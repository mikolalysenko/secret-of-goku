import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeastChallenge} from '../engine/beast-challenge.js';
import {createDragonQuest} from '../engine/dragon-quest.js';
import {createPowerIntro,powerIntroMessages} from '../engine/power-intro.js';
import {encodeText,wrapText} from '../engine/event-codec.js';

function fixture(earned=7){
  const ram=new Uint8Array(0x20000),cpu={cycle(){},cyclesLeft:0,r:[0,0],br:[0,0,0,0,0x4053]},snes={ram,cpu};
  const notices=[],position={x:128,y:160,screenX:128,screenY:160},mod={options:{enabled:true},gokuActive:true,canAttack:true,
    read8:a=>ram[a],read16:a=>ram[a]|ram[a+1]<<8,write8:(a,v)=>ram[a]=v,write16:(a,v)=>{ram[a]=v;ram[a+1]=v>>8;},
    entities:()=>[{index:3,base:0xe600,active:true,species:127,hp:mod.read16(0xe782)}],
    get status(){return position;},
    quest:{status:{earned,canFeed:earned===7}},radio:{say:text=>notices.push(text)}};
  mod.write16(0xdc,253);mod.write16(0xe782,1000);mod.write16(0xe182,999);
  const challenge=createBeastChallenge(snes,mod);mod.challenge=challenge;
  return{mod,challenge,notices,position,cpu,tick:(n=1)=>{for(let i=0;i<n;i++)challenge.tick();}};
}
test('all seven Balls force seed feeding, earned wards matter, and no Balls are delivered',()=>{
  const f=fixture(),{mod,challenge,cpu}=f;
  challenge.choose(false);f.tick();assert.equal(challenge.dangerous,true);assert.equal(mod.read16(0xe782),65535);
  challenge.choose(true);f.tick();assert.equal(mod.read16(0xe782),65535);assert.equal(challenge.dangerous,true);
  assert.equal(challenge.damage({species:127},8191),2047);assert.equal(challenge.damage({species:87},8191),8191);
  challenge.restore({...challenge.snapshot(),wards:2}); // two wards remain after earlier hits
  mod.write16(0xe1f1,450);cpu.cycle();assert.equal(mod.read16(0xe1f1),0);assert.equal(challenge.status.wards,1);
  mod.write16(0xe1f1,450);cpu.cycle();assert.equal(challenge.status.wards,1,'One spell animation cannot consume every ward');
  f.tick(90);mod.write16(0xe1f1,450);cpu.cycle();assert.equal(challenge.status.wards,0);
  f.tick(90);mod.write16(0xe1f1,450);cpu.cycle();assert.equal(mod.read16(0xe1f1),450,'No ward leaves damage to the native engine');
  const q=createDragonQuest({read8:()=>0});q.collect(1);q.collect(2);assert.equal(q.status.earned,2);assert.equal(q.status.count,2);
  q.restore({mask:127,seedMask:6,delivered:5});assert.equal(q.status.earned,2,'Legacy delivered Balls cannot count as earned wards');
  const textQuest=createDragonQuest({radio:{say:text=>{encodeText(text);assert.ok(wrapText(text).split('\n').length<=3);}}});
  for(let i=0;i<7;i++)textQuest.collect(i);
});
test('telegraphed eruptions pause in menus, replay exactly, and end with the native boss flag',()=>{
  const f=fixture(),{challenge,mod}=f;challenge.choose(true);f.tick(150);
  assert.equal(challenge.status.burst.age,0);f.tick(30);const saved=challenge.snapshot(),text=JSON.stringify(saved);
  mod.canAttack=false;f.tick(200);assert.deepEqual(challenge.snapshot(),saved);mod.canAttack=true;
  f.tick(60);assert.equal(mod.read16(0xe1f1),450);const after=challenge.snapshot();
  challenge.restore(saved);f.tick(60);assert.deepEqual(challenge.snapshot(),after);assert.equal(JSON.stringify(saved),text);
  mod.write8(0xcf4e,9);f.tick();assert.equal(challenge.status.won,true);assert.equal(challenge.dangerous,false);assert.equal(challenge.status.burst,null);
});
test('moving away dodges an eruption and a wounded Beast gives less warning over a larger area',()=>{
  const f=fixture(),{challenge,mod,position}=f;challenge.choose(true);f.tick(150);
  const target=challenge.status.burst;position.x+=100;f.tick(target.warning);
  assert.equal(mod.read16(0xe1f1),0,'The blast stays at the marked location instead of following Goku');
  assert.equal(challenge.status.burst.x,target.x);
  mod.write16(0xe782,32000);f.tick(22+72);
  assert.equal(challenge.status.burst.x,position.x);assert.equal(challenge.status.burst.warning,72);assert.equal(challenge.status.burst.radius,34);
});
test('flight and gold-hair reveals are one-shot and use valid native three-line windows',()=>{
  for(const text of Object.values(powerIntroMessages).flat()){encodeText(text);assert.ok(wrapText(text).split('\n').length<=3,text);}
  const notices=[],mod={options:{enabled:true,superSaiyan:true},gokuActive:true,canAttack:true,localFlight:true,action:{kind:'transform',duration:32},radio:{say:t=>notices.push(t)}};
  const intro=createPowerIntro(mod);intro.tick();intro.tick();assert.equal(notices.length,2);
  intro.transform();intro.transform();assert.equal(notices.length,5);assert.equal(mod.action.duration,72);
  const saved=intro.snapshot();intro.restore(saved);intro.tick();intro.transform();assert.equal(notices.length,5);
});

test('all seven real seed visits are required; legacy emergency Balls cannot unlock feeding or prevent later collection',()=>{
  const f=fixture(),q=createDragonQuest(f.mod);f.mod.quest=q;
  q.restore({mask:127,seedMask:5,delivered:5});assert.equal(q.status.canFeed,false);assert.equal(f.challenge.choose(true),false);
  assert.equal(f.challenge.status.fed,false);
  for(const i of[1,3,4,5])q.collect(i);assert.equal(q.status.seedCount,6);assert.equal(f.challenge.choose(true),false);
  q.collect(6);assert.equal(q.status.canFeed,true);assert.equal(q.status.earned,7);assert.equal(q.status.delivered,0);
  assert.equal(f.challenge.choose(true),true);assert.equal(f.challenge.status.wards,7);assert.equal(q.collect(6),false);
  const saved=q.snapshot();q.restore(saved);assert.equal(q.status.canFeed,true);
});
