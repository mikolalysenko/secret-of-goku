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
  snes.ram.set([0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0],0x100);
  for(const a of [0xe4,0xe5,0xe000,0xe02c])mod.write8(a,1);
  mod.write16(0xe002,200);mod.write16(0xe004,200);mod.write16(0xe020,128);mod.write16(0xe022,114);mod.write8(0xe010,[1,2,0x82,0][facing]);mod.facing=facing;
  const step=(mask=0,n=1)=>{for(let i=0;i<n;i++){mod.beforeFrame(mask);mod.motion.pose();mod.afterFrame();}return mod;};
  const enemy=(index,x,y,hp=20000,species=0)=>{const base=0xe000+index*0x200;mod.write8(base,1);mod.write8(base+0x180,species);mod.write16(base+2,x);mod.write16(base+4,y);mod.write16(base+0x182,hp);return base;};
  return{mod,snes,step,enemy};
}

test('keyboard aliases and separate touch pointers cannot release one another; quick action taps survive slower native menu scans',()=>{
  const input=new GameInput();input.press('j',0);input.press('touch:2',0);input.release('j');
  assert.equal(input.sample(),1);assert.equal(input.sample(),1);assert.equal(input.sample(),1);
  input.release('touch:2');assert.equal(input.sample(),1);assert.equal(input.sample(),0);
  input.press('space',0);input.release('space');for(let i=0;i<4;i++)assert.equal(input.sample(),1);assert.equal(input.sample(),0);
  input.press('up',4);input.press('left',6);assert.equal(input.sample(),80);input.clear();assert.equal(input.sample(),0);
});

test('every form and direction commits exactly one punch on its active visual frame',()=>{
  for(const superSaiyan of [false,true])for(let facing=0;facing<4;facing++){
    const {mod,step,enemy,snes}=setup({superSaiyan,facing}),[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][facing];
    const target=enemy(3,200+dx*28,200+dy*28),behind=enemy(4,200-dx*40,200-dy*40),npc=enemy(5,200+dx*24,200+dy*24,100,150);
    step(1);assert.equal(mod.motion.pose().kind,'punch');assert.equal(mod.read16(target+0x182),20000);
    step(0,superSaiyan?1:2);assert.equal(mod.motion.pose().column,superSaiyan?1:11);assert.ok(mod.read16(target+0x182)<20000);assert.equal(snes.joypad1State&1,0,'a connected punch must not also trigger the hidden sword');
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
    const {mod,snes,step}=setup({superSaiyan});step(0x402,12);assert.equal(mod.charging,true);
    step(0x402|(1<<4),100);assert.equal(mod.facing,3);assert.equal(mod.charge,superSaiyan?45:90);assert.equal(snes.joypad1State&0x1f1,1<<4);assert.equal(mod.motion.pose().column,superSaiyan?18:22);
    step();assert.equal(mod.effects.filter(e=>e.kind==='beam').length,1);assert.equal(mod.motion.pose().column,superSaiyan?19:23);
    step(1<<6,3);assert.equal(mod.action.facing,3);assert.equal(mod.effects[0].dy,-1);assert.equal(mod.motion.pose().row,3);
    step(0,superSaiyan?70:30);assert.equal(mod.action,null);assert.equal(mod.effects.length,0);
  }
});

test('charging slides between wide and closed stances and settles when movement stops',()=>{
  for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++){
    const {mod,step}=setup({superSaiyan,facing}),[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][facing];
    step(0x402,5);const column=superSaiyan?18:22,poses=new Set();
    assert.equal(mod.motion.pose().shuffle,undefined,'stationary charging has no foot cycle');
    for(let i=1;i<=40;i++){
      mod.write16(0xe002,200+dx*i);mod.write16(0xe004,200+dy*i);step(0x402);
      const p=mod.motion.pose();poses.add(p.shuffle);assert.equal(p.column,column);assert.equal(p.row,[0,2,1,3][facing]);
      assert.ok([0,1].includes(p.shuffle));assert.equal(p.legs,undefined,'grounded charge never uses lifted walking legs');
    }
    assert.deepEqual([...poses].sort((a,b)=>a-b),[0,1]);
    step(0x402,4);assert.equal(mod.motion.pose().shuffle,undefined);
    const still=JSON.stringify(mod.motion.pose());step(0x402,20);
    assert.equal(mod.motion.pose().column,JSON.parse(still).column);assert.equal(mod.motion.pose().shuffle,undefined);
    step();assert.equal(mod.motion.pose().kind,'beam');assert.equal(mod.motion.pose().legs,undefined);
  }
});

