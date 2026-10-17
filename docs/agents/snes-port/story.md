# Story module (SNES port)

Spoilers. Part of the [cartridge port](plan.md); build and harness in
[snes-rom.md](../snes-rom.md). The module puts the browser mod's story stack
(`engine/native-story.js` and every table and builder it loads) into the
cartridge: compiled events and dialogue for all four party variants in banks
F0–F7, the runtime that selects them, and the hooks other modules implement.

| Piece | File |
| --- | --- |
| Generator (runs the browser's own story code in Node) | `snes/gen/story.mjs`, `snes/gen/story-env.mjs` |
| Runtime (65816) | `snes/src/modules/story/module.asm` |
| Generated tables | `dist/snes/gen/story/` (`bank_f*.bin`, `data.asm`, `hooks.asm`, `defines.asm`, `testhooks.asm`, `catalog.json`) |
| Mesen tests | `snes/test/story/run.mjs`, `snes/test/story/story.lua` |

## Native event interpreter

### Ticks and states

`00:B09C` calls `JSL $01E8C7` once per field frame (inside the frame logic
`B08C`). `C1:E8C7` sets DB = `$7E` and runs `E8D3`:

1. Return if `($E2 & 1) | $FF | $52` or `$E8 & 4` (fades, map loads, menus).
2. If `$D0` bit 7 is set, dispatch the wait state through `C1:E902`.
3. Otherwise fetch at `E8EF`: `REP #$20 / LDA [$D1]` → `$04` = opcode,
   `$05` = first operand; opcodes ≥ `$50` are clamped to `$50`;
   `JMP ($E922,X)` (16-bit targets in bank `$01`).

Handlers end with `RTS` (yield until the next field frame) or `BRL $E8D3`
(continue in the same tick). The event pointer is `$D1-$D3` (24-bit);
handlers advance only its low word, so a script never crosses a bank.

| `$D0` | Meaning (handler) |
| --- | --- |
| `00` | idle |
| `01` | running |
| `80` | gather wait: until `$4E` = 0 (`F2E9`, set by op 03) |
| `81` | text engine running from `$1D01-$1D03`; when `$48` = 0 the pointer is copied back (`F2F5`) |
| `82` | timer: `$4F` counts down (op `28 nn`, about 5 frames a unit) |
| `83` | wait for a button press of the controlling player (op `28 00`) |
| `84`, `87`–`8F` | resume immediately |
| `85` | wait until no party/NPC actor has `$E042` (movement) pending (op 08) |
| `86` | wait for `$E2` bit 3 to clear |
| `FF` | set by CALL while `E77B` resolves the callee |

### Addressing

`C1:E76D` (JSL, A16 = id) → `E77B`. Callers: NPC talk `00:B697` (`$D4` =
talker slot), map triggers `00:BEF7`, JUMP/CALL/door opcodes, and the core's
`core_event_request`.

| A | Meaning |
| --- | --- |
| `000-7FF` | script event (only if `$D0` is 0 or `FF`): pointer from `C9:0000+2·id` (ids < `$400`) or `CA:0000+2·(id&3FF)`; `$D3` = `C9`/`CA`; `$D0` = 1; a fresh start (`$D0` was 0) also locks the triggering actor (`E88D`) |
| `800-BFF` | door: map = `C8:3000+4·door` word & `1FF` (→ `$DC`), `$DE`/`$DF` entry position, `$FF` = `$40` (load at the next boundary) |
| `C00-CFF` | world request from `C6:7A80` (takeoff; `$E8` = 4) |
| `D00-D7F` | world landing from `C6:7C80` |

All 2,048 events start at distinct addresses and every one ends in `00`
(END), `02` (RETURN) or an unconditional JUMP, so no event runs into
another. CALL is single level: the return pointer goes to `$D6-$D8`.

### Opcodes

Lengths follow `engine/event-codec.js commandLength`. Semantics from the US
interpreter, cross-checked with Moppu's SecretOfManaRandomizer
`EventCommandEnum` (also used by `engine/scene-graph.js`).

| Op | Len | Meaning |
| --- | --- | --- |
| `00` | 1 | END: clears `$D0`, `$4E`, `$3A`, actor locks |
| `01` | 1 | NOP: advance and yield one frame |
| `02` | 1 | RETURN from CALL (`$D6-$D8` → pointer), continue |
| `03` | 1 | gather party (`$D0` = `$80`) |
| `04`, `05` | 1 | toggle party visibility |
| `06`, `07` | 1 | cutscene lock / unlock |
| `08` | 1 | wait for actor movement (`$D0` = `$85`) |
| `09`, `0A` | 1 | refresh objects / map pieces |
| `0B` | 2 | skip |
| `0E`, `0F` | 1 | sell / upgrade menu |
| `10-17 nn` | 2 | JUMP to event `(op&7)<<8 \| nn` |
| `18-1B nn` | 2 | DOOR `(op-18)<<8 \| nn`; the script continues after the load |
| `1C nn` | 2 | world request `$C00\|nn`, then END |
| `1D` | 1 | cannon launch |
| `1E ii` | 2 | give item |
| `1F ss` | 2 | system: name a character (0–2), save menu (6), … |
| `20-27 nn` | 2 | CALL event `(op&7)<<8 \| nn` |
| `28 nn` | 2 | wait `nn` units, or a button press when 0 |
| `29 ff` / `2A ff` | 2 | increment / decrement story flag `$CF00+ff` |
| `2B m` / `2C m` | 2 | add / remove party member (1 girl, 2 sprite) |
| `2D e [a b]` | 2 or 4 | screen effect (4 bytes for `e` = 5, 6, `80-8F`) |
| `2E`, `2F` | 2 | buy menu / heal |
| `30 ff vv` | 3 | set story flag `$CF00+ff` = `vv` |
| `31 a n` | 3 | player-character animation (`a`: 0 event actor, 1–3 party) |
| `32 a m` | 3 | move actor (`m`: direction bits + distance) |
| `33`, `34 a n`, `36`, `37` | 3 | background colour, actor animation, gold add/remove |
| `38`–`3C` | 4 | actor attributes; `39 a k v` sets byte `+k` of actor `a` (`C8-CF` = spell levels) |
| `3D hh` | 2 | **story extension:** call `story_hook_table[hh]` (unused by the original game: `3D-3F`, `44-47`, `4F` are bare `RTS`) |
| `40 c a b d` | 5 | sound driver command via `$1E00` and `C3:0004` (01 music, 02 effect) |
| `41`–`43` | 5 | conditionals; `42 ff rr xx yy`: run the embedded JUMP/CALL/DOOR `xx yy` when `$CF00+ff` ∈ [`rr>>4`, `rr&15`] |
| `48`–`4E` | 6 | conditionals with the consequence in the last two bytes |
| `50` | 1 | open window (text engine from here on) |
| `51` / `52` | 1 | close window / clear page |
| `57 n` | 2 | name of character `n` |
| `58`, `5A x label…`, `5B` | | choice: options at column `x`, then a JUMP per outcome (cancel first) |
| `59 n` | 2 | spaces |
| `5D`–`5F` | 1 | gold window |
| `7D … 7E` | | credits ASCII |
| `7F` | 1 | newline |
| `80-FF` | 1 | glyphs |

### Text

Glyphs: `80` space, `81-9A` a–z, `9B-B4` A–Z, `B5-BE` 0–9, `BF . C0 , C1 /
C2 ' C3 [ C4 ] C5 : C6 - C7 % C8 ! C9 & CA ? CB ( CC ) CD * CE ^`. A window
holds three 28-column lines; `28 00` waits for a press between pages and `52`
clears. The interpreter hands everything ≥ `$50` to the text engine
(`F27A`: pointer → `$1D01-$1D03`, `$D0` = `$81`), which draws until it reaches
an interpreter opcode and copies the pointer back. `57 n` copies name slot
`n` (`$CC00+12n`, 12 bytes) to `$7E:A22F` (`C0:1866`) and draws from there.
Authored text uses `{0}`–`{3}`; `{3}` is the boy, whose name lives in the
tail of Goku's slot (`$CC06`).

## How the browser relocates events, and how the cartridge does it

`native-story.js load()` compiles 587 scripts (four party variants per event,
identical variants shared) into virtual banks `F0:8000`–`F6:96DF` and maps
324 original event starts to them. 280 entries are a plain variant per party
mask; 44 are closures over runtime state (Frieza, quest, Sandship, trial,
broken doors, RAM flags). At every opcode fetch (`C1:E8EF` breakpoint) it:
resumes a finished crisis greeting; redirects an original event start to its
entry; prepends a crisis greeting for NPC talks; credits Dragon Ball grant
markers; skips movement for absent companions; remembers spell grants.

**Generator.** `snes/gen/story-env.mjs` loads the browser's `native-story.js`
in Node on the same ROM copy the browser compiles from
(`gokuDialoguePatch(originalGamePatch(rom))`, evaluated from
`engine/rom-patches.js` and `engine/dialogue-patches.js`) and captures
`load()`'s internal maps (scripts, metadata, entries, grant markers, greeting
kinds) by wrapping `Map.prototype.set` during the call. Nothing is
re-implemented: the banks are written from the captured allocations and
checked byte for byte against the browser's `inspectByte` view, so the
layout fingerprint (`!STORY_LAYOUT`) matches and imported browser states that
stopped inside a relocated script continue correctly.

