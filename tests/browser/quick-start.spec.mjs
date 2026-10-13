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