test('focus and form changes allow native walking and follow the aimed direction',()=>{
  for(const kind of['focus','transform','revert'])for(let facing=0;facing<4;facing++){
    const {mod,step,snes}=setup(),direction=[0x20,0x80,0x40,0x10][facing];
    mod.action={kind,age:0,duration:kind==='focus'?0:32,super:kind==='transform',facing:1};
    step(0x400|direction,4);
    assert.equal(mod.action.kind,kind);assert.equal(snes.joypad1State&0xf0,direction);assert.equal(mod.action.facing,facing);
  }
});

test('airborne Kamehameha uses upright hover legs, including suspended local flight and Mode 7',()=>{
  for(const superSaiyan of[false,true])for(const mode of['localFlight','localLift','worldFlight']){
    const {mod,step}=setup({superSaiyan});step(0x402,5);
    if(mode==='localLift')mod.localLift=12;else mod[mode]=true;
    const pose=mod.motion.pose({flight:mode==='worldFlight'});
    assert.equal(pose.column,superSaiyan?18:22);assert.equal(pose.legs,superSaiyan?34:38);
  }
});

test('Instant Transmission stays beside one living target without dealing damage, then cycles on the next press',()=>{
  const {mod,step,enemy}=setup(),first=enemy(3,350,200,100),second=enemy(4,480,300,100),npc=enemy(5,205,200,100,150);
  const combo=0x401;step(combo,16);
  assert.equal(mod.lastTeleportTarget,3);assert.equal(mod.read16(0xe002),324);assert.equal(mod.read16(0xe004),200);
  assert.equal(mod.read16(first+0x182),100);assert.equal(mod.read16(first+0x1f1),0);assert.equal(mod.effects.length,0);
  step(combo,20);assert.equal(mod.read16(0xe002),324,'holding combo must not teleport repeatedly');
  step();step(combo,16);assert.equal(mod.lastTeleportTarget,4);assert.equal(mod.read16(0xe002),454);assert.equal(mod.read16(0xe004),300);
  assert.equal(mod.read16(second+0x1f1),0);assert.equal(mod.read16(npc+0x182),100);
  step();step(1);step();step(0,3);assert.ok(mod.read16(second+0x1f1)>0,'player attacks normally after arrival');
});

test('each ki tap fires one shot, alternating hands, without an extra burst',()=>{
  const {mod,step}=setup(),hands=[];const fire=mod.fireKi.bind(mod);mod.fireKi=a=>{hands.push(a.hand);fire(a);};
  for(let i=0;i<3;i++){step(2);step(0,20);}assert.deepEqual(hands,[0,1,0]);
});

