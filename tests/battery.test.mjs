import test from 'node:test';import assert from 'node:assert/strict';
import{createBatteryStore}from'../engine/battery.js';
const cartridge=()=>({sram:new Uint8Array(8192),isHirom:true,hasSram:true,sramSize:8192,write(bank,adr,v){if(adr>=0x6000&&adr<0x8000&&(bank<0x40||bank>=0x80&&bank<0xc0))this.sram[adr&8191]=v;}});
test('native battery writes survive a fresh cartridge and stay separate from ROM builds',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},a=createBatteryStore({storage}),cart=cartridge();
 a.attach(cart,'original-rom');cart.write(0x30,0x6001,83);cart.write(0x30,0x6ffe,42);
 for(let i=0;i<9;i++)a.tick();assert.equal(data.size,0,'wait until the native write batch has settled');a.tick();assert.equal(data.size,1);
 const next=cartridge(),b=createBatteryStore({storage});b.attach(next,'original-rom');assert.equal(next.sram[1],83);assert.equal(next.sram[4094],42);
 next.write(0xc0,0x6001,2);assert.equal(b.status.dirty,false,'ROM writes are not battery saves');
 next.write(0x30,0x6001,81);assert.equal(b.flush(),true);const third=cartridge();b.attach(third,'original-rom');assert.equal(third.sram[1],81);
 const unrelated=cartridge();b.attach(unrelated,'different-rom');assert.equal(unrelated.sram[1],0);
});

test('blocked browser storage does not prevent playing or native in-memory saves',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),errors=[];
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage blocked');}});
  const store=createBatteryStore({onError:e=>errors.push(e.message)}),cart=cartridge();store.attach(cart,'rom');
  cart.write(0x30,0x6001,42);assert.equal(store.flush(),false);assert.equal(cart.sram[1],42);assert.equal(store.status.dirty,true);
  assert.deepEqual(errors,['Storage blocked']);assert.equal(store.status.error,'Storage blocked');
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
