import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrbit,steerOrbit,tickOrbit,ricochet,orbitTargets,orbitTarget} from '../engine/frieza-orbit.js';
import {orbitFragments,orbitDebrisPose,strikeOrbitScenery,tickOrbitDebris} from '../engine/orbit-debris.js';
import {orbitPrompts} from '../engine/frieza-orbit-view.js';
import {encodeText,wrapText} from '../engine/event-codec.js';
import {orbitHeading,orbitVector,orbitProjectile,orbitRush,orbitVectors} from '../engine/orbit-pixels.js';
import {beginClash,tickClash,clashCamera,clashTiming,tapClash,clashSurges,victoryTiming} from '../engine/frieza-finale.js';
import {bossVictoryTiming,bossVictoryWhite} from '../engine/boss-victory.js';
import {orbitAim,orbitDefense,beginOrbitExchange,tickOrbitExchange,orbitAttackPattern} from '../engine/orbit-duel.js';
import {projectOrbitBackground} from '../engine/orbit-camera.js';

test('beam struggle instructions fit the original font and three-line window',()=>{
 for(const text of Object.values(orbitPrompts)){assert.doesNotThrow(()=>encodeText(text));assert.ok(wrapText(text).split('\n').length<=3);}
});

test('orbital steering stays on screen; charging slows movement and sprint restores evasion speed',()=>{
 const o=newOrbit({x:0,y:0});o.hero={x:100,y:100};steerOrbit(o,128);const walk=o.hero.x-100;
 o.hero.x=100;o.charge=20;steerOrbit(o,128|256);assert.ok(o.hero.x-100<walk);
 o.charge=0;o.hero.x=100;steerOrbit(o,128|256);assert.ok(o.hero.x-100>walk);
 for(let i=0;i<1000;i++)steerOrbit(o,256|128|32);
 assert.deepEqual(o.hero,{x:242,y:184});for(let i=0;i<1000;i++)steerOrbit(o,256|64|16);
 assert.deepEqual(o.hero,{x:14,y:20});
});

test('orbital projectiles turn in discrete steps and replay without fractional positions or angles',()=>{
 for(let i=0;i<16;i++)assert.equal(orbitHeading(...orbitVectors[i]),i);
 const shot={x:32.4,y:70.6,angle:.71,speed:4,age:0},target={x:220,y:180};
 for(let i=0;i<90;i++){
  const previous=shot.heading,age=shot.age;orbitProjectile(shot,target);
  assert.ok(Number.isInteger(shot.x)&&Number.isInteger(shot.y)&&Number.isInteger(shot.heading));
  assert.equal('angle' in shot,false);
  if(previous!==undefined){const turn=((shot.heading-previous+24)&15)-8;assert.ok(Math.abs(turn)<=1);if(age%12)assert.equal(turn,0);}
 }
 const saved=structuredClone(shot);for(let i=0;i<100;i++)orbitProjectile(shot,target);
 const replay=structuredClone(saved);for(let i=0;i<100;i++)orbitProjectile(replay,target);assert.deepEqual(replay,shot);
 const boss={x:32,y:80,node:0,nodes:[{x:202,y:57}],dash:1};
 for(let i=0;i<100&&boss.dash;i++){orbitRush(boss);assert.ok(Number.isInteger(boss.x)&&Number.isInteger(boss.y));}
 assert.equal(boss.dash,0);assert.equal(boss.x,202);assert.equal(boss.y,57);
 assert.deepEqual(orbitVector(0),{dx:1,dy:0,heading:0});
});

