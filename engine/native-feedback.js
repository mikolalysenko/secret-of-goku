// Short pulses of the game's own BG quake. Native events retain ownership:
// their next write to $49 immediately supersedes an attack's temporary pulse.
export function createNativeFeedback(snes,mod){
  const previous=snes.write,r=snes.ram,p=snes.ppu,color=p.getColor;let pulse=null,flash=0;
  p.getColor=function(sub,x,y){
    const result=color.call(this,sub,x,y);
    // A single seven-frame gold-white pulse, before native color math/fades.
    // Do not mutate CGRAM, brighten text, or touch Mode 7 matrices/HDMA.
    if(flash&&!sub&&(this.mode===1||this.mode===7)&&result[1]!==2){
      const amount=[0,1,2,4,6,9,13,17][flash],c=result[0];
      result[0]=Math.min(31,(c&31)+amount)|(Math.min(31,((c>>5)&31)+amount)<<5)|(Math.min(31,((c>>10)&31)+(amount>>1))<<10);
    }
    return result;
  };
  p.registerLineHook?.('getColor',p.getColor,color,ppu=>!flash||!(ppu.mode===1||ppu.mode===7));
  snes.write=function(address,value,dma){
    const bank=address>>>16,low=address&65535;
    if(low===0x49&&(bank===0x7e||bank<0x40||(bank>=0x80&&bank<0xc0)))pulse=null;
    return previous.call(this,address,value,dma);
  };
  snes.registerBusWriteHook?.(snes.write,previous,m=>m.offsets(0x49,0x4a));
  return{
    // Ordinary BG scroll quake conflicts with Mode 7 boss matrix/HDMA work.
    // Keep their native impact animation instead of pulsing the map quake.
    pulse(frames=4){if(snes.ppu?.mode===7)return;if(pulse){pulse.remaining=Math.max(pulse.remaining,frames);return;}if(r[0x49]!==0)return;pulse={previous:r[0x49],remaining:frames};r[0x49]=0xe0;},
    burst(){flash=7;this.pulse(9);},
    clearFlash(){flash=0;},
    tick(){
      if(flash)flash=mod&&(!mod.options.enabled||!mod.gokuActive||!(mod.canAttack||mod.worldFlight))?0:flash-1;
      if(pulse&&--pulse.remaining<=0){if(r[0x49]===0xe0)r[0x49]=pulse.previous;pulse=null;}
    },
    clear(){this.clearFlash();if(pulse&&r[0x49]===0xe0)r[0x49]=pulse.previous;pulse=null;},
    snapshot(){return{pulse:pulse?{...pulse}:null,flash};},
    restore(saved){pulse=saved?.pulse?{...saved.pulse}:saved?.remaining?{previous:saved.previous,remaining:saved.remaining}:null;flash=saved?.flash??0;},
    dispose(){this.clear();snes.write=previous;p.getColor=color;},
  };
}