Each closure entry is evaluated over every assignment of the state it reads
(tracked through getters and a RAM proxy; an undeclared read fails the
build) and turned into a decision tree. Side effects (`challenge.victory()`
in 42F) become hook calls before the tree. All 6,588 table rows are checked
against the encoded program at build time.

**Runtime.**

| Site | Original | Story code | Browser equivalent |
| --- | --- | --- | --- |
| `C1:E794` | event table lookup | `story_resolve`: original pointer; if Goku is active and `story_dispatch[id]` is set, run its route program → `$D1-$D3`, `!story_last_event`, `EVENT_ANY` + the script's hooks; arm the greeting check | entry redirect at fetch |
| `C1:E8EF` | `REP #$20 / LDA [$D1]` | `story_fetch`: greeting resume/prefix, grant markers, absent-companion skips, spell grants, `3D` opcode | fetch breakpoint |
| `00:C481` | `REP #$30 / LDA $DC` | `story_map_load`: story-area floors (`story-areas.js`) before the map's pieces and objects load | write hook on `$DD` |
| `00:C487` | object list bounds | `story_object_list`: owners may substitute a RAM list | `storyRead` bank-8 views |
| `00:DD85` | record copied to `$C808+16i` | `story_object`: story overlays + owner hooks, recompute `$C807` | `storyRead` bank-8 views |
| `00:1866` | name copy | `story_name_byte`: `displayName(n)` | `createNativeNames` |
| field frame | | queued requests, spell re-grants, Jema repairs, Fire Palace floor, fast track, Potos gatekeeper (R fast-forward with `-DSTORY_FAST_FORWARD`) | `C0:B073` breakpoint, `potosGatekeeper.tick`, `scene-fast-forward` |

