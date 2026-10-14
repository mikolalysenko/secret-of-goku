import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test('both endings show the overhead Snake Way map and checkpoint Bubbles accurately',async({page})=>{
 test.setTimeout(90000);test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and native fixture.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true});mana.mod.frieza.restore({stage:'defeated',permanent:true});document.querySelector('#native-pause').hidden=true;},JSON.parse(readFileSync(fixture)));
 for(const outcome of['good','bad']){
  await page.evaluate(outcome=>{mana.mod.ending.restore({outcome,phase:'kai',age:15,party:0});mana.run(2);},outcome);
  await page.locator('#screen').screenshot({path:test.info().outputPath(`${outcome}-kai.png`)});
  const result=await page.evaluate(()=>{
   const m=mana.mod,base=mana.snapshot(),start=m.ending.status.kai.bubbles;mana.run(150);const a=m.ending.snapshot(),pixels=mana.hash(mana.pixels);
   mana.restore(base);mana.run(150);const b=m.ending.snapshot();
   const match=JSON.stringify(a)===JSON.stringify(b)&&pixels===mana.hash(mana.pixels);
   const detached=m.ending.snapshot();detached.kai.bubbles.x=-1;
   // Read the final PPU layer, not browser interpolation. The entire upper
   // corner must be opaque, warm clouds rather than the old starfield.
   const corner=mana.snes.ppu.getColor(false,8,8)[0];
   return{match,moved:start.x!==b.kai.bubbles.x||start.y!==b.kai.bubbles.y,independent:m.ending.status.kai.bubbles.x!==-1,corner};
  });
  expect(result.match&&result.moved&&result.independent).toBe(true);expect(result.corner&31).toBeGreaterThan(20);expect(result.corner>>5&31).toBeGreaterThan(12);
  await page.evaluate(()=>{mana.mod.ending.cue('complete');mana.run(20);});
  await page.locator('#screen').screenshot({path:test.info().outputPath(`${outcome}-complete.png`)});
 }
 expect(errors).toEqual([]);
});
