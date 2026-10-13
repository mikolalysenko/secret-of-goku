import {encodeText} from './event-codec.js';

export const renameSenzu=text=>text.replace(/\bCups?\s+of\s+Wishes\b/gi,match=>/^cups/i.test(match)?'Senzu Beans':'Senzu Bean');

// Six SNES colors and transparent pixels, drawn at the original item's size.
const bean=[
 '0000000000000000','0000000111100000','0000011344310000','0000123455431000',
 '0001234444431000','0012344333321000','0013443321121000','0124433322111000',
 '0124433322100000','0124433321000000','0013443321000000','0012344432100000',
 '0001233332100000','0000112221000000','0000001110000000','0000000000000000',
];
const colors=[0,...[[3,7,2],[7,15,3],[14,23,5],[23,29,11],[30,31,22]].map(([r,g,b])=>1+r+(g<<5)+(b<<10))];
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
   // Fingerprint the decompressed native four-cell cup. This catches the
   // ring, target cursor, shop and use animation regardless of its DMA slot.
   const base=ppu.sprAdr1+((attr&256)?ppu.sprAdr2:0),tile=attr&255;let hash=2166136261;
   for(const delta of[0,1,16,17])for(let i=0;i<16;i++)hash=Math.imul(hash^ppu.vram[(base+((tile+delta)&255)*16+i)&32767],16777619);
   return (hash>>>0)===0xb22e39c3;
  },pixel:senzuPixel,get used(){return used;}};
}
