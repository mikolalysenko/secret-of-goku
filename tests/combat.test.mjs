import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {GameInput} from '../engine/input.js';

const context={window:{ManaSpriteLayer:class{load(){}destroy(){}}},Image:class{decode(){return Promise.resolve();}}};
for(const file of ['goku-animation-data.js','goku-animation.js','mana-mod.js'])vm.runInNewContext(await readFile(new URL('../engine/'+file,import.meta.url),'utf8'),context);
function setup({superSaiyan=false,facing=1,power=true}={}){
  const snes={ram:new Uint8Array(0x20000),joypad1State:0,ppu:{getWindowState(){}}},mod=new context.window.ManaMod(snes);
  Object.assign(mod.options,{enabled:true,power,superSaiyan});
  for(const a of [0xe4,0xe5,0xe000,0xe02c])mod.write8(a,1);
  mod.write16(0xe002,200);mod.write16(0xe004,200);mod.write16(0xe020,128);mod.write16(0xe022,114);mod.write8(0xe010,[1,2,0x82,0][facing]);mod.facing=facing;
  const step=(mask=0,n=1)=>{for(let i=0;i<n;i++){mod.beforeFrame(mask);mod.motion.pose();mod.afterFrame();}return mod;};
  const enemy=(index,x,y,hp=20000,species=0)=>{const base=0xe000+index*0x200;mod.write8(base,1);mod.write8(base+0x180,species);mod.write16(base+2,x);mod.write16(base+4,y);mod.write16(base+0x182,hp);return base;};
  return{mod,snes,step,enemy};
}

test('keyboard aliases and separate touch pointers cannot release one another; quick taps survive two scans',()=>{
  const input=new GameInput();input.press('j',0);input.press('touch:2',0);input.release('j');
  assert.equal(input.sample(),1);assert.equal(input.sample(),1);assert.equal(input.sample(),1);
  input.release('touch:2');assert.equal(input.sample(),0);
  input.press('space',0);input.release('space');assert.equal(input.sample(),1);assert.equal(input.sample(),1);assert.equal(input.sample(),0);
  input.press('up',4);input.press('left',6);assert.equal(input.sample(),80);input.clear();assert.equal(input.sample(),0);
});

test('every form and direction commits exactly one punch on its active visual frame',()=>{
  for(const superSaiyan of [false,true])for(let facing=0;facing<4;facing++){
    const {mod,step,enemy,snes}=setup({superSaiyan,facing}),[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][facing];
    const target=enemy(3,200+dx*28,200+dy*28),behind=enemy(4,200-dx*40,200-dy*40),npc=enemy(5,200+dx*24,200+dy*24,100,150);
    step(1);assert.equal(mod.motion.pose().kind,'ready');step();assert.equal(mod.read16(target+0x182),20000);
    step(0,superSaiyan?1:2);assert.equal(mod.motion.pose().column,11);assert.ok(mod.read16(target+0x182)<20000);assert.equal(snes.joypad1State&1,0,'a connected punch must not also trigger the hidden sword');
    const hp=mod.read16(target+0x182);step(0,20);assert.equal(mod.read16(target+0x182),hp);assert.equal(mod.read16(behind+0x182),20000);assert.equal(mod.read16(npc+0x182),100);
  }
});

test('rapid taps buffer through recovery and chain two punches into a finishing kick',()=>{
  for(const superSaiyan of [false,true]){
    const {mod,step}=setup({superSaiyan});step(1);step();
    const seen=[mod.action.combo];
    for(let i=0;i<2;i++){
      step(1);step();
      for(let guard=0;guard<20&&mod.action?.combo===seen.at(-1);guard++)step();
      seen.push(mod.action.combo);
    }
    assert.deepEqual(seen,[0,1,2]);assert.equal(mod.motion.pose().column,superSaiyan?14:18);
    step(0,60);step(1);step();assert.equal(mod.action.combo,0,'combo resets after an idle gap');
  }
});

test('a missed three-hit combo plays two air swishes and a kick whoosh without impact or energy cues',()=>{
  const {mod,step}=setup(),cues=[];mod.playSound=name=>cues.push(name);
  for(let i=0;i<3;i++){step(1);step();step(0,14);}
  assert.deepEqual(cues,['swing','swing','kickSwing']);
});

