// Short pulses of the game's own BG quake. Native events retain ownership:
// their next write to $49 immediately supersedes an attack's temporary pulse.
// Camera kicks push BG1/BG2 along a connected blow and spring back; text,
// the HUD (BG3 and OBJ) and Mode 7 arenas never move.
// Kick offsets in pixels along the blow, per frame from contact (jab, cross,
// kick); snes/gen/fx.mjs packs them for the cartridge (fx_kick_steps).
export const KICK_PROFILES=[[2,2,1,1],[3,3,2,1,1],[4,4,3,2,1,1]];
export function kickOffset(kick,age){return kick?KICK_PROFILES[kick.profile]?.[age]??0:0;}
export function createNativeFeedback(snes,mod){
  const previous=snes.write,r=snes.ram,p=snes.ppu,color=p.getColor;let pulse=null,flash=0,kick=null,applied=[0,0];
  // A single seven-frame gold-white pulse, before native color math/fades.
  // Do not mutate CGRAM, brighten text, or touch Mode 7 matrices/HDMA.
  function shade(ppu,sub,result){
    if(flash&&!sub&&(ppu.mode===1||ppu.mode===7)&&result[1]!==2){
      const amount=[0,1,2,4,6,9,13,17][flash],c=result[0];
      result[0]=Math.min(31,(c&31)+amount)|(Math.min(31,((c>>5)&31)+amount)<<5)|(Math.min(31,((c>>10)&31)+(amount>>1))<<10);
    }
  }
  p.getColor=function(sub,x,y){
    const result=color.call(this,sub,x,y);
    shade(this,sub,result);
    return result;
  };
  // shade() for a whole scanline as a compositor channel map.
  const tint={type:'channels',layers:63&~4,r:new Int32Array(32),g:null,b:new Int32Array(32),layer:-1,pixel:0,mainOnly:true};tint.g=tint.r;
  let tintFlash=-1;
  p.registerLineHook?.('getColor',p.getColor,color,ppu=>!flash||!(ppu.mode===1||ppu.mode===7),
    {name:'feedback',post:(ppu,sub,x,y,r)=>shade(ppu,sub,r),plan:(ppu,line,plan)=>{
      if(tintFlash!==flash){tintFlash=flash;const amount=[0,1,2,4,6,9,13,17][flash];for(let c=0;c<32;c++){tint.r[c]=Math.min(31,c+amount);tint.b[c]=Math.min(31,c+(amount>>1));}}
      plan.extra.push(tint);plan.skipPost=true;return true;
    }});
  snes.write=function(address,value,dma){
    const bank=address>>>16,low=address&65535;
    if(low===0x49&&(bank===0x7e||bank<0x40||(bank>=0x80&&bank<0xc0)))pulse=null;
    return previous.call(this,address,value,dma);
  };
  snes.registerBusWriteHook?.(snes.write,previous,m=>m.offsets(0x49,0x4a));
  // Scroll registers carry `applied` pixels (x, y) of kick. Field NMI's
  // C0:C170 rewrites BG1/BG2 scroll from the game's shadows and returns at
  // C0:C1CE: the next picture's offset goes on there. BG2's vertical scroll
  // stays an 8-bit value, as the game writes it.
  const kickVector=(k,age)=>{const n=kickOffset(k,age),[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][k?.facing??0];return[dx*n,dy*n];};
  function setKick([x,y]){
    const ddx=x-applied[0],ddy=y-applied[1];
    if(ddx){p.bgHoff[0]=(p.bgHoff[0]+ddx)&0xffff;p.bgHoff[1]=(p.bgHoff[1]+ddx)&0xffff;}
    if(ddy){p.bgVoff[0]=(p.bgVoff[0]+ddy)&0xffff;p.bgVoff[1]=((p.bgVoff[1]&0xff)+ddy)&0xff;}
    applied=[x,y];
  }
  const cpu=snes.cpu,cycle=cpu?.cycle;
  if(cpu){
    cpu.cycle=function(){
      if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[4]===0xc1ce){
        // C170 just wrote the base values: nothing of a kick is on them.
        applied=[0,0];
        if(kick&&p.mode!==7&&!(r[0x29]&4))setKick(kickVector(kick,kick.age+1));
      }
      return cycle.call(this);
    };
    cpu.registerBreakpoints?.(cpu.cycle,cycle,[[0,0xc1ce]]);
  }
  return{
    // Ordinary BG scroll quake conflicts with Mode 7 boss matrix/HDMA work.
    // Keep their native impact animation instead of pulsing the map quake.
    pulse(frames=4){if(snes.ppu?.mode===7)return;if(pulse){pulse.remaining=Math.max(pulse.remaining,frames);return;}if(r[0x49]!==0)return;pulse={previous:r[0x49],remaining:frames};r[0x49]=0xe0;},
    burst(){flash=7;this.pulse(9);},
    // A short, gentle brightening (the finishing kick): `frames` steps of the
    // same ramp, from its low end.
    flash(frames){if(snes.ppu?.mode===7)return;flash=Math.max(flash,Math.min(7,frames));},
    // The camera kick (facing 0-3, profile 0-2 jab/cross/kick). It shows in
    // the picture of this very frame, as the sprites drawn from this state.
    kick(facing,profile){
      if(snes.ppu?.mode===7||(r[0x29]&4)||!KICK_PROFILES[profile])return;
      kick={facing,profile,age:0};setKick(kickVector(kick,0));
    },
    get kickOffset(){return [...applied];},
    // Combat cancelled (ring, map change): its flash and camera kick end; the
    // next field NMI writes the plain scroll values again.
    clearFlash(){flash=0;kick=null;},
    tick(){
      if(flash)flash=mod&&(!mod.options.enabled||!mod.gokuActive||!(mod.canAttack||mod.worldFlight))?0:flash-1;
      if(pulse&&--pulse.remaining<=0){if(r[0x49]===0xe0)r[0x49]=pulse.previous;pulse=null;}
      if(kick&&++kick.age>=KICK_PROFILES[kick.profile].length)kick=null;
    },
    clear(){this.clearFlash();if(pulse&&r[0x49]===0xe0)r[0x49]=pulse.previous;pulse=null;kick=null;},
    snapshot(){return{pulse:pulse?{...pulse}:null,flash,kick:kick?{...kick}:null,applied:[...applied]};},
    restore(saved){pulse=saved?.pulse?{...saved.pulse}:saved?.remaining?{previous:saved.previous,remaining:saved.remaining}:null;flash=saved?.flash??0;kick=saved?.kick?{...saved.kick}:null;applied=Array.isArray(saved?.applied)?[...saved.applied]:[0,0];},
    dispose(){this.clear();snes.write=previous;p.getColor=color;if(cpu)cpu.cycle=cycle;},
  };
}
