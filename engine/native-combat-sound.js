// Replace just the native impact cue for our queued damage. Keep the original
// damage, reaction, number, reward and death routines, as well as NPC audio.
export function createNativeCombatSound(snes,mod){
 const cpu=snes.cpu,cycle=cpu.cycle,r=snes.ram,word=a=>r[a]|r[a+1]<<8,marked=new Map();
 let suppressed=0;
 cpu.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[4]===0x4157&&mod.options.enabled&&mod.gokuActive){
   const base=0xe000+this.br[1],hit=marked.get(base);
   if(base===0xe000&&word(base+0x1f1)>0){mod.playSound('hit');this.br[4]=0x4176;suppressed++;}
   else if(hit&&hit.map===word(0xdc)&&hit.species===r[base+0x180]&&mod.frame>=hit.frame&&mod.frame-hit.frame<8&&r[base+0x1f0]===0){
    marked.delete(base);this.br[4]=0x4176;suppressed++;
   }
  }
  return cycle.call(this);
 };
 return{mark(enemy){marked.set(enemy.base,{map:word(0xdc),species:enemy.species,frame:mod.frame});},
  get suppressed(){return suppressed;},restore(){marked.clear();},dispose(){cpu.cycle=cycle;marked.clear();}};
}
