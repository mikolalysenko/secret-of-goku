// Ki/punch hits feed each Crystal Orb's original event. The elemental test
// reads the orb's last-spell byte ($E181); its native script still owns flags,
// animation, dialogue, object removal, puzzle sounds and map reconstruction.
// No global puzzle flag writes and no cartridge changes.
export function createNativeOrbs(snes,mod){
  const c=snes.cpu,r=snes.ram,cycle=c.cycle,word=a=>r[a]|r[a+1]<<8;
  let queued=null,pending=null,activated=0,last=null,error=null;
  const firstSpell=[0,6,0x12,0x0c,0x28,0x24,0x18,0x1e];
  function describe(enemy){
    if(enemy.species!==0x55||!enemy.active||enemy.index<3)return null;
    const rom=snes.cart?.data,event=word(enemy.base+0x3e)&0x7ff;
    if(!rom||!event)return null;
    const bank=event<0x400?0x90000:0xa0000,at=bank+((event&0x3ff)*2),start=bank+(rom[at]|rom[at+1]<<8);
    const element=rom[start+1]-0x50;
    if(rom[start]!==0x23||element<0||element>7)return null;
    let strength=1;
    for(let i=2;i<13;i++)if(rom[start+i]===0x42&&rom[start+i+1]===0x98+element){strength=Math.max(1,rom[start+i+2]>>4);break;}
    return{base:enemy.base,event,map:word(0xdc),spell:firstSpell[element]+strength-1};
  }
  c.cycle=function(){
    if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&this.br[4]===0xb073){
      if(pending){
        if(this.br[3]!==pending.br[3])error='Orb event returned with unexpected stack';
        else{this.br.set(pending.br);this.r.set(pending.r);this.setP(pending.p);}
        pending=null;
      }
      if(queued&&!pending&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)){
        const item=queued;queued=null;
        const signature=[0xe2,0x20,0x8b,0x48].every((v,i)=>snes.cart.data[0x1e76d+i]===v);
        if(signature&&mod.options.enabled&&mod.canAttack&&word(0xdc)===item.map&&(r[item.base]&1)&&r[item.base+0x180]===0x55){
          // Mirror native hit context (C0:D453-D475), then use the original
          // long-call dispatcher at an established safe ground-loop boundary.
          r[item.base+0x181]=item.spell;r[0xd4]=r[0xd5]=0;
          const actor=item.base-0xe000;r[0x3a]=actor&255;r[0x3b]=actor>>8;
          pending={br:[...this.br],r:[...this.r],p:this.getP()};
          this.br[0]=item.event;this.pushByte(this.r[1]);this.pushWord((this.br[4]-1)&65535);
          this.r[1]=1;this.br[4]=0xe76d;this.cyclesLeft=7;activated++;last=item;
          return;
        }
      }
    }
    return cycle.call(this);
  };
  c.registerBreakpoints?.(c.cycle,cycle,[[0,0xb073]]);
  return{
    hit(enemy){if(!mod.options.enabled||!mod.canAttack||queued||pending)return false;const item=describe(enemy);if(!item)return false;queued=item;return true;},
    describe,get activated(){return activated;},get last(){return last;},get error(){return error;},
    snapshot(){return{queued,pending,activated,last,error};},
    restore(saved){queued=saved?.queued||null;pending=saved?.pending||null;activated=saved?.activated||0;last=saved?.last||null;error=saved?.error||null;},
    dispose(){c.cycle=cycle;},
  };
}
