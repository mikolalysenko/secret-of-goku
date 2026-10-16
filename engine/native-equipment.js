import {encodeText} from './event-codec.js';

const pouch=[
 '0000000000000000','0000011111100000','0000124332100000','0000012221000000',
 '0000015551000000','0000125552100000','0001234433210000','0012344443321000',
 '0123446444332100','0123466644332100','0123446444332100','0123444444332100',
 '0012344443321000','0001233333210000','0000111111100000','0000000000000000',
];
const colors=[0,...[[4,3,2],[10,7,4],[17,12,6],[24,19,11],[30,27,18],[27,27,25]].map(([r,g,b])=>1+r+(g<<5)+(b<<10))];
export const dustPixel=(x,y)=>colors[Number(pouch[y]?.[x])||0];

// The boy starts with armor 22. Keep its native inventory, equip/unequip,
// shop and save behavior; only Goku treats it as weighted training clothes.
export const TRAINING_GI=22;
export const NO_BODY_ARMOR=21;
export const trainingPenalty=Object.freeze({power:.9,agility:.8});

// Leave the original weapon records available to scripts and the combat
// engine, but never offer Goku a weapon tier or let anyone equip sword dust.
export function createNativeEquipment(snes,mod){
 const c=snes.cpu,r=snes.ram,cycle=c.cycle,word=a=>r[a]|r[a+1]<<8;
 const enabled=()=>mod.options.enabled&&mod.gokuActive;
 let cart,read,names=new Map(),swordIcons=new Set(),rejected=0,agility=null,rebuilding=false;
 const weighted=()=>enabled()&&r[0xe1e1]===TRAINING_GI;
 function stats(rebuilt=false){
  if(!(r[0xe000]&1)||rebuilding&&!rebuilt)return;
  const value=r[0xe189],base=!rebuilt&&agility&&value===agility.written?agility.base:value;
  const written=weighted()?Math.max(1,Math.floor(base*trainingPenalty.agility)):base;
  r[0xe189]=written;agility=weighted()?{base,written}:null;
 }
 c.cycle=function(){
  // Mark a fresh level-table load, then wait until armor/spell modifiers
  // and native attribute limits have finished, BEFORE agility feeds evade.
  // Weapon-only rebuilds also visit 4BF6; they must not apply weight twice.
  if(this.cyclesLeft===0&&(this.r[1]&63)===0){
   if(this.br[4]===0x4699&&this.br[2]===0)rebuilding=true;
   if(this.br[4]===0x4bf6&&this.br[1]===0&&rebuilding){stats(true);rebuilding=false;}
   if(this.br[4]===0x4576&&this.br[1]===0&&enabled()&&mod.options.power)mod.updatePowerStats?.();
  }
  if(this.cyclesLeft===0&&enabled()){
   const bank=this.r[1]&63,pc=this.br[4];
   // Empty tiers are skipped by the cartridge's existing up/down ring logic,
   // exactly like a character who has not learned any magic yet.
   if(bank===16&&pc===0xd1cf&&r[0x1808]===0)this.br[4]=0xd1fa;
   // All native equip/swap paths share this point after resolving the item.
   // Use its normal rejection branch before any inventory/stat writes occur.
   if(bank===0&&pc===0x74b6&&r[0x1809]===3&&(r[0x1808]===0||word(0x182c)===0x55)){
    this.br[4]=0x7594;rejected++;
   }
  }
  return cycle.call(this);
 };
 c.registerBreakpoints?.(c.cycle,cycle,[[0,0x4699],[0,0x4bf6],[0,0x4576],[0x10,0xd1cf],[0,0x74b6]]);
 function itemRead(bank,address){
  const pc=(bank&63)*65536+address;
  if((bank&0xc0)===0xc0&&enabled()&&names.has(pc))return names.get(pc);
  return read.call(this,bank,address);
 }
 return{
  load(){
   cart=snes.cart;read=cart.read;names.clear();swordIcons.clear();
   const name=[...encodeText('DUST BAG'),0];let at=0xa9b4b;
   if(!encodeText('RUSTY SWORD').every((v,i)=>cart.data[at+i]===v))throw Error('Unsupported weapon-name table');
   for(let i=0;i<9;i++){const start=at;while(cart.data[at])at++;at++;for(let n=start;n<at;n++)names.set(n,name[n-start]??0);}
   const armor=encodeText('Overalls'),training=[...encodeText('Heavy Gi'),0];
   if(!armor.every((v,i)=>cart.data[0xa9f00+i]===v))throw Error('Unsupported armor-name table');
   training.forEach((v,i)=>names.set(0xa9f00+i,v));
   const offset=cart.data[0x18fd66]|cart.data[0x18fd67]<<8;
   for(let i=9;i<18;i++){const a=0x18fd60+offset+i*2;swordIcons.add(cart.data[a]|cart.data[a+1]<<8);}
   cart.read=itemRead;cart.registerReadHook?.(itemRead,read,m=>{for(const pc of names.keys())m.hirom(pc,pc+1);});
  },
  iconMatches(ppu,attr,index){
   if(!enabled()||r[0x1809]!==3||r[0x1847]!==0||index<18||index>=26||(attr&511)!==0xe0+(index-18)*2)return false;
   return swordIcons.has(word(0x1880+(index-18)*2));
  },pixel:dustPixel,get rejected(){return rejected;},
  get weighted(){return weighted();},
  get powerScale(){return weighted()?trainingPenalty.power:1;},
  tick(){stats();if(!rebuilding&&enabled()&&mod.options.power)mod.updatePowerStats?.();},
  confiscate(){
   if(!weighted())return false;
   // Native armor inventory: low six bits are the item, top two its wearer.
   // The guards cannot carry it: Goku stows it, leaving it available in the
   // armor ring. The following native Sandship door rebuilds equipment DEF.
   for(let at=0xcc2c;at<0xcc38;at++)if(r[at]===(0x40|TRAINING_GI))r[at]=TRAINING_GI;
   r[0xe1e1]=NO_BODY_ARMOR;stats();if(mod.options.power)mod.updatePowerStats?.();return true;
  },
  snapshot(){return{agility:agility?{...agility}:null,rebuilding};},
  restore(saved){agility=saved?.agility?{...saved.agility}:null;rebuilding=!!saved?.rebuilding;},
 };
}
