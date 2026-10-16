import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

test('Thanatos rejects stale script checkpoints and keeps native dialogue separate from status messages',async({page})=>{
 test.setTimeout(120000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=thanatos');await page.waitForFunction(()=>mana.ready,{},{timeout:45000});
 const before=await page.evaluate(async()=>{
  mana.pause();const m=mana.mod;
  const {checkpointStore}=await import('/engine/state.js'),{quickStartRevision}=await import('/engine/quick-start.js');
  mana.snes.cart.write(0x30,0x7fff,0xa5);mana.battery.flush();await mana.saveCheckpoint();
  const rom=mana.hash(mana.snes.cart.data),key=`${quickStartRevision}:${rom}:${m.story.layout}:thanatos`;
  const cached=await checkpointStore(undefined,key);if(!cached)throw Error('No test checkpoint was cached');
  const original=m.story.layout;
  // A checkpoint captured before a dialogue edit still has native return
  // pointers into the old virtual script allocation. Never resume it.
  cached.state.goku.story.layout='old-script-layout';cached.state.goku.frieza.stage='defeated';
  await checkpointStore(cached,key);
  await checkpointStore(cached,`finale-polish-25:${rom}:thanatos`);
  return{layout:original,rom,sram:mana.hash(mana.snes.cart.sram)};
 });
 await page.reload();await page.waitForFunction(()=>mana.ready,{},{timeout:45000});
 const result=await page.evaluate(()=>{
  mana.pause();const m=mana.mod,r=mana.snes.ram;
  const entry={stage:m.frieza.status.stage,layout:m.story.layout,map:m.status.map};
  // Let the first window finish typing, without advancing the dialogue.
  // Status/instant-death banners used to overwrite this native BG3 window.
  mana.run(1500);
  return{entry,scene:m.frieza.status.scene?.kind,event:m.story.status.lastEvent,d0:r[0xd0],
   statuses:[0,1,2].map(i=>[r[0xe190+i*512],r[0xe191+i*512]]),
   hp:[mana.read16(0xe182),mana.read16(0xe382),mana.read16(0xe582)],
   error:m.story.status.error,rom:mana.hash(mana.snes.cart.data),sram:mana.hash(mana.snes.cart.sram)};
 });
 expect(result.entry).toEqual({stage:'trial',layout:before.layout,map:246});
 expect(result).toMatchObject({scene:'trial-taunt',event:0x6e,statuses:[[0,0],[0,0],[0,0]],hp:[999,999,999],error:null,rom:before.rom,sram:before.sram});
 expect(result.d0&128).toBe(128);expect(errors).toEqual([]);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:test.info().outputPath('thanatos-dialogue.png')});
 await page.locator('#native-restore').click();
 expect(await page.evaluate(()=>mana.mod.frieza.status.stage)).toBe('trial');
});