test('charge preserves directional movement, aims immediately and releases along the locked facing',()=>{
  for(const superSaiyan of [false,true]){
    const {mod,snes,step}=setup({superSaiyan});step(1,12);assert.equal(mod.charging,true);
    step(1|(1<<4),100);assert.equal(mod.facing,3);assert.equal(mod.charge,superSaiyan?45:90);assert.equal(snes.joypad1State&0x1f1,1<<4);assert.equal(mod.motion.pose().column,superSaiyan?18:22);
    step();assert.equal(mod.effects.filter(e=>e.kind==='beam').length,1);assert.equal(mod.motion.pose().column,superSaiyan?19:23);
    step(1<<6,3);assert.equal(mod.action.facing,3);assert.equal(mod.effects[0].dy,-1);assert.equal(mod.motion.pose().row,3);
    step(0,superSaiyan?70:30);assert.equal(mod.action,null);assert.equal(mod.effects.length,0);
  }
});

test('Instant Transmission stays beside one living target without dealing damage, then cycles on the next press',()=>{
  const {mod,step,enemy}=setup(),first=enemy(3,350,200,100),second=enemy(4,480,300,100),npc=enemy(5,205,200,100,150);
  const combo=0x100|(1<<17);step(combo,16);
  assert.equal(mod.lastTeleportTarget,3);assert.equal(mod.read16(0xe002),324);assert.equal(mod.read16(0xe004),200);
  assert.equal(mod.read16(first+0x182),100);assert.equal(mod.read16(first+0x1f1),0);assert.equal(mod.effects.length,0);
  step(combo,20);assert.equal(mod.read16(0xe002),324,'holding combo must not teleport repeatedly');
  step();step(combo,16);assert.equal(mod.lastTeleportTarget,4);assert.equal(mod.read16(0xe002),454);assert.equal(mod.read16(0xe004),300);
  assert.equal(mod.read16(second+0x1f1),0);assert.equal(mod.read16(npc+0x182),100);
  step();step(1);step();step(0,3);assert.ok(mod.read16(second+0x1f1)>0,'player attacks normally after arrival');
});

test('a released ki burst finishes three alternating palm shots without starting a second burst',()=>{
  const {mod,step}=setup(),hands=[];const fire=mod.fireKi.bind(mod);mod.fireKi=a=>{hands.push(a.shots&1);fire(a);};
  step(1<<17);step(0,20);assert.deepEqual(hands,[0,1,0]);
});

test('DBZ cues follow actual strike, palm emission and beam-contact frames',()=>{
  for(const superSaiyan of[false,true]){
    const {mod,step,enemy}=setup({superSaiyan,power:false}),events=[];
    mod.playSound=name=>events.push({name,frame:mod.frame,age:mod.action?.age});
    enemy(3,228,200,20000);step(1);step();const released=mod.frame;
    assert.deepEqual(events.map(e=>e.name),['swing']);
    step(0,superSaiyan?1:2);
    assert.equal(events.at(-1).name,'hit');assert.equal(events.at(-1).frame-released,superSaiyan?1:2);
    step(0,20);events.length=0;step(1<<17);assert.equal(events.length,0);
    step(0,12);assert.equal(events.filter(e=>e.name==='blast').length,3);
    assert.ok(events.filter(e=>e.name==='impact').every(e=>e.frame>events.find(e=>e.name==='blast').frame));
    step(0,20);events.length=0;enemy(3,330,200,20000);mod.startCharge();mod.charge=90;mod.releaseCharge();
    assert.deepEqual(events.map(e=>e.name),['charge','beam']);step(0,10);
    assert.ok(events.find(e=>e.name==='impact').frame>events.find(e=>e.name==='beam').frame);
  }
});

test('world-flight landing cue waits for the visible descent to reach ground level',()=>{
  const {mod,snes,step}=setup(),cues=[];
  snes.ppu.brightness=15;mod.ownership={ppuOwners:[{base:0xe000,kind:'body'}]};
  mod.flightTransition={kind:'landing',age:0};mod.playSound=name=>cues.push({name,age:mod.flightTransition?.age});
  snes.ppu.forcedBlank=true;step(0,10);assert.equal(mod.flightTransition.age,0);assert.deepEqual(cues,[]);
  snes.ppu.forcedBlank=false;step(0,23);assert.deepEqual(cues,[]);assert.equal(mod.motion.pose().extraLift,3);
  step();assert.equal(mod.motion.pose().extraLift,0);assert.deepEqual(cues,[{name:'landing',age:24}]);
  step(0,10);assert.equal(cues.length,1);
});

test('beam damage follows its visible front, repeats on sustained contact, and ignores targets outside its width',()=>{
  const {mod,step,enemy}=setup({power:false}),near=enemy(3,300,200,1000,87),far=enemy(4,480,200,1000,87),outside=enemy(5,320,280,1000,87);
  mod.write16(0xe198,30);mod.startCharge();mod.charge=90;mod.releaseCharge();
  step();assert.equal(mod.read16(near+0x182),1000);assert.equal(mod.read16(far+0x182),1000);
  const health=base=>mod.read16(base+0x182)-mod.read16(base+0x1f1);
  step(0,3);assert.equal(health(near),970);assert.equal(health(far),1000);
  step(0,12);assert.equal(health(near),940);assert.equal(health(far),940);assert.equal(health(outside),1000);
});

