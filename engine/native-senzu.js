import {encodeText} from './event-codec.js';
import {nativeItemIcon} from './native-item-icons.js';

export const renameSenzu=text=>text.replace(/\bCups?\s+of\s+Wishes\b/gi,match=>/^cups/i.test(match)?'Senzu Beans':'Senzu Bean');

// A plump kidney-shaped bean, with a pale hilum in the inner crease.
// Five SNES colors plus transparency, at the native 16-pixel item size.
const bean=[
 '0000000000000000','0000000111100000','0000011333310000','0000123444331000',
 '0001234444332100','0012344443332100','0013444333222100','0123443325511000',
 '0123433255100000','0123333251100000','0123333332100000','0012333333210000',
 '0012233333210000','0001122222100000','0000011111000000','0000000000000000',
];
const colors=[0,...[[3,6,2],[5,12,3],[10,20,4],[21,28,10],[28,28,18]].map(([r,g,b])=>1+r+(g<<5)+(b<<10))];
export const senzuPixel=(x,y)=>colors[Number(bean[y]?.[x])||0];

// Every shop, treasure message and ring reads the same native item name.
// Cup item 05 already revives to maximum HP at C0:5593. Extend its target
// filter to living, injured allies; keep the native consumption/heal pipeline.
export function createNativeSenzu(snes,mod){
 const cpu=snes.cpu,cycle=cpu.cycle,r=snes.ram,word=a=>r[a]|r[a+1]<<8;
 const enabled=()=>mod.options.enabled;
 let read=null,cart=null,used=0;
 const name=Uint8Array.from([...encodeText('Senzu Bean'),0,0,0,0]);
 cpu.cycle=function(){
  if(this.cyclesLeft===0&&enabled()){
   const bank=this.r[1]&0x3f,pc=this.br[4],target=this.br[1];
   if(bank===0x10&&pc===0xdb2a&&r[0x1809]===0&&r[0x19f1]===5&&[0xe000,0xe200,0xe400].includes(target)&&(r[target]&1)){
    this.br[4]=(r[target+0x191]&0x80)||word(target+0x182)<word(target+0x184)?0xdb44:0xdb4d;
   }
   if(bank===0&&pc===0x5593)used++;
  }
  return cycle.call(this);
 };
 function itemRead(bank,address){
  const pc=(bank&63)*65536+address;
  if((bank&0xc0)===0xc0&&enabled()&&pc>=0xaa120&&pc<0xaa12e)return name[pc-0xaa120];
  return read.call(this,bank,address);
 }
 return{load(){cart=snes.cart;read=cart.read;const original=encodeText('Cup of Wishes');if(!original.every((b,i)=>cart.data[0xaa120+i]===b))throw Error('Unsupported item-name table');cart.read=itemRead;},
  iconMatches(ppu,attr){
   return nativeItemIcon(ppu,attr)==='senzu';
  },pixel:senzuPixel,get used(){return used;}};
}