Resolving at `E77B` instead of at the fetch is equivalent because event
starts are unique, every event is terminated, and `E77B` is the only writer
of an event-start pointer. The crisis greeting is still decided at the first
fetch, because the event's actor (`$3A`) may be set after `E76D` returns.

Route programs live in `$E5:2000+` (`story_dispatch[id]` = program address):

| Byte | Node |
| --- | --- |
| `00 aa aa bb ii ii` | enter script `bb:aaaa`; `ii ii` = its event id (`lastEvent`, selects hooks) |
| `01 q n t0…tn-1` | switch on query `q` (values ≥ `n` use the last branch) |
| `02 h` | call hook `h` (route side effect) |
| `03 d` | dynamic resolver `d` (1: Water Palace walk) |
| `04 tt tt` | goto |

## Hook catalogue (`story_hook_table`)

An owner implements a hook by defining `!STORY_HOOK_<NAME> = <label>` in its
own module file; `snes/src/modules.asm` includes `story/hooks.asm` last, so
the table picks the label up (stub `RTL` otherwise). Hooks are entered with
`JSL`: P = M16/X16, DB = `$7E`, D = 0, A = the event id (per row below for
other hooks), X/Y = the caller's X/Y. Preserve DB/D, return with `RTL`; A/X/Y
may be clobbered. Event hooks run inside the interpreter while it resolves
an event: keep them short, never start another event from one, and leave
the game's direct page alone. The ids are generated; use the names
(`!STORY_H_<NAME>`). `catalog.json` lists the live table.

Every JavaScript callback the browser runs because a relocated event was
entered (`native-story.js` lines after `relocations++`) is a hook keyed by
the entered script's id, in the browser's order (Frieza, Sandship, trial
observers, then the specific calls). The browser's `call(F.x)` helpers are
native CALLs to one-byte marker events; entering one fires its hook.

