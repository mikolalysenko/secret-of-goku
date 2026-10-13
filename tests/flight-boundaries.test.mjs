import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeLocalFlight} from '../engine/native-local-flight.js';

function fixture(options={}){
  const ram=new Uint8Array(0x20000),cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}};
  const word=(a,v)=>{ram[a]=v&255;ram[a+1]=v>>8;};
  ram.set([0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0],0x100);
  word(0xc0,128);word(0xc2,96);word(0xe002,25);word(0xe004,40);ram[0xe000]=ram[0xe02c]=1;
  for(const layer of [0,1]){
    const at=0x1b800+layer*0x400;
    ram.set([3,0,0xc8,0],at+4);ram.set([3,0,0,0],at+8);
    ram.set([0,0,4,0],at+12);ram.set([0,0,0xc1,5],at+16);ram.set([0,0,0xc1,4],at+20);
    ram.set([3,0,0xc2,0],at+24);
  }
  const hook=createNativeLocalFlight({ram,cpu},{active:()=>true,speed:8,phase:true,...options});
  const tile=(x,y,t,layer=0)=>{ram[0x10000+layer*0x4000+y*128+x]=t;};
  const phase=(dx=6,dy=0)=>{ram[0x1e]=dx;ram[0x1f]=dy;cpu.br[4]=0xd778;cpu.cycle();return cpu.br[4]===0xd7f3;};
  return{ram,cpu,word,hook,tile,phase};
}

test('flight crosses low native obstacles, but walls, slopes and switches retain native collision',()=>{
  for(const t of [1,2,3,4,6]){
    const {hook,tile,phase}=fixture();tile(2,2,t);
    assert.equal(phase(),t===1||t===6,`descriptor ${t}`);
    assert.equal(hook.canLand(36,40),false,'cannot land inside any obstacle');
  }
});

test('terrain height one is walkable, low objects can be exited, and unsafe high-speed steps are limited',()=>{
  const {hook,ram,word,tile,phase,cpu}=fixture();
  ram[0xe00b]=1;ram.set([1,0,0,0],0x1b800);
  assert.equal(hook.canLand(25,40),true);
  tile(2,2,1);word(0xe002,46);
  assert.equal(phase(8),true,'leave an obstacle even when the destination is all clear');
  word(0xe002,25);tile(2,2,2);ram[0x1e]=8;cpu.br[4]=0xd651;cpu.cycle();
  assert.equal(ram[0x1e],1,'native collision receives a single pixel near a wall');
});

test('water currents and stairs are flyable floors, with guidance bypassed only in flight',()=>{
  for(const code of [0x20,0x21,0x22,0x23,0x31,0x3f]){
    const {hook,ram,cpu}=fixture();ram.set([0,2,code,0],0x1b800);
    assert.equal(hook.canFly(40,40),true);assert.equal(hook.canLand(40,40),true);
    ram[0x1e]=2;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],8,'A safe floor keeps full flight speed');
    ram[0xe048]=code;cpu.br[4]=0xd359;cpu.cycle();assert.equal(cpu.br[4],0xd38e);
    ram[0x1b800]=3;assert.equal(hook.canFly(40,40),false,'Floor behavior cannot open a solid wall');
  }
  const {ram,cpu}=fixture({phase:false});ram[0xe048]=0x31;cpu.br[4]=0xd359;cpu.cycle();
  assert.equal(cpu.br[4],0xd359,'Walking and ground charging retain native currents');
});

test('flight restores the last safe position after an unexpected out-of-bounds displacement',()=>{
  const {hook,word}=fixture();hook.settle();const state=hook.snapshot();
  word(0xe002,65530);hook.settle();
  assert.equal(hook.recovered,1);assert.equal(hook.canLand(),true);
  assert.deepEqual(hook.snapshot(),state);
});

test('the full flight footprint prevents corner cutting and checks each intermediate pixel',()=>{
  const {tile,phase,word}=fixture();tile(2,2,1);tile(2,1,2);
  assert.equal(phase(),true);
  word(0xe004,35);assert.equal(phase(),false,'top of footprint clips the wall');
  tile(2,1,0);tile(2,2,2);tile(3,2,1);word(0xe002,25);
  assert.equal(phase(24),false,'cannot tunnel through a wall to reach a low obstacle');
});

test('map size, collision layer and live obstacle changes immediately alter flight boundaries',()=>{
  const {tile,hook,ram,word,cpu,phase}=fixture();tile(2,2,1);tile(2,2,2,1);
  assert.equal(phase(),true);ram[0xe00b]=0x80;assert.equal(phase(),false);
  ram[0xe00b]=0;tile(2,2,0);assert.equal(hook.canLand(40,40),true);assert.equal(hook.canFloat(40,40),false);
  for(const [x,y]of [[-1,40],[4,40],[124,40],[40,-1],[40,92],[128,40]])assert.equal(hook.canLand(x,y),false);
  word(0xe002,119);ram[0x1e]=8;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],1,'clamped before wrap');
  word(0xc0,64);assert.equal(hook.canLand(80,40),false,'new map has its own bounds');
});

test('flight can change terrain height, and forest banks require usable ground on both sides',()=>{
 const {hook,ram,word,tile,phase,cpu}=fixture();
 ram[0xe00b]=1;ram.set([2,0,0,0],0x1b800);
 assert.equal(hook.canLand(25,40),false);assert.equal(hook.canFly(25,40),true,'fly between native height bands');
 assert.equal(hook.canLand(25,40,0,2),true,'teleport checks the target terrain, not Goku’s old terrain');
 const rom=new Uint8Array(0x90000);rom[0x80002]=2;
 // This fixture needs cartridge art metadata to distinguish banks from trees.
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 ram.set([3,0,0,0],0x1b800+62*4);ram.set([0x73,0,0,0],0x1b800+186*4);
 for(let y=0;y<6;y++)tile(2,y,62);
 assert.equal(native.canFly(40,40),true,'a thin riverbank between two shores');
 assert.equal(native.canLand(40,40),false,'stay airborne over the rock face');
 for(let y=0;y<6;y++)for(let x=3;x<8;x++)tile(x,y,186);
 assert.equal(native.canFly(40,40),false,'the same bank art at the forest/void boundary stays closed');
 native.dispose();
});
