import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(240000);
test('orbital battle keeps native map safe, counters balls, pauses in rings and requires the charged mash finisher',async({page})=>{
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and fixture.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(async s=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});mana.snes.ram.fill(0,0xe200,0xe600);mana.run(3);
  const{buildLateCheckpoint}=await import('/engine/quick-start.js');
  await buildLateCheckpoint('orbit',{mod:m,pump:async(f,b)=>mana.run(f,b),capture:()=>mana.snapshot(),cache:()=>{},progress:()=>{}});
  document.querySelector('#native-pause').hidden=true;
 },JSON.parse(readFileSync(fixture)));
 const base=await page.evaluate(()=>mana.snapshot());writeFileSync(test.info().outputPath('orbit.json'),JSON.stringify(base));
 await page.locator('#screen').screenshot({path:test.info().outputPath('orbit.png')});
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
 expect(fight.fired.hp).toBeLessThan(32000);expect(fight.fired.destroyed.length).toBeGreaterThan(0);expect(fight.replay).toBe(true);
 expect(fight.menu.opened).toBe(true);expect(fight.menu.before).toBe(fight.menu.after);expect(fight.menu.resumed).toBeGreaterThan(fight.menu.after);
 expect(fight.injury).toBeLessThan(999);expect(fight.afterGround).toEqual(fight.ground);expect(fight.afterGrid).toBe(fight.grid);expect(fight.error).toBe(null);
 await page.evaluate(()=>{const m=mana.mod;m.frieza.hit(m.frieza.entity(),1e8);mana.run(2);});
 expect(await page.evaluate(()=>mana.mod.frieza.orbit.clash.phase)).toBe('charge');
 await page.locator('#screen').screenshot({path:test.info().outputPath('final-death-ball.png')});
 const failed=await page.evaluate(()=>{
  const m=mana.mod;mana.run(50,[10,1]);mana.run(1);const started=m.frieza.orbit.clash.phase;const saved=mana.snapshot();
  mana.run(300,[0]);const failed={stage:m.frieza.status.stage,clash:m.frieza.orbit.clash.phase,hp:m.status.hp};mana.restore(saved);return{started,failed};
 });
 expect(failed.started).toBe('struggle');expect(failed.failed.stage).toBe('battle');expect(failed.failed.clash).toBe('charge');expect(failed.failed.hp).toBeLessThan(999);
 await page.locator('#screen').screenshot({path:test.info().outputPath('beam-struggle.png')});
 const win=await page.evaluate(()=>{
  const m=mana.mod;for(let i=0;i<30&&m.frieza.status.stage==='battle';i++){mana.run(1,[0]);mana.run(3);}
  return{stage:m.frieza.status.stage,hp:m.frieza.status.hp,phase:m.frieza.orbit.clash.phase,taps:m.frieza.orbit.clash.taps};
 });
 expect(win).toMatchObject({stage:'won',hp:0,phase:'win'});expect(win.taps).toBeGreaterThan(8);
 await page.locator('#screen').screenshot({path:test.info().outputPath('final-beam.png')});
 const result=await page.evaluate(()=>{
  const m=mana.mod;for(let f=0;f<6500&&m.status.map!==253;f+=50)mana.run(50,[11]);
  return{orbit:m.frieza.orbit,map:m.status.map,stage:m.frieza.status.stage,quest:m.quest.status,challenge:m.challenge.status,error:m.story.status.error};
 });
 expect(result).toMatchObject({orbit:null,map:253,stage:'defeated',quest:{held:7},challenge:{fed:true},error:null});expect(errors).toEqual([]);
});