| ID | Hook | Owner | Fired when |
| --- | --- | --- | --- |
| 01 | `EVENT_ANY` | any | every relocated entry (A = id); the browser's generic `onEvent` observers |
| 02 | `FRIEZA_TRIAL` | frieza | entering `0F6` (F.trial) |
| 03 | `FRIEZA_TRIAL_READY` | frieza | entering `06E` |
| 04 | `FRIEZA_EMPOWER` | frieza | entering `129` |
| 05 | `FRIEZA_TRIAL_LEAVE` | frieza | entering `06F` |
| 06 | `FRIEZA_TRIAL_FADE` | frieza | entering `071` |
| 07 | `FRIEZA_AFTER_TRIAL` | frieza | entering `12A` |
| 08 | `FRIEZA_OFFER` | frieza | entering `0A7` |
| 09 | `FRIEZA_THEFT` | frieza | entering `0A8` |
| 0A | `FRIEZA_EMPEROR_PRELUDE` | frieza | entering `4A7` |
| 0B | `FRIEZA_SCENE_CLEAR` | frieza | entering `4A8` |
| 0C | `FRIEZA_PALACE` | frieza | entering `07B` |
| 0D | `FRIEZA_DECK_DEATH_BALL` | frieza | entering `07C` |
| 0E | `FRIEZA_TEMPLE_EXIT` | frieza | entering `069` |
| 0F | `FRIEZA_CORE_ARRIVAL` | frieza | entering `06A` |
| 10 | `FRIEZA_FANHA_FINISH` | frieza | entering `4A9` |
| 11 | `FRIEZA_EMPEROR_SHOT` | frieza | entering `066` |
| 12 | `FRIEZA_EMPEROR_FALL` | frieza | entering `067` |
| 13 | `FRIEZA_TREE_ARRIVAL` | frieza | entering `178` |
| 14 | `FRIEZA_TREE_CHARGE` | frieza | entering `179` |
| 15 | `FRIEZA_TREE_SHOT` | frieza | entering `17A` |
| 16 | `FRIEZA_TREE_IMPACT` | frieza | entering `17B` |
| 17 | `FRIEZA_TREE_LEAVE` | frieza | entering `17C` |
| 18 | `FRIEZA_TREE_RETURN` | frieza | entering `19D` |
| 19 | `FRIEZA_TREE_WAKE` | frieza | entering `1A4` |
| 1A | `FRIEZA_TREE_DONE` | frieza | entering `17D` |
| 1B | `FRIEZA_REVEAL` | frieza | entering `0AC` |
| 1C | `FRIEZA_ALTAR_APPROACH` | frieza | entering `1A8` |
| 1D | `FRIEZA_STEAL` | frieza | entering `0AD` |
| 1E | `FRIEZA_CORE_CHARGE` | frieza | entering `0CC` |
| 1F | `FRIEZA_CORE_SHOT` | frieza | entering `0D6` |
| 20 | `FRIEZA_CORE_IMPACT` | frieza | entering `0D7` |
| 21 | `FRIEZA_ESCAPE` | frieza | entering `0D8` |
| 22 | `FRIEZA_LEAVE` | frieza | entering `0BF` |
| 23 | `FRIEZA_EIGHTH` | frieza | entering `0AF` |
| 24 | `FRIEZA_SHOWDOWN` | frieza | entering `0C1` |
| 25 | `FRIEZA_LIFT` | frieza | entering `0C2` |
| 26 | `FRIEZA_EXPLODE` | frieza | entering `0C3` |
| 27 | `FRIEZA_GOLD` | frieza | entering `0C5` |
| 28 | `FRIEZA_BATTLE` | frieza | entering `0C6` |
| 29 | `FRIEZA_VICTORY` | frieza | entering `0C7` |
| 2A | `FRIEZA_DEFEATED` | frieza | entering `0C8` (also call `story_api_quest_recover`) |
| 2B | `FRIEZA_REVIVE` | frieza | entering `0C9` |
| 2C | `SANDSHIP_CAPTURE` | destroy (Sandship) | entering `28B` (stow gear before the capture) |
| 2D | `SANDSHIP_CRASH` | destroy (Sandship) | entering `07D` |
| 2E | `SANDSHIP_WAVE` | destroy (Sandship) | entering `075` (arm the breakout hint) |
| 2F | `SANDSHIP_DECK` | destroy (Sandship) | entering `077` |
| 30 | `TRIAL_START` | vegeta | entering `3DB` |
| 31 | `EQUIP_CONFISCATE` | combat | entering `28B`, after the Sandship hook |
| 32 | `STORY_FAST_TRACK` | story | entering `088` (retired Luka travel): sets the fast track |
| 33 | `ENDING_BEGIN` | ending | entering `42F` |
| 34–37 | `ENDING_CUE_DRAGON/WISH/VILLAGE/COMPLETE` | ending | entering `0A3`–`0A6` (cue 'wish' calls `story_api_quest_wish`) |
| 38–3C | `ENDING_CUE_DEPART/KAI/SCATTER/REUNION/SUMMON` | ending | entering `0DE`, `0E4`, `14F`, `176`, `06B` |
| 3D | `STORY_REPAIR_IF_WISHED` | story | entering `0A4`: calls `FRIEZA_REPAIR_CORE` when the ledger says wished |
| 3E | `FRIEZA_REPAIR_CORE` | frieza | the wish repairs the core |
| 3F / 40 | `BEAST_CHOOSE_ORDINARY` / `_FEED` | frieza (Beast challenge) | entering `095` / `096` |
| 41 | `BEAST_VICTORY` | frieza (Beast challenge) | route effect: before `42F` picks the ending |
| 42 | `QUEST_COLLECTED` | radio | a Ball is collected (A = palace index 0–6): "DRAGON BALLS: n / 7" |
| 43 | `QUEST_WISH_CEILING` | flight | the wish: repair ceiling escapes |
| 44 | `QUEST_WISH_SCARS` | world | the wish: restore world-map craters |
| 45 | `FLIGHT_LAND` | flight | Potos gatekeeper: cancel combat and local flight, land |
| 46 | `OBJECT_SANDSHIP` | destroy (Sandship) | per object record at load: A = record index, X = slot offset (bytes at `$7E:C808+X`) |
| 47 | `OBJECT_ENDING` | ending | same, reunion cliff |
| 48 | `OBJECT_FRIEZA` | frieza | same: Emperor (map 431 record 3), exterior Jema (195), arena 246 suppression |
| 49 | `OBJECT_TRIAL` | vegeta | same: Dyluck/Thanatos staging on 246 |
| 4A | `OBJECT_LIST_SANDSHIP` | destroy (Sandship) | per map load, A = map: may substitute the object list (wreck view: hidden crew, enemy-map header, appended monsters) |
| 4B | `OBJECT_LIST_ENDING` | ending | same: map 180 gains Dyluck's record |
| 4C | `OPCODE_SCRIPT` | any | free for scripts using `3D` |