test('one full SSJ wave overwhelms a 65535-HP boss but leaves its lethal hit to the native engine',()=>{
  const {mod,step,enemy}=setup({superSaiyan:true}),boss=enemy(3,300,200,65535,87);
  const orb=enemy(4,340,200,100,0x55);let orbCalls=0;mod.orbs={hit(){orbCalls++;return true;}};
  mod.startCharge();mod.charge=45;mod.releaseCharge();step(0,58);
  assert.equal(mod.read16(boss+0x182),1);assert.equal(mod.read16(boss+0x1f1),999);
  assert.equal(mod.read16(boss+2),300,'a giant boss is never launched out of its arena');
  assert.equal(mod.read8(boss+0x191)&0x80,0,'the game, not the beam, starts the death event');
  assert.equal(orbCalls,1);assert.equal(mod.read16(orb+0x182),100);
  // Native defeat can consume the queue and reuse the slot for a death OBJ.
  mod.write16(boss+0x182,0);mod.write16(boss+0x1f1,0);mod.write8(boss+0x180,0xf9);step(0,10);
  assert.equal(mod.read16(boss+0x1f1),0);assert.equal(orbCalls,1);
});

test('only a full Super Saiyan beam sweeps a screen-wide path, with travelling damage and a sustained pose',()=>{
  for(const superSaiyan of[false,true])for(const strength of[.95,1]){
    const {mod}=setup({superSaiyan});mod.startCharge();mod.charge=strength*(superSaiyan?45:90);mod.releaseCharge();
    assert.equal(mod.effects[0].mega,superSaiyan&&strength===1);
  }
  for(let facing=0;facing<4;facing++){
    const {mod,step,enemy}=setup({superSaiyan:true,facing}),[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][facing];
    // Keep the long-range targets inside unsigned native coordinates.
    mod.write16(0xe002,800);mod.write16(0xe004,800);
    const origin=mod.handOrigin(),spawn=(index,along,across,species=0)=>enemy(index,origin.x+dx*along-dy*across,origin.y+dy*along+dx*across+12,20000,species);
    const wide=spawn(3,140,65),outside=spawn(4,150,110),behind=spawn(5,-60,0),far=spawn(6,550,30),npc=spawn(7,160,0,150);
    mod.startCharge();mod.charge=45;mod.releaseCharge();const beam=mod.effects[0];
    step();assert.equal(beam.hits.length,0,'front has not reached the targets');
    step(0,5);assert.deepEqual(Array.from(beam.hits),[3]);
    assert.equal(mod.read16(outside+0x182),20000);assert.equal(mod.read16(behind+0x182),20000);assert.equal(mod.read16(npc+0x182),20000);
    step(0,25);assert.deepEqual(Array.from(beam.hits),[3,6]);assert.equal(mod.motion.pose().column,20,'hands sustain the giant beam');
    assert.ok(mod.read16(wide+0x182)<20000);assert.ok(mod.read16(far+0x182)<20000);
    assert.equal(mod.beamGeometry(beam).halfWidth,80);
    step(0,40);assert.equal(mod.action,null);assert.equal(mod.effects.length,0);
  }
});

test('held ki blasts use their own release pose and Super Saiyan fires faster',()=>{
  const counts=[];
  for(const superSaiyan of [false,true]){
    const {mod,step}=setup({superSaiyan});let shots=0;const fire=mod.fireKi.bind(mod);mod.fireKi=action=>{shots++;fire(action);};
    step(1<<17);assert.equal(mod.effects.length,0,'windup precedes emission');step(1<<17,superSaiyan?1:2);
    assert.equal(mod.motion.pose().column,superSaiyan?25:29);assert.equal(mod.effects[0].kind,'ki');step(1<<17,120);counts.push(shots);
  }
  assert.ok(counts[1]>counts[0]*2);
});

test('menus, confirm, switching characters and incapacitation cancel charge without a stray shot',()=>{
  for(const stop of [(m,s)=>s(1<<1),(m,s)=>s(1<<16),(m,s)=>{m.write8(0xe02c,0);s(1);},(m,s)=>{m.write8(0xe191,0x80);s(1);},(m,s)=>{m.write8(0xe011,0x8d);s(1);},(m,s)=>{m.write8(0xd0,0x83);s(1);}]){
    const {mod,step}=setup({power:false});step(1,50);assert.equal(mod.charging,true);stop(mod,step);assert.equal(mod.charging,false);assert.equal(mod.effects.length,0);step();assert.equal(mod.effects.length,0);
  }
  const {mod,step,snes}=setup();step(1<<16,120);assert.equal(mod.charging,false);assert.equal(snes.joypad1State,1);
});

