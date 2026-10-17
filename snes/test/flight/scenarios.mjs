// Flight scenarios shared by the cartridge runner (Mesen, scenario.lua) and
// the browser-mod reference (browser-ref.mjs): same fixture, same warp
// (the browser tests' enter(): door 3 rewritten to map/x/y; none without
// `enter`), same inputs.
// Steps: {b: buttons held, n: frames}. Buttons: up down left right a b x y l r.
// `prep`: 'clearActors' removes every other actor (as several specs do),
// 'restore' = localFlightHook.restore(), {w:[[addr,value,bytes]...]} writes
// WRAM, {x,y} moves Goku there with teleport.follow().
export const scenarios=[
  // flight-regressions.spec.mjs: Water Palace platform gap.
  {name:'water-gap',fixture:'graphics-audit__party',enter:{map:139,x:17,y:55},
    steps:[{b:['a','up'],n:14},{n:45},{b:['a','up'],n:14},{n:10},{b:['a','down'],n:28},{n:10}]},
  // flight-regressions.spec.mjs: Gaia's Navel ledges (SSJ speed) and Haunted Forest vines.
  {name:'gaia-ledges',fixture:'graphics-audit__party',enter:{map:25,x:22,y:60},prep:['clearActors','ssj',{x:360,y:970}],
    steps:[{n:30},{b:['a','up'],n:45},{n:20}]},
  {name:'forest-vines',fixture:'graphics-audit__party',enter:{map:28,x:14,y:22},prep:['clearActors','ssj',{x:232,y:360}],
    steps:[{n:30},{b:['a','up'],n:16},{n:20}]},
  // gaia-boundaries.spec.mjs: solid rock ceiling stops flight.
  {name:'gaia-rock',fixture:'graphics-audit__party',enter:{map:286,x:18,y:48},prep:['clearSupport'],
    steps:[{b:['a','right'],n:70},{n:10}]},
  // teleport.spec.mjs (rabite-field-b, no warp): Instant Transmission to the
  // enemy side of a riverbank, copying the target's terrain height.
  {name:'teleport-bank',fixture:'animation-audit__native__rabite-field-b',
    prep:[{w:[[0xe002,312,2],[0xe004,248,2],[0xe00b,1,1],[0xe602,352,2],[0xe604,248,2],[0xe60b,2,1],[0xe800,0,1],[0xea00,0,1]]},'restore'],
    steps:[{b:['l','b'],n:4},{n:30}]},
  // An offscreen target: the camera streams the map into view, then
  // walking (down) and the ring (X) still work.
  {name:'teleport-offscreen',fixture:'animation-audit__native__rabite-field-b',
    prep:[{w:[[0xe600,0,1],[0xe800,0,1]]}],
    steps:[{b:['l','b'],n:80},{n:1},{b:['down'],n:6},{n:4}]},
  // Pressing again visits the next foe (nearest first, then slot order).
  {name:'teleport-cycle',fixture:'animation-audit__native__rabite-field-b',
    steps:[{b:['l','b'],n:2},{n:18},{b:['l','b'],n:2},{n:18},{b:['l','b'],n:2},{n:30},{b:['l','b'],n:2},{n:30}]},
  // ki-world.spec.mjs: walking onto Earth Palace's whip pad floats the party
  // across without a whip (gap-flight pose, 6F9 crossing, CF01/CF03 clear).
  {name:'whip-pad',fixture:'graphics-audit__party',enter:{map:313,x:12,y:38},
    steps:[{b:['right'],n:10},{n:230}]},
  // whip-flight.spec.mjs (map 313, pad 13,38 → right): flying over the pad
  // never starts its event; Goku lands on the far side.
  {name:'whip-fly',fixture:'graphics-audit__party',enter:{map:313,x:12,y:38},
    steps:[{n:20},{b:['a','right'],n:16},{b:['right'],n:6},{n:20}]},
  // event-barriers.spec.mjs: flight passes over the Pandora castle guards
  // (NPC pass-through) without changing the castle story flags.
  {name:'pandora-guards',fixture:'graphics-audit__party',enter:{map:266,x:5,y:17,flags:{18:0,19:6}},
    steps:[{b:['a','up'],n:40},{n:30}]},
  // Opening field exits: flying south out of Potos beside the path's
  // passage (over its bank, x within two tiles) takes its door (2) as
  // walking through it does. 'restore' drops the fixture's saved anchor.
  {name:'potos-exit',fixture:'graphics-audit__party',enter:{map:131,x:33,y:38},prep:['clearActors','restore'],
    steps:[{n:10},{b:['a','right'],n:9},{b:['a','down'],n:40},{n:90}]},
  // sandship.spec.mjs: flying sideways onto the deck hatch takes it below
  // (flyThroughDoor: three frames over a ship door, story event 07A).
  {name:'ship-hatch',fixture:'graphics-audit__party',enter:{map:99,x:27,y:12},prep:['restore'],
    steps:[{b:['a','right'],n:60},{n:200}]},
  // On foot in the rabite field (combat's transform scenario): walking right,
  // focusing (L), standing — the module's on-foot cost.
  {name:'rabite-walk',fixture:'animation-audit__native__rabite-field-b',
    steps:[{b:['right'],n:20},{b:['l'],n:40},{n:20}]},
  // Potos river banks and fences (town flight).
  {name:'potos-river',fixture:'graphics-audit__party',enter:{map:131,x:18,y:22},prep:['clearActors'],
    steps:[{n:10},{b:['a','right'],n:40},{n:10},{b:['a','down'],n:40},{n:10},{b:['a','left'],n:40},{n:20}]},
];