Object list contract (`OBJECT_LIST_*`): on entry `!RAM_STORY+$8C` (word) is
the list start, `+$8E` the end and `+$90` the bank (`C8`); a list is an 8-byte
header followed by 8-byte records, end = start + 8 + 8n (n ≤ `$30`). Point
them at a copy (e.g. SRAM work space) to change the header or add records.
Record hooks may change `$C808-$C80F+X`; story recomputes `$C807+X`.

## Query catalogue (`story_query_table`)

Route programs and story logic ask other modules for state through queries.
Implement one with `!STORY_QUERY_<NAME> = <label>`: `JSL`, P = M16/X16,
DB = `$7E`, D = 0; return A16 = the value (an index into the domain below);
preserve DB/D. Unimplemented foreign queries return 0, which is the
browser's value when that module is absent (e.g. `mod.frieza?.crisisActive`
undefined).

| ID | Query | Owner | Value |
| --- | --- | --- | --- |
| 00 | `MASK` | story | party mask: bit0 girl (`$E200&1`), bit1 sprite (`$E400&1`) |
| 01 | `QUEST_COUNT` | story | Balls held (0–7) |
| 02 | `QUEST_HELD7` | story | all seven held and none stolen |
| 03 | `QUEST_SEEDS_ALL` | story | all seven personally collected (`canFeed`) |
| 04 | `QUEST_MASK_ALL` | story | ledger mask = 127 |
| 05 | `QUEST_WISHED` | story | wish granted |
| 10 | `FRIEZA_CRISIS` | frieza | five-minute crisis active |
| 11 | `FRIEZA_STOLEN` | frieza | Frieza holds the Balls (`unresolved`) |
| 12 | `FRIEZA_PENDING` | frieza | entrance pending |
| 13 | `FRIEZA_PALACE` | frieza | stage `palace` |
| 14 | `FRIEZA_NEEDS_TREE` | frieza | `needsTree` |
| 15 | `FRIEZA_ELIGIBLE` | frieza | Dryad invitation due |
| 16 | `FRIEZA_TRIAL` | frieza | stage `trial` |
| 17 | `FRIEZA_EMPEROR_KILLED` | frieza | |
| 18 | `FRIEZA_TREE_COMPLETE` | frieza | `status.tree === 'complete'` |
| 19 | `FRIEZA_TRIAL_WON` | frieza | |
| 1A | `FRIEZA_DEFEATED` | frieza | `status.stage === 'defeated'` |
| 1B / 1C | `FRIEZA_POPOI_MEMBER` / `_PRIMM_MEMBER` | frieza | membership recorded at the showdown |
| 1D | `FRIEZA_STOLEN_CLASS` | frieza | 0 none, 1 some, 2 all seven stolen |
| 1E | `FRIEZA_INPUT_LOCKED` | frieza | `inputLocked` or orbit intro (R stays masked) |
| 20 | `FORTRESS_DESTROYED` | world | Fortress destroyed by a full beam |
| 21–23 | `DOOR_GAIA_SHORTCUT` / `_PANDORA_RUINS_EXIT` / `_NORTHTOWN_RUINS_SEAL` | destroy | `barriers.doorBroken(id)` |
| 28 / 29 | `TRIAL_ACTIVE` / `TRIAL_PARTY` | vegeta | trial running / borrowed party mask |
| 30–32 | `BEAST_FED` / `_STARTED` / `_WON` | frieza (Beast challenge) | `challenge.status` |
| 38–3B | `SANDSHIP_CRASH` / `_WRECKED` / `_PLANNED` / `_DOOR` | destroy (Sandship) | door: 0 none, 1+i = door `1A0+i` |
| 3C | `EQUIP_WEIGHTED` | combat | Heavy Gi still worn |
| 40 | `ENDING_ACTIVE` | ending | ending owns the player (`canAttack` gate) |
| 41 | `LOCAL_FLIGHT` | flight | Goku hovers (Potos gatekeeper) |

