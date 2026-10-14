import {hash} from './state.js';
// Persist the cartridge's battery RAM independently of browser checkpoints.
// A native save stays available from GAME FILE after reloading the page or
// rebuilding a quick-start checkpoint. No ROM data is stored here.
export function createBatteryStore({storage,onError=()=>{}}={}){
 let cart=null,write=null,key=null,dirty=false,quiet=0,error=null,saves=0,metadata={},pendingMetadata=new Map();
 const getStorage=()=>storage??globalThis.localStorage;
 function flush(){
  if(!cart||!dirty)return false;
  try{
   for(const[slot,value]of pendingMetadata)metadata[slot]={hash:hash(cart.sram.slice(slot*0x400,slot*0x400+0x2bc)),value};
   pendingMetadata.clear();
   getStorage().setItem(key,JSON.stringify({version:1,bytes:Array.from(cart.sram),metadata}));dirty=false;saves++;return true;}
  catch(e){if(!error)onError(e);error=e.message;return false;}
 }
 return{
  attach(next,romHash){
   flush();if(cart)cart.write=write;
   cart=next;write=cart.write;key=`secret-of-goku:sram:${romHash}`;dirty=false;quiet=0;error=null;metadata={};pendingMetadata.clear();
   try{const saved=JSON.parse(getStorage().getItem(key)||'null');if(saved?.version===1&&saved.bytes?.length===cart.sram.length&&saved.bytes.every(b=>Number.isInteger(b)&&b>=0&&b<=255)){cart.sram.set(saved.bytes);metadata=saved.metadata??{};}}
   catch(e){error=e.message;onError(e);}
   cart.write=function(bank,adr,value){
    // Check the same HiROM/LoROM battery range as the cartridge adapter.
    let index=-1;
    if(this.hasSram){
     if(this.isHirom&&adr>=0x6000&&adr<0x8000&&(bank<0x40||bank>=0x80&&bank<0xc0))index=(((bank&0x3f)<<13)|(adr&0x1fff))&(this.sramSize-1);
     else if(!this.isHirom&&adr<0x8000&&bank>=0x70&&bank<0x7e)index=(((bank-0x70)<<15)|(adr&0x7fff))&(this.sramSize-1);
    }
    const before=index<0?null:this.sram[index];write.call(this,bank,adr,value);
    if(index>=0&&before!==this.sram[index]){dirty=true;quiet=0;}
   };
  },
  stageMetadata(offset,value){const slot=(offset&0xfff)>>10;pendingMetadata.set(slot,structuredClone(value));dirty=true;quiet=0;},
  metadataFor(offset){
   const slot=(offset&0xfff)>>10,entry=metadata[slot];
   return entry?.hash===hash(cart.sram.slice(offset,offset+0x2bc))?structuredClone(entry.value):null;
  },
  tick(){if(dirty&&++quiet>=10)flush();},flush,
  get status(){return{dirty,error,saves};},
 };
}
