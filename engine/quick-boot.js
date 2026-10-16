import {crownGoku} from './native-names.js';
import {eventRange} from './event-codec.js';

// Only used for an explicitly selected test scene. Let the cartridge do its
// real new-game initialization, then replace the legend/bridge events with
// a native door to the late-game staging room. Restore every byte before a
// checkpoint is captured; ordinary starts, ROM hashes and saves stay intact.
// The staging room (`door`, `map`), the progress flags seeded, the item
// given and the HP seed default to the late game's Tree Palace start.
const lateFlags=[[0x00,2],[0x10,1],[0x0c,0]];
export async function bootLateGame({pump,mod},{door=0x3fc,map=431,flags=lateFlags,item=0x47,seedHp=true,control=true}={}){
  // Before the sword is pulled Goku cannot attack; an idle interpreter is enough.
  const ready=()=>mod.status.map===map&&(control?mod.canAttack:!mod.read8(0xd0));
  const rom=mod.snes.cart.data,patches=[
    [0x400,[0x04,0x29,0xf8,0x1d,0x7f,0x18,0x00,0x2a,0xf8,0x11,0x06,0x00]],
    [0x106,[...flags.flatMap(([flag,value])=>[0x30,flag,value]),...item===null?[]:[0x1e,item],
      // Seed HP before the first native HUD is built, including its cache.
      ...seedHp?[0x39,1,0x82,0xe7,0x39,1,0x83,3,0x39,1,0x84,0xe7,0x39,1,0x85,3]:[],
      0x18+(door>>8),door&255,0x05,0x00]],
  ].map(([id,bytes])=>{
    const {start,end}=eventRange(rom,id);
    if(bytes.length>end-start)throw Error('The test-start event does not fit this ROM.');
    return{start,bytes,original:rom.slice(start,start+bytes.length)};
  });
  try{
    for(const p of patches)rom.set(p.bytes,p.start);
    // Existing native saves make GAME FILE the default selection. Move to
    // NEW GAME explicitly, without clearing or replacing battery saves.
    // Eight-frame taps survive all phases of the native menu input scan;
    // Up is harmless when an empty cartridge already selects NEW GAME.
    for(const[frames,buttons]of[[960],[8,[3]],[180],[8,[4]],[8],[8,[0]],[180]])await pump(frames,buttons);
    if(!mod.nameEditor)throw Error('The native new-game initializer did not open.');
    await pump(8,[3]);
    for(let i=0;i<60&&!ready();i++)await pump(24);
    if(!ready())throw Error(`The test staging room did not load (map ${mod.status.map}, event ${mod.read8(0xd0)}).`);
    crownGoku(mod.snes.ram); // native GOKU
    mod.cancelInput();
  }finally{
    for(const p of patches)rom.set(p.original,p.start);
  }
}
