// Short pulses of the game's own BG quake. Native events retain ownership:
// their next write to $49 immediately supersedes an attack's temporary pulse.
export function createNativeFeedback(snes){
  const previous=snes.write,r=snes.ram;let pulse=null;
  snes.write=function(address,value,dma){
    const bank=address>>>16,low=address&65535;
    if(low===0x49&&(bank===0x7e||bank<0x40||(bank>=0x80&&bank<0xc0)))pulse=null;
    return previous.call(this,address,value,dma);
  };
  return{
    pulse(frames=4){if(pulse){pulse.remaining=Math.max(pulse.remaining,frames);return;}if(r[0x49]!==0)return;pulse={previous:r[0x49],remaining:frames};r[0x49]=0xe0;},
    tick(){if(pulse&&--pulse.remaining<=0){if(r[0x49]===0xe0)r[0x49]=pulse.previous;pulse=null;}},
    clear(){if(pulse&&r[0x49]===0xe0)r[0x49]=pulse.previous;pulse=null;},
    snapshot(){return pulse?{...pulse}:null;},restore(saved){pulse=saved?{...saved}:null;},
    dispose(){this.clear();snes.write=previous;},
  };
}
