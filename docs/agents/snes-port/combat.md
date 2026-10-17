# COMBAT module: Goku's fighting on the field

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/combat/`, generator
`snes/gen/combat.mjs`, tests `snes/test/combat/`. Browser references:
`engine/mana-mod.js` (gates, input, punches, ki, Kamehameha, focus,
transformation, hits, launches, power stats, status recovery) and its native
adapters `native-interaction.js`, `native-combat-sound.js`,
`native-hit-recovery.js`, `native-feedback.js`, `native-equipment.js`,
`native-senzu.js`; gameplay spec in [combat](../combat.md).

Combat decides; other modules show. It owns timing, hit boxes, damage,
launches, the form and Goku's stats, publishes the pose state through the
goku module's `!goku_*` fields, and calls fx (pictures), audio (DBZ cues),
ui (King Kai) and destroy (the map) through `bind.asm`.

## Status

| Feature | State | Evidence (`snes/test/combat`, Mesen vs the browser engine) |
| --- | --- | --- |
| canAttack gate, input remap (B attack, Y ki, X ring/back → native Y or Start, A never the dash on foot, L focus, L+Y charge, L+A transform) | Done | every scenario's action clock |
| Punch combo (jab, cross, kick ×1.5; 14/7-frame punches, strike after 2/1, buffered after 9/4, held B chains, contact hold 3/5), native B pulse on a miss | Done | `punch`, `combo`, `combo-held`, `ssj-punch` |
| Ki (12/5-frame cooldown, 14 px/frame, 40% damage, first contact, held Y repeats) | Done | `ki`, `ki-held`, `ki-ssj` |
| Kamehameha (charge 90/45, partial strength, pulses 8/6, full SSJ wave 64 frames, 80 px, 640 px, 48 px/frame, taper) | Done | `beam`, `beam-partial`, `wave` |
| Focus (96 frames), transformation (72 first reveal, then 32), burst (56 px radial, 75% SSJ), revert (10) | Done | `transform` (radial arc against the browser formula), `revert` |
| Damage 4095/8191 (×0.9 Heavy Gi) queued at +1F1 with +1F0 = +1EC = 0, clamp 999, excess leaves 1 HP for the native lethal hit; rewards native | Done | `punch` (+2 GP, +1 XP), `mantis` (+100 GP, +10 XP) |
| Launches 56/88 px, 12-frame eased arc and lift, F9 death effect keeps flying; bosses (species ≥ $54) stay | Done | launch points within 3 px of the browser's arc in every killing scenario; `mantis` (no launch, defeat event starts) |
| Saiyan resilience: incoming damage /20 cap 12 (ordinary), /4 cap 80 (boss), SSJ /50 cap 5, /8 cap 40; recovery 24/8 frames | Done | `boss-hit`, `boss-hit-ssj`, `chip-hit`, `chip-hit-ssj` (HP loss equal) |
| Deflection (every third clean contact, two of three in SSJ, 24 frames apart) through the retail dodge path | Done | `deflect` (≥ 1), `deflect-ssj` (≥ 2) |
| Level 99, skills 8:99, 999 HP (missing HP kept), strength 255 / attack byte 255, DEF +160/80 (+320/160 SSJ) | Done | every scenario's stat sequence; debug presets `sword`, `late`, `flight` now FULL |
| Heavy Gi (−10% strength, −20% agility, never stacking on rebuilds), DUST BAG names, weapon tiers | Done (gi), names patched | `heavy-gi`, `heavy-gi-ssj` (armor ring off/on) |
| Senzu Bean (name, targets through the item ring) | Ported, not yet compared | — |
| Status recovery (focus breaks sleep / petrify / Frosty / Balloon / Engulf; poison and sleep break SSJ) | Ported, not yet compared | — |
| Effects | Gameplay records done; drawing through fx (`bind.asm`): spawns (impact, ki, burst, status) from the logic, continuous draws (beam picture, aura, orb, lightning) from `combat_field_frame`; placeholder sprites only without the fx library (`!COMBAT_FX_PLACEHOLDER`) | fx's `gallery` / `beams` pass with combat; on-screen look not reviewed yet (see Remaining work) |
| World flight: focus and transformation | Done (`combat_world_frame`) | — |
| World flight: the aerial charge | The world module's stand-in (`!w_combat_owns` = 0) | world tests pass |

## Resources

| Resource | Use |
| --- | --- |
| Code `$A2:8000-$A2:B3C2` | `!CODE_COMBAT` (about 13 KiB; asserted below `$A2:F000`) |
| Code `$A2:F000-$A2:F3CB` | `bind.asm`: bindings to optional modules, assembled after every module include |
| Data `$E2:0000-$E2:0A3A` | `!DATA_COMBAT` (`snes/gen/combat.mjs`): damage, beam damage/width by charge, wave envelope by age, strength and focus tables, launch arcs, lift, radial ease, hand sockets, item names, placeholder cells |
| WRAM `$7E:D800-$7E:D8FF` | `!RAM_COMBAT` (map in `module.asm`); public fields below |
| SRAM `$31:7C00-$31:7FFF` | `!SRAM_WORK_COMBAT`: 16 effect records, 9 launch records, 9 sound marks, 9 beam pulse timers, the pad of the last four field vblanks (`!PADH`), destroy_hit arguments |
| SRAM `$31:6200` | `!PERSIST_COMBAT` byte 0: `PCF_REVEALED` (the first transformation reveal was seen). Shared: `!persist_ssj_lock` (permanent form), `!persist_goku_active` (read) |
| OAM / VRAM | Placeholder effects only (`!COMBAT_FX_PLACEHOLDER`: 1 unless the real fx library is in the build, detected by its `!fx_busy`): OBJ region `!VRAM_FIELD_OBJ_B` (owner `$02`, tiles `$184+`) |
| Other modules' RAM written | `!goku_form`, `!goku_act`, `!goku_act_facing/_age/_arg/_dur`, `!goku_mode/_facing/_age` (reactions); destroy's `!arg_*`; fx's request block; core `!core_pad_mask/_inject` |

## Original code patched

Every patch asserts the original bytes (`%origN`); all are `%hijack_jsl`
unless noted.

| Address | Bytes | Handler | Why |
| --- | --- | --- | --- |
| `C0:C164` | 4 | `cb_nmi_vblank` | End of every field NMI: count field vblanks and keep pad 1 of each (the browser's 60 Hz clock and input while the game lags) |
| `C0:B0AC` | 6 | `cb_hook_logic` | `JSR $93B9 / JSR $B69C`: combat runs after the frame's pad read and before movement, actors and the OAM build, as the browser's `beforeFrame` |
| `C0:B224`, `C0:B2A7` | 4, 4 | `cb_hook_weapon_charged/_normal` | Goku never swings the native weapon (`native-interaction.js`): B talks / opens through the native interaction only |
| `C0:4157` | 5 | `cb_hook_hit_sound` | The damage consumer's impact sound: Goku's own hits use the DBZ cue (`native-combat-sound.js`) |
| `C0:4053` | 5 | `cb_hook_receive` | Goku's incoming damage scaled after the retail 999 cap (`native-hit-recovery.js` `receive()`) |
| `C0:514B` | 5 | `cb_hook_parry` | Physical resolver → retail dodge `C0:4E6F` for deflections |
| `C0:4AF9` | 5 | `cb_hook_defense` | End of the DEF rebuild: Saiyan defense |
| `C0:F590`, `C1:8355` | 5, 5 | `cb_hook_hurt_timer`, `cb_hook_number_fade` | Shortened recovery: hurt timer and damage-number fade |
| `C0:4699`, `C0:4BF2` | 4, 4 | `cb_hook_level_read`, `cb_hook_attr_clamp` | Heavy Gi agility on a fresh level-table read; attribute clamp |
| `C0:4576` | 4 | `cb_hook_rebuild_end` (`%hijack`, JML) | End of the stats rebuild: strength / agility / DEF rules at once |
| `D0:D1CF` | 6 | `cb_hook_weapon_tier` | Goku's weapon ring tier |
| `C0:74B6` | 5 | `cb_hook_equip` | Weapon / sword-dust equips rejected |
| `D0:DB2A` | 4 | `cb_hook_item_target` | Senzu Bean targets (`native-senzu.js`) |
| `C0:D651`, `C0:D890` | 6, 5 | `combat_hook_move_vector/_commit` (`bind.asm`) | Saiyan recoil (`softenRecoil`); skipped when a flight module owns the site (below) |
| `CA:A120` (14), `CA:9F00` (8), `CA:9B4B` (102) | `%patch` | — | Item names: Senzu Bean, Heavy Gi, DUST BAG for the nine swords |

## Runtime

**Clock.** `cb_nmi_vblank` counts field vblanks (`!cb_vblanks`) and stores
each vblank's pad in `!PADH`. The logic hook runs one combat step per field
vblank since the previous field frame (at most 4), each with its own
vblank's pad, so a lagging scene keeps the browser's 60 Hz timing (punch
lengths, charge, beam ages, launch arcs). Catch-up steps skip what only the
last step shows: a beam calls `destroy_hit` and draws on the last step.

**Order inside a field frame.** Pre-logic hook: `cb_field_gate` (Goku
active, field vectors, menu session, canAttack, the native mask), the stats
upkeep, then either `cb_idle_frame` or the steps (`cb_hr_tick`,
`cb_quake_tick`, `cb_read_input`, `cb_goku_frame`) and `cb_publish`.
Frame end (`combat_field_frame`, before `goku_frame`): the frame's mask and
injections go to the core pad filter (never masking a button combat
injects), then audio beds, King Kai's charge remarks and effects.

**Idle frames.** When combat's own state is quiet (`!cb_quiet`, noted at the
end of every full frame and cleared by APIs, the receive / deflect hooks,
menu and world frames, input locks), none of the frame's vblanks has B, Y,
A, X or L and, with Goku active, no foreign action, hurt pose, reaction
mode, breakable status or map change is pending, `cb_idle_frame` does
exactly what the steps would (clock, pads, mask, power upkeep) and nothing
else. `cb_facing` is then left alone: actions track it in their own steps
and the resist reaction reads the native facing.

**Input.** Through `!core_pad_mask` / `!core_pad_inject` (applied from the
game's next pad read). B is always combat's (a miss pulses native B for
talking and chests); Y is ki while Goku is player 1's character; X/L/R are
combat's while he can attack; on foot A never reaches the native dash.
X is ring / back everywhere: native Y, or Start in the status-window and
controller editors (`panelBack`). Buttons held when a menu closes stay away
from combat until released.

**Hits.** `cb_hit` queues damage at `+1F1` with `+1F0 = +1EC = 0`, leaves
1 HP when the total would kill (the native lethal hit then runs death,
rewards and events), marks the hit for the impact sound, and starts a launch
for small enemies. Party members, species ≥ `$80`, dead actors and the
puzzle orb (`$55`, through destroy's `destroy_orb_hit`) are excluded.
Strength/width tables are the browser's floats evaluated in the generator.

**Stats.** Every frame Goku can attack: level byte 98 (99), skills `$88`
and 99s (every 8th frame, at once when the level is off), 999 maximum HP,
`$E1ED = 0`. Strength / agility / attack / DEF and the body armor are
checked every frame against combat's last pass (a form, power or armor
change, or another writer, runs the pass at once); the native rebuild hooks
apply the rules immediately.

## Hand-off contracts

- **Flight (C0:D651 / C0:D890).** A module that also steers at these sites
  defines `!FLIGHT_OWNS_D651` / `!FLIGHT_OWNS_D890`, hooks them itself and
  calls `combat_recoil_vector` at D651 (before reading `$1E/$1F`) and
  `combat_recoil_commit` at D890 (any DB/M/X; all registers preserved; D = 0).
- **World flight.** `combat_world_frame` runs focus, transformation and the
  form in Mode 7. The aerial charge is still the world module's stand-in;
  owning it means setting `!w_combat_owns` and calling `world_fire_ki` /
  `world_fire_wave` with combat's charge (`world.md`).
- **Story.** `!STORY_HOOK_EQUIP_CONFISCATE = combat_equip_confiscate` (the
  Sandship guards: the Heavy Gi is unequipped, still owned) and
  `!STORY_QUERY_EQUIP_WEIGHTED = combat_q_weighted`; story's test builds keep
  their own answers. Story reads `!cb_can` directly.
- **Frieza / Vegeta.** Define `!COMBAT_HOOK_DAMAGE = <label>`: JSL with
  A16 = damage, X16 = actor offset, DB = `$7E`; return A16 = damage (special
  boss resistance). `combat_api_danger` while a dangerous encounter runs.
- **Debug scene select.** `combat_debug_hook` answers `CANCEL_COMBAT`,
  `FORM` (`superSaiyan`) and `POWER_INTRO` (`superShown` → `PCF_REVEALED`;
  the flight hint is the UI's). It takes the `ANY` slot unless another
  module defines `!DEBUG_PRESET_HOOK_ANY` first; a later module that needs
  `ANY` must chain to it.

## API for other modules

All entries are `JSL`, any M/X on entry, DB and D preserved; exit M16/X16
unless noted.

| Entry | Contract |
| --- | --- |
| `combat_api_cancel` | `mod.cancelCombat()`: action, charge, effects and combat's cues end; launches and the form stay |
| `combat_api_state` | A16 = bit0 can attack, bit1 charging, bit2 Super Saiyan, bit3 full charge, bit4 beam live; X16 = charge frames; Y16 = combat's action kind (`!GOKU_K_*`) |
| `combat_api_set_form` | A = 0 base / 1 Super Saiyan, without a transformation (scenes, the permanent form, endings) |
| `combat_api_hit` | Goku's hit on actor X (offset `$0600-$1600`): A16 = damage, Y16 = launch facing 0-3 or `$FFFF`. C set when it took damage |
| `combat_api_targets` | Hostile actors in an attack box: write `!ag_x/_y/_dir/_range/_width/_behind/_cy` (`$7E:D890-D89D`, long addressing); A16 = slot mask (bit 0 = slot 3) |
| `combat_api_lock` / `_unlock` | A16 = owner bit: Goku cannot attack while any is set (input stays native) |
| `combat_api_input_lock` / `_unlock` | A16 = owner bit: the owner takes the whole pad (native input masked, combat paused) |
| `combat_api_danger` / `_safe` | A16 = owner bit: no damage scaling and no deflection |
| `combat_recoil_vector` / `_commit` | See the flight contract |
| `combat_debug_hook` | Debug preset hook (A = kind, X = preset, Y = payload) |

Public WRAM (read-only for others, long `$7E:xxxx`): `!cb_can` `$D812`
(canAttack this frame), `!cb_form` `$D811`, `!cb_act` `$D814`,
`!cb_charge` `$D826`, `!cb_vblanks` `$D8C4` (field vblanks).

## Tests

`node snes/test/combat/run.mjs [scenario …]` (Mesen2; ROM `$SNES_ROM` or
`dist/snes/secret-of-goku.sfc`). Each scenario imports a browser-mod state
into the cartridge (Goku active and the combat block clean before and after
the import) and runs the same state and input through `engine/mana-mod.js`
with its native adapters on the vendored SnesJs core (`jsref.mjs`). The
traces are compared by `compare.mjs`:

- the action clock (kind, age, combo, contact hold, charge, form) as a
  sequence of distinct states, each within 3 frames of the browser's; a
  cartridge frame may skip as many browser states as the vblanks it spans,
  and it must reach the browser's last state. Cartridge records are timed
  by the vblank their logic started at (`vbl`), one frame of input latency;
- each touched enemy's settled life states, agreeing damage queues, launch
  points within 3 px of the browser's arc (radial bursts against the
  browser's formula on the cartridge's geometry);
- GP / XP rewards, the strength / agility / DEF sequence and the final
  level / HP / stats; scenario checks (defeat event, HP loss, deflections,
  armor ring sequence).

Scenarios: `punch`, `combo`, `combo-held`, `ssj-punch`, `ki`, `ki-held`,
`ki-ssj`, `beam`, `beam-partial`, `wave`, `transform`, `mantis`, `boss-hit`,
`boss-hit-ssj`, `chip-hit`, `chip-hit-ssj`, `deflect`, `deflect-ssj`,
`heavy-gi`, `heavy-gi-ssj`, `revert` (Rabite field, Mantis Ant arena, party
state). All 21 pass on this branch with audio, destroy, debug, world, title
and story merged. Traces: `.local/snes-test/combat/<scenario>/`.

## Performance

Mesen, Potos walk (`snes/test/goku/budget.lua` scene): combat's logic hook
about 5.2 lines p50 / 5.9 p90 a field frame, its frame-end hook 0.6, the NMI
counter 0.44 (Goku inactive: about 3 lines). Measured against goku alone the
goku budget test (Goku on vs off; combat follows him) reads 25 lines (limit
24). A full Super Saiyan wave costs about 10 lines a step in combat; the
first frames of a wave are dominated by destroy's band growth (one
`destroy_hit` call up to ~600 lines while the band grows, ~14 lines a frame
afterwards), so those frames lag 2-5 vblanks and combat catches up.

`snes/test/perf` (p90 logic end over the original cartridge, shared import
bundles): sword 39, Sandship 37, battle 45, Fortress 41, flight 42, Rabite
field 44 lines on this branch; main without combat measures 45, 31, 37, 33,
38, 43, so combat adds about 4-8 lines where the scene is busy and the
40-line limit is already reached on main in two scenes.

The title arrival's impact (`snes/test/title`, "no frames made late by the
modules") has every fifth frame (the game's party refresh) start the
modules at line ~181 on this branch: they end at 229-230 in 4 of 140 frames
(main: 219-222). Combat adds about 5 lines to those frames, fx's module
another 2-3. With `CORE_FASTROM` (MEMSEL set) the same frames end at
207-215 and none is late.

## Remaining work

- Compare Senzu targeting, status recovery (focus breaking statuses,
  poison / sleep ending SSJ), the native B pulse (talk, chests) and weapon
  tier / equip rejection against the browser.
- The aerial charge in world flight (`!w_combat_owns`).
- Senzu Bean / DUST BAG item icons (names only so far).
- Review the effects on screen with fx: in the Rabite field (field frames
  lag to 2 vblanks) screenshots showed no Kamehameha strip or charge orb and
  a misplaced full-wave polygon although `fx_beam` / `fx_draw` receive the
  expected arguments every frame (palms, facing 1, length 64-320, width 12,
  age). Combat's effect records use their own names (`!ER`, `!er_*`,
  `!ERK_*`, `!ERF_*`) so nothing shadows fx's `!fx_*` request block, and
  every request starts from a cleared block.
- The Mantis Ant rescue aftermath now that imports keep the sound CPU.

## Requests

- **core**: FastROM (`CORE_FASTROM`). Measured on this branch: the title
  arrival's late impact frames (4-5 of 140 at lines 229-232 with SlowROM)
  all end by 215; every module runs 25% faster, which combat, goku,
  destroy, fx and audio together now need in heavy rooms and cutscenes.
  With fx merged, combat's ~6 lines a frame also cost destroy's
  `demo-wind` its first Wind Palace breach again (planner spare time; main
  with fx keeps it).
- **core**: a shared field-vblank counter and per-vblank pad history (what
  `C0:C164` provides here) would serve other 60 Hz clients.
- **goku**: the `ring` / `menu` tests drive the ring with native X after a
  Select; with combat (as the browser mod) X opens the controlled
  character's ring through native Y, and Y is ki. Their browser reference
  (`menuref.mjs`) runs without `mana-mod.js`'s input layer. The budget test
  compares Goku on and off, which now includes combat (25 lines, limit 24).
- **title**: the arrival test's ring round trip presses native Y, which is
  Goku's ki with combat (the browser mod's player presses X); see also the
  impact frames under Performance.
- **fx**: continuous draws are kept only when they come from frame
  callbacks (combat now sends its beam from `combat_field_frame`); worth a
  line in fx.md. A define such as `!FX_DRAWS` would be a cleaner signal than
  `!fx_busy` for combat's placeholder. Please look at combat's beam / orb /
  wave in a lagging field scene (see Remaining work).
- **debug**: one hook per preset can hold only one module; several modules
  (combat, frieza, radio, world) answer kinds of the same presets.
- **destroy**: a full Super Saiyan wave's first frames (band growth) cost up
  to ~600 lines in one `destroy_hit` call.
