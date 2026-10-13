// Native B tries talking at C0:B851, then falls through to a weapon swing.
// Keep that NPC/chest handling and menu confirmation, but stop Goku's hidden
// weapon at its two entry points. BOY, companions and status escapes stay native.
export function createNativeInteraction(snes,mod){
 const cpu=snes.cpu,cycle=cpu.cycle;
 let suppressed=0;
 cpu.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&this.br[1]===0&&mod.options.enabled&&mod.canAttack){
   if(this.br[4]===0xb2a7){this.br[4]=0xb2b1;suppressed++;}
   else if(this.br[4]===0xb224){this.br[4]=0xb247;suppressed++;}
  }
  return cycle.call(this);
 };
 return{get suppressed(){return suppressed;},dispose(){cpu.cycle=cycle;}};
}
