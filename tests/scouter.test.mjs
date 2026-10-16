import test from 'node:test';
import assert from 'node:assert/strict';
import {createScouter,powerLevel,formatPower,analyzerSpell,sylphidFlag} from '../engine/scouter.js';

function rig({entities=[],owned=true}={}){
 const ram=new Uint8Array(0x20000),writes=[];
 if(owned)ram[0xcf00+sylphidFlag]=2;
 const snes={ram,ppu:{forcedBlank:false,getColor:()=>0x1234},write(address,value){writes.push([address,value]);ram[address&0x1ffff]=value;}};
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

test('L+X scans only once the scouter is owned, and swallows the ring tap',()=>{
 const unowned=rig({entities:[goku,rabite],owned:false});
 assert.equal(unowned.scouter.chord(0x600,true),false,'without Sylphid, X still opens the ring');
 const {scouter,sounds,radio}=rig({entities:[goku,rabite]});
 assert.equal(scouter.chord(0x600,true),true);
 assert.equal(scouter.chord(0x600,true),true,'holding does not rescan');
 assert.equal(scouter.status.scans,1);
 assert.deepEqual(scouter.status.readouts.map(r=>r.key),[0xe000,0xe600]);
 assert.deepEqual(sounds,['teleport']);assert.match(radio[0],/OVER 9000/);
 scouter.chord(0,true);scouter.chord(0x600,true);
 assert.equal(radio.length,1,'the joke plays once');
 for(let i=0;i<241;i++)scouter.tick();
 assert.equal(scouter.status.readouts.length,0,'readouts fade');
});

test('a native Analyzer hit (spell 17h written to +181h) shows that target',()=>{
 const {snes,scouter}=rig({entities:[goku,rabite]});
 snes.write(0x7e0000|0xe781,analyzerSpell);
 assert.deepEqual(scouter.status.readouts.map(r=>[r.key,r.source]),[[0xe600,'analyzer']]);
 snes.write(0x7e0000|0xe981,0x12); // a different spell
 snes.write(0x7e0000|0xe782,analyzerSpell); // a different field
 assert.equal(scouter.status.readouts.length,1);
});

test('the overlay draws reticles and digits only while readouts exist',()=>{
 const {snes,scouter}=rig({entities:[goku]});
 assert.equal(snes.ppu.getColor(false,128,80),0x1234);
 scouter.chord(0x600,true);for(let i=0;i<30;i++)scouter.tick();
 let lit=0;for(let y=60;y<130;y++)for(let x=100;x<160;x++)if(Array.isArray(snes.ppu.getColor(false,x,y)))lit++;
 assert.ok(lit>40,`overlay pixels: ${lit}`);
 assert.deepEqual(scouter.snapshot(),{version:1,jokes:['goku'],scans:1});
});
