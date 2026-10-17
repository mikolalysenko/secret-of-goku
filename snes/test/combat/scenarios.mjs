// Combat test scenarios: an import bundle (its browser-mod source state comes
// from .local/snes-import/catalog.json), an input script (button[+button]:frames
// per step) and optional set-up. Both the cartridge and the browser engine run
// the same script from the same state; run.mjs compares the traces.
const RABITES='animation-audit__native__rabite-field-a';   // Goku (288,602), Rabites 3-5
export const SCENARIOS=[
  // One jab kills the Rabite to the right: 999 queued, 1 HP left for the
  // native lethal hit, death effect F9 flies 56 px, 1 XP each, 2 GP.
  {name:'punch',bundle:RABITES,script:'right:12,b:3,none:40'},
  // Tapping chains jab -> cross -> kick (buffered after frame 9), misses
  // pulse native B; an idle gap resets the chain.
  {name:'combo',bundle:RABITES,script:'left:3,b:1,none:5,b:1,none:5,b:1,none:5,b:1,none:40,b:1,none:20'},
  // Holding B chains the combo too.
  {name:'combo-held',bundle:RABITES,script:'left:3,b:60,none:20'},
  // Super Saiyan: 7-frame punches, strike after 1 frame, 88 px launch.
  {name:'ssj-punch',bundle:RABITES,ssj:true,script:'right:12,b:2,none:30'},
  // Ki: one shot per tap, 14 px per frame, 40% damage, first contact only.
  {name:'ki',bundle:RABITES,script:'right:4,y:1,none:30,y:1,none:30'},
  {name:'ki-held',bundle:RABITES,script:'right:4,y:40,none:30'},
  {name:'ki-ssj',bundle:RABITES,ssj:true,script:'right:4,y:30,none:30'},
  // Kamehameha: full base charge (90 frames), release toward the Rabites.
  {name:'beam',bundle:RABITES,script:'right:4,l+y:95,none:50'},
  {name:'beam-partial',bundle:RABITES,script:'right:4,l+y:30,none:40'},
  // Full Super Saiyan wave (45 frames): 64-frame beam, 6-frame pulses.
  {name:'wave',bundle:RABITES,ssj:true,script:'right:4,l+y:50,none:80'},
  // Focus builds 96 frames; L+A at full power transforms (first reveal: 72
  // frames, the burst on age 26 hits everything within 56 px).
  {name:'transform',bundle:RABITES,radial:88,script:'right:20,l:100,l+a:4,l:2,none:90'},
  // Super Saiyan: a fresh L+A reverts in 10 frames.
  {name:'revert',bundle:RABITES,ssj:true,script:'l:4,l+a:3,none:30'},
];