RAM queries (ids `$80+`, evaluated by story): `$CF0D ≥ 8`, `$CF0E ≥ 8`
(Sandship captives), `$CF28 ≥ 11`, `$CF44 ≥ 2`.

Routed events and what decides them (everything else is a variant per party
mask): `025`, `4E5` trial return; `072`, `074`, `076`, `07A`, `28B`, `291`,
`292`, `295`–`299`, `29C`, `2A1` Sandship; `07C`, `0A8`, `0C1`, `0CA`,
`4A1`–`4A4`, `4AA`, `4E0`, `4E1`, `5F8` Frieza; `085` Luka's Advice (ledger,
Frieza); `093`–`097`, `09A`, `429` Beast; `42D` Thanatos aftermath; `42F`
ending (`endingResult` + membership; `BEAST_VICTORY` first); `131` Water
Palace walk; `16A`/`16B`/`55A`/`55B` broken doors; `558` Northtown captive.

## Story state

| Where | Field |
| --- | --- |
| `!PERSIST_STORY+$00` | version (1 once initialised; 0 after a new game or a legacy load: the ledger is then inferred from `$CF90-$CF96` = 1, as `dragon-quest.js restore()` does) |
| `+$01` / `+$02` | ledger: Balls held / personally collected (bit = palace: Water, Earth, Wind, Fire, Light, Dark, Moon) |
| `+$03`, `+$04`, `+$05` | legacy delivery count, wished, fast track |
| `+$08`–`+$17` | spell grants kept for the girl / sprite slots (`$E3C8`/`$E5C8`), re-OR-ed every field frame once present |
| `!RAM_STORY` | last event, counters, request queue, greeting state, scratch, name buffer, fast-forward, object list bounds (map in `module.asm`) |
| `!SRAM_WORK_STORY` | `+$000` Water Palace walk script; test builds: `+$700` query table, `+$800` hook log (128 entries), `+$B10` dispatch sweep |

The browser kept spell grants only in checkpoints; here they persist with the
save sidecar, so a save made before recruiting a companion keeps the spells.

## API

All `JSL`; any M/X on entry unless noted; DB/D preserved.

