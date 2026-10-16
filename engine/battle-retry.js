// Retain the public adapter name for old test tools, but a finale defeat is
// terminal. Let the native actor die, blocking its unrelated death warp;
// the saved ending clock then renders the planet's destruction without reviving
// Goku, restoring consumed items, or advancing the defeated boss's script.
import {installFinaleDeathGate} from './boss-rush-death.js';
export function createBattleRetry(mod,{onDefeat=()=>{},onGameOver=()=>{}}={}){
 installFinaleDeathGate(mod.snes,mod);
 let key=null,reported=false;
 function encounter(){
  if(mod.frieza?.encounter)return mod.frieza.encounter;
  const map=mod.read16(0xdc),species=map===246?121:map===253?127:null;
  // The native boss also identifies older checkpoints without trial flags.
  return species&&mod.entities().some(e=>e.species===species&&!e.custom&&e.active&&e.hp)?map===246?'thanatos':'beast':null;
 }
 return{
  check(){
   if(mod.ending?.defeated){key=mod.ending.status.encounter;return true;}
   if(mod.ending?.active||!mod.options.enabled||!mod.gokuActive){key=null;return false;}
   const next=encounter();
   if((key||next)&&!mod.read16(0xe182)&&[246,253].includes(mod.read16(0xdc))){key??=next;mod.ending.lose(key);mod.teleport?.restore();onDefeat(key);return true;}
   if(next&&mod.canAttack&&mod.read16(0xe182)>0)key=next;
   if(![246,253].includes(mod.read16(0xdc)))key=null;
   return false;
  },
  tick(advanceNative){
   if(!mod.ending?.defeated)return;
   if(!mod.ending.complete){
    if(mod.ending.nativeDeath&&advanceNative)advanceNative();
    else{mod.frame++;mod.ending.tick();}
   }
   mod.planetView.renderDefeat();
   if(mod.ending.complete&&!reported){reported=true;onGameOver();}
  },
  retry(){return false;},
  clear(){key=null;reported=false;},
  get defeated(){return !!mod.ending?.defeated;},get gameOver(){return !!mod.ending?.defeated&&mod.ending.complete;},get encounter(){return key;},
 };
}