test('DBZ cues follow actual strike, palm emission and beam-contact frames',()=>{
  for(const superSaiyan of[false,true]){
    const {mod,step,enemy}=setup({superSaiyan,power:false}),events=[];
    mod.playSound=name=>events.push({name,frame:mod.frame,age:mod.action?.age});
    enemy(3,228,200,20000);step(1);const released=mod.frame;
    assert.deepEqual(events.map(e=>e.name),['swing']);
    step(0,superSaiyan?1:2);
    assert.equal(events.at(-1).name,'hit');assert.equal(events.at(-1).frame-released,superSaiyan?1:2);
    step(0,20);events.length=0;step(1<<17);assert.equal(events.length,0);
    step(0,12);assert.equal(events.filter(e=>e.name==='blast').length,1);
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
  snes.ppu.forcedBlank=false;step(0,23);assert.deepEqual(cues,[]);assert.ok(mod.motion.pose().extraLift>0);
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
  for(const stop of [(m,s)=>s(1<<9),(m,s)=>s(1<<16),(m,s)=>{m.write8(0xe02c,0);s(1);},(m,s)=>{m.write8(0xe191,0x80);s(1);},(m,s)=>{m.write8(0xe011,0x8d);s(1);},(m,s)=>{m.write8(0xd0,0x83);s(1);}]){
    const {mod,step}=setup({power:false});step(0x402,50);assert.equal(mod.charging,true);stop(mod,step);assert.equal(mod.charging,false);assert.equal(mod.effects.length,0);step();assert.equal(mod.effects.length,0);
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

test('Super Saiyan ignition hits nearby enemies once on the gold flash and sound frame',()=>{
  for(const duration of[32,72]){
    const {mod,step,enemy}=setup(),cues=[],flashes=[];
    mod.playSound=name=>cues.push({name,age:mod.action?.age});mod.feedback={tick(){},burst:()=>flashes.push(mod.action.age)};
    const nearby=[enemy(3,240,200),enemy(4,160,200),enemy(5,200,240),enemy(6,200,160,20000,87)];
    const untouched=[enemy(1,205,200,50,129),enemy(7,244,244),enemy(8,205,200,100,150),enemy(9,205,200,100,0x55),enemy(10,210,200),enemy(11,205,200,30)];
    mod.write8(untouched[4]+0x191,0x80);mod.write16(untouched[5]+0x1f1,30);
    const health=base=>mod.read16(base+0x182)-mod.read16(base+0x1f1),before=untouched.map(health);
    mod.configure({superSaiyan:true});mod.action.duration=duration;
    const ignition=Math.ceil(duration*14/40);step(0,ignition-1);
    assert.deepEqual(nearby.map(health),[20000,20000,20000,20000]);assert.deepEqual(flashes,[]);
    step();assert.equal(mod.motion.pose().column,56);
    assert.deepEqual(flashes,[ignition]);assert.deepEqual(cues.filter(c=>c.name==='powerBurst'),[{name:'powerBurst',age:ignition}]);
    assert.deepEqual(nearby.map(health),Array(4).fill(20000-Math.round(8191*.75)));
    assert.deepEqual(untouched.map(health),before);assert.equal(mod.effects.filter(e=>e.kind==='powerBurst').length,1);
    assert.equal(mod.knockbacks.length,3,'bosses stay in their arena');
    assert.ok(mod.knockbacks.find(k=>k.base===nearby[0]).dx>0);assert.ok(mod.knockbacks.find(k=>k.base===nearby[1]).dx<0);
    step(0,duration+20);assert.equal(mod.effects.length,0);assert.deepEqual(flashes,[ignition]);
    assert.deepEqual(nearby.map(health),Array(4).fill(20000-Math.round(8191*.75)));
  }
});

test('transformation burst replays once across checkpoints and never damages from Mode 7',()=>{
  const {mod,step,enemy}=setup(),target=enemy(3,235,200);
  mod.configure({superSaiyan:true});step(0,10);
  const before=mod.snapshot(),ram=mod.snes.ram.slice();step(0,4);const after=JSON.stringify(mod.snapshot()),afterRam=mod.snes.ram.slice();
  mod.snes.ram.set(ram);mod.restore(before);step(0,4);assert.equal(JSON.stringify(mod.snapshot()),after);assert.deepEqual(mod.snes.ram,afterRam);
  const during=mod.snapshot(),effective=mod.read16(target+0x182)-mod.read16(target+0x1f1);mod.restore(during);step(0,40);
  assert.equal(mod.read16(target+0x182)-mod.read16(target+0x1f1),effective,'restoring after ignition cannot hit twice');
  const air=setup();air.enemy(3,235,200);air.mod.write8(0xe4,4);air.mod.write8(0xe5,4);air.mod.write8(0xec,0x80);air.step();
  air.mod.configure({superSaiyan:true});air.step(0,40);
  assert.equal(air.mod.read16(0xe782),20000);assert.equal(air.mod.effects.length,0);
});

test('held L keeps the original directional guard without shifting the body or changing form',()=>{
 for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++){
  const {mod,step}=setup({superSaiyan,facing});
  for(let i=0;i<150;i++){
    step(0x400);const pose=mod.motion.pose();
    assert.equal(pose.kind,'focus');assert.equal(pose.sheet,superSaiyan?'ssj':'goku');
    assert.equal(pose.column,superSaiyan?21:25);assert.equal(pose.row,[0,2,1,3][facing]);
    for(const key of['bodyX','bodyY','offsetX','offsetY'])assert.equal(pose[key]??0,0);
  }
  assert.equal(mod.options.superSaiyan,superSaiyan);
  assert.equal(mod.effects.length,0,'holding focus alone does not repeatedly explode');
  step();assert.notEqual(mod.motion.pose().kind,'focus');
 }
});

test('every strike keeps its native pivot and blocks movement until recovery finishes',()=>{
 for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++)for(const kind of['punch','blast']){
  for(let combo=0;combo<(kind==='punch'?3:1);combo++){
   const {mod,step,snes}=setup({superSaiyan,facing});mod.combo=combo-1;mod.comboUntil=100;
   if(kind==='punch')mod.punch();else mod.kiBlast();
   while(mod.action){
    const p=mod.motion.pose();
    for(const key of['bodyX','bodyY','offsetX','offsetY'])assert.equal(p[key]??0,0);
    assert.equal(p.row,[0,2,1,3][facing]);assert.equal(mod.read16(0xe002),200);assert.equal(mod.read16(0xe004),200);
    step(0xf0);if(mod.action)assert.equal(snes.joypad1State&0xf0,0,'no sliding during the strike or recovery');
   }
   step(0x80);assert.equal(snes.joypad1State&0x80,0x80,'movement resumes immediately after recovery');
  }
 }
});

test('both forms use separate lead-hand, rear-hand and kick strips in every direction',()=>{
 for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++){
  const {mod}=setup({superSaiyan,facing}),strips=[];
  for(let combo=0;combo<3;combo++){
   const poses=[];
   for(const age of superSaiyan?[0,1,2,4]:[0,2,4,7]){
    mod.action={kind:'punch',combo,age,super:superSaiyan,facing,impact:superSaiyan?1:2};
    const p=mod.motion.pose();poses.push(`${p.sheet}:${p.column}`);assert.equal(p.row,[0,2,1,3][facing]);
   }
   assert.equal(new Set(poses).size,4,'every phase is reachable, including the rear-facing contact frame');strips.push(poses);
  }
  assert.equal(new Set(strips.flat()).size,12,'the second punch cannot reuse the first hand');
  if(superSaiyan)assert.deepEqual(strips,[['ssjJab:0','ssjJab:1','ssjJab:2','ssjJab:3'],['ssj:10','ssj:11','ssj:12','ssj:13'],['ssj:14','ssj:15','ssj:16','ssj:17']]);
 }
});

test('connected strikes freeze 5 / 6 / 10 frames (one less as a Super Saiyan) with a two-frame white impact frame; misses and puzzle orbs do not hit-stop',()=>{
 for(const superSaiyan of[false,true])for(const combo of[0,1,2]){
  const {mod,step,enemy}=setup({superSaiyan}),base=enemy(3,228,200);
  mod.combo=combo-1;mod.comboUntil=100;mod.punch();step(0,mod.action.impact);
  const pose=JSON.stringify(mod.motion.pose()),hp=mod.read16(base+0x1f1),hold=mod.action.hitPause;
  assert.equal(hold,[[5,6,10],[4,5,9]][superSaiyan?1:0][combo]);assert.equal(mod.effects.find(e=>e.kind==='impact').life,10);
  assert.deepEqual([...mod.effects.filter(e=>e.kind==='star').map(e=>`${e.size}/${e.life}@${e.x},${e.y}`)],[`${combo+1}/2@228,188`],'impact frame sized by the blow at the contact');
  assert.deepEqual([...mod.effects.filter(e=>e.kind==='flash').map(e=>`${e.base}/${e.life}`)],[`${base}/2`],'the struck actor flashes white');
  assert.equal(mod.read8(base+0x0d),hold<<4|1,'the native shake jitters it along the blow through the hit stop');
  assert.deepEqual([...mod.effects.filter(e=>e.kind==='shock').map(e=>e.life)],combo===2?[7]:[],'only the kick sends a shockwave, a frame after the burst');
  for(let i=0;i<hold;i++){
   step();const p=mod.motion.pose();assert.equal(p.phase,'contact');
   assert.equal(p.column,JSON.parse(pose).column);assert.equal(mod.action.age,mod.action.impact);
   assert.equal(p.lunge,[2,3,4][combo],'the contact pose lunges further for heavier blows');
   assert.equal(mod.effects.find(e=>e.kind==='impact').life,10);assert.equal(mod.read16(base+2),228);
   assert.equal(mod.read16(base+0x1f1),hp,'contact hold never deals a second hit');
   assert.equal(mod.effects.some(e=>e.kind==='star'||e.kind==='flash'),i===0,'impact frame and flash last two frames');
  }
  step();assert.ok(mod.read16(base+2)>228);assert.ok(mod.action.age>mod.action.impact);
  const knock=mod.knockbacks.find(k=>k.base===base);
  if(combo<2){
   // A surviving target slides back along the ground and stays in reach.
   assert.equal(knock.slide,true);assert.equal(knock.duration,6);assert.equal(knock.distance,superSaiyan?14:10);
   step(0,5);assert.equal(mod.read16(base+2),228+(superSaiyan?14:10));assert.equal(mod.read8(base+0x45),0);
  }else{assert.equal(knock.slide,undefined);assert.equal(knock.distance,superSaiyan?88:56);assert.ok(mod.read8(base+0x45)>0);}
 }
 // A killing jab still launches the target.
 {const {mod,step,enemy}=setup(),base=enemy(3,228,200,100);mod.punch();step(0,mod.action.impact);
  const knock=mod.knockbacks.find(k=>k.base===base);assert.equal(knock.slide,undefined);assert.equal(knock.distance,56);}
 for(const orb of[false,true]){
  const {mod,step,enemy}=setup();if(orb)enemy(3,228,200,100,0x55);
  step(1);step(0,2);assert.equal(mod.action.hitPause,0);
  assert.equal(mod.effects.some(e=>['impact','star','flash','shock'].includes(e.kind)),false);step();assert.equal(mod.action.age,3);
 }
});

test('impact frames: a mirrored starburst per blow, then the kick shockwave a frame later, shared with the cartridge',async()=>{
 const {impactArt,impactParts,drawImpact,IMPACT_STAR_LIFE,IMPACT_SHOCK_LIFE,IMPACT_SHOCK_DELAY}=await import('../engine/impact-art.js');
 const art=impactArt(),radius=[];
 for(let size=0;size<4;size++){
  assert.equal(impactParts('star',size,0),art.stars[size]);assert.equal(impactParts('star',size,IMPACT_STAR_LIFE),null);
  let lo=99,hi=-99;drawImpact(art.stars[size],0,0,(x)=>{lo=Math.min(lo,x);hi=Math.max(hi,x);});radius.push(hi);
  if(size)assert.deepEqual(art.stars[size].map(p=>[p.ox,p.oy,p.h,p.v]),[[0,0,false,false],[-16,0,true,false],[0,-16,false,true],[-16,-16,true,true]],'one cell in four quadrants (fx_emit_quad)');
 }
 assert.ok(radius[0]<radius[1]&&radius[1]<radius[2]&&radius[2]<radius[3],'ki < jab < cross < kick');
 assert.equal(impactParts('shock',0,0),null,'the contact frame carries only the burst');
 for(let age=IMPACT_SHOCK_DELAY;age<IMPACT_SHOCK_DELAY+IMPACT_SHOCK_LIFE;age++)assert.equal(impactParts('shock',0,age),art.shock[age-IMPACT_SHOCK_DELAY]);
 assert.equal(impactParts('shock',0,IMPACT_SHOCK_DELAY+IMPACT_SHOCK_LIFE),null);
 assert.ok(new Set(art.shock.flat().map(p=>p.px)).size<=5,'the shockwave reuses five cells');
});

test('the strike lunges only the drawn body along the facing, never the native position',()=>{
 for(const superSaiyan of[false,true])for(let combo=0;combo<3;combo++){
  const {mod}=setup({superSaiyan}),reach=[2,3,4][combo],seen=[];
  for(let age=0;age<(superSaiyan?7:14);age++){
   mod.action={kind:'punch',combo,age,super:superSaiyan,facing:1,impact:superSaiyan?1:2};
   seen.push(mod.motion.pose().lunge);
  }
  const contact=superSaiyan?[1]:[2,3],follow=superSaiyan?[2,3]:[4,5,6];
  seen.forEach((lunge,age)=>assert.equal(lunge,contact.includes(age)?reach:follow.includes(age)?(reach+1)>>1:0,`age ${age}`));
 }
});

test('a connected blow kicks the background camera along it and springs back; text and Mode 7 stay put',async()=>{
 const {createNativeFeedback,KICK_PROFILES}=await import('../engine/native-feedback.js');
 const ram=new Uint8Array(0x20000),cpu={r:[0,0],br:[0,0,0,0,0],cyclesLeft:0,cycle(){},registerBreakpoints(){}};
 const ppu={bgHoff:[100,200,300,0,0],bgVoff:[50,60,70,0,0],mode:1,getColor(){return [0,0,0];}};
 const snes={ram,ppu,cpu,write(){}},feedback=createNativeFeedback(snes,{options:{enabled:true},gokuActive:true,canAttack:true});
 // The field NMI's scroll routine returns at C0:C1CE with fresh values.
 const nmi=()=>{ppu.bgHoff[0]=100;ppu.bgHoff[1]=200;ppu.bgVoff[0]=50;ppu.bgVoff[1]=60;cpu.br[4]=0xc1ce;cpu.cycle();cpu.br[4]=0;};
 const seen=[];
 feedback.kick(1,2);seen.push([ppu.bgHoff[0],ppu.bgHoff[1],ppu.bgVoff[0],ppu.bgVoff[1],ppu.bgHoff[2]]);
 for(let f=0;f<8;f++){nmi();feedback.tick();seen.push([ppu.bgHoff[0],ppu.bgHoff[1],ppu.bgVoff[0],ppu.bgVoff[1],ppu.bgHoff[2]]);}
 assert.deepEqual(seen.map(s=>s[0]-100),[...KICK_PROFILES[2],0,0,0],'BG1 follows the kick profile, one value per picture');
 assert.ok(seen.every(s=>s[1]-200===s[0]-100&&s[2]===50&&s[3]===60&&s[4]===300),'BG2 moves with BG1; vertical and BG3 stay');
 feedback.kick(3,0);assert.deepEqual([ppu.bgVoff[0],ppu.bgVoff[1]],[48,58],'an upward blow pushes the camera up');
 ppu.mode=7;nmi();feedback.tick();assert.deepEqual([ppu.bgHoff[0],ppu.bgVoff[0]],[100,50],'Mode 7 arenas keep their scroll');
 feedback.kick(1,1);assert.equal(ppu.bgHoff[0],100);
});

test('teleport cycles the entire reachable roster and buffers one tap through the fully hidden camera wait',()=>{
 const {mod,step,enemy,snes}=setup(),sounds=[];
 for(let i=3;i<6;i++)enemy(i,200+i*45,200,100);
 mod.playSound=name=>sounds.push({name,age:mod.action?.age});
 let pending=false;mod.teleport={get pending(){return pending;},findLanding:target=>({x:target.x-26,y:target.y,terrain:0,facing:1}),follow(){pending=true;}};
 step(0x401,4);assert.equal(mod.lastTeleportTarget,3);assert.equal(mod.motion.pose().hidden,true);
 step();step(0x401);step();step(0x401,12);
 assert.equal(mod.action.age,4);assert.equal(mod.motion.pose().hidden,true);assert.equal(snes.joypad1State,0);
 assert.equal(sounds.filter(s=>s.name==='teleportIn').length,0);
 pending=false;step();assert.equal(mod.motion.pose().hidden,true);
 step();assert.equal(mod.motion.pose().phase,'appear');assert.deepEqual(sounds.at(-1),{name:'teleportIn',age:6});
 step(0,10);assert.equal(mod.lastTeleportTarget,4,'the queued tap commits once after recovery');
 pending=false;step(0,16);assert.equal(mod.action,null);assert.equal(sounds.filter(s=>s.name==='teleport').length,2);
 for(const index of[5,3]){
  step(0x401,4);assert.equal(mod.lastTeleportTarget,index);pending=false;step(0,16);
 }
 for(let i=3;i<6;i++)assert.equal(mod.read16(0xe000+i*512+0x1f1),0);
});

test('mid-charge and mid-strike snapshots preserve exact animation and projectile timing',()=>{
  for(const charging of [true,false]){
    const {mod,step}=setup();step(charging?0x402:1,charging?36:2);if(!charging){step();step();}
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
  const {mod,step,enemy}=setup();step(0x402,35);mod.write8(0xec,1);step(0x402,35);
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
    mod.write8(0xe045,0);mod.write16(0xe026,112);step();assert.equal(mod.motion.pose().column,superSaiyan?33:51);
    mod.write16(0xe026,134);mod.write8(0xe045,2);step();assert.equal(mod.motion.pose().column,superSaiyan?41:49);
    mod.write8(0xe011,0);mod.write8(0xe045,0);step(0,3);assert.equal(mod.motion.pose().kind,'idle');
  }
});

test('an unblocked hit cancels charge, owns movement, and requires release before charging again',()=>{
  for(const power of [false,true])for(const hurt of[0x8c,0x8d,0x8e,0x8f]){
    const {mod,step}=setup({power});step(0x402,40);assert.equal(mod.charging,true);
    mod.write8(0xe011,hurt);mod.write8(0xe045,12);step(0x402);
    assert.equal(mod.charging,false);assert.equal(mod.canAttack,false);assert.equal(mod.action,null);assert.equal(mod.attackBlocked,true);
    mod.write8(0xe011,0);mod.write8(0xe045,0);step(0x402,10);assert.equal(mod.charging,false);
    step();assert.equal(mod.effects.some(e=>e.kind==='beam'),false);step(0x402,10);assert.equal(mod.charging,true);
  }
});

test('SNES L builds focus, L+A commits only at full power, and one tap quickly reverts',()=>{
  const {mod,step,snes}=setup();step(0x400,120);
  assert.equal(mod.powerCharge,96);assert.equal(mod.options.superSaiyan,false);assert.equal(mod.action.kind,'focus');
  assert.equal(snes.joypad1State&0xf00,0,'focus never leaks shoulder actions into the game');
  step();assert.equal(mod.action,null);assert.equal(mod.powerCharge,0);
  step(0x500,45);assert.equal(mod.options.superSaiyan,false);step();assert.equal(mod.action,null);
  step(0x500,96);assert.equal(mod.options.superSaiyan,true);assert.equal(mod.action.kind,'transform');
  step(0x500,100);assert.equal(mod.options.superSaiyan,true,'holding the chord never toggles back');
  step();step(0x500);assert.equal(mod.options.superSaiyan,false);assert.equal(mod.action.duration,10);
  step(0x500,130);assert.equal(mod.options.superSaiyan,false,'revert requires release before another transformation');
});
test('L attack chords replace focus without toggling form, and holding B chains a physical combo',()=>{
  const {mod,step,enemy}=setup({superSaiyan:true});enemy(3,350,200);
  step(0x400,30);step(0x402,55);assert.equal(mod.charging,true);assert.equal(mod.options.superSaiyan,true);
  step(2);assert.equal(mod.action.kind,'beam');step(2,100);assert.equal(mod.effects.filter(e=>e.kind==='ki').length,0,'releasing L first does not fire unintended ki');
  step();step(0x401,20);assert.equal(mod.lastTeleportTarget,3);assert.equal(mod.options.superSaiyan,true);
  step(0,20);const combos=new Set();for(let i=0;i<50;i++){step(1);if(mod.action?.kind==='punch')combos.add(mod.action.combo);}
  assert.deepEqual([...combos].sort(),[0,1,2]);assert.equal(mod.charging,false);
});
test('focus checkpoints replay the aura clock and transformation precisely',()=>{
  const {mod,step}=setup();step(0x500,55);const saved=mod.snapshot(),ram=mod.snes.ram.slice();
  step(0x500,60);const expected=JSON.stringify(mod.snapshot());mod.snes.ram.set(ram);mod.restore(saved);step(0x500,60);
  assert.equal(JSON.stringify(mod.snapshot()),expected);
});

test('Saiyan strength enlarges the health pool once but never regenerates battle injuries',()=>{
 const {mod,step}=setup();mod.write16(0xe184,50);mod.write16(0xe182,43);step();
 assert.equal(mod.read16(0xe184),999);assert.equal(mod.read16(0xe182),992,'keep the seven points already lost');
 mod.write16(0xe182,913);step(0,180);step(0x402,120);step(0,80);
 assert.equal(mod.read16(0xe182),913,'idle, charging and releasing cannot heal');
 mod.options.superSaiyan=true;step(0,60);assert.equal(mod.read16(0xe182),913);
 mod.write16(0xe182,0);mod.write8(0xe191,0x80);step(0,120);assert.equal(mod.read16(0xe182),0,'unconscious Goku is not revived');
});

test('battle banners keep attacks active; modal screens and incapacitation never turn ki into a ring request',()=>{
 const {mod,snes,step}=setup();mod.write8(0x2c,3);
 step(2,4);assert.equal(mod.canAttack,true);assert.equal(mod.action.kind,'blast');assert.equal(snes.joypad1State&2,0);
 step(0,30);step(1);assert.equal(mod.action.kind,'punch');step(0,30);
 // Native status/action/level pages use the menu interrupt, even with EC=0.
 snes.ram.set([0x5c,0xa7,0x20,0xc0],0x100);step(2,5);
 assert.equal(mod.canAttack,false);assert.equal(mod.action,null);assert.equal(snes.joypad1State&2,0);
 step(0x200);assert.equal(snes.joypad1State&2,2,'the explicit ring/back button still exits');
 snes.ram.set([0x5c,0xa8,0xc0,0],0x100);mod.write8(0xe191,0x80);step(2,5);
 assert.equal(mod.canAttack,false);assert.equal(snes.joypad1State&2,0);
 mod.write8(0xe191,0);step();step(2,4);assert.equal(mod.action.kind,'blast');
 step(0,30);step(1);assert.equal(mod.action.kind,'punch');
});

test('sleep and poison immediately end Super Saiyan without curing the native condition or firing the held beam',()=>{
 for(const [address,bit]of[[0xe190,0x10],[0xe191,0x20]]){
  const {mod,step}=setup({superSaiyan:true});const sounds=[];mod.playSound=s=>sounds.push(s);step(0x402,35);assert.equal(mod.charging,true);
  mod.write8(address,bit);step(0x402);assert.equal(mod.options.superSaiyan,false);assert.equal(mod.charging,false);assert.equal(mod.charge,0);assert.equal(mod.read8(address)&bit,bit);assert.equal(mod.effects.some(e=>e.kind==='beam'),false);
  step(0x402,8);assert.equal(sounds.filter(s=>s==='revert').length,1);mod.configure({superSaiyan:true});assert.equal(mod.options.superSaiyan,false);
  mod.write8(address,0);step();mod.configure({superSaiyan:true});assert.equal(mod.options.superSaiyan,true);
 }
});

test('Focus breaks stone, unconsciousness, Frosty, Balloon and burning, with a saved resistance window',()=>{
 for(const bit of[0x10,0x20,0x40,0x100,0x4000]){
  const {mod,step}=setup({superSaiyan:true});mod.write16(0xe182,913);mod.write16(0xe184,999);
  const cues=[];mod.playSound=name=>cues.push(name);
  mod.write16(0xe190,bit);if(bit===0x40)mod.write8(0xe02c,0);
  step(0x400);assert.equal(mod.read16(0xe190)&0x4170,0);assert.ok(mod.statusRecovery);
  if(bit===0x10)assert.equal(mod.options.superSaiyan,false);
  // The cartridge, not this adapter, assigns the controller after curing.
  if(bit===0x40){assert.equal(mod.read8(0xe02c),0);mod.write8(0xe02c,1);step(0x400);}
  assert.equal(mod.effects.filter(e=>e.kind==='statusBurst').length,1);
  if(bit===0x20||bit===0x100){assert.equal(mod.effects.find(e=>e.kind==='statusBurst').shell,bit===0x20?'ice':'balloon');assert.ok(cues.includes(bit===0x20?'iceBreak':'balloonPop'));}
  if(bit===0x4000){assert.equal(mod.effects.find(e=>e.kind==='statusBurst').shell,'fire');assert.ok(cues.includes('powerBurst'));assert.ok(cues.includes('impact'));}
  const saved=mod.snapshot(),ram=mod.snes.ram.slice();
  for(let i=0;i<100;i++){mod.write16(0xe190,bit);step();assert.equal(mod.read16(0xe190)&0x4170,0);}
  const expected=JSON.stringify(mod.snapshot());mod.snes.ram.set(ram);mod.restore(saved);
  for(let i=0;i<100;i++){mod.write16(0xe190,bit);step();}
  assert.equal(JSON.stringify(mod.snapshot()),expected);assert.equal(mod.read16(0xe182),913);
  step(0,25);mod.write16(0xe190,bit);step();assert.equal(mod.read16(0xe190)&bit,bit,'resistance expires');
  step(0x400);assert.equal(mod.read16(0xe190)&0x4170,0,'Focus can break a later application');
 }
});

test('Focus recovery preserves poison, party control, story locks, and actual defeat',()=>{
 const {mod,step}=setup();mod.write16(0xe182,700);mod.write16(0xe184,999);
 mod.write8(0xe190,0x10);mod.write8(0xe191,0x20);step(0x400);
 assert.equal(mod.read8(0xe190),0);assert.equal(mod.read8(0xe191),0x20);assert.equal(mod.read16(0xe182),700);
 mod.statusRecovery=null;mod.write16(0xe190,0x400);step(0x400);
 assert.equal(mod.read16(0xe190),0x400,'Barrel is an item, not the fire stun (Engulf is $E191 bit 6)');assert.equal(mod.statusRecovery,null);
 for(const lock of['event','menu','party','dead']){
  mod.statusRecovery=null;mod.write8(0xe190,0x40);mod.write8(0xe191,0);mod.write16(0xe182,700);
  if(lock==='event')mod.write8(0xd0,1);
  if(lock==='menu')mod.write8(0xec,8);
  if(lock==='party'){mod.write8(0xe200,1);mod.write8(0xe02c,0);}
  if(lock==='dead'){mod.write16(0xe182,0);mod.write8(0xe191,0x80);}
  step(0x400,4);assert.equal(mod.read8(0xe190),0x40,lock);assert.equal(mod.statusRecovery,null,lock);
  mod.write8(0xd0,0);mod.write8(0xec,0);mod.write8(0xe200,0);mod.write8(0xe02c,1);
 }
 assert.equal(mod.read16(0xe182),0);assert.equal(mod.read8(0xe191),0x80);
});