| Routine | Contract |
| --- | --- |
| `story_api_request` | A16 = event id < `$800`, X16 = NPC slot (`$600-$17FF`, step `$200`) or 0. Carry set when queued. Same rules as the browser's `story.request`: nothing queued, Goku active and `canAttack`; the event starts at a later field frame if the NPC is still there unchanged (`$3A` = slot). Use this for story-driven starts; `core_event_request` is the generic idle-field service. |
| `story_api_travel` | A16 = door (1–`$3FF`). Carry set when queued. |
| `story_api_quest_collect` | A16 = palace 0–6. Carry set if new; fires `QUEST_COLLECTED`. |
| `story_api_quest_recover` | Frieza returns the pouch: held \|= collected. |
| `story_api_quest_wish` | grants the wish only for a good ending; fires `QUEST_WISH_CEILING`, `QUEST_WISH_SCARS`. |
| `story_api_quest_status` | A16 = held \| collected<<8, X16 = wished. |
| `story_api_ending_result` | A16 = 0 good, 1 fortress, 2 balls, 3 frieza, 4 beast (`ending-rules.js`). |
| `story_api_flag_get` / `_set` / `_raise` | story flags `$CF00+n` (A = n; X = value / minimum; raise never lowers, carry = changed). |
| `story_api_display_name` | A16 = n (0–3) → X16 = address in bank `$7E` of the 12-byte display name (overlay text, King Kai's radio). |
| `story_api_window_has_choice` | carry set when the interpreter's current window (`$D1-$D3`) holds a choice before it closes, or the stream is unknown (`windowHasChoice`, for R fast-forward). |

## Resources and patches

| Kind | Use |
| --- | --- |
| ROM `F0:8000-F6:96DF` | compiled scripts (byte-identical to the browser); free: lower halves of F0–F7, `F6:96E0-F7:FFFF` |
| ROM `E5:0000-3893` | dispatch (`$0000`), hook index (`$1000`), greeting kinds (`$1800`), programs (`$2000`, 5 KiB), hook lists, greetings, grant markers, RAM queries, story areas, Water Palace templates, default names |
| ROM `A5:8000-9466` | runtime code; `A5:FC00` hook and query tables |
| WRAM | `!RAM_STORY` (`$7E:DA00`, `$91` of `$100` bytes used) |
| SRAM | `!PERSIST_STORY` (`$18` of `$C0` bytes), `!SRAM_WORK_STORY` |

Patched original code (each asserted with `%orig`):

| Address | Bytes | Purpose |
| --- | --- | --- |
| `C1:E794` (4) + `C1:E798` (2) | `JSL story_resolve` / `BRA $E7BA` | event-start resolution |
| `C1:E8EF` (4) | `JML story_fetch` | per-opcode work, `3D` |
| `C0:C481` (4) | `JSL story_map_load` | story-area floors |
| `C0:C487` (4) + `C0:C48B` (2) | `JSL story_object_list` / `BRA $C498` | object list view |
| `C0:DD85` (5) | `JSL story_object` | object record overlays |
| `C0:1866` (6) | `JSL story_name_byte` | name view |
| `CA:A139` (12) | "Fly" | Flammie Drum item name (`flight-dialogue.js`) |

All other `flight-dialogue.js` spans sit inside relocated events (4E4, 52F,
532); the browser shows their compiled copies, so the cartridge does too.

## Coordination with title/arrival

| Title/arrival owns | Story owns |
| --- | --- |
| Event 103 (sword pull) and its `C7:4400` stream, hook `C9:269F`, resume `C9:2790`; story never relocates 100–103, 106, 400 (`nativeOnlyEvents`) | Every other dialogue edit: all compiled events, including 10C and 112, whose `dialogue-patches.js` lines are compiled from the patched copy |
| The 103 text patches in the cartridge (`92691`, `927E4`) | `flight-dialogue.js` (Fly label patch) |
| `crownGoku` at impact (slot 0 = GOKU, boy's name to `$CC06`) and `!persist_goku_active` (also derived for legacy saves, as `arrival.restore` does) | The `57 n` read view at `C0:1866` (`displayName`); `story_api_display_name` for overlay text |
| Starting Drum (`rom-patches.js originalGamePatch`) | |

`plan.md` lists `native-names` under title. The name *view* lives here
because every authored `{3}` line depends on it; if title also needs
`C0:1866` the build's overlap check will say so, and one side should call
the other's routine.

`scene-fast-forward.js` belongs to the UI module (`plan.md`, `!RAM_UI`). Story
provides `story_api_window_has_choice` (the event-stream scan) and a
complete reference implementation over the core input filter
(`story_fast_forward`: R held in a scene masks R, pulses B on two of every
eight frames for prose, stops at choices), built only with
`-DSTORY_FAST_FORWARD` so two modules never inject B.

## Tests

`node snes/test/story/run.mjs [case …]` (or `node snes/test/run-all.mjs
story`). Cases import a browser-mod state, set story fields, start an event
like `story.request()`, and record every native resolution plus every byte
read from F0–F7. Expectations come from the browser's own closures
(`env.evaluate`), its `storyRead`, or the browser stack running on SnesJs,
never from copied data. Test-ROM cases build `dist/snes/story-test.sfc` with
`-DSTORY_TEST`. Screenshots and traces go to `.local/snes-test/story/`.

| Area | Cases | Checked |
| --- | --- | --- |
| From a new game | `newgame-*` (4) | start from the core's `potos.mss` (fresh NEW GAME, empty battery, Potos by the native door) with Goku made active: the ledger initialises from native flags; a villager's `{3}` line reads Randi; Luka's one-time spear gift (with its music upload) runs, the menu returns, Advice opens the 0/7 page; the Elder's line |
| Party variants | `party-solo/-girl/-sprite/-both` | 24B resolves to the browser's variant for each mask; its text is read |
| Choices, ledger | `luka-advice` | Luka's menu, Advice chosen, "DRAGON BALLS: 3 / 7" page |
| Names | `names-boy-*` (4) | `{3}` shows the state's, a typed, the editor-default (Randi) and an empty boy name |
| Grants | `grant-water`, `hooks-grant` | native CF90 write, grant marker, ledger, `QUEST_COLLECTED` (A = 0) |
| Absent companions | `spell-grant`, `absent-skip` | spells kept and re-granted; 8 companion moves skipped, no WAIT stall |
| Story areas | `story-area` | door 45 → map 40 raises CF20–22 to 3/2/1 |
| Greeting | `crisis-greeting` | one greeting before an NPC's compiled script, then resume |
| Fast-forward | `newgame-fast-forward` | test ROM with `story_fast_forward`: R held through Luka's spear gift reaches the menu and stops at the choice |
| Potos gatekeeper | `potos-gatekeeper` | test ROM with `LOCAL_FLIGHT` answered 1: hovering just north of the gate guard starts his compiled banishment scene (9B), fires `FLIGHT_LAND`, latches once |
| Jema repair | `jema-dedupe` | a stale second Water Palace Jema (CF11 8) is removed; the actor slots equal the browser's on SnesJs |
| Water Palace | `water-palace-walk` | 113-byte walk equals `water-palace.js` for the state's positions |
| Object overlays | `objects-*` (7) | loaded records of maps 408 (both captive states), 236 (solo/full), 139 (CF11 5/12), 195 equal `storyRead` |
| Routes | `route-*` (25) | first resolution under story and foreign state for 558, 93, 9A, A8, 297, 42F, 4E1, 4A4, 5F8, 429, 4E5, 28B, 7A |
| Hook contract | `hooks-objects/-opcode/-theft/-ending` | A/X per record, `3D`, Frieza hook order, `BEAST_VICTORY` before `ENDING_BEGIN` |
| Browser differential | `diff-*` (9) | the browser's own `native-story.js` runs on the vendored SnesJs core (`snes/test/story/jsref.mjs`) from the same source state with the same request and mashing: all 256 story flags, the relocated events entered, the ledger and absent-actor skips equal the cartridge's, for the Moogle (solo, full party), Water seed, Luka's Advice, the solo 28A, a story-area door, a villager, the Elder (114) and the Potos arrival scene (10C, 2,400 frames) |
| Every route | `sweep-0`…`sweep-7` | the cartridge evaluates all 324 dispatch programs (`story_test_sweep`) under 8 states (all party masks, ledger, RAM thresholds, every foreign query, 6 seeded at random); all 2,592 choices equal the browser's |

Not covered natively: complete cutscenes that upload music or sound banks.
After `H.importSnesJs` the driver's upload handshake (`C3:065C`, waiting for
the SPC700 to echo `$2140`) never completes, so a test stops at the first
song change; the scripts up to that point were verified. Owners' behaviour
behind the hooks (Frieza, Sandship wreck, endings) is outside this module.

## Not ported here / core and owner requests

- **Core / tools:** the import bundles' APU state does not answer sound-bank
  uploads (above). The Water Palace walk script (at most 512 bytes) is built
  in `!SRAM_WORK_STORY` and executed by the original interpreter and text
  engine, which the WRAM/SRAM claim test (`snes/test/core/wram.lua`) would
  report as original code reading an added SRAM page; either whitelist
  `$33:6000-$33:61FF` for that scene or give story a 512-byte WRAM buffer. A shared `canAttack` flag would replace
  `story_compute_can_act`, which reproduces `mana-mod.js canAttack` from RAM
  plus `ENDING_ACTIVE` (the JS-only `menuTransition` is not modelled).
- **Import bundles from an older story layout (goku tests, harness):** a
  browser state keeps live F0–F7 pointers, and any dialogue edit moves the
  scripts after it (the browser lab discards quick-start caches whose
  `story.layout` differs for this reason). The idle text-engine pointer
  `$1D01-$1D03` is read once per frame at `C0:01AD`. On a ROM without the
  story banks (F0–F7 zero) a stale pointer reads `00`. With them it can land
  mid-sentence, and the native text engine renders the stale bytes every
  frame: game logic rises from 16–20k to as much as 58k cycles, with lag
  frames. The browser mod does exactly the same once `native-story.js` is
  installed. In `barrier-audit/potos-probe` the pointer `F0:BECE` advances
  and the hero walks up to y 616 instead of 600, in the browser and on the
  cartridge alike. 61 of the 334 bundles in `.local/snes-import/` have such a
  pointer, among them `barrier-audit__potos-probe`, which every goku test
  imports. With that one pointer moved to a `00` byte (`F0:0000`; the lower
  halves of F0–F7 are unused), all six goku tests pass on the story branch.
  Re-export those bundles from states saved under the current layout, or
  neutralise the pointer after the import in tests: if `$1D03` is F0–F7,
  `$A170` is 0 and the byte at the pointer is `$50` or more, write
  `$1D01-$1D02 = 0`.
- **frieza:** door `3FC` entry override while the Emperor is present
  (`storyRead` returns 36 at `C8:3FF2`; door bytes are read at `C1:E7E8`/`E7F2`)
  needs its own patch site.
- **destroy:** Watts's shortcut map piece (`C8:5A8E` → `0F` when
  `gaia-shortcut` is broken; map 73's object list is at `C8:A398`) is map
  piece data, read outside the object list hooks above; it needs its own
  patch in the piece loader. The Sandship runtime (`sandship.js` wreck,
  flight doors, crash, gear) has no owner in `plan.md`; its routing and
  dialogue are already here.
- **radio:** `window-placement.js` (BG3 window moved below the HUD).
- **debug:** `quick-boot.js`, `scene-launcher.js`.
- **Fly label:** the browser shows "Flammie Drum" until Goku arrives; the
  cartridge patch shows "Fly" from the start.
- **Water Palace mid-walk states:** the browser's fixed walk allocation is
  zero in ROM (the walk is built in SRAM); an imported state paused inside
  that walk ends it.