test('the final counter establishes its camera and cannot skip the beam contact or struggle',()=>{
 const o=newOrbit({x:1000,y:1600}),b={x:202,y:57};beginClash(o,b);
 for(let i=0;i<clashTiming.gather;i++){
  tickClash(o,b);assert.ok([o.hero.x,o.hero.y,b.x,b.y,...Object.values(clashCamera(o))].every(Number.isInteger));
 }
 assert.equal(o.clash.phase,'charge');const sounds=[];
 for(let i=0;i<clashTiming.charge;i++)tickClash(o,b,{sound:n=>sounds.push(n)});
 assert.equal(o.clash.phase,'launch');assert.equal(o.charge,0);assert.deepEqual(sounds,['charged','beam']);let impacts=0;
 for(let i=0;i<clashTiming.launch;i++)assert.equal(tickClash(o,b,{shake:()=>impacts++}),false);
 assert.equal(impacts,1);assert.equal(o.clash.phase,'struggle');
 for(let i=0;i<clashTiming.struggle-1;i++){o.clash.pressure=1;assert.equal(tickClash(o,b),false);}
 const saved=structuredClone(o);let won=false;for(let i=0;i<40&&!won;i++){o.clash.pressure=1;won=tickClash(o,b);}
 assert.equal(won,true);const replay=structuredClone(saved);for(let i=0;i<40&&replay.clash.phase!=='win';i++){replay.clash.pressure=1;tickClash(replay,b);}
 assert.deepEqual(replay,o);
});
test('manual facing permits misses; Frieza dodges threatened lanes and teleport melee has a bounded four-hit exchange',()=>{
 const o=newOrbit({x:1000,y:1000}),b={x:120,y:50,shots:[],hp:32000};o.intro=0;o.hero={x:120,y:140};
 steerOrbit(o,128);assert.deepEqual(orbitAim(o),{dx:1,dy:0,heading:0});
 o.charge=40;assert.equal(orbitDefense(o,b),false,'Facing away does not target the boss');
 steerOrbit(o,16);assert.equal(orbitAim(o).dy,-1);assert.equal(orbitDefense(o,b),true);
 const x=b.x;for(let i=0;i<7;i++)orbitDefense(o,b);assert.ok(Math.abs(b.x-x)>=35);assert.equal(b.evade,null);
 assert.equal(beginOrbitExchange(o,b),true);const saved=structuredClone({o,b});let damage=0,booms=0;
 for(let i=0;i<72;i++){assert.equal(tickOrbitExchange(o,b,{hurt:n=>damage+=n,sound:n=>booms+=n==='friezaImpact'}),true);assert.ok([b.x,b.y,o.hero.x,o.hero.y].every(Number.isInteger));}
 assert.equal(o.duel,null);assert.equal(damage,2250);assert.equal(booms,4);assert.equal(beginOrbitExchange(o,b),false);
 for(let i=0;i<72;i++)tickOrbitExchange(saved.o,saved.b,{hurt:()=>{}});assert.deepEqual(saved,{o,b});
 assert.ok(orbitAttackPattern.filter(s=>s==='beam'||s==='laser').length>orbitAttackPattern.filter(s=>s==='orb').length);
});
test('the beam struggle needs sustained fresh presses and every enemy surge pushes the beam back',()=>{
 const simulate=interval=>{
  const o=newOrbit({x:0,y:0}),b={x:204,y:48};beginClash(o,b);o.clash.phase='struggle';let damage=0,surges=0,frames=0;
  for(;frames<2400&&o.clash.phase==='struggle';frames++){
   if(frames%interval===0)tapClash(o.clash);
   const pressure=o.clash.pressure;
   tickClash(o,b,{damage:n=>damage+=n});
   if(clashSurges.some(s=>s.at===o.clash.age)){assert.ok(o.clash.pressure<pressure-.07);surges++;}
   if(frames<clashTiming.struggle-1)assert.notEqual(o.clash.phase,'win');
  }
  return{o,frames,damage,surges};
 };
 const fast=simulate(10),steady=simulate(12),slow=simulate(20),held=simulate(Infinity);
 for(const s of[fast,steady]){assert.equal(s.o.clash.phase,'win');assert.equal(s.surges,3);assert.ok(s.o.clash.taps>75);assert.equal(s.damage,0);}
 assert.ok(steady.frames>fast.frames);assert.equal(slow.o.clash.phase,'recoil');assert.equal(held.o.clash.phase,'recoil');assert.equal(slow.damage,420);
 assert.ok(victoryTiming.quiet-victoryTiming.jingle>=bossVictoryTiming.jingleFrames);
 assert.ok(victoryTiming.jingle<victoryTiming.reward&&victoryTiming.reward<victoryTiming.acquire);
 assert.ok(victoryTiming.descent>victoryTiming.reward+180,'reward and a quiet beat follow the complete native fanfare');
});
test('the same saved orbit camera moves near bodies farther than stars while preserving zoom and integer projection',()=>{
 const a={x:95,y:154,r:104,travelX:0,travelY:0},b={...a,travelX:256,travelY:128},p={x:190,y:40,r:12};
 const far=projectOrbitBackground(b,p,1),near=projectOrbitBackground(b,p,5);
 assert.ok(Math.abs(near.x-p.x)>Math.abs(far.x-p.x));assert.ok(near.y<far.y);
 const zoom=projectOrbitBackground({...a,r:68},p,5);assert.ok(zoom.r<p.r);assert.ok(zoom.x<p.x);
 assert.deepEqual(projectOrbitBackground(structuredClone(b),p,5),near);assert.ok(Object.values(near).every(Number.isInteger));
});

