import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {snapshot,restore} from '../engine/state.js';
const source=await readFile(new URL('../engine/mana-mod.js',import.meta.url),'utf8');
const context={window:{ManaSpriteLayer:class{load(){}destroy(){}}},Image:class{decode(){return Promise.resolve();}}};vm.runInNewContext(source,context);
const make=()=>{const snes={ram:new Uint8Array(0x20000),joypad1State:0,ppu:{oam:new Uint16Array(256),evaluateSprites(){}}};const mod=new context.window.ManaMod(snes);mod.configure({enabled:true});mod.write8(0xe4,1);mod.write8(0xe5,1);mod.write8(0xe000,1);mod.write8(0xe02c,1);mod.write8(0xe010,1);return{snes,mod};};
const frame=(snes,mod,input=0)=>{snes.joypad1State=input;mod.beforeFrame(input);mod.afterFrame();};

test('native attack stays masked during a hold and fires only after release',()=>{
  const {snes,mod}=make();for(let i=0;i<120;i++){frame(snes,mod,0x402);assert.equal(snes.joypad1State&1,0);}
  assert.equal(mod.charging,true);assert.equal(mod.charge,90);assert.equal(mod.effects.length,0);
  frame(snes,mod,0);assert.equal(mod.charging,false);assert.equal(mod.effects.length,1);assert.ok(mod.effects[0].width>15);
  mod.reset();frame(snes,mod,1);assert.equal(mod.action.kind,'punch');frame(snes,mod,0);assert.equal(mod.action.kind,'punch');
  frame(snes,mod);frame(snes,mod);assert.equal(snes.joypad1State&1,1);assert.equal(mod.effects[0].kind,'punch');
});

test('hybrid damage queues the native lethal hit without hitting an NPC or party member',()=>{
  const {snes,mod}=make();mod.write16(0xe002,100);mod.write16(0xe004,100);mod.facing=0;
  for(const [index,species] of [[1,0],[3,87],[4,150]]){const b=0xe000+index*0x200;mod.write8(b,1);mod.write16(b+2,100);mod.write16(b+4,145);mod.write8(b+0x180,species);mod.write16(b+0x182,150);}
  mod.startCharge();mod.charge=90;mod.releaseCharge();assert.equal(mod.read16(0xe782),150,'damage waits for the travelling wave');
  for(let i=0;i<3;i++)frame(snes,mod);
  assert.equal(mod.effects[0].hits.length,1);assert.equal(mod.effects[0].hits[0],3);assert.equal(mod.read16(0xe782),1);assert.equal(mod.read16(0xe7f1),999);
  assert.equal(mod.read8(0xe791)&0x80,0,'the native damage routine owns the actual death transition');
  assert.equal(mod.read16(0xe382),150);assert.equal(mod.read16(0xe982),150);
});

test('native flight preserves the original held descend input and transformation doubles attack',()=>{
  const {snes,mod}=make();mod.write8(0xe4,4);mod.write8(0xe5,4);mod.write8(0xec,0x80);frame(snes,mod,1);
  assert.equal(mod.worldFlight,true);assert.equal(snes.joypad1State&1,1);assert.equal(mod.charging,false);assert.equal(mod.read16(0xe198),4095);
  mod.configure({superSaiyan:true});frame(snes,mod,1);assert.equal(mod.read16(0xe198),8191);assert.equal(mod.read8(0xe1ed),0);
});

test('state snapshots omit ROM bytes, preserve aliases and closures, and reject another cartridge',()=>{
  const rom=new Uint8Array([17,33,55]),ram=new Uint8Array([4,5,6]);const tick=()=>{};
  const core={cart:{data:rom},ram,alias:ram,cpu:{pc:10,tick},count:8};core.self=core;
  const state=snapshot(core);assert.equal(state.nodes.some(n=>n.typed&&n.values.join(',')==='17,33,55'),false);
  ram[0]=99;core.cpu.pc=50;core.count=100;restore(core,state);
  assert.equal(ram[0],4);assert.equal(core.cpu.pc,10);assert.equal(core.count,8);assert.equal(core.alias,core.ram);assert.equal(core.self,core);assert.equal(core.cpu.tick,tick);assert.equal(core.cart.data,rom);
  core.cart.data=new Uint8Array([1]);assert.throws(()=>restore(core,state),/different ROM/);
});


test('title, naming, dialogue, ring and ring-opening inputs bypass combat hooks',()=>{
  for(const [address,value] of [[0xe4,0],[0xe5,0],[0xe000,0],[0xd0,0x83],[0x2c,3],[0xec,8],[0xed,0x40],[0xe190,0x10],[0xe190,0x20],[0xe190,0x40],[0xe191,0x01],[0xe191,0x04],[0xe191,0x10],[0xe191,0x40],[0xe191,0x80]]){
    const {snes,mod}=make();mod.write8(address,value);
    for(let i=0;i<120;i++){frame(snes,mod,1);assert.equal(snes.joypad1State,1);}
    frame(snes,mod,0);assert.equal(mod.charging,false);assert.equal(mod.effects.length,0);
  }
  const {snes,mod}=make();frame(snes,mod,0x201);assert.equal(snes.joypad1State,3);assert.equal(mod.attackHeld,0);
});

test('native facing drives attacks, including scripted direction changes',()=>{
  for(const [native,expected]of [[0,3],[1,0],[2,1],[0x82,2]]){
    const {snes,mod}=make();mod.write8(0xe010,native);frame(snes,mod,0);assert.equal(mod.facing,expected);
  }
});

test('original intro engine transitions are never mistaken for world flight',()=>{
  const {snes,mod}=make();mod.write8(0xe4,4);mod.write8(0xe5,4);mod.write8(0xd0,1);frame(snes,mod,1);
  assert.equal(mod.worldFlight,false);assert.equal(mod.charging,false);assert.equal(snes.joypad1State,1);
});

test('the BOY prologue retains native inputs and stats until Goku has arrived',()=>{
  const {snes,mod}=make();mod.arrival={arrived:false};mod.write16(0xe182,50);mod.write16(0xe198,7);
  for(let i=0;i<120;i++){frame(snes,mod,1);assert.equal(snes.joypad1State,1);}
  assert.equal(mod.canAttack,false);assert.equal(mod.charging,false);assert.equal(mod.effects.length,0);
  assert.equal(mod.read16(0xe182),50);assert.equal(mod.read16(0xe198),7);
  mod.arrival.arrived=true;frame(snes,mod,0);assert.equal(mod.canAttack,true);assert.equal(mod.read16(0xe198),4095);
});
