import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePlants} from '../engine/native-plants.js';

function fixture(){
 const ram=new Uint8Array(0x20000),data=new Uint8Array(0x10000),cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}};
 data.set([0xe2,0x30,0xa5,0x2e],0xc7c3);cpu.br[4]=0xc7c3;
 const snes={ram,cpu,cart:{data},frames:0},cuts=[],plants=createNativePlants(snes,{canCut:()=>ram[0xd0]===0,onCut:r=>cuts.push(r)});
 const descriptor=(tile,bytes,l=0)=>ram.set(bytes,0x1b800+l*0x400+tile*4);
 const tile=(tx,ty,id,l=0)=>ram[0x10000+l*0x4000+ty*128+tx]=id;
 return{ram,cpu,snes,plants,descriptor,tile,cuts};
}

test('one Saiyan strike removes all axe/sword damage stages through the native redraw on either layer',()=>{
 for(const layer of[0,1])for(const code of[0xc2,0xc8]){
  const f=fixture();f.descriptor(10,[0x23,0,code,11],layer);f.descriptor(11,[0x23,0,code,12],layer);f.descriptor(12,[0x23,0,code,13],layer);f.descriptor(13,[0x12,6,0,0],layer);f.tile(3,4,10,layer);
  const accepted=f.plants.beam({x:24,y:72,dx:1,dy:0,length:28,halfWidth:9,policy:'objects',collisionLayer:layer});
  assert.equal(accepted.length,1);assert.equal(f.plants.metadata(3,4,layer).tile,10,'the attack queues work until the native CPU boundary');
  f.cpu.cycle();assert.equal(f.plants.metadata(3,4,layer).tile,13);assert.equal(f.ram[0x82],layer?0x80:1);assert.equal(f.cuts.length,1);
 }
});

test('Saiyan scenery destruction rejects cycles, puzzle targets, walls and the other collision layer',()=>{
 const f=fixture();f.descriptor(10,[0x13,0,0xc1,11]);f.descriptor(11,[0x13,0,0xc1,10]);f.descriptor(12,[0x13,0,0xcc,0]);f.descriptor(13,[0x13,0,0xf8,0x6f]);f.descriptor(14,[0x13,0,0,0]);f.descriptor(15,[0x13,0,0xc8,0],1);
 for(let i=0;i<5;i++)f.tile(2+i,2,10+i);f.tile(2,2,15,1);
 assert.deepEqual(f.plants.beam({x:16,y:40,dx:1,dy:0,length:100,policy:'objects'}),[]);f.cpu.cycle();assert.equal(f.plants.metadata(2,2,1).tile,15);assert.equal(f.cuts.length,0);
});

test('a same-room switch rebuild cannot regrow smashed scenery, including after checkpoint restore',()=>{
 const f=fixture();f.descriptor(10,[0x23,0,0xc2,11]);f.descriptor(11,[0x12,6,0,0]);f.tile(3,4,10);
 f.plants.enqueueTiles([{tx:3,ty:4}],{policy:'objects'});f.cpu.cycle();const saved=f.plants.snapshot();
 assert.equal(f.plants.metadata(3,4).tile,11);
 f.ram[0x82]=0;f.ram[0x95]=0;f.ram[0xd0]=1;f.tile(3,4,10);f.snes.frames++;f.cpu.cycle();
 assert.equal(f.plants.metadata(3,4).tile,10,'the native event retains control until it finishes');
 f.ram[0xd0]=0;f.snes.frames++;f.cpu.cycle();assert.equal(f.plants.metadata(3,4).tile,11);assert.equal(f.cuts.length,1);assert.equal(f.ram[0x95],0,'replay does not play another impact');
 f.plants.restore(saved);f.tile(3,4,10);f.ram[0x82]=0;f.snes.frames++;f.cpu.cycle();assert.equal(f.plants.metadata(3,4).tile,11);
 f.tile(3,4,10);f.descriptor(10,[0x23,0,0xc2,12]);f.ram[0x82]=0;f.snes.frames++;f.cpu.cycle();assert.equal(f.plants.metadata(3,4).tile,10,'a changed layout descriptor cannot inherit an obsolete replacement');
 f.descriptor(10,[0x23,0,0xc2,11]);f.ram[0xdc]=1;f.snes.frames++;f.cpu.cycle();assert.equal(f.plants.metadata(3,4).tile,10,'leaving the room retains native respawn semantics');
});
