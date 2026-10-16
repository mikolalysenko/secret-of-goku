import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createNativeEquipment} from '../engine/native-equipment.js';
import {createNativeHitRecovery} from '../engine/native-hit-recovery.js';
import {gokuStats,isGokuStatus} from '../engine/native-status.js';
import {powerLevel} from '../engine/scouter.js';

const context={window:{ManaSpriteLayer:class{load(){}}},Image:class{decode(){return Promise.resolve();}}};
vm.runInNewContext(readFileSync(new URL('../engine/mana-mod.js',import.meta.url),'utf8'),context);
function rig(){
 const snes={ram:new Uint8Array(0x20000),frames:0,cpu:{r:new Uint8Array(4),br:new Uint16Array(8),cycle(){}},ppu:{}};
 const mod=new context.window.ManaMod(snes);mod.options.enabled=true;
 for(const [a,v]of[[0xe000,1],[0xe02c,1],[0xe181,98],[0xe189,99],[0xe18a,99],[0xe18b,50],[0xe18c,75],[0xe197,99],[0xe1a4,24],[0xe4,1],[0xe5,1]])mod.write8(a,v);
 mod.write16(0xe182,780);mod.write16(0xe184,999);mod.write16(0xe1a5,99);mod.write16(0xe1a8,75);
 mod.write16(0xe199,0xa55a);mod.equipment=createNativeEquipment(snes,mod);mod.hitRecovery=createNativeHitRecovery(snes,mod);
 return{snes,mod};
}

test('all form/gi combinations share combat, native attributes and scouter readings without overflow or drift',()=>{
 const {mod}=rig();
 for(const gold of[false,true,false,true])for(const armor of[22,21,22,23,21]){
  mod.options.superSaiyan=gold;mod.write8(0xe1e1,armor);
  for(let i=0;i<300;i++){mod.equipment.tick();mod.hitRecovery.tick();}
  const weighted=armor===22,scale=weighted?.9:1,attack=Math.round((gold?8191:4095)*scale),stats=gokuStats(mod);
  assert.equal(stats.attack,attack);assert.equal(mod.status.attack,attack);assert.equal(mod.damageScale(),attack);
  assert.equal(stats.strength,weighted?230:255);assert.equal(stats.agility,weighted?79:99);
  assert.equal(stats.defense,gold?419:259);assert.equal(stats.magicDefense,gold?235:155);
  assert.equal(stats.power,(gold?150_000_000:90_000)*scale);assert.equal(powerLevel(mod,{index:0}),stats.power);
  assert.equal(mod.read8(0xe198),255);assert.equal(mod.read16(0xe199),0xa55a,'large attack must not change weapon effects');
  assert.equal(stats.hp,780,'stat refresh is not healing');
  const equipment=mod.equipment.snapshot(),defense=mod.hitRecovery.snapshot();
  mod.equipment.restore(equipment);mod.hitRecovery.restore(defense);mod.equipment.tick();mod.hitRecovery.tick();assert.deepEqual(gokuStats(mod),stats);
  mod.charging=true;mod.charge=gold?45:90;assert.equal(powerLevel(mod,{index:0}),stats.power*2);mod.charging=false;mod.charge=0;
 }
 mod.options.power=false;mod.write8(0xe198,73);assert.equal(mod.damageScale(),73,'unpowered attack ignores adjacent effect flags');
});

test('power page reads native seed count, full money and selected character without altering RAM',()=>{
 const {mod,snes}=rig(),r=snes.ram,p=snes.ppu;r.set([1,0,1,2,3,1,0,1],0xcf90);r.set([0x87,0xd6,0x12],0xcc6a);
 const before=r.slice();assert.equal(gokuStats(mod).mana,4);assert.equal(gokuStats(mod).money,1234567);assert.deepEqual(r,before);
 Object.assign(p,{mode:5,tilemapAdr:[0,0x5800],vram:new Uint16Array(0x8000)});
 for(const[a,v]of[[0x5820,0x2020],[0x5830,0x2020],[0x59c0,0xa020],[0x5b10,0xa020]])p.vram[a]=v;
 r[0x2c]=3;r[0x1809]=r[0x180a]=r[0x1876]=2;assert.equal(isGokuStatus(snes,mod),true);
 for(const[a,v]of[[0x19fe,1],[0x19fe,2],[0x1808,1],[0x1876,0],[0x1809,0],[0xec,8],[0x2c,0]]){
  const old=r[a];r[a]=v;assert.equal(isGokuStatus(snes,mod),false);r[a]=old;
 }
 r[0x180a]=0;assert.equal(isGokuStatus(snes,mod),true,'remembered STATUS is cursor zero on reopening');
 p.vram[0x5830]=0;assert.equal(isGokuStatus(snes,mod),false);
});
