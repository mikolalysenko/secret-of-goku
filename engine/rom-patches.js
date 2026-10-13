/* Declarative in-memory patches, offsets refer to unheadered Secret of Mana US. */
// Add the Drum to the original inventory initializer. All original opening
// events, title/name/save menus, doors and map layers remain untouched.
window.originalGamePatch = function(source) {
  const rom=new Uint8Array(source),at=0x74285;
  const original=[0x28,0xab,0x2b,0x6b];
  const code=[0x48,0xa9,0x27,0x8f,0x48,0xcc,0x7e,0x68,0x28,0xab,0x2b,0x6b];
  if(!original.every((v,i)=>rom[0x57af+i]===v)||!code.every((_,i)=>rom[at+i]===0xff))throw Error('Unsupported ROM inventory initializer');
  rom.set(code,at);rom.set([0x5c,0x85,0x42,0xc7],0x57af);
  return rom;
};

// Explicit developer shortcut only. The main game never calls this patch.
window.potosPatch = function (source) {
  const rom=source.slice();
  const word=at=>rom[at]|rom[at+1]<<8;
  const event400=0xa0000+word(0xa0000);
  const event106=0x90000+word(0x9020c);
  if(event400!==0xa0c02||event106!==0x928a0)throw Error('Unsupported ROM revision: event table differs');
  // Preserve vanilla transition/init into the ground-game engine.
  rom.set([0x04,0x29,0xf8,0x1d,0x7f,0x18,0x00,0x2a,0xf8,0x11,0x06,0x00],event400);
  // Enable HUD/rings, mark sword obtained, add Flammie Drum and move to Potos door 3.
  rom.set([0x30,0x00,0x02,0x30,0x10,0x01,0x30,0x0c,0x00,0x1e,0x47,0x18,0x03,0x05,0x00],event106);
  // Door3 normally spawns below the immovable southern gate NPC. Start five
  // tiles farther north, on the village side of the gate, using native loading.
  rom[0x8300e]=32<<1;
  // The independent world-flight landing record also points below the gate.
  // Its map131 / x33 / y39 triplet at$67987 becomes y34 (native landing554px).
  rom[0x67989]=34<<1;
  return rom;
};
