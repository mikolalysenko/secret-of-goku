/*
 * retro-host: a small headless libretro frontend for scripted cartridge tests.
 *
 *   retro-host --core core.dylib --rom game.sfc --out DIR
 *              [--script steps.json | --stdin]
 *              [--option key=value ...] [--sram FILE|zero|ff|noise:SEED]
 *              [--wram-init zero|ff|noise:SEED] [--quiet]
 *
 * It loads one libretro core and one ROM, then runs a script of steps: hold
 * buttons for N frames, wait, take PNG screenshots of the framebuffer, read,
 * write or dump WRAM/SRAM/VRAM, reset, power-cycle with battery RAM kept, and
 * savestates. A script is a JSON array of step objects; with --stdin the
 * steps come one JSON object per line and each gets a one-line JSON reply on
 * stdout, so a test can make decisions between frames. results.json in DIR
 * collects the values, screenshots and core log.
 *
 * No audio is output and nothing is timed: every retro_run() is one frame,
 * so a run is deterministic for a deterministic core and script. Anything
 * the core prints to stdout goes to DIR/core-stdout.log.
 *
 * Memory: WRAM/SRAM/VRAM come from retro_get_memory_data(). Cores that do
 * not expose them (bsnes) but serialize their state are read and written
 * through retro_serialize()/retro_unserialize() at offsets found by a
 * calibration load (a noise .srm locates save RAM; power-on WRAM with the
 * core's randomisation off locates the 128 KiB of WRAM: the zeros that end
 * at the first non-zero byte after save RAM). bsnes reads and
 * writes battery RAM as <save dir>/<rom name>.srm itself, so --sram is
 * written there before the game loads, as well as copied to SAVE_RAM.
 *
 * Steps (all fields but "op" optional; addresses may be numbers or "0x.."):
 *   {"op":"wait","frames":N}                     run N frames, no buttons
 *   {"op":"hold","buttons":"a b","frames":N}     hold buttons for N frames
 *   {"op":"tap","buttons":"b","frames":3,"gap":3}  hold, then wait gap
 *   {"op":"shot","name":"title"}                 DIR/title.png of the last frame
 *   {"op":"read","name":"k","mem":"wram","addr":N,"size":1..4 | "len":N}
 *   {"op":"dump","name":"k","mem":"sram","addr":0,"len":N,"format":"bin|hex|json"}
 *   {"op":"write","mem":"wram","addr":N,"bytes":[..] | "value":V,"size":S}
 *   {"op":"fill","mem":"sram","value":V | "seed":S,"addr":0,"len":N}
 *   {"op":"loadmem","mem":"sram","file":"path","addr":0}
 *   {"op":"until","mem":"wram","addr":N,"size":1,"cmp":"eq|ne|lt|le|gt|ge",
 *    "value":V,"mask":M,"frames":MAX,"buttons":"start","every":20,"hold":4}
 *   {"op":"reset"}                               console Reset button
 *   {"op":"reload"}                              power cycle, battery RAM kept
 *   {"op":"savestate","name":"k"}  {"op":"loadstate","file":"path"}
 *   {"op":"result","name":"k","value":<json>}    {"op":"log","text":".."}
 *   {"op":"info"}  {"op":"quit"}
 * Memory names: wram (128 KiB; 0x7E0000-0x7FFFFF also accepted), sram, vram.
 *
 * libretro.h (MIT, the RetroArch team) is vendored next to this file.
 */
#define _DARWIN_C_SOURCE 1
#define _DEFAULT_SOURCE 1
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <zlib.h>

#include "libretro.h"

#define HOST_VERSION 1
#define WRAM_SIZE 0x20000

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

typedef struct {
  char *buf;
  size_t len, cap;
} sb_t;

static void sb_grow(sb_t *s, size_t extra) {
  if (s->len + extra + 1 <= s->cap) return;
  size_t cap = s->cap ? s->cap : 256;
  while (cap < s->len + extra + 1) cap *= 2;
  s->buf = realloc(s->buf, cap);
  if (!s->buf) { perror("realloc"); exit(3); }
  s->cap = cap;
}
static void sb_putn(sb_t *s, const char *p, size_t n) {
  sb_grow(s, n);
  memcpy(s->buf + s->len, p, n);
  s->len += n;
  s->buf[s->len] = 0;
}
static void sb_puts(sb_t *s, const char *p) { sb_putn(s, p, strlen(p)); }
static void sb_printf(sb_t *s, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  char tmp[512];
  int n = vsnprintf(tmp, sizeof tmp, fmt, ap);
  va_end(ap);
  if (n < 0) return;
  if ((size_t)n < sizeof tmp) { sb_putn(s, tmp, (size_t)n); return; }
  sb_grow(s, (size_t)n);
  va_start(ap, fmt);
  vsnprintf(s->buf + s->len, (size_t)n + 1, fmt, ap);
  va_end(ap);
  s->len += (size_t)n;
}
static void sb_json_str(sb_t *s, const char *p) {
  sb_putn(s, "\"", 1);
  for (; p && *p; p++) {
    unsigned char c = (unsigned char)*p;
    if (c == '"') sb_puts(s, "\\\"");
    else if (c == '\\') sb_puts(s, "\\\\");
    else if (c == '\n') sb_puts(s, "\\n");
    else if (c == '\r') sb_puts(s, "\\r");
    else if (c == '\t') sb_puts(s, "\\t");
    else if (c < 0x20) sb_printf(s, "\\u%04x", c);
    else sb_putn(s, (const char *)&c, 1);
  }
  sb_putn(s, "\"", 1);
}
static void sb_free(sb_t *s) { free(s->buf); s->buf = NULL; s->len = s->cap = 0; }

static uint8_t *read_file(const char *path, size_t *size) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  if (n < 0) { fclose(f); return NULL; }
  uint8_t *d = malloc((size_t)n + 1);
  if (!d) { fclose(f); return NULL; }
  size_t got = fread(d, 1, (size_t)n, f);
  fclose(f);
  d[got] = 0;
  if (size) *size = got;
  return d;
}
static bool write_file(const char *path, const void *data, size_t size) {
  FILE *f = fopen(path, "wb");
  if (!f) return false;
  bool ok = fwrite(data, 1, size, f) == size;
  return fclose(f) == 0 && ok;
}
static void mkdirs(const char *path) {
  char tmp[PATH_MAX];
  snprintf(tmp, sizeof tmp, "%s", path);
  for (char *p = tmp + 1; *p; p++)
    if (*p == '/') { *p = 0; mkdir(tmp, 0755); *p = '/'; }
  mkdir(tmp, 0755);
}
/* Deterministic noise (xorshift32); seed 0 is mapped to a fixed value. */
static void noise_fill(uint8_t *d, size_t n, uint32_t seed) {
  uint32_t x = seed ? seed : 0x9E3779B9u;
  for (size_t i = 0; i < n; i++) {
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    d[i] = (uint8_t)(x >> 24);
  }
}

/* ------------------------------------------------------------------ */
/* Minimal JSON parser (objects, arrays, strings, numbers, literals)   */
/* ------------------------------------------------------------------ */

typedef enum { J_NULL, J_BOOL, J_NUM, J_STR, J_ARR, J_OBJ } jtype;
typedef struct jval {
  jtype t;
  double n;
  bool b;
  char *s;
  struct jval **items;
  char **keys;
  int len;
} jval;

typedef struct { const char *p; const char *err; } jparser;

