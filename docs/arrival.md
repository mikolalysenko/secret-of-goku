# Title and Goku's arrival

The opening begins with the original BOY sprite and an editable BOY default name. The bridge, fall, waterfall controls and approach to the sword stay native. During the sword-pull grunt, Goku crashes a Saiyan pod into the scene, destroys the boy and sword, and leaves a crater. Its hatch opens and he hops out: “This isn't Planet Namek... Uh, sorry about the parking.” The original ghost recruits him. Goku's identity and powers take over at impact; his body stays inside the pod until the hatch opens.

## Title

`engine/title-layer.js` intercepts BG2 pixel fetches only when the native title's Mode3, graphics base0, tilemap base0x800 and placement signature match. It replaces the Mana word at native rectangle(143,56,49,48) with authored gold silhouettes, using the original palette indices8–14. “Secret of” remains untouched.

The programmer credit uses the original 8×8 font already decompressed into VRAM tiles0x60–0x7F. Its31 characters are centered at x4 on row17. The adapter requires the entire original credit row, so other attract-mode text remains native. All pixels still pass through the PPU's palette, windows, priority and fades. File/name menus retain title data in VRAM but use Mode5, so the guard rejects them.

## Native sword event

`engine/arrival-event-data.js` supplies a342-byte event stream through cartridge reads starting at CPU C7:4400. It fits inside verified unused FF padding ending at C7:5000; the starting-Drum stub ends before it. No cartridge bytes or event-table pointers change.

The controller diverts event103 at C9:269F, while the native grunt pause owns control. The original grunt is restored through reads at C9:2691, preserving existing cartridge hashes even though the older bounded text patch remains in the cartridge copy.

| Stage | Native PC | Behavior |
| --- | --- | --- |
| Descent | C7:4400 | Close grunt box; quake sound;60-frame native wait |
| Impact | C7:440D | Original sword/UI flags and object refresh; quake, flash and hole-opening sound;120-frame wait |
| Ghost | C7:4423 | Restore palette, spawn original speciesD7 via flag0A;20-frame wait |
| Dialogue | C7:4430 | Five original-font pages with native confirm input |
| Finish | Compiled `finish` label | Remove ghost, redirect to original event tailC9:2790 |

WAIT leaves D1:D3 at the next opcode. Harmless actor-lock separators distinguish an active wait from the following phase. The JS controller starts the dive at `descentWait`, changes the native six-byte name to GOKU at impact, and restores D0=1 when resuming. The original tail finishes animation, music, inventory and story setup. Final flags match the original pickup: CF00=1, CF10=1, CF0A=0, CFC1=1, with actor lock cleared.

## Artwork and state

`engine/saiyan-pod.js` authors three 48×48, fifteen-color capsule frames: closed red window, half-open hatch, and open cockpit with a fold-down ramp. They render at native resolution in the PPU, with an original-spell entry trail. The pod settles behind the crater, opens, and Goku hops toward the original actor position. The open pod remains as scenery behind native actors and windows, using opaque sprite color math so the river cannot make its hull translucent. The animation depends only on checkpointed arrival phase/ticks.

The blast arranges original spell cells at native pixel size. `engine/native-crater.js` decodes the original Potos hole's six metatiles from ROM; soil/stone indices are retained and surrounding turf omitted. The crater appears at integer2× size under native sprites and UI on map128. Native background palette-flash offsets also apply to its borrowed soil colors.

Arrival phase, elapsed ticks, permanent hand-off and crater state are saved alongside the native checkpoint. A mid-impact replay is deterministic. Older checkpoints infer progress from the native sword flag only in a live ground/flight engine, avoiding uninitialized title/menu RAM. The Potos developer shortcut starts with Goku already present. The source ROM and cartridge hash remain unchanged by these adapters.

## Verification

Unit checks cover read bounds, untouched cartridge bytes, native font/palette usage, phase boundaries, BOY input/stat gates, checkpoint metadata, crater layering and flash. Browser checks cover the original editable name and bridge, all five arrival pages, impact checkpoint replay, return to native control, and hold/release Kamehameha afterward. Local screenshots and native event traces are under `.local/title-research/` and `.local/arrival-research/`.