test('the boss whiteout holds through the explosion tail before the pouch',()=>{
 const lastBurst=bossVictoryTiming.bursts.at(-1);
 for(let age=lastBurst;age<=bossVictoryTiming.reveal;age++)assert.equal(bossVictoryWhite(age),1);
 let previous=1;
 for(let age=bossVictoryTiming.reveal;age<=bossVictoryTiming.clear;age++){
  const white=bossVictoryWhite(age);assert.ok(white<=previous&&previous-white<=1/31+.0001);previous=white;
 }
 assert.equal(previous,0);
 assert.ok(victoryTiming.reward>victoryTiming.impact+bossVictoryTiming.clear);
});
test('a blue beam repeatedly hits its visible lane and counters a Death Ball before it can collide again',()=>{
 const o=newOrbit({x:0,y:0}),b={x:100,y:50,shots:[{kind:'orb',x:80,y:50,age:5},{kind:'orb',x:80,y:100,age:5}]};
 o.intro=0;
 o.beam={x:20,y:50,dx:1,dy:0,age:0,max:60,width:20,damage:900};let damage=0;
 const hooks={hurt:n=>damage+=n,sound:()=>{},shake:()=>{}};
 for(let i=0;i<12;i++)tickOrbit(o,b,hooks);
 assert.equal(damage,1800);assert.equal(b.shots[0].age,999);assert.equal(b.shots[1].age,5);
 assert.equal(o.ricochets.length,1,'countered shot does not explode repeatedly');
 b.y=100;for(let i=0;i<6;i++)tickOrbit(o,b,hooks);assert.equal(damage,1800);
 assert.equal(o.ricochets.length,1,'An empty beam lane cannot create an unrelated shot from Frieza');
});
test('aimed shots destroy visible bodies on contact, without an arbitrary cooldown or auto-aim',()=>{
 const o=newOrbit({x:200,y:500}),b={x:100,y:150,shots:[]};let booms=0;
 o.intro=0;const hooks={hurt:()=>{},sound:n=>{if(n==='fortressBreak')booms++;},shake:()=>{}};
 o.shots.push({x:206,y:36,dx:1,dy:0,age:0});tickOrbit(o,b,hooks);
 assert.deepEqual(o.destroyed,[0]);assert.equal(booms,1);assert.equal(o.debris.length,9);assert.match(o.aside.text,/LUNA:My moon! Goku!/);
 assert.ok(o.aside.age<0,'The explosion is visible before the short aside');
 o.beam={x:38,y:3,dx:0,dy:1,age:0,max:60,width:20,damage:900};tickOrbit(o,b,hooks);
 assert.deepEqual(o.destroyed,[0,1]);assert.equal(booms,2,'A second aimed hit does not wait ten seconds');assert.equal(o.debris.length,18);
 const saved=structuredClone(o);for(let i=0;i<120;i++)tickOrbit(o,b,hooks);
 const replay=structuredClone(saved);for(let i=0;i<120;i++)tickOrbit(replay,b,{...hooks,sound:()=>{}});assert.deepEqual(replay,o);
 assert.equal(booms,2,'Neither body can explode twice');
 const miss=newOrbit({x:0,y:0});miss.intro=0;ricochet(miss,120,90,0,1);
 for(let i=0;i<45;i++)tickOrbit(miss,b,hooks);assert.deepEqual(miss.destroyed,[]);
 const behind=newOrbit({x:0,y:0});behind.camera={...behind.camera,x:220,y:36};
 assert.equal(strikeOrbitScenery(behind,220,0,220,60,2,hooks),false,'A body hidden by the globe cannot be hit through it');
});
test('irregular surface chunks persist, hurt only after a dodge window, split under blasts and vaporize under beams',()=>{
 const o=newOrbit({x:0,y:0});o.intro=0;
 const moon=orbitTarget(o,0);strikeOrbitScenery(o,moon.x,moon.y-30,moon.x,moon.y,2);
 const masks=orbitFragments(0);assert.ok(masks.every(p=>p.colors.some(c=>c===0)&&p.colors.some(Boolean)));
 const p=o.debris.find(p=>p.r>=4);o.debris=[p];o.destroyed=[0,1,2];p.dx=p.dy=0;
 const at=orbitDebrisPose(o,p);o.hero={x:at.x,y:at.y};let damage=0;
 for(let i=0;i<59;i++)tickOrbitDebris(o,{damage:n=>damage+=n});assert.equal(damage,0);
 tickOrbitDebris(o,{damage:n=>damage+=n});assert.equal(damage,70);
 for(let i=0;i<59;i++)tickOrbitDebris(o,{damage:n=>damage+=n});assert.equal(damage,70,'Contact has a one-second grace period');
 const moved=orbitDebrisPose(o,p);strikeOrbitScenery(o,moved.x-20,moved.y,moved.x+20,moved.y,2);tickOrbitDebris(o);
 assert.equal(o.debris.length,2);assert.ok(o.debris.every(p=>p.size===1));
 for(let i=0;i<60;i++)tickOrbitDebris(o);
 for(const child of [...o.debris]){const t=orbitDebrisPose(o,child);strikeOrbitScenery(o,t.x-12,t.y,t.x+12,t.y,4,{}, {beam:true});}
 tickOrbitDebris(o);assert.equal(o.debris.length,0);assert.ok(o.dust.length);assert.ok(o.grit.length,'Harmless dust remains in orbit');
 const grain=o.grit[0];grain.age=180;
 const start=orbitDebrisPose(o,grain);grain.phase=(grain.phase+128)&255;
 const opposite=orbitDebrisPose(o,grain);
 assert.ok(Math.abs(start.x+opposite.x-2*o.camera.x)<=1&&Math.abs(start.y+opposite.y-2*o.camera.y)<=1,'Half an orbit passes around the globe, not across screen-wrap edges');
 const zoom=orbitDebrisPose(o,grain,{...o.camera,r:52});assert.ok(Math.abs(zoom.x-o.camera.x)<Math.abs(opposite.x-o.camera.x));
});
