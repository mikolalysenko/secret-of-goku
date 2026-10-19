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
| World flight: the aerial charge | Shared combat charge, action, input locks and native sound pulses (`!w_combat_owns` = 1) | world `controls`, `ki`, `fortress` |
| Virtual targets (mana-mod.js `entities()` extras: frieza.js `entity()` / `hit()`), registered in `modules.asm`: punches, ki, beams and the burst include them; a hit calls the module's routine (no native queue, number, launch or damage hook) with the spark, cue, contact hold, ki first contact and beam pulses of an actor | Done | `frieza-punch`, `frieza-ki`, `frieza-ki-held`, `frieza-beam`, `frieza-wave`, `frieza-burst` against the browser's own frieza.js `hit()`: every call (damage, melee, HP taken) and its frame, Frieza's HP, sparks, shots |
| Receive hooks at `C0:4053`: other modules see Goku's queued damage before Saiyan resilience (the fed Beast's cap, `beast-challenge.js`) | Done; frieza's `frieza_combat_receive` listed (the fed Beast's 110 / 140 cap, 75-frame grace) | `receive-cap`, `receive-none` (a test hook) |
| `combat_api_beam`: the live beam's `beamGeometry()` for other modules | Done | `beam-api`, `wave-api` (every age equals the browser's); vegeta's clash cases read it |
| Damage hooks as a list (no include-order rule) | Done | frieza's (Beast, Lich) and vegeta's (slot-3 window) both listed; vegeta suite |
| Input hold: the pad taken, what was fired runs on (`trial.inputLocked`) | Done | `input-hold`; vegeta's draw holds |
| X / back on the options pages decided by the open option `$1876` (browser f376330) | Done | `panel`: the browser test's 8 page pairs (3 stayed open before) |
| X never reaches the game as native X (hidden up front in every frame, also while Goku is inactive) | Done | `xrace`: 25 press offsets after the Potos import open the controlled character's ring (4 opened member 1's before) |

## Resources

