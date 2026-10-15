// Retry restores the whole emulator plus mod state. Never jump a dead actor
// back into a live room or let the old intro defeat event run in this arena.
export function createBattleRetry(mod,{capture,restore,onDefeat}){
 let key=null,saved=null,defeated=false;
 function encounter(){return mod.frieza?.encounter??(mod.read16(0xdc)===253&&mod.canAttack&&mod.entities().some(e=>e.species===127&&e.active&&e.hp)?'beast':null);}
 return{
  check(){
   if(defeated)return true;
   const next=encounter();
   if(saved&&!mod.read16(0xe182)&&[246,253].includes(mod.read16(0xdc))){defeated=true;mod.cancelCombat();mod.teleport?.restore();onDefeat(key);return true;}
   if(next&&next!==key&&mod.canAttack&&mod.read16(0xe182)>0&&!mod.read16(0xe1f1)){key=next;saved=capture();}
   if(saved&&![246,253].includes(mod.read16(0xdc))){key=null;saved=null;}
   return false;
  },
  retry(){if(!defeated||!saved)return false;const state=saved;restore(state);mod.cancelInput();defeated=false;return true;},
  clear(){key=null;saved=null;defeated=false;},
  get defeated(){return defeated;},get encounter(){return key;},
 };
}
