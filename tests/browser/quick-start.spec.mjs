import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';

test('quick checkpoints build from the ROM, reload from browser storage, and preserve the manual slot',async({page})=>{
  test.setTimeout(180000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?start=sword');
  await page.waitForFunction(()=>mana.ready&&mana.arrival.phase==='complete',{},{timeout:150000});
  const start=await page.evaluate(async()=>{mana.pause();await mana.saveCheckpoint();return{s:mana.mod.status,arrival:mana.arrival.snapshot(),hash:mana.hash(mana.snes.cart.data)}});
  expect(start.s).toMatchObject({map:128,canAttack:true,event:0,charge:0});expect(start.arrival).toMatchObject({arrived:true,crater:true,phase:'complete'});
  await page.getByText('Controls & game options',{exact:true}).click();
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
  test.setTimeout(240000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?start=battle');
  await page.waitForFunction(()=>mana.ready&&mana.mod.frieza.fighting,{},{timeout:210000});
  const start=await page.evaluate(async()=>{mana.pause();await mana.saveCheckpoint();return{state:mana.mod.frieza.status,map:mana.mod.status.map,sram:mana.hash(mana.snes.cart.sram),rom:mana.hash(mana.snes.cart.data)}});
  expect(start.map).toBe(246);expect(start.state).toMatchObject({stage:'battle',permanent:true,fallen:true,hp:96000});
  expect(await page.evaluate(async()=>{await mana.quickStart('late');mana.pause();return{map:mana.mod.status.map,eligible:mana.mod.frieza.eligible,count:mana.mod.quest.status.seedCount}})).toEqual({map:431,eligible:true,count:7});
  await page.locator('#native-restore').click();
  expect(await page.evaluate(()=>mana.mod.frieza.status.stage)).toBe('battle');
  expect(await page.evaluate(async()=>{await mana.quickStart('frieza');mana.pause();return mana.mod.frieza.status.stage})).toBe('showdown');
  await page.reload();await page.waitForFunction(()=>mana.ready&&mana.mod.frieza.fighting,{},{timeout:15000});
  const cached=await page.evaluate(()=>{mana.pause();return{state:mana.mod.frieza.status,map:mana.mod.status.map,sram:mana.hash(mana.snes.cart.sram),rom:mana.hash(mana.snes.cart.data)}});
  expect(cached.map).toBe(246);expect(cached.state).toMatchObject({stage:'battle',permanent:true,fallen:true,hp:96000});
  expect(cached.sram).toBe(start.sram);expect(cached.rom).toBe(start.rom);expect(errors).toEqual([]);
});
