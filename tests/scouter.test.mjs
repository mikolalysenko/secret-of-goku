import test from 'node:test';
import assert from 'node:assert/strict';
import {createScouter,powerLevel,formatPower,analyzerSpell,sylphidFlag} from '../engine/scouter.js';

function rig({entities=[],owned=true}={}){
 const ram=new Uint8Array(0x20000),writes=[];
 if(owned)ram[0xcf00+sylphidFlag]=2;
 const snes={ram,cpu:{cyclesLeft:0,r:new Uint8Array(4),br:new Uint16Array(8),cycle(){}},ppu:{forcedBlank:false,getColor:()=>0x1234},write(address,value){writes.push([address,value]);ram[address&0x1ffff]=value;}};
 const sounds=[],radio=[];
 const mod={options:{enabled:true,superSaiyan:false},gokuActive:true,canAttack:true,worldFlight:false,charging:false,charge:0,frame:0,
  entities:()=>entities,read16:()=>131,playSound:s=>sounds.push(s),radio:{say:t=>radio.push(t)},challenge:{status:{fed:false}},frieza:{trial:false,status:{}}};
 return{snes,mod,sounds,radio,scouter:createScouter(snes,mod)};
}
const goku={index:0,base:0xe000,active:true,species:0x80,hp:999,maxHp:999,screenX:128,screenY:120};
const rabite={index:3,base:0xe600,active:true,species:0,hp:20,maxHp:20,screenX:60,screenY:90};

test('power levels: canon Goku and Frieza, HP-derived for everyone else',()=>{
 const {mod}=rig();
 assert.equal(powerLevel(mod,goku),90_000);
 mod.options.superSaiyan=true;assert.equal(powerLevel(mod,goku),150_000_000);
 mod.options.superSaiyan=false;mod.charging=true;mod.charge=45;assert.equal(powerLevel(mod,goku),135_000);
 assert.equal(powerLevel(mod,rabite),80);
 assert.equal(powerLevel(mod,{...rabite,maxHp:1234}),4900); // two significant figures
 assert.equal(powerLevel(mod,{index:12,custom:'frieza',maxHp:96000}),60_000_000);
 mod.frieza.status.boss={muscular:true};assert.equal(powerLevel(mod,{index:12,custom:'frieza',maxHp:96000}),120_000_000);
 assert.equal(formatPower(150000000),'150,000,000');
});

function selectScouter({snes,scouter},actor=0){
 const {ram:r,cpu:c}=snes;r[0x1808]=actor;r[0x1809]=2;r[0x1876]=1;
 c.r[1]=0xc0;c.br[4]=0x73f4;c.cycle();scouter.tick();return c.br[4];
}

test('Sylphid unlocks a ring toggle but neither ownership nor Analyzer switches it on',()=>{
 for(const owned of[false,true]){
  const rigged=rig({entities:[goku,rabite],owned}),{snes,scouter}=rigged;
  assert.equal(scouter.enabled,false);snes.write(0x7ee781,analyzerSpell);scouter.tick();
  assert.equal(scouter.status.readouts.length,0);assert.equal(scouter.chord,undefined,'no shortcut intercepts focus + ring');
  assert.equal(selectScouter(rigged),owned?0x7275:0x73f4);
  assert.equal(scouter.enabled,owned);if(owned)assert.equal(snes.ram[0x1812],1,'the native title refreshes immediately');
 }
});

test('only Goku can toggle the scouter; it follows visible actors until disabled',()=>{
 const r=rig({entities:[goku,rabite]}),{scouter,sounds,radio}=r;
 assert.equal(selectScouter(r,1),0x73f4);assert.equal(scouter.enabled,false);
 selectScouter(r);assert.equal(scouter.enabled,true);assert.equal(scouter.status.scans,1);
 assert.deepEqual(scouter.status.readouts.map(r=>r.key),[0xe000,0xe600]);
 assert.deepEqual(sounds,['teleport']);assert.match(radio[0],/OVER 9000/);
 for(let i=0;i<300;i++)scouter.tick();assert.equal(scouter.status.readouts.length,2);
 selectScouter(r);assert.equal(scouter.enabled,false);assert.equal(scouter.status.readouts.length,0);
 selectScouter(r);assert.equal(radio.length,1,'the joke plays once');
});

test('Analyzer readouts require explicit activation and disabling immediately clears the cached overlay',()=>{
 const r=rig({entities:[goku,rabite]}),{snes,scouter,mod}=r;
 snes.write(0x7ee781,analyzerSpell);assert.equal(scouter.status.readouts.length,0);
 selectScouter(r);snes.write(0x7ee781,analyzerSpell);
 assert.equal(scouter.status.readouts.find(r=>r.key===0xe600).source,'analyzer');
 for(let i=0;i<30;i++)scouter.tick();
 const pixels=()=>{let lit=0;for(let y=60;y<130;y++)for(let x=40;x<160;x++)if(Array.isArray(snes.ppu.getColor(false,x,y)))lit++;return lit;};
 assert.ok(pixels()>40);scouter.setEnabled(false);assert.equal(pixels(),0);
 scouter.setEnabled(true);scouter.tick();mod.menuActive=true;mod.frame++;assert.equal(pixels(),0);
});

test('checkpoints remember opt-in; old saves and new games default off and never carry stale readouts',()=>{
 const r=rig({entities:[goku]}),{scouter}=r;selectScouter(r);
 const saved=scouter.snapshot();assert.deepEqual(saved,{version:2,enabled:true,jokes:['goku'],scans:1});
 scouter.restore();assert.equal(scouter.enabled,false);
 scouter.restore(saved);assert.equal(scouter.enabled,true);assert.equal(scouter.status.readouts.length,0);
 scouter.restore({version:1,jokes:[],scans:5});assert.equal(scouter.enabled,false);
 r.snes.ram[0xcf00+sylphidFlag]=0;scouter.restore(saved);assert.equal(scouter.enabled,false);
});
