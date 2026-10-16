import {test,expect} from '@playwright/test';
import {victoryTiming} from '../../engine/frieza-finale.js';
import {bossVictoryTiming} from '../../engine/boss-victory.js';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(240000);
test('aimed orbital beams break the moon into a persistent, avoidable asteroid ring',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=space');await page.waitForFunction(()=>mana.ready,{},{timeout:60000});
 await page.evaluate(async()=>{
  mana.pause();const m=mana.mod,s=m.frieza.snapshot(),o=s.boss.space;
  const {orbitTarget}=await import('/engine/frieza-orbit.js');
  // Stage a clear upward shot while keeping the actual game input, charge,
  // projectile collision, native damage worker and menu paths intact.
  Object.assign(o.camera,{x:95,y:154,r:104,travelX:0,travelY:0});
  const moon=orbitTarget(o,0);o.hero={x:moon.x,y:moon.y+65};o.heading=12;o.intro=0;
  s.boss.x=40;s.boss.y=160;s.boss.stun=6000;s.boss.shots=[];s.boss.warning=null;
  m.frieza.restore(s);document.querySelector('#native-pause').hidden=true;
 });
 await page.locator('#screen').screenshot({path:test.info().outputPath('moon-before-shot.png')});
 const shot=await page.evaluate(()=>{mana.run(45,[10,1]);mana.run(10);const o=mana.mod.frieza.orbit;return{destroyed:o.destroyed,debris:o.debris.length,grit:o.grit.length,aside:o.aside};});
 expect(shot.destroyed).toContain(0);expect(shot.debris).toBe(shot.destroyed.length*9);expect(shot.grit).toBe(shot.destroyed.length*18);expect(shot.aside.text).toContain('LUNA:My moon! Goku!');expect(shot.aside.age).toBeLessThan(0);
 await page.locator('#screen').screenshot({path:test.info().outputPath('moon-exploding.png')});
 await page.evaluate(()=>mana.run(100));
 await page.locator('#screen').screenshot({path:test.info().outputPath('luna-moon-reaction.png')});
 await page.evaluate(()=>mana.run(180));
 await page.locator('#screen').screenshot({path:test.info().outputPath('orbiting-rubble.png')});
 const field=await page.evaluate(async()=>{
  const m=mana.mod,checkpoint=mana.snapshot();mana.run(90,[8,6]);
  const pixels=mana.hash(mana.pixels),state=JSON.stringify(m.frieza.snapshot());mana.restore(checkpoint);mana.run(90,[8,6]);
  const replay=pixels===mana.hash(mana.pixels)&&state===JSON.stringify(m.frieza.snapshot());
  mana.run(2,[9]);mana.run(70);const opened=!!(m.read8(0xec)&12),before=JSON.stringify(m.frieza.orbit.debris);mana.run(90);const paused=before===JSON.stringify(m.frieza.orbit.debris);
  mana.run(2,[9]);mana.run(70);
  const {orbitDebrisPose}=await import('/engine/orbit-debris.js');
  let s,o,chunk;
  for(let f=0;f<600&&!chunk;f+=6){
   s=m.frieza.snapshot();o=s.boss.space;
   chunk=o.debris.find(p=>{const t=orbitDebrisPose(o,p);return t.front&&t.x>20&&t.x<235&&t.y>25&&t.y<175;});
   if(!chunk)mana.run(6);
  }
  if(!chunk)throw Error('No visible foreground asteroid to test');
  const t=orbitDebrisPose(o,chunk);o.hero={x:t.x,y:t.y};o.debrisGrace=0;s.boss.grace=0;
  m.frieza.restore(s);const hp=m.status.hp;mana.run(12);const injury=hp-m.status.hp;
  return{replay,opened,paused,injury,remaining:m.frieza.orbit.debris.length,ground:[m.status.x,m.status.y],error:m.story.status.error};
 });
 expect(field.replay).toBe(true);expect(field.opened).toBe(true);expect(field.paused).toBe(true);expect(field.injury).toBe(70);expect(field.remaining).toBeGreaterThan(0);expect(field.error).toBe(null);expect(errors).toEqual([]);
});
test('orbital battle keeps native map safe, counters balls, pauses in rings and automatically charges the mash finisher',async({page})=>{
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and fixture.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(async s=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});mana.snes.ram.fill(0,0xe200,0xe600);mana.run(3);
  const{buildLateCheckpoint}=await import('/engine/quick-start.js');
  await buildLateCheckpoint('space',{mod:m,pump:async(f,b)=>mana.run(f,b),capture:()=>mana.snapshot(),cache:()=>{},progress:()=>{}});
  document.querySelector('#native-pause').hidden=true;
 },JSON.parse(readFileSync(fixture)));
 const base=await page.evaluate(()=>mana.snapshot());writeFileSync(test.info().outputPath('orbit.json'),JSON.stringify(base));
 await page.locator('#screen').screenshot({path:test.info().outputPath('orbit.png')});
 const focus=await page.evaluate(()=>{
  const m=mana.mod,s=m.frieza.snapshot();s.boss.stun=1000;s.boss.warning=null;s.boss.shots=[];s.boss.space.intro=0;m.frieza.restore(s);
  const old={...m.frieza.orbit.hero},ground=[m.status.x,m.status.y];mana.run(100,[10]);
  const held={kind:m.action?.kind,power:m.powerCharge,hero:{...m.frieza.orbit.hero},ground:[m.status.x,m.status.y]};
  mana.run(1);return{old,ground,held,released:m.action?.kind??null};
 });
 expect(focus.held).toEqual({kind:'focus',power:96,hero:focus.old,ground:focus.ground});expect(focus.released).toBe(null);
 // Open the real ring at opposite picture edges. Neither its opening nor
 // closing animation may pan the orbital background or the native actor.
 for(const position of[{x:14,y:20},{x:242,y:184}]){
  const ring=await page.evaluate(({base,position})=>{
   mana.restore(base);const m=mana.mod,s=m.frieza.snapshot();Object.assign(s.boss.space.hero,position);m.frieza.restore(s);mana.run(2);
   const ground=[m.status.x,m.status.y],patch=()=>{
    const out=[];for(let y=172;y<186;y++)for(let x=104;x<148;x++)out.push(mana.snes.ppu.getColor(false,x,y)[0]);return out;
   };
   // Compare each animation frame with the same saved orbital state shown
   // without a ring. This catches camera jumps while allowing normal drift
   // to resume on the first actual combat frame after closing.
   const scroll=[];let opened;
   for(let f=0;f<150;f++){
    mana.run(1,f<2||f>=76&&f<79?[9]:[]);
    const actual=patch(),ec=m.read8(0xec),saved=m.frieza.snapshot();
    if(f===75)opened={opened:!!(ec&12),view:m.frieza.orbitMenu,anchor:[m.read16(0x181a)+8,m.read16(0x181c)+8],duplicate:m.spriteLayer.plan?.sprite??null,portraits:m.spriteLayer.plan?.portraits.size};
    m.write8(0xec,ec&1);m.frieza.restore(structuredClone(saved));const reference=patch();m.write8(0xec,ec);m.frieza.restore(saved);
    if(actual.some((c,i)=>c!==reference[i]))scroll.push(f);
   }
   mana.run(2,[9]);mana.run(70);
   return{...opened,scroll,ground,after:[m.status.x,m.status.y]};
  },{base,position});
  expect(ring.opened).toBe(true);expect(ring.anchor).toEqual([ring.view.x,ring.view.y]);expect(ring.duplicate).toBe(null);expect(ring.portraits).toBeGreaterThan(0);expect(ring.after).toEqual(ring.ground);
  expect(ring.scroll).toEqual([]);
  await page.locator('#screen').screenshot({path:test.info().outputPath(`orbit-ring-${position.x}.png`)});
 }
 const pageView=await page.evaluate(base=>{
  mana.restore(base);const m=mana.mod;mana.run(2,[9]);mana.run(70);
  for(let i=0;i<3;i++){mana.run(2,[7]);mana.run(50);}mana.run(2,[0]);mana.run(90);
  const view={field:m.nativeField,sprite:m.spriteLayer.plan?.sprite,age:m.frieza.orbit.age};mana.run(40);view.after=m.frieza.orbit.age;mana.restore(base);return view;
 },base);
 expect(pageView.field).toBe(false);expect(pageView.sprite?.sheet).toBe('ssj');expect(pageView.after).toBe(pageView.age);
 const fight=await page.evaluate(()=>{
  const m=mana.mod,base=mana.snapshot(),grid=mana.hash(mana.snes.ram.slice(0x10000,0x18000)),ground=[m.status.x,m.status.y];
  const start={...m.frieza.orbit.hero};mana.run(6,[8,7]);const fast={...m.frieza.orbit.hero};
  mana.run(6,[10,1,7]);const slow={...m.frieza.orbit.hero};mana.run(40,[10,1]);mana.run(1);
  mana.run(48);const fired={hp:m.frieza.status.hp,destroyed:m.frieza.orbit.destroyed,beam:m.frieza.orbit.beam};
  const checkpoint=mana.snapshot();mana.run(24,[8,6]);const state=m.frieza.snapshot(),pixels=mana.hash(mana.pixels);mana.restore(checkpoint);mana.run(24,[8,6]);
  const replay=JSON.stringify(state)===JSON.stringify(m.frieza.snapshot())&&pixels===mana.hash(mana.pixels);
  mana.restore(base);mana.run(2,[9]);mana.run(70);const opened=!!(m.read8(0xec)&12),before=m.frieza.orbit.age;mana.run(100);const after=m.frieza.orbit.age;mana.run(3,[9]);mana.run(90);const resumed=m.frieza.orbit.age;
  // Prove the real native damage queue still hurts Goku during orbital play.
  mana.restore(base);for(let f=0;f<1800&&m.status.hp===999;f++)mana.run(1);const injury=m.status.hp;
  mana.restore(base);mana.run(2);
  return{start,fast,slow,fired,replay,menu:{opened,before,after,resumed},injury,ground,afterGround:[m.status.x,m.status.y],grid,afterGrid:mana.hash(mana.snes.ram.slice(0x10000,0x18000)),error:m.story.status.error};
 });
 expect(fight.fast.x-fight.start.x).toBeGreaterThan(20);expect(fight.slow.x-fight.fast.x).toBeLessThan(9);
 expect(fight.fired.hp).toBe(32000); // Facing right misses the boss above Goku.
 expect(fight.fired.destroyed).toEqual([]);expect(fight.replay).toBe(true);
 expect(fight.menu.opened).toBe(true);expect(fight.menu.before).toBe(fight.menu.after);expect(fight.menu.resumed).toBeGreaterThan(fight.menu.after);
 expect(fight.injury).toBeLessThan(999);expect(fight.afterGround).toEqual(fight.ground);expect(fight.afterGrid).toBe(fight.grid);expect(fight.error).toBe(null);
 await page.evaluate(()=>{const m=mana.mod;m.frieza.hit(m.frieza.entity(),1e8);mana.run(2);});
 expect(await page.evaluate(()=>mana.mod.frieza.orbit.clash.phase)).toBe('gather');
 await page.evaluate(()=>mana.run(150));
 expect(await page.evaluate(()=>mana.mod.frieza.orbit.clash.phase)).toBe('charge');
 await page.locator('#screen').screenshot({path:test.info().outputPath('final-beam-charge.png')});
 const failed=await page.evaluate(()=>{
  const m=mana.mod;for(let f=0;f<120&&m.frieza.orbit.clash.phase==='charge';f++)mana.run(1);const started=m.frieza.orbit.clash.phase;const saved=mana.snapshot();
  for(let f=0;f<600&&m.frieza.orbit.clash.phase!=='recoil';f++)mana.run(1,[0]);
  mana.run(6); // The native damage worker consumes the queued hit on its next actor update.
  const failed={stage:m.frieza.status.stage,clash:m.frieza.orbit.clash.phase,hp:m.status.hp};mana.restore(saved);return{started,failed};
 });
 expect(failed.started).toBe('launch');expect(failed.failed.stage).toBe('battle');expect(failed.failed.clash).toBe('recoil');expect(failed.failed.hp).toBeLessThan(999);
 await page.evaluate(()=>mana.run(72));
 await page.locator('#screen').screenshot({path:test.info().outputPath('beam-struggle.png')});
 const win=await page.evaluate(()=>{
  const m=mana.mod;for(let i=0;i<180&&m.frieza.status.stage==='battle';i++){mana.run(1,[0]);mana.run(9);}
  return{stage:m.frieza.status.stage,hp:m.frieza.status.hp,phase:m.frieza.orbit.clash.phase,taps:m.frieza.orbit.clash.taps};
 });
 expect(win).toMatchObject({stage:'won',hp:0,phase:'win'});expect(win.taps).toBeGreaterThan(60);
 await page.locator('#screen').screenshot({path:test.info().outputPath('final-beam.png')});
 const aftermath=await page.evaluate(async()=>{
  const {victoryTiming}=await import('/engine/frieza-finale.js');
  const m=mana.mod,saved=mana.snapshot(),grid=mana.hash(mana.snes.ram.slice(0x10000,0x18000));
  let jingleEnergy=0,deathEnergy=0,pickupTail=null;
  const commands=[],cpu=mana.snes.cpu,cycle=cpu.cycle;
  cpu.cycle=function(){
   if(this.cyclesLeft===0&&(this.r[1]&63)===3&&this.br[4]===4){
    const command=[...mana.snes.ram.slice(0x1e00,0x1e04)];commands.push(command);
    if(command[0]===1&&command[1]===0x18)pickupTail=mana.snes.apu.dsp.gain.slice(6);
   }
   return cycle.call(this);
  };
  const advance=age=>{for(let i=0;i<2200&&m.frieza.orbit?.clash.age<age;i++){
   mana.run(1);
   if(m.frieza.orbit?.clash.age>victoryTiming.impact&&m.frieza.orbit?.clash.age<victoryTiming.impact+30){const samples=mana.snes.apu.dsp.samplesL;deathEnergy=Math.max(deathEnergy,Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length));}
   if(m.frieza.orbit?.clash.age>victoryTiming.jingle+60&&m.frieza.orbit?.clash.age<victoryTiming.quiet){const samples=mana.snes.apu.dsp.samplesL;jingleEnergy=Math.max(jingleEnergy,Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length));}
  }};
  advance(victoryTiming.impact+400);
  const white=[0,30,100,180].map(y=>mana.snes.ppu.getColor(false,128,y)[0]);
  advance(victoryTiming.quiet-10);const expected=JSON.stringify(m.frieza.snapshot()),pixels=mana.hash(mana.pixels);
  mana.restore(saved);commands.length=0;advance(victoryTiming.quiet-10);
  const native=m.frieza.snapshot().nativeAudio;
  const descent={stage:m.frieza.status.stage,age:m.frieza.orbit.clash.age,map:m.status.map,audio:native?.played,complete:native?.completed,frame:m.frame};
  const same=JSON.stringify(m.frieza.snapshot())===expected&&mana.hash(mana.pixels)===pixels;
  const afterGrid=mana.hash(mana.snes.ram.slice(0x10000,0x18000));
  for(let i=0;i<600&&!m.frieza.returnScene;i++)mana.run(1);
  const touchdown={orbit:m.frieza.orbit,map:m.status.map,stage:m.frieza.status.stage,return:{...m.frieza.returnScene},safe:m.localFlight===false,locked:m.frieza.inputLocked};
  mana.run(50);cpu.cycle=cycle;return{jingleEnergy,deathEnergy,pickupTail,commands,white,same,grid,afterGrid,descent,touchdown,landedStage:m.frieza.status.stage};
 });
 expect(aftermath.jingleEnergy).toBeGreaterThan(.03);
 expect(aftermath.deathEnergy).toBeGreaterThan(.05);
 expect(aftermath.pickupTail).toEqual([0,0]);
 expect(aftermath.commands.filter(c=>c[0]===2&&c[1]===0x94)).toEqual([[2,0x94,15,0x80]]);
 expect(aftermath.commands.filter(c=>c[0]===1)).toEqual([[1,0x18,0x44,0x8f]]);
 expect(aftermath.white).toEqual([32767,32767,32767,32767]);
 expect(aftermath.same).toBe(true);expect(aftermath.afterGrid).toBe(aftermath.grid);
 expect(aftermath.descent).toMatchObject({stage:'won',map:246});expect(aftermath.descent.age).toBeGreaterThanOrEqual(victoryTiming.quiet-10);expect(aftermath.descent.age).toBeLessThan(victoryTiming.quiet);
 expect(aftermath.descent.audio.map(c=>c.name)).toEqual(['stop','death',...Array(6).fill('burst'),'fade',...Array(7).fill('burst'),'acquire','jingle']);
 expect(aftermath.descent.complete.at(-1).name).toBe('jingle');
 expect(aftermath.descent.frame-aftermath.descent.complete.at(-1).frame).toBeGreaterThanOrEqual(bossVictoryTiming.jingleFrames-12);
 expect(aftermath.touchdown).toMatchObject({orbit:null,map:246,stage:'won',safe:true,locked:true,return:{kind:'return',age:0}});
 expect(aftermath.landedStage).toBe('won');
 await page.locator('#screen').screenshot({path:test.info().outputPath('feet-first-return.png')});
 const result=await page.evaluate(()=>{
  const m=mana.mod;m.write16(0xe182,113);
  for(let f=0;f<6500&&m.status.map!==253;f+=50)mana.run(50,[11]);
  return{orbit:m.frieza.orbit,map:m.status.map,hp:m.status.hp,maxHp:m.status.maxHp,stage:m.frieza.status.stage,quest:m.quest.status,challenge:m.challenge.status,error:m.story.status.error};
 });
 expect(result).toMatchObject({orbit:null,map:253,stage:'defeated',quest:{held:7},challenge:{fed:true},error:null});expect(result.hp).toBe(result.maxHp);expect(errors).toEqual([]);
});