test('transform and revert play every authored phase without empty or unrelated source cells',()=>{
  const {mod,step}=setup();
  for(const [superSaiyan,columns,sheet]of [[true,[54,55,56,57,58],'goku'],[false,[47,48,49,50],'ssj']]){
    mod.configure({superSaiyan});const seen=new Set();
    while(mod.action){const pose=mod.motion.pose();assert.equal(pose.sheet,sheet);assert.equal(pose.row,0);seen.add(pose.column);step();}
    assert.deepEqual([...seen].sort((a,b)=>a-b),columns);
  }
});

test('mid-charge and mid-strike snapshots preserve exact animation and projectile timing',()=>{
  for(const charging of [true,false]){
    const {mod,step}=setup();step(1,charging?36:2);if(!charging){step();step();}
    const saved=mod.snapshot(),ram=mod.snes.ram.slice();step(0,8);const first=JSON.stringify(mod.snapshot());
    mod.snes.ram.set(ram);mod.restore(saved);step(0,8);assert.equal(JSON.stringify(mod.snapshot()),first);
  }
});

test('restoring a flight checkpoint updates controls before the next emulated frame',()=>{
  const {mod,step}=setup();mod.write8(0xe4,4);mod.write8(0xe5,4);mod.write8(0xec,0x80);step();
  const saved=mod.snapshot();mod.reset();assert.equal(mod.worldFlight,false);mod.restore(saved);assert.equal(mod.worldFlight,true);
  mod.restore();assert.equal(mod.worldFlight,true,'legacy native-only checkpoints derive flight from restored WRAM');
  mod.write8(0xe4,1);mod.write8(0xe5,1);mod.write8(0xec,0);mod.restore();assert.equal(mod.worldFlight,false);
});

test('standing feet stay fixed across source poses and native airborne height is subtracted once',()=>{
  const {mod,step}=setup();mod.write8(0xe011,1);let distance=0;
  for(let i=0;i<12;i++){mod.write16(0xe002,200+i*2);step();const pose=mod.motion.pose();assert.deepEqual(Array.from(pose.origin),[16,31]);distance=mod.motion.state.distance;}
  assert.ok(distance>=20);
  mod.write8(0xe011,0x8d);mod.write8(0xe045,15);step();assert.equal(mod.motion.pose().kind,'hurt');assert.equal(mod.motion.pose().lift,15);
  mod.write8(0xe190,0x10);step();assert.equal(mod.motion.pose().column,51);
});

test('native NMI sync bit does not interrupt charge or lose reward attribution',()=>{
  const {mod,step,enemy}=setup();step(1,35);mod.write8(0xec,1);step(1,35);
  assert.equal(mod.charging,true);assert.ok(mod.charge>50);
  const target=enemy(3,230,200,20);mod.write8(target+0x1ec,0xff);mod.write8(target+0x1f0,0xff);
  step();step(0,3);assert.equal(mod.read16(target+0x1f1),999);
  assert.equal(mod.read8(target+0x1ec),0);assert.equal(mod.read8(target+0x1f0),0);
});

test('scripted falling stays airborne, then native landing and recovery phases use the correct poses',()=>{
  for(const superSaiyan of [false,true]){
    const {mod,step}=setup({superSaiyan});
    for(const native of [0xa0,0xae]){
      mod.write8(0xe011,native);step(0,100);
      const pose=mod.motion.pose();assert.equal(pose.kind,'fall');assert.equal(pose.column,superSaiyan?34:38);
    }
    mod.write8(0xe011,0xa2);mod.write16(0xe026,280);mod.write8(0xe045,47);step();
    assert.equal(mod.motion.pose().column,superSaiyan?29:33);assert.equal(mod.motion.pose().lift,47);
    mod.write8(0xe045,0);mod.write16(0xe026,112);step();assert.equal(mod.motion.pose().column,superSaiyan?43:51);
    mod.write16(0xe026,134);mod.write8(0xe045,2);step();assert.equal(mod.motion.pose().column,superSaiyan?41:49);
    mod.write8(0xe011,0);mod.write8(0xe045,0);step(0,3);assert.equal(mod.motion.pose().kind,'idle');
  }
});

test('Saiyan charge resists ordinary knockback without losing its pose; normal power can be interrupted',()=>{
  for(const power of [false,true]){
    const {mod,step}=setup({power});step(1,40);mod.write8(0xe011,0x8d);mod.write8(0xe045,12);step(1);
    assert.equal(mod.charging,power);assert.equal(mod.motion.pose().kind,power?'charge':'hurt');
  }
});
