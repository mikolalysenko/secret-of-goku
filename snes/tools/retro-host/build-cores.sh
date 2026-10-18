#!/bin/sh
# Fetches and builds the libretro cores used by snes/test/emulators:
#   snes/tools/retro-host/build-cores.sh [snes9x] [bsnes]
# Sources go to .local/tools/emu-src/<core> (pinned commits below, override
# with SNES9X_REF / BSNES_REF), libraries to .local/tools/emu/. Nothing here
# is committed. Needs git, make and a C/C++ compiler (clang on macOS).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
src="$repo/.local/tools/emu-src"
out="$repo/.local/tools/emu"
jobs=${JOBS:-8}
SNES9X_REF=${SNES9X_REF:-1bcc369e89f08243e0a462882fb1f3e42e51de3a}
BSNES_REF=${BSNES_REF:-78474e5d39f58872dc21aca18cf9eb583b147fe7}
case "$(uname -s)" in
  Darwin) ext=dylib ;;
  MINGW*|MSYS*|CYGWIN*) ext=dll ;;
  *) ext=so ;;
esac
mkdir -p "$src" "$out"

# fetch <dir> <url> <ref>: shallow checkout of one commit (or branch/tag).
fetch() {
  if [ ! -d "$1/.git" ]; then
    git init -q "$1"
    git -C "$1" remote add origin "$2"
  fi
  git -C "$1" fetch -q --depth 1 origin "$3"
  git -C "$1" checkout -q --force FETCH_HEAD
  echo "$(basename "$1"): $(git -C "$1" rev-parse HEAD)"
}

build_snes9x() {
  fetch "$src/snes9x" https://github.com/snes9xgit/snes9x.git "$SNES9X_REF"
  # fpic overrides the makefile's -mmacosx-version-min=10.1, which it adds
  # when it misreads macOS 11+ version numbers.
  make -C "$src/snes9x/libretro" -j"$jobs" fpic=-fPIC
  cp "$src/snes9x/libretro/snes9x_libretro.$ext" "$out/"
}

build_bsnes() {
  fetch "$src/bsnes" https://github.com/bsnes-emu/bsnes.git "$BSNES_REF"
  make -C "$src/bsnes/bsnes" -j"$jobs" target=libretro binary=library
  cp "$src/bsnes/bsnes/out/bsnes_libretro.$ext" "$out/"
}

cores=${*:-snes9x bsnes}
for core in $cores; do
  case "$core" in
    snes9x) build_snes9x ;;
    bsnes) build_bsnes ;;
    *) echo "unknown core: $core" >&2; exit 2 ;;
  esac
done
ls -l "$out"