static void jskip(jparser *j) { while (*j->p == ' ' || *j->p == '\t' || *j->p == '\n' || *j->p == '\r') j->p++; }
static jval *jnew(jtype t) { jval *v = calloc(1, sizeof *v); v->t = t; return v; }
static void jfree(jval *v) {
  if (!v) return;
  free(v->s);
  for (int i = 0; i < v->len; i++) { jfree(v->items[i]); if (v->keys) free(v->keys[i]); }
  free(v->items);
  free(v->keys);
  free(v);
}
static void jappend(jval *v, char *key, jval *item) {
  v->items = realloc(v->items, sizeof(jval *) * (size_t)(v->len + 1));
  if (v->t == J_OBJ) v->keys = realloc(v->keys, sizeof(char *) * (size_t)(v->len + 1)), v->keys[v->len] = key;
  v->items[v->len++] = item;
}
static void utf8_put(sb_t *s, unsigned cp) {
  char b[4];
  if (cp < 0x80) { b[0] = (char)cp; sb_putn(s, b, 1); }
  else if (cp < 0x800) { b[0] = (char)(0xC0 | (cp >> 6)); b[1] = (char)(0x80 | (cp & 63)); sb_putn(s, b, 2); }
  else { b[0] = (char)(0xE0 | (cp >> 12)); b[1] = (char)(0x80 | ((cp >> 6) & 63)); b[2] = (char)(0x80 | (cp & 63)); sb_putn(s, b, 3); }
}
static char *jparse_string(jparser *j) {
  if (*j->p != '"') { j->err = "expected string"; return NULL; }
  j->p++;
  sb_t s = {0};
  sb_grow(&s, 0);
  while (*j->p && *j->p != '"') {
    if (*j->p == '\\') {
      j->p++;
      char c = *j->p++;
      switch (c) {
        case 'n': sb_putn(&s, "\n", 1); break;
        case 't': sb_putn(&s, "\t", 1); break;
        case 'r': sb_putn(&s, "\r", 1); break;
        case 'b': sb_putn(&s, "\b", 1); break;
        case 'f': sb_putn(&s, "\f", 1); break;
        case 'u': {
          unsigned cp = 0;
          for (int i = 0; i < 4; i++) {
            char h = *j->p++;
            cp <<= 4;
            if (h >= '0' && h <= '9') cp |= (unsigned)(h - '0');
            else if (h >= 'a' && h <= 'f') cp |= (unsigned)(h - 'a' + 10);
            else if (h >= 'A' && h <= 'F') cp |= (unsigned)(h - 'A' + 10);
            else { j->err = "bad \\u escape"; sb_free(&s); return NULL; }
          }
          utf8_put(&s, cp);
          break;
        }
        case 0: j->err = "unterminated string"; sb_free(&s); return NULL;
        default: sb_putn(&s, &c, 1);
      }
    } else {
      sb_putn(&s, j->p, 1);
      j->p++;
    }
  }
  if (*j->p != '"') { j->err = "unterminated string"; sb_free(&s); return NULL; }
  j->p++;
  return s.buf;
}
static jval *jparse_value(jparser *j, int depth) {
  jskip(j);
  if (depth > 64) { j->err = "nesting too deep"; return NULL; }
  char c = *j->p;
  if (c == '{' || c == '[') {
    bool obj = c == '{';
    jval *v = jnew(obj ? J_OBJ : J_ARR);
    j->p++;
    jskip(j);
    if (*j->p == (obj ? '}' : ']')) { j->p++; return v; }
    for (;;) {
      char *key = NULL;
      if (obj) {
        jskip(j);
        key = jparse_string(j);
        if (!key) { jfree(v); return NULL; }
        jskip(j);
        if (*j->p != ':') { j->err = "expected ':'"; free(key); jfree(v); return NULL; }
        j->p++;
      }
      jval *item = jparse_value(j, depth + 1);
      if (!item) { free(key); jfree(v); return NULL; }
      jappend(v, key, item);
      jskip(j);
      if (*j->p == ',') { j->p++; continue; }
      if (*j->p == (obj ? '}' : ']')) { j->p++; return v; }
      j->err = obj ? "expected ',' or '}'" : "expected ',' or ']'";
      jfree(v);
      return NULL;
    }
  }
  if (c == '"') {
    char *s = jparse_string(j);
    if (!s) return NULL;
    jval *v = jnew(J_STR);
    v->s = s;
    return v;
  }
  if (!strncmp(j->p, "true", 4)) { j->p += 4; jval *v = jnew(J_BOOL); v->b = true; return v; }
  if (!strncmp(j->p, "false", 5)) { j->p += 5; return jnew(J_BOOL); }
  if (!strncmp(j->p, "null", 4)) { j->p += 4; return jnew(J_NULL); }
  if (c == '-' || (c >= '0' && c <= '9')) {
    char *end;
    double n = strtod(j->p, &end);
    if (end == j->p) { j->err = "bad number"; return NULL; }
    j->p = end;
    jval *v = jnew(J_NUM);
    v->n = n;
    return v;
  }
  j->err = "unexpected character";
  return NULL;
}
static jval *jparse(const char *text, const char **err) {
  jparser j = {text, NULL};
  jval *v = jparse_value(&j, 0);
  if (v) {
    jskip(&j);
    if (*j.p) { j.err = "trailing characters"; jfree(v); v = NULL; }
  }
  if (err) *err = j.err;
  return v;
}
static jval *jget(const jval *o, const char *key) {
  if (!o || o->t != J_OBJ) return NULL;
  for (int i = 0; i < o->len; i++)
    if (!strcmp(o->keys[i], key)) return o->items[i];
  return NULL;
}
/* Numbers may be JSON numbers or strings such as "0x7E00DC" or "$7E00DC". */
static bool jnum_of(const jval *v, double *out) {
  if (!v) return false;
  if (v->t == J_NUM) { *out = v->n; return true; }
  if (v->t == J_BOOL) { *out = v->b; return true; }
  if (v->t == J_STR && v->s[0]) {
    const char *p = v->s;
    int base = 10;
    if (p[0] == '$') { p++; base = 16; }
    else if (p[0] == '0' && (p[1] == 'x' || p[1] == 'X')) { p += 2; base = 16; }
    char *end;
    long long n = strtoll(p, &end, base);
    if (*end) return false;
    *out = (double)n;
    return true;
  }
  return false;
}
static double jnum(const jval *o, const char *key, double def) {
  double n;
  return jnum_of(jget(o, key), &n) ? n : def;
}
static const char *jstr(const jval *o, const char *key, const char *def) {
  jval *v = jget(o, key);
  return v && v->t == J_STR ? v->s : def;
}
static void jwrite(sb_t *s, const jval *v) {
  if (!v) { sb_puts(s, "null"); return; }
  switch (v->t) {
    case J_NULL: sb_puts(s, "null"); break;
    case J_BOOL: sb_puts(s, v->b ? "true" : "false"); break;
    case J_NUM:
      if (v->n == (double)(long long)v->n) sb_printf(s, "%lld", (long long)v->n);
      else sb_printf(s, "%.17g", v->n);
      break;
    case J_STR: sb_json_str(s, v->s); break;
    case J_ARR:
    case J_OBJ:
      sb_puts(s, v->t == J_ARR ? "[" : "{");
      for (int i = 0; i < v->len; i++) {
        if (i) sb_puts(s, ",");
        if (v->t == J_OBJ) { sb_json_str(s, v->keys[i]); sb_puts(s, ":"); }
        jwrite(s, v->items[i]);
      }
      sb_puts(s, v->t == J_ARR ? "]" : "}");
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Host state                                                          */
/* ------------------------------------------------------------------ */

typedef struct {
  void *h;
  void (*init)(void);
  void (*deinit)(void);
  unsigned (*api_version)(void);
  void (*get_system_info)(struct retro_system_info *);
  void (*get_system_av_info)(struct retro_system_av_info *);
  void (*set_environment)(retro_environment_t);
  void (*set_video_refresh)(retro_video_refresh_t);
  void (*set_audio_sample)(retro_audio_sample_t);
  void (*set_audio_sample_batch)(retro_audio_sample_batch_t);
  void (*set_input_poll)(retro_input_poll_t);
  void (*set_input_state)(retro_input_state_t);
  void (*set_controller_port_device)(unsigned, unsigned);
  void (*reset)(void);
  void (*run)(void);
  size_t (*serialize_size)(void);
  bool (*serialize)(void *, size_t);
  bool (*unserialize)(const void *, size_t);
  bool (*load_game)(const struct retro_game_info *);
  void (*unload_game)(void);
  void *(*get_memory_data)(unsigned);
  size_t (*get_memory_size)(unsigned);
} core_t;

typedef struct {
  char *key, *value, *def, *desc;
} option_t;

enum { MEM_WRAM, MEM_SRAM, MEM_VRAM, MEM_COUNT };
static const char *mem_names[MEM_COUNT] = {"wram", "sram", "vram"};
static const unsigned mem_ids[MEM_COUNT] = {RETRO_MEMORY_SYSTEM_RAM, RETRO_MEMORY_SAVE_RAM, RETRO_MEMORY_VIDEO_RAM};

static struct {
  core_t core;
  const char *core_path, *rom_path, *out;
  char savedir[PATH_MAX], sysdir[PATH_MAX], rombase[PATH_MAX];
  bool quiet, interactive, calibrating;
  FILE *proto; /* replies and the final summary (the original stdout) */

  struct retro_system_info sysinfo;
  struct retro_system_av_info av;
  enum retro_pixel_format fmt;
  bool fmt_set;

  uint8_t *rom;
  size_t rom_size;

  /* last frame */
  uint8_t *fbuf;
  unsigned fw, fh;
  size_t fcap;
  enum retro_pixel_format ffmt;
  unsigned long long frames_drawn, dupes;

  uint16_t buttons;
  unsigned long long frame; /* retro_run calls since start */
  unsigned long long polls;

  option_t *opts;
  int nopts;
  bool opts_dirty;

  /* state-backed memory (cores without memory pointers) */
  bool state_mem;
  size_t state_size;
  uint8_t *state;
  bool state_valid, state_dirty;
  unsigned long long state_frame;
  long sram_off, wram_off;
  size_t sram_state_size;

  /* battery RAM handling */
  uint8_t *sram_init;
  size_t sram_init_size;
  size_t header_sram_size;
  char wram_init[64];

  sb_t log, values, shots, unknown_env;
  int nvalues, nshots, nlog, nunknown;
  char error[1024];
} G;

static void hostlog(const char *fmt, ...) {
  if (G.quiet) return;
  va_list ap;
  va_start(ap, fmt);
  fprintf(stderr, "[retro-host] ");
  vfprintf(stderr, fmt, ap);
  fputc('\n', stderr);
  va_end(ap);
}

/* ------------------------------------------------------------------ */
/* libretro callbacks                                                  */
/* ------------------------------------------------------------------ */

static void log_cb(enum retro_log_level level, const char *fmt, ...) {
  static const char *names[] = {"DEBUG", "INFO", "WARN", "ERROR"};
  char line[2048];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(line, sizeof line, fmt, ap);
  va_end(ap);
  size_t n = strlen(line);
  while (n && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
  /* A multi-line message (snes9x's ROM info) is kept as one entry. */
  if (!G.quiet) fprintf(stderr, "[core %s] %s\n", level <= RETRO_LOG_ERROR ? names[level] : "?", line);
  if (G.nlog < 2000) {
    char tagged[2100];
    snprintf(tagged, sizeof tagged, "%s: %s", level <= RETRO_LOG_ERROR ? names[level] : "?", line);
    if (G.nlog++) sb_puts(&G.log, ",");
    sb_json_str(&G.log, tagged);
  }
}

static option_t *find_option(const char *key) {
  for (int i = 0; i < G.nopts; i++)
    if (!strcmp(G.opts[i].key, key)) return &G.opts[i];
  return NULL;
}
static option_t *add_option(const char *key) {
  option_t *o = find_option(key);
  if (o) return o;
  G.opts = realloc(G.opts, sizeof(option_t) * (size_t)(G.nopts + 1));
  o = &G.opts[G.nopts++];
  memset(o, 0, sizeof *o);
  o->key = strdup(key);
  return o;
}
/* "Description; default|other|..." */
static void declare_variable(const char *key, const char *spec) {
  option_t *o = add_option(key);
  const char *semi = spec ? strchr(spec, ';') : NULL;
  if (!semi) return;
  free(o->desc);
  o->desc = strndup(spec, (size_t)(semi - spec));
  const char *v = semi + 1;
  while (*v == ' ') v++;
  const char *bar = strchr(v, '|');
  free(o->def);
  o->def = bar ? strndup(v, (size_t)(bar - v)) : strdup(v);
}
static const char *option_value(const char *key) {
  option_t *o = find_option(key);
  /* The calibration load turns power-on randomisation off. */
  if (G.calibrating && (strstr(key, "entropy") || strstr(key, "randomize"))) {
    if (o && o->desc && strstr(key, "entropy")) return "None";
    return "disabled";
  }
  if (!o) return NULL;
  return o->value ? o->value : o->def;
}

static bool env_cb(unsigned cmd, void *data) {
  switch (cmd) {
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
      ((struct retro_log_callback *)data)->log = log_cb;
      return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
      enum retro_pixel_format f = *(const enum retro_pixel_format *)data;
      if (f != RETRO_PIXEL_FORMAT_0RGB1555 && f != RETRO_PIXEL_FORMAT_XRGB8888 && f != RETRO_PIXEL_FORMAT_RGB565) return false;
      G.fmt = f;
      G.fmt_set = true;
      return true;
    }
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY:
      *(const char **)data = G.sysdir;
      return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
      *(const char **)data = G.savedir;
      return true;
    case RETRO_ENVIRONMENT_SET_VARIABLES: {
      const struct retro_variable *v = data;
      for (; v && v->key; v++) declare_variable(v->key, v->value);
      return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = data;
      v->value = option_value(v->key);
      return v->value != NULL;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
      *(bool *)data = G.opts_dirty;
      G.opts_dirty = false;
      return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION:
      return false; /* cores then declare their options with SET_VARIABLES */
    case RETRO_ENVIRONMENT_GET_CAN_DUPE:
      *(bool *)data = true;
      return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
      return true;
    case RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE:
      if (data) *(int *)data = 3;
      return true;
    case RETRO_ENVIRONMENT_GET_FASTFORWARDING:
      if (data) *(bool *)data = false;
      return true;
    case RETRO_ENVIRONMENT_GET_LANGUAGE:
      *(unsigned *)data = RETRO_LANGUAGE_ENGLISH;
      return true;
    case RETRO_ENVIRONMENT_GET_INPUT_MAX_USERS:
      *(unsigned *)data = 2;
      return true;
    case RETRO_ENVIRONMENT_SET_GEOMETRY:
      G.av.geometry = *(const struct retro_game_geometry *)data;
      return true;
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:
      G.av = *(const struct retro_system_av_info *)data;
      return true;
    case RETRO_ENVIRONMENT_SET_MESSAGE: {
      const struct retro_message *m = data;
      if (m && m->msg) log_cb(RETRO_LOG_INFO, "message: %s", m->msg);
      return true;
    }
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_SUBSYSTEM_INFO:
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
    case RETRO_ENVIRONMENT_SET_SUPPORT_ACHIEVEMENTS:
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
    case RETRO_ENVIRONMENT_SET_MEMORY_MAPS:
    case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
    case RETRO_ENVIRONMENT_SET_CONTENT_INFO_OVERRIDE:
      return true;
    default:
      if (G.nunknown < 64) {
        if (G.nunknown++) sb_puts(&G.unknown_env, ",");
        sb_printf(&G.unknown_env, "%u", cmd);
      }
      return false;
  }
}

static void video_cb(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data || data == RETRO_HW_FRAME_BUFFER_VALID) { G.dupes++; return; }
  unsigned bpp = G.fmt == RETRO_PIXEL_FORMAT_XRGB8888 ? 4 : 2;
  size_t need = (size_t)w * h * bpp;
  if (need > G.fcap) {
    G.fbuf = realloc(G.fbuf, need);
    G.fcap = need;
  }
  for (unsigned y = 0; y < h; y++) memcpy(G.fbuf + (size_t)y * w * bpp, (const uint8_t *)data + (size_t)y * pitch, (size_t)w * bpp);
  G.fw = w;
  G.fh = h;
  G.ffmt = G.fmt;
  G.frames_drawn++;
}
static void audio_sample_cb(int16_t l, int16_t r) { (void)l; (void)r; }
static size_t audio_batch_cb(const int16_t *d, size_t frames) { (void)d; return frames; }
static void input_poll_cb(void) { G.polls++; }
static int16_t input_state_cb(unsigned port, unsigned device, unsigned index, unsigned id) {
  (void)index;
  if (port != 0 || (device & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD) return 0;
  if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)G.buttons;
  return id < 16 ? (int16_t)((G.buttons >> id) & 1) : 0;
}

/* ------------------------------------------------------------------ */
/* Core loading                                                        */
/* ------------------------------------------------------------------ */

static void *sym(const char *name) {
  void *p = dlsym(G.core.h, name);
  if (!p) { fprintf(stderr, "retro-host: core lacks %s\n", name); exit(3); }
  return p;
}
static void load_core(void) {
  G.core.h = dlopen(G.core_path, RTLD_NOW | RTLD_LOCAL);
  if (!G.core.h) { fprintf(stderr, "retro-host: dlopen %s: %s\n", G.core_path, dlerror()); exit(3); }
  core_t *c = &G.core;
  *(void **)&c->init = sym("retro_init");
  *(void **)&c->deinit = sym("retro_deinit");
  *(void **)&c->api_version = sym("retro_api_version");
  *(void **)&c->get_system_info = sym("retro_get_system_info");
  *(void **)&c->get_system_av_info = sym("retro_get_system_av_info");
  *(void **)&c->set_environment = sym("retro_set_environment");
  *(void **)&c->set_video_refresh = sym("retro_set_video_refresh");
  *(void **)&c->set_audio_sample = sym("retro_set_audio_sample");
  *(void **)&c->set_audio_sample_batch = sym("retro_set_audio_sample_batch");
  *(void **)&c->set_input_poll = sym("retro_set_input_poll");
  *(void **)&c->set_input_state = sym("retro_set_input_state");
  *(void **)&c->set_controller_port_device = sym("retro_set_controller_port_device");
  *(void **)&c->reset = sym("retro_reset");
  *(void **)&c->run = sym("retro_run");
  *(void **)&c->serialize_size = sym("retro_serialize_size");
  *(void **)&c->serialize = sym("retro_serialize");
  *(void **)&c->unserialize = sym("retro_unserialize");
  *(void **)&c->load_game = sym("retro_load_game");
  *(void **)&c->unload_game = sym("retro_unload_game");
  *(void **)&c->get_memory_data = sym("retro_get_memory_data");
  *(void **)&c->get_memory_size = sym("retro_get_memory_size");
  if (c->api_version() != RETRO_API_VERSION) { fprintf(stderr, "retro-host: core API version %u\n", c->api_version()); exit(3); }
  c->set_environment(env_cb);
  c->set_video_refresh(video_cb);
  c->set_audio_sample(audio_sample_cb);
  c->set_audio_sample_batch(audio_batch_cb);
  c->set_input_poll(input_poll_cb);
  c->set_input_state(input_state_cb);
  c->init();
  c->get_system_info(&G.sysinfo);
}

static bool load_game(void) {
  struct retro_game_info gi = {0};
  gi.path = G.rom_path;
  if (!G.sysinfo.need_fullpath) {
    gi.data = G.rom;
    gi.size = G.rom_size;
  }
  if (!G.core.load_game(&gi)) return false;
  G.core.get_system_av_info(&G.av);
  G.core.set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
  G.core.set_controller_port_device(1, RETRO_DEVICE_JOYPAD);
  G.state_valid = false;
  G.state_dirty = false;
  return true;
}

/* Header SRAM size: ExHiROM (0x40FFC0), HiROM (0xFFC0), LoROM (0x7FC0). */
static size_t header_sram(void) {
  static const size_t heads[] = {0x40FFC0, 0xFFC0, 0x7FC0};
  for (int i = 0; i < 3; i++) {
    size_t h = heads[i];
    if (h + 0x40 > G.rom_size) continue;
    uint8_t mode = G.rom[h + 0x15];
    uint16_t sum = (uint16_t)(G.rom[h + 0x1E] | G.rom[h + 0x1F] << 8), comp = (uint16_t)(G.rom[h + 0x1C] | G.rom[h + 0x1D] << 8);
    if ((mode & 0xE0) != 0x20 || (uint16_t)(sum ^ comp) != 0xFFFF) continue;
    uint8_t s = G.rom[h + 0x18];
    return s && s <= 8 ? (size_t)1024 << s : 0;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Memory access                                                       */
/* ------------------------------------------------------------------ */

static void state_apply(void) {
  if (G.state_mem && G.state_dirty) {
    if (!G.core.unserialize(G.state, G.state_size)) hostlog("unserialize failed");
    G.state_dirty = false;
  }
}
static bool state_refresh(void) {
  if (!G.state_mem) return false;
  if (G.state_valid && G.state_frame == G.frame) return true;
  state_apply();
  if (!G.core.serialize(G.state, G.state_size)) return false;
  G.state_valid = true;
  G.state_frame = G.frame;
  return true;
}

typedef struct { uint8_t *p; size_t size; bool via_state; } memview;
static bool mem_view(int which, memview *v) {
  memset(v, 0, sizeof *v);
  uint8_t *p = G.core.get_memory_data(mem_ids[which]);
  size_t n = G.core.get_memory_size(mem_ids[which]);
  if (p && n) { v->p = p; v->size = n; return true; }
  if (G.state_mem) {
    if (which == MEM_WRAM && G.wram_off >= 0 && state_refresh()) { v->p = G.state + G.wram_off; v->size = WRAM_SIZE; v->via_state = true; return true; }
    if (which == MEM_SRAM && G.sram_off >= 0 && state_refresh()) { v->p = G.state + G.sram_off; v->size = G.sram_state_size; v->via_state = true; return true; }
  }
  return false;
}
static int mem_index(const char *name) {
  for (int i = 0; i < MEM_COUNT; i++)
    if (!strcmp(name, mem_names[i])) return i;
  return -1;
}
static long mem_addr(int which, double a) {
  long addr = (long)a;
  if (which == MEM_WRAM && addr >= 0x7E0000 && addr <= 0x7FFFFF) addr -= 0x7E0000;
  return addr;
}
static void mem_touched(memview *v) {
  if (v->via_state) G.state_dirty = true;
}

/* Calibration for state-backed memory: a throwaway load with a noise .srm
 * and power-on randomisation off; save RAM is the noise, WRAM the 128 KiB of
 * zeros that end where the next non-zero byte starts. */
static bool calibrate_state(void) {
  char dir[PATH_MAX], path[PATH_MAX], saved[PATH_MAX];
  snprintf(dir, sizeof dir, "%s/.calibration", G.out);
  mkdirs(dir);
  snprintf(path, sizeof path, "%s/%s.srm", dir, G.rombase);
  size_t nsz = 0x20000;
  uint8_t *noise = malloc(nsz);
  noise_fill(noise, nsz, 0xC0FFEEu);
  write_file(path, noise, nsz);
  snprintf(saved, sizeof saved, "%s", G.savedir);
  snprintf(G.savedir, sizeof G.savedir, "%s", dir);
  G.calibrating = true;
  bool ok = false;
  if (load_game()) {
    size_t n = G.core.serialize_size();
    uint8_t *s = n ? malloc(n) : NULL;
    if (s && G.core.serialize(s, n)) {
      long so = -1;
      for (size_t i = 0; i + 64 <= n; i++)
        if (!memcmp(s + i, noise, 64)) { so = (long)i; break; }
      if (so >= 0) {
        size_t run = 0;
        while ((size_t)so + run < n && run < nsz && s[so + run] == noise[run]) run++;
        size_t size = 1;
        while (size * 2 <= run) size *= 2; /* save RAM sizes are powers of two */
        /* serialize() first runs the CPU to an instruction boundary, so
         * the reset code may already have touched the stack page: WRAM is
         * the 128 KiB that end with the first long run of zeros. */
        size_t i = (size_t)so + size, zeros = 0;
        long wo = -1;
        for (; i < n; i++) {
          if (!s[i]) { zeros++; continue; }
          if (zeros >= WRAM_SIZE / 2 && i >= WRAM_SIZE && i - WRAM_SIZE >= (size_t)so + size) { wo = (long)(i - WRAM_SIZE); break; }
          zeros = 0;
        }
        G.sram_off = so;
        G.sram_state_size = size;
        G.wram_off = wo;
        ok = wo >= 0;
        hostlog("state calibration: save RAM at +%ld (%zu bytes), WRAM at +%ld, state %zu bytes", so, size, wo, n);
      }
    }
    free(s);
    G.core.unload_game();
  }
  G.calibrating = false;
  snprintf(G.savedir, sizeof G.savedir, "%s", saved);
  remove(path);
  rmdir(dir);
  free(noise);
  return ok;
}

/* Battery RAM for the next load: written as the core's .srm (cores that
 * manage their own saves) and copied into SAVE_RAM after the load. */
static void sram_prepare_file(void) {
  if (!G.sram_init) return;
  char path[PATH_MAX];
  snprintf(path, sizeof path, "%s/%s.srm", G.savedir, G.rombase);
  write_file(path, G.sram_init, G.sram_init_size);
}
static void sram_apply_pointer(void) {
  if (!G.sram_init) return;
  uint8_t *p = G.core.get_memory_data(RETRO_MEMORY_SAVE_RAM);
  size_t n = G.core.get_memory_size(RETRO_MEMORY_SAVE_RAM);
  if (p && n) memcpy(p, G.sram_init, n < G.sram_init_size ? n : G.sram_init_size);
}
static bool parse_fill(const char *spec, uint8_t *d, size_t n) {
  if (!strcmp(spec, "zero")) { memset(d, 0, n); return true; }
  if (!strcmp(spec, "ff")) { memset(d, 0xFF, n); return true; }
  if (!strncmp(spec, "noise:", 6)) { noise_fill(d, n, (uint32_t)strtoul(spec + 6, NULL, 0)); return true; }
  return false;
}
static void wram_apply_init(void) {
  if (!G.wram_init[0]) return;
  memview v;
  if (!mem_view(MEM_WRAM, &v)) { hostlog("--wram-init: WRAM not accessible"); return; }
  parse_fill(G.wram_init, v.p, v.size);
  mem_touched(&v);
}

/* Battery RAM as it is now: SAVE_RAM, or the state copy. */
static bool sram_snapshot(uint8_t **out, size_t *size) {
  memview v;
  if (!mem_view(MEM_SRAM, &v)) return false;
  *out = malloc(v.size);
  memcpy(*out, v.p, v.size);
  *size = v.size;
  return true;
}

/* ------------------------------------------------------------------ */
/* Frames, buttons, screenshots                                        */
/* ------------------------------------------------------------------ */

static uint16_t parse_buttons(const char *s, bool *ok) {
  static const struct { const char *name; unsigned id; } map[] = {
      {"b", RETRO_DEVICE_ID_JOYPAD_B}, {"y", RETRO_DEVICE_ID_JOYPAD_Y}, {"select", RETRO_DEVICE_ID_JOYPAD_SELECT},
      {"start", RETRO_DEVICE_ID_JOYPAD_START}, {"up", RETRO_DEVICE_ID_JOYPAD_UP}, {"down", RETRO_DEVICE_ID_JOYPAD_DOWN},
      {"left", RETRO_DEVICE_ID_JOYPAD_LEFT}, {"right", RETRO_DEVICE_ID_JOYPAD_RIGHT}, {"a", RETRO_DEVICE_ID_JOYPAD_A},
      {"x", RETRO_DEVICE_ID_JOYPAD_X}, {"l", RETRO_DEVICE_ID_JOYPAD_L}, {"r", RETRO_DEVICE_ID_JOYPAD_R},
  };
  uint16_t mask = 0;
  *ok = true;
  if (!s) return 0;
  char word[16];
  while (*s) {
    while (*s == ' ' || *s == '+' || *s == ',') s++;
    size_t n = 0;
    while (s[n] && s[n] != ' ' && s[n] != '+' && s[n] != ',') n++;
    if (!n) break;
    if (n >= sizeof word) { *ok = false; return 0; }
    memcpy(word, s, n);
    word[n] = 0;
    s += n;
    bool found = false;
    for (size_t i = 0; i < sizeof map / sizeof map[0]; i++)
      if (!strcasecmp(word, map[i].name)) { mask |= (uint16_t)(1u << map[i].id); found = true; }
    if (!found) { *ok = false; return 0; }
  }
  return mask;
}
static void run_frames(unsigned long long n, uint16_t buttons) {
  for (unsigned long long i = 0; i < n; i++) {
    state_apply();
    G.buttons = buttons;
    G.core.run();
    G.frame++;
  }
  G.buttons = 0;
}

static void png_chunk(FILE *f, const char *type, const uint8_t *data, uint32_t len) {
  uint8_t be[4] = {(uint8_t)(len >> 24), (uint8_t)(len >> 16), (uint8_t)(len >> 8), (uint8_t)len};
  fwrite(be, 1, 4, f);
  fwrite(type, 1, 4, f);
  if (len) fwrite(data, 1, len, f);
  uLong crc = crc32(0, (const Bytef *)type, 4);
  if (len) crc = crc32(crc, data, len);
  uint8_t c[4] = {(uint8_t)(crc >> 24), (uint8_t)(crc >> 16), (uint8_t)(crc >> 8), (uint8_t)crc};
  fwrite(c, 1, 4, f);
}
static bool write_png(const char *path, const uint8_t *rgb, unsigned w, unsigned h) {
  size_t stride = (size_t)w * 3 + 1, raw_len = stride * h;
  uint8_t *raw = malloc(raw_len);
  for (unsigned y = 0; y < h; y++) {
    raw[y * stride] = 0;
    memcpy(raw + y * stride + 1, rgb + (size_t)y * w * 3, (size_t)w * 3);
  }
  uLongf zlen = compressBound(raw_len);
  uint8_t *z = malloc(zlen);
  bool ok = compress2(z, &zlen, raw, raw_len, 6) == Z_OK;
  FILE *f = ok ? fopen(path, "wb") : NULL;
  if (f) {
    fwrite("\x89PNG\r\n\x1a\n", 1, 8, f);
    uint8_t ihdr[13] = {(uint8_t)(w >> 24), (uint8_t)(w >> 16), (uint8_t)(w >> 8), (uint8_t)w,
                        (uint8_t)(h >> 24), (uint8_t)(h >> 16), (uint8_t)(h >> 8), (uint8_t)h, 8, 2, 0, 0, 0};
    png_chunk(f, "IHDR", ihdr, 13);
    png_chunk(f, "IDAT", z, (uint32_t)zlen);
    png_chunk(f, "IEND", NULL, 0);
    ok = fclose(f) == 0;
  } else ok = false;
  free(raw);
  free(z);
  return ok;
}
static const char *fmt_name(enum retro_pixel_format f) {
  return f == RETRO_PIXEL_FORMAT_XRGB8888 ? "XRGB8888" : f == RETRO_PIXEL_FORMAT_RGB565 ? "RGB565" : "0RGB1555";
}
/* RGB888 of the last frame; each 5/6-bit channel expanded by bit
 * replication, 8-bit channels kept. */
static uint8_t *frame_rgb(void) {
  if (!G.fbuf || !G.fw) return NULL;
  uint8_t *rgb = malloc((size_t)G.fw * G.fh * 3);
  size_t n = (size_t)G.fw * G.fh;
  for (size_t i = 0; i < n; i++) {
    unsigned r, g, b;
    if (G.ffmt == RETRO_PIXEL_FORMAT_XRGB8888) {
      uint32_t v;
      memcpy(&v, G.fbuf + i * 4, 4);
      r = (v >> 16) & 255; g = (v >> 8) & 255; b = v & 255;
    } else {
      uint16_t v;
      memcpy(&v, G.fbuf + i * 2, 2);
      if (G.ffmt == RETRO_PIXEL_FORMAT_RGB565) {
        unsigned r5 = v >> 11, g6 = (v >> 5) & 63, b5 = v & 31;
        r = r5 << 3 | r5 >> 2; g = g6 << 2 | g6 >> 4; b = b5 << 3 | b5 >> 2;
      } else {
        unsigned r5 = (v >> 10) & 31, g5 = (v >> 5) & 31, b5 = v & 31;
        r = r5 << 3 | r5 >> 2; g = g5 << 3 | g5 >> 2; b = b5 << 3 | b5 >> 2;
      }
    }
    rgb[i * 3] = (uint8_t)r; rgb[i * 3 + 1] = (uint8_t)g; rgb[i * 3 + 2] = (uint8_t)b;
  }
  return rgb;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

static void set_value_raw(const char *name, const char *json) {
  if (!name || !*name) return;
  if (G.nvalues++) sb_puts(&G.values, ",");
  sb_json_str(&G.values, name);
  sb_puts(&G.values, ":");
  sb_puts(&G.values, json);
}

static void write_results(void) {
  sb_t r = {0};
  sb_printf(&r, "{\"host\":{\"version\":%d},\"core\":{\"path\":", HOST_VERSION);
  sb_json_str(&r, G.core_path);
  sb_puts(&r, ",\"library_name\":");
  sb_json_str(&r, G.sysinfo.library_name);
  sb_puts(&r, ",\"library_version\":");
  sb_json_str(&r, G.sysinfo.library_version);
  sb_printf(&r, ",\"need_fullpath\":%s},\"rom\":{\"path\":", G.sysinfo.need_fullpath ? "true" : "false");
  sb_json_str(&r, G.rom_path);
  sb_printf(&r, ",\"size\":%zu,\"header_sram_size\":%zu}", G.rom_size, G.header_sram_size);
  sb_printf(&r, ",\"av\":{\"base_width\":%u,\"base_height\":%u,\"max_width\":%u,\"max_height\":%u,\"fps\":%.6f,\"sample_rate\":%.1f}",
            G.av.geometry.base_width, G.av.geometry.base_height, G.av.geometry.max_width, G.av.geometry.max_height,
            G.av.timing.fps, G.av.timing.sample_rate);
  sb_puts(&r, ",\"pixel_format\":");
  sb_json_str(&r, fmt_name(G.fmt));
  sb_puts(&r, ",\"memory\":{");
  for (int i = 0; i < MEM_COUNT; i++) {
    void *p = G.core.get_memory_data(mem_ids[i]);
    size_t n = G.core.get_memory_size(mem_ids[i]);
    const char *access = p && n ? "pointer" : (G.state_mem && ((i == MEM_WRAM && G.wram_off >= 0) || (i == MEM_SRAM && G.sram_off >= 0))) ? "state" : "none";
    size_t size = p && n ? n : !strcmp(access, "state") ? (i == MEM_WRAM ? WRAM_SIZE : G.sram_state_size) : 0;
    sb_printf(&r, "%s\"%s\":{\"access\":\"%s\",\"size\":%zu}", i ? "," : "", mem_names[i], access, size);
  }
  sb_puts(&r, "}");
  if (G.state_mem)
    sb_printf(&r, ",\"state\":{\"size\":%zu,\"sram_offset\":%ld,\"sram_size\":%zu,\"wram_offset\":%ld}", G.state_size, G.sram_off,
              G.sram_state_size, G.wram_off);
  sb_puts(&r, ",\"options\":{");
  for (int i = 0; i < G.nopts; i++) {
    if (i) sb_puts(&r, ",");
    sb_json_str(&r, G.opts[i].key);
    sb_puts(&r, ":");
    sb_json_str(&r, G.opts[i].value ? G.opts[i].value : G.opts[i].def ? G.opts[i].def : "");
  }
  sb_printf(&r, "},\"frames\":%llu,\"frames_drawn\":%llu,\"dupes\":%llu,\"input_polls\":%llu", G.frame, G.frames_drawn, G.dupes, G.polls);
  sb_puts(&r, ",\"values\":{");
  if (G.values.buf) sb_puts(&r, G.values.buf);
  sb_puts(&r, "},\"shots\":[");
  if (G.shots.buf) sb_puts(&r, G.shots.buf);
  sb_puts(&r, "],\"log\":[");
  if (G.log.buf) sb_puts(&r, G.log.buf);
  sb_puts(&r, "],\"unknown_env\":[");
  if (G.unknown_env.buf) sb_puts(&r, G.unknown_env.buf);
  sb_puts(&r, "]");
  /* What the core printed to stdout (snes9x prints its memory map there). */
  fflush(stdout);
  char path[PATH_MAX];
  snprintf(path, sizeof path, "%s/core-stdout.log", G.out);
  size_t n = 0;
  uint8_t *out = read_file(path, &n);
  sb_puts(&r, ",\"stdout\":[");
  if (out) {
    char *line = (char *)out, *save = NULL;
    int k = 0;
    for (char *t = strtok_r(line, "\n", &save); t && k < 200; t = strtok_r(NULL, "\n", &save), k++) {
      if (k) sb_puts(&r, ",");
      sb_json_str(&r, t);
    }
    free(out);
  }
  sb_puts(&r, "]");
  if (G.error[0]) { sb_puts(&r, ",\"error\":"); sb_json_str(&r, G.error); }
  sb_puts(&r, "}\n");
  snprintf(path, sizeof path, "%s/results.json", G.out);
  write_file(path, r.buf, r.len);
  sb_free(&r);
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

static int fail(sb_t *reply, const char *fmt, ...) {
  char msg[512];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof msg, fmt, ap);
  va_end(ap);
  sb_puts(reply, ",\"error\":");
  sb_json_str(reply, msg);
  snprintf(G.error, sizeof G.error, "%s", msg);
  return 1;
}
static int get_mem(const jval *step, sb_t *reply, memview *v, long *addr, long *len, long deflen) {
  const char *name = jstr(step, "mem", "wram");
  int which = mem_index(name);
  if (which < 0) return fail(reply, "unknown memory '%s'", name);
  if (!mem_view(which, v)) return fail(reply, "memory '%s' is not accessible in this core", name);
  *addr = mem_addr(which, jnum(step, "addr", 0));
  *len = (long)jnum(step, "len", deflen < 0 ? (double)v->size - *addr : deflen);
  if (*addr < 0 || *len < 0 || (size_t)(*addr + *len) > v->size) return fail(reply, "%s range 0x%lx+0x%lx outside 0x%zx bytes", name, *addr, *len, v->size);
  return 0;
}
static uint32_t read_le(const uint8_t *p, int size) {
  uint32_t v = 0;
  for (int i = size - 1; i >= 0; i--) v = v << 8 | p[i];
  return v;
}
static bool compare(uint32_t a, const char *cmp, uint32_t b) {
  if (!strcmp(cmp, "eq")) return a == b;
  if (!strcmp(cmp, "ne")) return a != b;
  if (!strcmp(cmp, "lt")) return a < b;
  if (!strcmp(cmp, "le")) return a <= b;
  if (!strcmp(cmp, "gt")) return a > b;
  if (!strcmp(cmp, "ge")) return a >= b;
  return false;
}

static int reload_game(sb_t *reply) {
  uint8_t *sram = NULL;
  size_t size = 0;
  bool have = sram_snapshot(&sram, &size);
  G.core.unload_game(); /* cores that manage their own .srm write it here */
  if (have && !G.core.get_memory_data(RETRO_MEMORY_SAVE_RAM)) {
    /* state-backed save RAM: the core's own file is authoritative */
    free(sram);
    sram = NULL;
    have = false;
  }
  if (!load_game()) { free(sram); return fail(reply, "reload: retro_load_game failed"); }
  if (have) {
    uint8_t *p = G.core.get_memory_data(RETRO_MEMORY_SAVE_RAM);
    size_t n = G.core.get_memory_size(RETRO_MEMORY_SAVE_RAM);
    if (p && n) memcpy(p, sram, n < size ? n : size);
  }
  free(sram);
  wram_apply_init();
  return 0;
}

static int run_step(const jval *step, sb_t *reply) {
  const char *op = jstr(step, "op", "");
  const char *name = jstr(step, "name", NULL);
  bool ok;
  if (!strcmp(op, "wait") || !strcmp(op, "frames")) {
    run_frames((unsigned long long)jnum(step, "frames", jnum(step, "n", 1)), 0);
  } else if (!strcmp(op, "hold") || !strcmp(op, "press")) {
    uint16_t b = parse_buttons(jstr(step, "buttons", ""), &ok);
    if (!ok) return fail(reply, "bad buttons '%s'", jstr(step, "buttons", ""));
    run_frames((unsigned long long)jnum(step, "frames", 1), b);
  } else if (!strcmp(op, "tap")) {
    uint16_t b = parse_buttons(jstr(step, "buttons", ""), &ok);
    if (!ok) return fail(reply, "bad buttons '%s'", jstr(step, "buttons", ""));
    run_frames((unsigned long long)jnum(step, "frames", 3), b);
    run_frames((unsigned long long)jnum(step, "gap", 3), 0);
  } else if (!strcmp(op, "shot")) {
    if (!name) return fail(reply, "shot needs a name");
    uint8_t *rgb = frame_rgb();
    if (!rgb) return fail(reply, "no frame yet");
    char path[PATH_MAX];
    snprintf(path, sizeof path, "%s/%s.png", G.out, name);
    bool w = write_png(path, rgb, G.fw, G.fh);
    free(rgb);
    if (!w) return fail(reply, "cannot write %s", path);
    if (G.nshots++) sb_puts(&G.shots, ",");
    sb_printf(&G.shots, "{\"name\":");
    sb_json_str(&G.shots, name);
    sb_printf(&G.shots, ",\"frame\":%llu,\"width\":%u,\"height\":%u,\"format\":\"%s\"}", G.frame, G.fw, G.fh, fmt_name(G.ffmt));
    sb_printf(reply, ",\"width\":%u,\"height\":%u", G.fw, G.fh);
  } else if (!strcmp(op, "read")) {
    memview v;
    long addr, len;
    jval *lenv = jget(step, "len");
    int size = (int)jnum(step, "size", 1);
    if (size < 1 || size > 4) return fail(reply, "read size must be 1-4");
    if (get_mem(step, reply, &v, &addr, &len, lenv ? -1 : size)) return 1;
    sb_t val = {0};
    if (lenv) {
      sb_puts(&val, "[");
      for (long i = 0; i < len; i++) sb_printf(&val, "%s%u", i ? "," : "", v.p[addr + i]);
      sb_puts(&val, "]");
    } else {
      sb_printf(&val, "%u", read_le(v.p + addr, size));
    }
    sb_puts(reply, ",\"value\":");
    sb_puts(reply, val.buf);
    set_value_raw(name, val.buf);
    sb_free(&val);
  } else if (!strcmp(op, "dump")) {
    memview v;
    long addr, len;
    if (!name) return fail(reply, "dump needs a name");
    if (get_mem(step, reply, &v, &addr, &len, -1)) return 1;
    const char *format = jstr(step, "format", "bin");
    char path[PATH_MAX];
    snprintf(path, sizeof path, "%s/%s.%s", G.out, name, format);
    if (!strcmp(format, "bin")) {
      if (!write_file(path, v.p + addr, (size_t)len)) return fail(reply, "cannot write %s", path);
    } else {
      sb_t d = {0};
      if (!strcmp(format, "json")) {
        sb_printf(&d, "{\"mem\":\"%s\",\"addr\":%ld,\"frame\":%llu,\"bytes\":[", jstr(step, "mem", "wram"), addr, G.frame);
        for (long i = 0; i < len; i++) sb_printf(&d, "%s%u", i ? "," : "", v.p[addr + i]);
        sb_puts(&d, "]}\n");
      } else if (!strcmp(format, "hex")) {
        for (long i = 0; i < len; i += 16) {
          sb_printf(&d, "%06lX:", addr + i);
          for (long k = i; k < i + 16 && k < len; k++) sb_printf(&d, " %02X", v.p[addr + k]);
          sb_puts(&d, "\n");
        }
      } else {
        sb_free(&d);
        return fail(reply, "dump format must be bin, hex or json");
      }
      bool w = write_file(path, d.buf ? d.buf : "", d.len);
      sb_free(&d);
      if (!w) return fail(reply, "cannot write %s", path);
    }
    sb_puts(reply, ",\"file\":");
    sb_json_str(reply, path);
  } else if (!strcmp(op, "write")) {
    memview v;
    long addr, len;
    jval *bytes = jget(step, "bytes");
    int size = (int)jnum(step, "size", 1);
    long n = bytes && bytes->t == J_ARR ? bytes->len : size;
    if (get_mem(step, reply, &v, &addr, &len, n)) return 1;
    if (bytes && bytes->t == J_ARR) {
      for (int i = 0; i < bytes->len; i++) {
        double b;
        if (!jnum_of(bytes->items[i], &b)) return fail(reply, "bytes must be numbers");
        v.p[addr + i] = (uint8_t)(long)b;
      }
    } else {
      uint32_t value = (uint32_t)(long long)jnum(step, "value", 0);
      for (int i = 0; i < size; i++) v.p[addr + i] = (uint8_t)(value >> (8 * i));
    }
    mem_touched(&v);
  } else if (!strcmp(op, "fill")) {
    memview v;
    long addr, len;
    if (get_mem(step, reply, &v, &addr, &len, -1)) return 1;
    if (jget(step, "seed")) noise_fill(v.p + addr, (size_t)len, (uint32_t)jnum(step, "seed", 1));
    else memset(v.p + addr, (int)jnum(step, "value", 0), (size_t)len);
    mem_touched(&v);
  } else if (!strcmp(op, "loadmem")) {
    memview v;
    long addr, len;
    const char *file = jstr(step, "file", NULL);
    if (!file) return fail(reply, "loadmem needs a file");
    size_t n = 0;
    uint8_t *d = read_file(file, &n);
    if (!d) return fail(reply, "cannot read %s", file);
    if (get_mem(step, reply, &v, &addr, &len, -1)) { free(d); return 1; }
    size_t k = n < (size_t)len ? n : (size_t)len;
    memcpy(v.p + addr, d, k);
    free(d);
    mem_touched(&v);
    sb_printf(reply, ",\"bytes\":%zu", k);
  } else if (!strcmp(op, "until")) {
    memview v;
    long addr, len;
    int size = (int)jnum(step, "size", 1);
    if (size < 1 || size > 4) return fail(reply, "until size must be 1-4");
    if (get_mem(step, reply, &v, &addr, &len, size)) return 1;
    const char *cmp = jstr(step, "cmp", "eq");
    uint32_t want = (uint32_t)(long long)jnum(step, "value", 0);
    uint32_t mask = (uint32_t)(long long)jnum(step, "mask", 0xFFFFFFFF);
    unsigned long long max = (unsigned long long)jnum(step, "frames", 600), every = (unsigned long long)jnum(step, "every", 0);
    unsigned long long holdn = (unsigned long long)jnum(step, "hold", 4), checkEvery = (unsigned long long)jnum(step, "check", 1);
    uint16_t b = parse_buttons(jstr(step, "buttons", ""), &ok);
    if (!ok) return fail(reply, "bad buttons");
    if (checkEvery < 1) checkEvery = 1;
    unsigned long long t = 0;
    bool met = false;
    uint32_t cur = 0;
    for (;;) {
      memview m;
      if (!mem_view(mem_index(jstr(step, "mem", "wram")), &m)) return fail(reply, "memory lost");
      cur = read_le(m.p + addr, size);
      if (compare(cur & mask, cmp, want)) { met = true; break; }
      if (t >= max) break;
      unsigned long long step_n = checkEvery;
      if (t + step_n > max) step_n = max - t;
      for (unsigned long long i = 0; i < step_n; i++, t++) {
        bool pressing = b && every && (t % every) < holdn;
        run_frames(1, pressing ? b : 0);
      }
    }
    sb_printf(reply, ",\"met\":%s,\"waited\":%llu,\"value\":%u", met ? "true" : "false", t, cur);
    if (name) {
      char tmp[64];
      snprintf(tmp, sizeof tmp, "%s", met ? "true" : "false");
      set_value_raw(name, tmp);
    }
  } else if (!strcmp(op, "reset")) {
    state_apply();
    G.core.reset();
    G.state_valid = false;
  } else if (!strcmp(op, "reload")) {
    state_apply();
    if (reload_game(reply)) return 1;
  } else if (!strcmp(op, "savestate")) {
    if (!name) return fail(reply, "savestate needs a name");
    state_apply();
    size_t n = G.core.serialize_size();
    uint8_t *d = n ? malloc(n) : NULL;
    if (!d || !G.core.serialize(d, n)) { free(d); return fail(reply, "serialize failed"); }
    char path[PATH_MAX];
    snprintf(path, sizeof path, "%s/%s.state", G.out, name);
    bool w = write_file(path, d, n);
    free(d);
    if (!w) return fail(reply, "cannot write %s", path);
    G.state_valid = false;
  } else if (!strcmp(op, "loadstate")) {
    const char *file = jstr(step, "file", NULL);
    size_t n = 0;
    uint8_t *d = file ? read_file(file, &n) : NULL;
    if (!d) return fail(reply, "cannot read state %s", file ? file : "(none)");
    state_apply();
    bool u = G.core.unserialize(d, n);
    free(d);
    if (!u) return fail(reply, "unserialize failed");
    G.state_valid = false;
  } else if (!strcmp(op, "result")) {
    sb_t val = {0};
    jwrite(&val, jget(step, "value"));
    set_value_raw(name, val.buf);
    sb_free(&val);
  } else if (!strcmp(op, "log")) {
    log_cb(RETRO_LOG_INFO, "script: %s", jstr(step, "text", ""));
  } else if (!strcmp(op, "info")) {
    sb_puts(reply, ",\"core\":");
    sb_json_str(reply, G.sysinfo.library_name);
    sb_puts(reply, ",\"version\":");
    sb_json_str(reply, G.sysinfo.library_version);
    sb_printf(reply, ",\"pixel_format\":\"%s\",\"width\":%u,\"height\":%u", fmt_name(G.fmt), G.fw, G.fh);
    for (int i = 0; i < MEM_COUNT; i++) {
      memview v;
      bool a = mem_view(i, &v);
      sb_printf(reply, ",\"%s\":{\"size\":%zu,\"access\":\"%s\"}", mem_names[i], a ? v.size : 0, !a ? "none" : v.via_state ? "state" : "pointer");
    }
  } else if (!strcmp(op, "quit")) {
    return -1;
  } else {
    return fail(reply, "unknown op '%s'", op);
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

static void usage(void) {
  fprintf(stderr,
          "usage: retro-host --core CORE --rom ROM --out DIR [--script FILE | --stdin]\n"
          "                  [--option key=value]... [--sram FILE|zero|ff|noise:SEED]\n"
          "                  [--wram-init zero|ff|noise:SEED] [--sysdir DIR] [--quiet]\n");
  exit(2);
}

int main(int argc, char **argv) {
  const char *script = NULL, *sram = NULL;
  G.sram_off = G.wram_off = -1;
  G.fmt = RETRO_PIXEL_FORMAT_0RGB1555;
  struct { char *k, *v; } overrides[128];
  int nover = 0;
  for (int i = 1; i < argc; i++) {
    const char *a = argv[i];
    const char *next = i + 1 < argc ? argv[i + 1] : NULL;
    if (!strcmp(a, "--core") && next) G.core_path = argv[++i];
    else if (!strcmp(a, "--rom") && next) G.rom_path = argv[++i];
    else if (!strcmp(a, "--out") && next) G.out = argv[++i];
    else if (!strcmp(a, "--script") && next) script = argv[++i];
    else if (!strcmp(a, "--stdin")) G.interactive = true;
    else if (!strcmp(a, "--sram") && next) sram = argv[++i];
    else if (!strcmp(a, "--wram-init") && next) snprintf(G.wram_init, sizeof G.wram_init, "%s", argv[++i]);
    else if (!strcmp(a, "--sysdir") && next) snprintf(G.sysdir, sizeof G.sysdir, "%s", argv[++i]);
    else if (!strcmp(a, "--quiet")) G.quiet = true;
    else if (!strcmp(a, "--option") && next && nover < 128) {
      char *kv = strdup(argv[++i]);
      char *eq = strchr(kv, '=');
      if (!eq) usage();
      *eq = 0;
      overrides[nover].k = kv;
      overrides[nover++].v = eq + 1;
    } else usage();
  }
  if (!G.core_path || !G.rom_path || !G.out || (!script && !G.interactive)) usage();

  mkdirs(G.out);
  char abs_out[PATH_MAX];
  if (realpath(G.out, abs_out)) G.out = strdup(abs_out);
  snprintf(G.savedir, sizeof G.savedir, "%s/saves", G.out);
  mkdirs(G.savedir);
  if (!G.sysdir[0]) snprintf(G.sysdir, sizeof G.sysdir, "%s/system", G.out);
  mkdirs(G.sysdir);

  /* Keep the protocol channel clean: the core's own printf output goes to
   * core-stdout.log, replies to the original stdout. */
  int proto_fd = dup(1);
  G.proto = fdopen(proto_fd, "w");
  char path[PATH_MAX];
  snprintf(path, sizeof path, "%s/core-stdout.log", G.out);
  int logfd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (logfd >= 0) { dup2(logfd, 1); close(logfd); }
  setvbuf(stdout, NULL, _IOLBF, 0);

  G.rom = read_file(G.rom_path, &G.rom_size);
  if (!G.rom) { fprintf(stderr, "retro-host: cannot read %s\n", G.rom_path); return 3; }
  G.header_sram_size = header_sram();
  {
    const char *base = strrchr(G.rom_path, '/');
    base = base ? base + 1 : G.rom_path;
    snprintf(G.rombase, sizeof G.rombase, "%s", base);
    char *dot = strrchr(G.rombase, '.');
    if (dot) *dot = 0;
  }
  if (sram) {
    size_t n = G.header_sram_size ? G.header_sram_size : 0x2000;
    G.sram_init = malloc(n);
    G.sram_init_size = n;
    if (!parse_fill(sram, G.sram_init, n)) {
      free(G.sram_init);
      G.sram_init = read_file(sram, &G.sram_init_size);
      if (!G.sram_init) { fprintf(stderr, "retro-host: cannot read --sram %s\n", sram); return 3; }
    }
  }

  jval *steps = NULL;
  if (script) {
    size_t n;
    char *text = (char *)read_file(script, &n);
    if (!text) { fprintf(stderr, "retro-host: cannot read %s\n", script); return 3; }
    const char *err = NULL;
    steps = jparse(text, &err);
    free(text);
    if (!steps || steps->t != J_ARR) { fprintf(stderr, "retro-host: %s: %s\n", script, err ? err : "expected a JSON array of steps"); return 3; }
  }

  load_core();
  for (int i = 0; i < nover; i++) {
    option_t *o = add_option(overrides[i].k);
    free(o->value);
    o->value = strdup(overrides[i].v);
  }
  hostlog("core %s %s", G.sysinfo.library_name, G.sysinfo.library_version);

  sram_prepare_file();
  if (!load_game()) {
    snprintf(G.error, sizeof G.error, "retro_load_game failed");
    write_results();
    fprintf(stderr, "retro-host: retro_load_game failed\n");
    return 3;
  }
  if (!G.core.get_memory_data(RETRO_MEMORY_SYSTEM_RAM) || !G.core.get_memory_size(RETRO_MEMORY_SYSTEM_RAM)) {
    G.state_size = G.core.serialize_size();
    if (G.state_size) {
      G.core.unload_game();
      G.state_mem = calibrate_state();
      if (G.state_mem) G.state = malloc(G.state_size);
      sram_prepare_file();
      if (!load_game()) {
        snprintf(G.error, sizeof G.error, "retro_load_game failed after state calibration");
        write_results();
        return 3;
      }
    }
  }
  sram_apply_pointer();
  wram_apply_init();

  int rc = 0;
  sb_t reply = {0};
  if (steps) {
    for (int i = 0; i < steps->len; i++) {
      reply.len = 0;
      if (reply.buf) reply.buf[0] = 0;
      int r = run_step(steps->items[i], &reply);
      if (r < 0) break;
      if (r > 0) {
        fprintf(stderr, "retro-host: step %d: %s\n", i, G.error);
        rc = 2;
        break;
      }
    }
  } else {
    char *line = NULL;
    size_t cap = 0;
    ssize_t n;
    while ((n = getline(&line, &cap, stdin)) > 0) {
      while (n && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
      if (!n) continue;
      const char *err = NULL;
      jval *step = jparse(line, &err);
      reply.len = 0;
      if (reply.buf) reply.buf[0] = 0;
      int r;
      if (!step || step->t != J_OBJ) {
        r = fail(&reply, "bad step: %s", err ? err : "expected an object");
      } else {
        r = run_step(step, &reply);
      }
      jfree(step);
      fprintf(G.proto, "{\"ok\":%s,\"frame\":%llu%s}\n", r > 0 ? "false" : "true", G.frame, reply.buf ? reply.buf : "");
      fflush(G.proto);
      if (r > 0) G.error[0] = 0; /* reported to the driver; not fatal */
      if (r < 0) break;
    }
    free(line);
  }
  sb_free(&reply);
  jfree(steps);

  /* Battery RAM at exit: SAVE_RAM, or the core's own .srm after unloading. */
  state_apply();
  uint8_t *final_sram = NULL;
  size_t final_size = 0;
  bool pointer_sram = G.core.get_memory_data(RETRO_MEMORY_SAVE_RAM) && G.core.get_memory_size(RETRO_MEMORY_SAVE_RAM);
  if (pointer_sram) sram_snapshot(&final_sram, &final_size);
  write_results();
  G.core.unload_game();
  if (!pointer_sram) {
    snprintf(path, sizeof path, "%s/%s.srm", G.savedir, G.rombase);
    final_sram = read_file(path, &final_size);
  }
  if (final_sram) {
    snprintf(path, sizeof path, "%s/sram.bin", G.out);
    write_file(path, final_sram, final_size);
    free(final_sram);
  }
  G.core.deinit();
  fprintf(G.proto, "{\"done\":true,\"frames\":%llu,\"rc\":%d}\n", G.frame, rc);
  fflush(G.proto);
  return rc;
}
