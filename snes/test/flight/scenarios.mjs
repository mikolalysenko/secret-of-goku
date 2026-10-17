// Flight scenarios shared by the cartridge runner (Mesen, scenario.lua) and
// the browser-mod reference (browser-ref.mjs): same fixture, same warp
// (the browser tests' enter(): door 3 rewritten to map/x/y), same inputs.
// Steps: {b: buttons held, n: frames}. Buttons: up down left right a b x y l r.
// `prep`: 'clearActors' removes every other actor (as several specs do).
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
  // Potos river banks and fences (town flight).
  {name:'potos-river',fixture:'graphics-audit__party',enter:{map:131,x:18,y:22},prep:['clearActors'],
    steps:[{n:10},{b:['a','right'],n:40},{n:10},{b:['a','down'],n:40},{n:10},{b:['a','left'],n:40},{n:20}]},
];
