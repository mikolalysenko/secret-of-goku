// The cartridge's combat feel. By the maintainer's request (2026-10-21:
// "make goku's moves more powerful and more threatening ... make the combat
// intensely powerful. goku is very strong, it should feel like it in the
// combat. it should be responsive and impactful") the cartridge no longer
// follows engine/mana-mod.js in these values. They feed the generators
// (combat.mjs, fx.mjs); the test references apply them to the browser's own
// code (snes/test/snes-feel.mjs) so every other aspect still compares
// exactly. Shared gameplay (damage, HP, rewards, story state) is untouched.
export const FEEL={
  // Hit stop of a connected jab, cross, kick (browser 5/6/10, 4/5/9 as a
  // Super Saiyan): the jab stays snappy, the big blows hang. (The startups
  // stay the browser's, the fist landing on age 2, or 1 as a Super Saiyan:
  // a one-frame base startup and ki throw cost gameplay misses.)
  hitStop:[[4,8,14],[3,7,12]],
  // Goku holds a blow that kills a native actor at least this long (base,
  // Super Saiyan); the target, its spark and its shake keep the blow's own
  // stop (it already flies).
  killStop:[12,10],
  // Launch distance over the 12-frame arc (browser 56 / 88): the kick,
  // killing blows, ki hits and the transformation's burst; its peak height
  // (browser 20). The Kamehameha blows its targets farther still.
  launch:[96,136],
  beamLaunch:[148,196],
  lift:30,
  // Camera kick of BG1/BG2 per blow (jab, cross, kick, a killing blow):
  // signed steps along the blow, a shake that dies out (browser: 2/3/4 px
  // springing back, native-feedback.js KICK_PROFILES). Six steps at most.
  kick:[[2,-1],[4,-3,2,-1],[8,-6,4,-3,2,-1],[11,-8,6,-4,2,-1]],
  // A full-screen white flash (fixed-colour addition, of 31) frame by frame
  // on the finishing kick, a killing blow and the Kamehameha's release
  // (the full Super Saiyan wave's longest; browser: the kick's warm 4, 2, 1
  // brightening, none for the beam).
  flash:{kick:[12,6,2],kill:[18,9,4],beam:[14,9,5,2],wave:[24,18,12,8,4,2]},
  // BG quake frames of the finishing kick and of a killing blow (base,
  // Super Saiyan; browser: the kick's 3 / 5).
  quake:{kick:[4,6],kill:[3,5]},
  // A launched native actor that lands alive on screen thuds: the camera
  // jolts down with this blow's kick (0 jab, 1 cross, 2 kick, 3 kill; -1
  // none), unless a kick already shakes it (browser: nothing). An echo of
  // the blow, smaller than the kick's own; a killed actor's death effect
  // is gone before its arc ends.
  land:0,
  // Starburst size of a ki shot's contact (0 ki, 1 jab, 2 cross, 3 kick;
  // browser 0). (A muzzle burst at the palm, a shockwave for a ki kill and
  // a starburst on every Kamehameha pulse each cost gameplay misses in held
  // barrages and beams: the game's palm flash and pulse sparks stay.)
  kiStar:2,
};
