import {commandLength} from './event-codec.js';
export const sceneFastForwardRate=12;

// Inspect the current native text window without fetching through cartridge
// adapters (some reads execute world/whip hooks). A choice anywhere in this
// window blocks auto-confirm before the cursor even becomes visible.
export function windowHasChoice(read,start){
  const bytes=Uint8Array.from({length:4096},(_,i)=>read(start+i));
  for(let i=0;i<bytes.length;){
    const op=bytes[i];
    if(op===0x58||op===0x5b)return true;
    if(op===0||op===0x51||op===0x02)return false;
    i+=commandLength(bytes,i);
  }
  return true; // Unknown/unbounded streams require manual confirmation.
}
export function createSceneFastForward(mod){
  let cached=-1,choice=false;
  function state(input){
    const held=!!(input&0x800)&&!(input&0x400)&&!(input&(1<<21));
    if(held&&(mod.frieza?.inputLocked||mod.frieza?.orbit?.intro))return{active:true,choice:false};
    const scene=mod.read8(0xd0)!==0&&!mod.nameEditor&&!mod.nativeFlight&&mod.read8(0xe4)!==0&&!(mod.read8(0xec)&0x7e);
    if(!held||!scene){cached=-1;return{active:false,choice:false};}
    const pointer=mod.read16(0xd1)|(mod.read8(0xd3)<<16),dialog=[0x81,0x83].includes(mod.read8(0xd0));
    if(dialog&&pointer!==cached){cached=pointer;choice=windowHasChoice(a=>mod.story.inspectByte(a),pointer);}
    return{active:!dialog||!choice,choice:dialog&&choice};
  }
  return{
    state,
    input(input){
      const current=state(input);
      // R has no native event meaning here; B is pulsed across two controller
      // scans, with a release gap, so ordinary prose doesn't need more taps.
      if(current.active||current.choice)input&=~0x800;
      if(current.active&&[0x81,0x83].includes(mod.read8(0xd0))&&mod.frame%8<2)input|=1<<16;
      return input;
    },
  };
}
