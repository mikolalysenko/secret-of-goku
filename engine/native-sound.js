// Secret of Mana USA's original sound dispatcher. Enqueue at the verified
// ground-loop boundary after actor updates, before wait-for-NMI. This is the
// normal 65816 JSL/RTL contract, not a jump into a live instruction or an SPC
// port overwrite. No cartridge or vendor-core bytes are modified.
export function createNativeSound(snes,mod){
  const cpu=snes.cpu,cycle=cpu.cycle;
  let queue=[],pending=null,lastFrame=-1;
  const sounds={swing:[3,0],hit:[0x50,15],charge:[0x2a,15],charged:[0x2a,15],blast:[3,0],beam:[0xb0,15],transform:[0x12,0]};
  cpu.cycle=function(){
    const boundary=(this.r[1]===0||this.r[1]===0xc0)&&this.br[4]===0xb073&&this.cyclesLeft===0;
    if(boundary&&pending){
      // PLD/PLB in the native sound epilogue set N/Z after PLP. Restore those
      // two flags too so the injected call has no architectural side effect.
      if(this.br[3]===pending.sp)this.setP(pending.p);
      pending=null;
    }
    if(boundary&&queue.length&&lastFrame!==snes.frames&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)){
      queue=queue.filter(item=>mod.frame-item.frame<8);
      const signature=[0xe2,0x20,0xa9,0x01].every((byte,i)=>snes.cart?.data[0xb073+i]===byte);
      const safe=signature&&mod.options.enabled&&mod.canAttack&&snes.ram[0x1e00]===0;
      if(safe&&queue.length){
        const item=queue.shift();lastFrame=snes.frames;
        pending={p:this.getP(),sp:this.br[3]};snes.ram.set(item.command,0x1e00);
        this.pushByte(this.r[1]);this.pushWord((this.br[4]-1)&0xffff);
        this.r[1]=0xc3;this.br[4]=4;this.cyclesLeft=7;return;
      }
    }
    return cycle.call(this);
  };
  const api={
    play(name){
      const sound=sounds[name];if(!sound||!mod.canAttack||queue.some(item=>item.name===name&&mod.frame-item.frame<3))return;
      const item={name,frame:mod.frame,command:[2,sound[0],sound[1],0x88]};
      if(name==='hit')queue=queue.filter(item=>item.name!=='swing');
      if(queue.length<4)queue.push(item);
    },
    snapshot(){return JSON.parse(JSON.stringify({queue,pending,lastFrame}));},
    restore(saved){queue=saved?.queue||[];pending=saved?.pending||null;lastFrame=saved?.lastFrame??-1;},
    clear(){queue=[];},
    dispose(){cpu.cycle=cycle;queue=[];},
  };
  mod.playSound=name=>api.play(name);mod.sound=api;return api;
}