| Resource | Use |
| --- | --- |
| Code `$A2:8000-$A2:B72F` | `!CODE_COMBAT` (about 14 KiB; asserted below `$A2:F000`) |
| Code `$A2:F000-$A2:F44A` | `bind.asm`: bindings to optional modules, assembled after every module include |
| Data `$E2:0000-$E2:0BCC` | `!DATA_COMBAT` (`snes/gen/combat.mjs`): damage, beam damage/width by charge, beam half width 8.8 by charge and wave age (`combat_api_beam`), wave envelope by age, strength and focus tables, launch arcs, lift, radial ease, hand sockets, item names, placeholder cells |
| Core `$A0:F10E-$A0:F123` | The extension lists in `modules.asm` (`modules_combat_targets`, `_damage`, `_receive`), core's bank |
| WRAM `$7E:D800-$7E:D8FF` | `!RAM_COMBAT` (map in `module.asm`); public fields below |
| SRAM `$31:7C00-$31:7FFF` | `!SRAM_WORK_COMBAT`: 16 effect records, 9 launch records, 9 sound marks, the pad of the last four field vblanks (`!PADH`), destroy_hit arguments, the beam picture, 16 beam pulse timers (per target bit), the virtual target cache and the log of the last 8 virtual hits (`!VT`, `$31:7E34`), `combat_api_beam`'s record (`!cb_beam`), the hold owners (`!cb_inhold`); test builds `$31:7F00-7F23` (`!CBT`) |
| SRAM `$31:6200` | `!PERSIST_COMBAT` byte 0: `PCF_REVEALED` (the first transformation reveal was seen). Shared: `!persist_ssj_lock` (permanent form), `!persist_goku_active` (read). NEW GAME resets the form (combat's and `!goku_form`) to base; a load sets both from `!persist_ssj_lock`, whatever the title-time init saw |
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
| `C0:4053` | 5 | `cb_hook_receive` | Goku's incoming damage: other modules' receive hooks first (`modules_combat_receive`: the fed Beast, `beast-challenge.js`), then scaled after the retail 999 cap (`native-hit-recovery.js` `receive()`) |
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

**Gameplay follow-up (2026-10-18).** Goku now clears the native sword's
stamina percentage, charge latch and charged sparkle before the HUD uploads,
including native writes made after combat's logic. His ki charge remains
independent. A recovery/teleport camera follow blocks new attacks and focus,
matching the browser's pending-camera branch. The input and movement calls
use the FastROM mirror. Native target checks resolve facing into a rectangle
once per query and unroll the nine slots; range, inclusive edges, eligibility,
damage and virtual targets are unchanged. `combat meter` covers the stale
HUD and ordinary hero fallback; `combat geometry` checks 192 combinations of
facings, boundaries and excluded targets. Punch, combo, ki, beam, wave,
transform and Frieza comparison cases pass; `flight scene` checks charging
during and after recovery-camera movement.

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

**Native attribute clamp.** `C0:4BD7` batches the first four attribute
clamps, then retains the final native iteration and the Heavy Gi hook at
`C0:4BF2`. The native accumulator, flags, scratch counter, status penalty
and narrow-index wrapping are preserved. `COMBAT_ATTR_BATCH_SLOW` keeps
the scalar loop. The assembled `attr-clamp.test.mjs` compares 15,168
contexts with that loop and its former hook wrapper; the current loop's
representative 230 CPU cycles fall to 146. Native reward and stat rebuild
timing stays synchronous.

**Input.** Through `!core_pad_mask` / `!core_pad_inject` (applied from the
game's next pad read). B is always combat's (a miss pulses native B for
talking and chests); Y is ki while Goku is player 1's character; X/L/R are
combat's while he can attack; on foot A never reaches the native dash.
X is ring / back everywhere: native Y, or Start in the status-window and
controller editors (`panelBack`: the open option `$1876` is 5 or 6), and X
itself is hidden in every frame combat sees, also while Goku is inactive:
a mask requested only once combat's step saw the press came after the
game's read of that frame, so one press frame in five opened member 1's
ring. The press edge that picks Y or Start compares with the previous
frame's pad in menus too (mana-mod.js `lastPadInput`): with the last
field pad instead, a ring opened with X kept every later press of a menu
on its first route. Buttons held when a menu closes stay away from combat
until released.

**Hits.** `cb_hit` queues damage at `+1F1` with `+1F0 = +1EC = 0`, leaves
1 HP when the total would kill (the native lethal hit then runs death,
rewards and events), marks the hit for the impact sound, and starts a launch
for small enemies. Party members, species ≥ `$80`, dead actors and the
puzzle orb (`$55`, through destroy's `destroy_orb_hit`) are excluded.
Strength/width tables are the browser's floats evaluated in the generator.

**Virtual targets** (`virtual.asm`). Combat's target masks use bits 0-8 for
actor slots 3-11 and bits 9-15 for the entries of `modules_combat_targets`,
so every scan visits the actors first and then the virtual targets in
table order (frieza.js is index 12, after the actors, in the browser too).
The first scan of a field frame asks every entry's query and caches the
answers; the targets only change through hits during combat's steps (scene
modules tick at the frame end), so the cache serves the catch-up steps,
and a hit makes it stale so a fallen target leaves at once. A virtual
target has nothing pending (it is never "lethal queued"), is never an orb,
never flies and skips the damage hooks, as mana-mod.js `hit()` returns for
custom entities first; its hit routine gets X16 = 1 while combat's action
is a punch (what frieza.js and joch-trial.js test), and its answer (HP
taken, 0 = no contact) feeds the punch's contact test. Sparks sit at the
target's x, y - 12, beam pulses keep a per-bit timer, a ki shot ends at
its first contact.

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
- **World flight.** `world_prepare_frame` establishes the flight session
  before `combat_world_frame` runs focus, transformation, charge and input
  locks. `combat/world.asm` owns the aerial charge and mirrors it to world
  for rendering; world still owns trajectories and the shot lifetime.
  A transform cannot be interrupted by charging, releasing L with Y held
  fires one wave without stray ki, and entering/leaving flight cancels the
  previous mode's action. Core hides altitude buttons on the first pad read
  of an L+A/L+B chord, before native flight can consume them.
- **Story.** `!STORY_HOOK_EQUIP_CONFISCATE = combat_equip_confiscate` (the
  Sandship guards: the Heavy Gi is unequipped, still owned) and
  `!STORY_QUERY_EQUIP_WEIGHTED = combat_q_weighted`; story's test builds keep
  their own answers. Story reads `!cb_can` directly.
- **Frieza / Vegeta / orbit.** Virtual targets, damage hooks and receive
  hooks are lists in `snes/src/modules.asm` (below): add a line for the
  module, in any include order. The single-owner `!COMBAT_HOOK_DAMAGE`
  define is gone. `combat_api_danger` while a dangerous encounter
  runs; `combat_api_input_lock` / `_hold` while a scene takes the pad;
  `combat_api_beam` for Goku's live beam.
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
| `combat_api_targets` | Hostile targets in an attack box: write `!ag_x/_y/_dir/_range/_width/_behind/_cy` (`$7E:D890-D89D`, long addressing); A16 = target mask: bit 0 = actor slot 3 ... bit 8 = slot 11, bits 9-15 = virtual entries 0-6 (queried afresh) |
| `combat_api_beam` | C set while Goku's Kamehameha is live (a `beam` effect with life > 0): X16 = palms x, Y16 = palms y (map), A16 = facing (0 down, 1 right, 2 left, 3 up) \| `$0100` fired as Super Saiyan \| `$0200` full wave; the long record `!cb_beam` (`$31:7EB2`) holds `beamGeometry()` of its current frame: `+0` x, `+2` y, `+4` dx, `+6` dy (-1/0/1), `+8` length (px), `+10` half width (8.8, `floor(256·w)` of the browser's doubles), `+12` byte fired as Super Saiyan, `+13` byte full wave, `+14` age (max - life), `+16` life, `+18` taper (44 or 0). Its first 14 bytes have the layout of vegeta's `!vs_gb_*`. C clear otherwise. Uses only combat's math scratch, so a virtual target's hit routine may call it. `!COMBAT_API_BEAM` is defined (= the label) |
| `combat_api_vtarget` | X16 = a virtual target's browser entity index (its table entry; frieza 12): C set when that target can be struck now (its query, asked afresh): A16 = species, X16 = x, Y16 = y (map), and the long word `!cb_vq` (`$31:7EC8`) = its terrain byte \| the entry's flags << 8 (`!CVT_AIRBORNE` = 1). C clear otherwise. For Instant Transmission's target list |
| `combat_api_lock` / `_unlock` | A16 = owner bit: Goku cannot attack while any is set (input stays native) |
| `combat_api_input_lock` / `_hold` / `_unlock` | A16 = owner bit (A preserved). **lock**: the owner takes the whole pad (native input masked, combat's input zero, nothing injected) and combat's action, charge and effects end (frieza.js `inputLocked` plus `cancelCombat()`). **hold**: the same pad, but what was fired runs on: while Goku can act every effect ages (holds not honoured), the action advances and projectiles hit; nothing new starts, launches pause (joch-trial.js `inputLocked`). Any owner's lock wins over holds. **unlock** releases the owner's lock or hold |
| `combat_api_danger` / `_safe` | A16 = owner bit: no damage scaling and no deflection |
| `combat_recoil_vector` / `_commit` | See the flight contract |
| `combat_debug_hook` | Debug preset hook (A = kind, X = preset, Y = payload) |

Extension lists in `snes/src/modules.asm` (core's bank; add a line per
module, the order inside a list carries no meaning):

| List | Contract |
| --- | --- |
| `modules_combat_targets` | Virtual targets, at most 7: `dl <query>, <hit> : db <browser entity index>, <flags>` each. **query**: C set while the target can be struck: A16 = species (low byte; ≥ `$80` is never a target) with the terrain byte (actor `+$0B`, layer bit 7, floor bits 0-1) in the high byte for Instant Transmission, X16 = x, Y16 = y (map: the point the browser's `entity()` reports and the boxes test; frieza.js uses the feet + 12). **hit**: A16 = Goku's damage (after the form, Heavy Gi and attack scale), X16 = 1 while combat's action is a punch (mana-mod.js `action.kind === 'punch'`), else 0; returns A16 = HP taken, 0 = no contact (`hit().after >= before`: no punch hold or spark). Both JSL with DB = `$7E`, D = 0, M16/X16; they may change A, X, Y, must preserve DB and D, and run inside combat's step (a hit should defer `combat_api_cancel` to its own frame, as frieza's `fz_win` does). Flags: `!CVT_AIRBORNE` (hovers: a teleport may end in the air) |
| `modules_combat_damage` | Damage hooks on native actors (the Mana Beast, the empowered Lich): JSL each with A16 = damage, X16 = actor offset, DB = `$7E`, D = 0, M16/X16; returns A16 = damage and keeps X. Not called for virtual targets |
| `modules_combat_receive` | Receive hooks: Goku's queued damage at the native consumer `C0:4053` (Goku's own queue, X = 0) while Goku is active, before the native 999 clamp and combat's Saiyan resilience: JSL each with A16 = `$E1F1` (nonzero; heals, `$E1B0` bit 12, are never offered), DB = `$7E`, D = 0, M16/X16; returns A16 = the damage to apply (0 = none: no hit recorded either) |

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
state). `transform` places Goku where the browser's walk ends (x 324) on
both sides: a lagging field frame walks 2 px less, and on the integration
build the Rabite field lags enough that the Rabite stayed outside the
burst. Traces: `.local/snes-test/combat/<scenario>/`.

**Virtual targets** (`frieza-punch`, `frieza-ki`, `frieza-ki-held`,
`frieza-beam`, `frieza-wave`, `frieza-burst`): the battle reference
(`snes-ref__battle__state`, Goku the permanent Super Saiyan, wearing the
Heavy Gi) with Frieza pinned at a spot (his only node, no attack due: the
cartridge rewrites his position before every combat step at `00:B0AC`) and
written through the frieza module's own field mapping
(`snes/test/frieza/state.mjs`). The browser runs mana-mod.js with the real
frieza.js restored from the same snapshot and never ticked; a proxy logs
its `hit()` calls and keeps Frieza's own bursts out of combat's effect
list. Checked beside the action clock: every hit call in order (damage,
melee flag, HP taken) within 3 frames, Frieza's settled HP, the live ki
shots and spark positions of every cartridge frame equal to the browser's
within 2 frames, no launch, no native queue. On the build before the
registry the same cases fail (no hit, no hold, the shot flies through).
They run only when the frieza module is in the build and registered
(`frieza_virtual_target` in the ROM's symbols, `snes/test/frieza/state.mjs`
present); otherwise they report skipped.

**Test ROM** (`-DCOMBAT_TEST`, built once per run into
`.local/snes-test/roms/combat-test.sfc` for scenarios with `testRom`): a
mailbox at `$31:7F00` (`!CBT`) read at the start of each field frame's
logic (hold, lock, unlock for an owner), a receive hook in
`modules_combat_receive` (keep, cap, none) and `combat_api_beam`'s answer
at every frame end. `beam-api` / `wave-api`: the API at every age equals
the browser's `beamGeometry()` (palms relative to Goku, direction, length,
half width 8.8, taper, flags, life). `input-hold`: a hold from 3 frames
after a full Kamehameha's release for 40 frames against a stand-in
`trial.inputLocked` in the browser: the beam runs out and keeps hitting,
launches pause, B held across the release starts nothing until the hold
ends and then punches. `receive-cap` / `receive-none`: the Mantis's 300
offered to the hook, capped at 110 then ceil(110 / 4) = 28 by the boss
rule, or taken away.

**Cases on the cartridge alone**: `panel` repeats the browser test of
f376330 (`tests/browser/native-status.spec.mjs`): from the party state, X
opens the ring, right rotates it to an option, B opens it, X backs out;
eight page pairs, including Status opened at cursor 5 after option 4.
`xrace`: with Goku inactive (the native boy in the Potos probe state), X
pressed 8-32 frames after the import must open the controlled character's
ring (`$1808` = 0) every time; before, offsets 14, 19, 24 and 29 opened
member 1's.

`--profile` adds combat's cost to each scenario's line (scanlines of 1364
master clocks, from the ROM's symbols): its logic hook per combat step, its
frame end per field frame, and the virtual targets' queries and hits per
call (the module's routine included).

On main with the frieza module (78d7955) all 34 pass, the Frieza cases
included; the frieza (13 cases), vegeta (11, every tick), goku (11) and
perf suites pass, and the scene select has 21 presets full, `trial` native
(vegeta) and `hexas` partial (Goku's position after the preset; main's own
build gives the same).

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

Virtual targets (`run.mjs --profile`, master clocks, main with frieza
listed): a query costs 0.3 lines when the target is elsewhere
(`frieza_virtual_target` leaves at once off map 246) and 1.5 when it is
live, once per field frame in which an attack scans; each scan then adds
about 25 cycles. With the earlier 0.88-line query, combat's logic per step
in the Rabite scenarios grew against the same build without the registry
by punch +0.06, beam +0.15, combo +0.17, SSJ ki +0.42, base ki +0.54 lines;
idle frames do no scan (+9 cycles for the cache reset). A virtual hit
costs 5.5-6.5 lines, almost all of it frieza's `frieza_virtual_hit` (the
scaling on the hardware divider, the burst and the cue); combat's side is
under a line. `snes/test/perf` is unchanged by these changes: on main at
78d7955 its p90 and lag frames are equal with and without them in all six
scenes (the build over the original: sword +20, Sandship +23, battle +21,
Beast +2, Fortress +16, flight +13 lines).

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
  The X race of goku.md's request is closed (X is hidden up front in every
  frame, `xrace`): `menu` can open the boy's ring with X again if wanted.
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
- **frieza**: listed in all three lists (`modules_combat_targets`: index
  12, airborne; `modules_combat_damage`; `modules_combat_receive`), and its
  unread `!COMBAT_HOOK_DAMAGE` define is deleted. frieza.md and the comment
  over `frieza_combat_damage` (`beast.asm`) still name that define and the
  include order it needed. The hit's X16 is "combat's action is a punch",
  the browser's rule, also for a ki shot landing during a punch.
- **vegeta**: the registry can replace the slot-3 window. A version that
  does it (commit c0b2c19 on branch `worktree-agent-a988f7ddad4064d41`;
  every tick of every vegeta case agrees with joch-trial.js) changed the
  frame pacing enough on the integration build that `combat-final`'s pilot
  reached the Final Flash at 19 HP and missed the gold clash; re-apply it
  with a pilot that keeps Goku standing until the Final Flash.
- **flight**: Instant Transmission can list the same targets through
  `combat_api_vtarget` (X16 = slot index 3-15: C set with the species,
  position, terrain and airborne flag of a live virtual target registered at
  that index), in place of the per-frame `!fl_tp_custom` posts.
- **flight / ui (integration)**: in the Rabite field `flight_frame` costs
  6 / 11 / 20 lines (p50 / p90 / max) and `ui_field_frame` 2 / 11 / 20; the
  scene completes 117 field frames in 155 against 126 on main.
