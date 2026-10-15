import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test('quick checkpoints build from the ROM, reload from browser storage, and preserve the manual slot',async({page})=>{
  test.setTimeout(180000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?start=sword');
  await page.waitForFunction(()=>mana.ready&&mana.arrival.phase==='complete',{},{timeout:150000});
  const start=await page.evaluate(async()=>{mana.pause();await mana.saveCheckpoint();return{s:mana.mod.status,arrival:mana.arrival.snapshot(),hash:mana.hash(mana.snes.cart.data)}});
  expect(start.s).toMatchObject({map:128,canAttack:true,event:0,charge:0});expect(start.arrival).toMatchObject({arrived:true,crater:true,phase:'complete'});
  await page.getByText('Test scenes',{exact:true}).click();
  await page.locator('#quick-title').click();await page.waitForFunction(()=>mana.ready&&mana.mod.nameEditor);
  expect(await page.evaluate(()=>{mana.pause();return mana.arrival.arrived})).toBe(false);
  await page.locator('#native-restore').click();
  expect(await page.evaluate(()=>({map:mana.mod.status.map,arrived:mana.arrival.arrived,nameEditor:mana.mod.nameEditor}))).toEqual({map:128,arrived:true,nameEditor:false});
  await page.reload();await page.waitForFunction(()=>mana.ready&&mana.arrival.phase==='complete',{},{timeout:15000});
  const cached=await page.evaluate(()=>{mana.pause();return{s:mana.mod.status,hash:mana.hash(mana.snes.cart.data)}});
  expect(cached.hash).toBe(start.hash);expect(cached.s).toMatchObject({map:128,canAttack:true,event:0});
  expect(errors).toEqual([]);
});

test('late checkpoints build from a fresh ROM and reload the playable Frieza battle without replacing saves',async({page})=>{
  test.setTimeout(90000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?start=battle');
  await page.waitForFunction(()=>mana.ready&&mana.mod.frieza.fighting,{},{timeout:30000});
  const start=await page.evaluate(async()=>{mana.pause();mana.snes.cart.write(0x30,0x7fff,0x5a);mana.battery.flush();await mana.saveCheckpoint();return{state:mana.mod.frieza.status,map:mana.mod.status.map,sram:mana.hash(mana.snes.cart.sram),rom:mana.hash(mana.snes.cart.data)}});
  expect(start.map).toBe(246);expect(start.state).toMatchObject({stage:'battle',permanent:true,fallen:true,hp:96000});
  expect(await page.evaluate(async()=>{await mana.quickStart('late');mana.pause();return{map:mana.mod.status.map,eligible:mana.mod.frieza.eligible,count:mana.mod.quest.status.seedCount}})).toEqual({map:431,eligible:true,count:7});
  await page.locator('#native-restore').click();
  expect(await page.evaluate(()=>mana.mod.frieza.status.stage)).toBe('battle');
  expect(await page.evaluate(async()=>{await mana.quickStart('frieza');mana.pause();return mana.mod.frieza.status.stage})).toBe('trial');
  await page.reload();await page.waitForFunction(()=>mana.ready&&mana.mod.frieza.fighting,{},{timeout:15000});
  const cached=await page.evaluate(()=>{mana.pause();return{state:mana.mod.frieza.status,map:mana.mod.status.map,sram:mana.hash(mana.snes.cart.sram),rom:mana.hash(mana.snes.cart.data)}});
  expect(cached.map).toBe(246);expect(cached.state).toMatchObject({stage:'battle',permanent:true,fallen:true,hp:96000});
  expect(cached.sram).toBe(start.sram);expect(cached.rom).toBe(start.rom);expect(errors).toEqual([]);
  const orbit=await page.evaluate(async()=>{await mana.quickStart('orbit');mana.pause();return{map:mana.mod.status.map,space:mana.mod.frieza.orbit,surge:mana.mod.frieza.status.boss.surge,rom:mana.hash(mana.snes.cart.data)}});
  expect(orbit.map).toBe(246);expect(orbit.space).toBe(null);expect(orbit.surge).toMatchObject({kind:'frieza-cosmic',age:1});expect(orbit.rom).toBe(start.rom);
  await page.locator('#native-restore').click();expect(await page.evaluate(()=>mana.mod.frieza.orbit)).toBe(null);
  await page.goto('/?start=orbit');await page.waitForFunction(()=>mana.ready&&!!mana.mod.frieza.status.boss.surge,{},{timeout:15000});
  const transition=await page.evaluate(()=>{mana.pause();const s=mana.mod.frieza.status.boss.surge;mana.run(1800);return{age:s.age,kind:s.kind,space:mana.mod.frieza.orbit?.kind,canAttack:mana.mod.canAttack};});
  expect(transition.age).toBeLessThan(72);expect(transition).toMatchObject({kind:'frieza-cosmic',space:'frieza-orbit',canAttack:true});
  expect(errors).toEqual([]);
});

test('all finale query links initialize native scenes, preserve saves and show loading progress',async({page})=>{
 test.setTimeout(120000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=late');await expect(page.locator('#test-loading')).toBeVisible();
 await page.waitForFunction(()=>mana.ready&&mana.mod.status.map===431,{},{timeout:30000});
 const initial=await page.evaluate(async()=>{mana.pause();mana.snes.cart.write(0x30,0x7fff,0xa5);mana.battery.flush();await mana.saveCheckpoint();return{rom:mana.hash(mana.snes.cart.data),sram:mana.hash(mana.snes.cart.sram)}});
 await page.getByText('Test scenes',{exact:true}).click();
 await expect(page.locator('#quick-checkpoints a')).toHaveCount(13);
 for(const kind of['fortress','flight','beast','good-ending','bad-ending','explosion']){
   await page.goto(`/?start=${kind}`);await page.waitForFunction(()=>mana.ready,{},{timeout:30000});
   const state=await page.evaluate(()=>{mana.pause();const m=mana.mod;return{map:m.status.map,canAttack:m.canAttack,flight:m.worldFlight,hp:m.status.hp,challenge:m.challenge.status,ending:m.ending.status,rom:mana.hash(mana.snes.cart.data),sram:mana.hash(mana.snes.cart.sram),error:m.story.status.error};});
   expect(state.rom).toBe(initial.rom);expect(state.sram).toBe(initial.sram);expect(state.error).toBe(null);expect(state.hp).toBe(999);
   if(kind==='fortress')expect(state).toMatchObject({map:255,canAttack:true});
   if(kind==='flight')expect(state.flight).toBe(true);
   if(kind==='beast')expect(state).toMatchObject({map:253,canAttack:true,challenge:{started:true,fed:true,won:false}});
   if(kind==='good-ending')expect(state.ending).toMatchObject({outcome:'good',phase:'summon'});
   if(kind==='bad-ending')expect(state.ending).toMatchObject({outcome:'bad',phase:'doomed'});
   if(kind==='explosion'){
     expect(state.ending.phase).toBe('explode');
     const replay=await page.evaluate(()=>{const s=mana.snapshot();mana.run(80);const pixels=mana.hash(mana.pixels);mana.restore(s);mana.run(80);return pixels===mana.hash(mana.pixels);});expect(replay).toBe(true);
     await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
     await page.locator('#screen').screenshot({path:test.info().outputPath('irregular-planet-fragments.png')});
   }
   await expect(page.locator('#test-loading')).toBeHidden();
   await page.locator('#native-restore').click();expect(await page.evaluate(()=>mana.mod.status.map)).toBe(431);
 }
 expect(errors).toEqual([]);
});

test('unknown query scenes safely start the ordinary game',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 await page.goto('/?start=constructor');await page.waitForFunction(()=>mana.ready);
 expect(await page.evaluate(()=>mana.mod.frieza.fighting)).toBe(false);
 await expect(page.getByText('Unknown test scene.',{exact:false})).toBeVisible();
});

test('orbit query starts with an existing native GAME FILE and preserves its save and manual checkpoint',async({page})=>{
 test.setTimeout(90000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync('.local/graphics-audit/party.json'),'Requires private ROM and fixture.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const saved=await page.evaluate(async state=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true});mana.run(3);
  // Use the native save routine and checksum, so the title really selects
  // GAME FILE. A lone SRAM sentinel does not reproduce that menu branch.
  const c=mana.snes.cart.data,r=mana.snes.ram,old=c.slice(0x742b0,0x742b3);
  try{c.set([0x10,0x50,0],0x742b0);r.set([1,0xb0,0x42,0xc7],0xd0);mana.run(180);for(let i=0;i<5;i++){mana.run(2,[0]);mana.run(100);}}
  finally{c.set(old,0x742b0);}
  mana.battery.flush();await mana.saveCheckpoint();
  return{sram:mana.hash(mana.snes.cart.sram),metadata:mana.battery.metadataFor(0),map:mana.mod.status.map};
 },JSON.parse(readFileSync('.local/graphics-audit/party.json')));
 expect(saved.metadata).toBeTruthy();
 await page.goto('/?start=orbit');await page.waitForFunction(()=>mana.ready,{},{timeout:45000});
 const result=await page.evaluate(()=>{mana.pause();return{map:mana.mod.status.map,transition:mana.mod.frieza.status.boss?.surge?.kind,sram:mana.hash(mana.snes.cart.sram),metadata:mana.battery.metadataFor(0)};});
 expect(result).toEqual({map:246,transition:'frieza-cosmic',sram:saved.sram,metadata:saved.metadata});
 await expect(page.locator('#lab-message')).toContainText('Frieza: transition to space ready');
 await page.locator('#native-restore').click();expect(await page.evaluate(()=>mana.mod.status.map)).toBe(saved.map);
 expect(errors).toEqual([]);
});
