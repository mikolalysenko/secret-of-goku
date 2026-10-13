import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
test('original ROM boots Potos with Goku, holds attack, flies, lands and replays a checkpoint',async({page})=>{
  test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the local US ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/engine.html');await page.getByRole('button',{name:'START IN POTOS'}).click();
  await page.waitForFunction(()=>window.mana?.ready,null,{timeout:60000});
  await page.evaluate(()=>{window.__nativeOpening=mana.snapshot();});
  expect(await page.evaluate(()=>mana.mod.status.map)).toBe(131);
  expect(await page.evaluate(()=>mana.mod.status.hiddenOamSlots.length)).toBeGreaterThan(0);
  const movement=await page.evaluate(()=>{
    mana.pause();const saved=mana.snapshot(),before=mana.mod.status.y;
    mana.run(80,[4]);const after=mana.mod.status.y;mana.restore(saved);mana.play();return{before,after};
  });
  expect(movement.before-movement.after).toBeGreaterThan(60);
  await page.keyboard.down('j');await expect.poll(()=>page.evaluate(()=>mana.mod.charge)).toBe(90);
  expect(await page.evaluate(()=>({charging:mana.mod.charging,charge:mana.mod.charge,nativeB:mana.snes.joypad1State&1}))).toEqual({charging:true,charge:90,nativeB:0});
  await page.keyboard.up('j');await expect.poll(()=>page.evaluate(()=>mana.logs.some(l=>l.startsWith('Kamehameha')))).toBe(true);
  await page.keyboard.press('r');await expect.poll(()=>page.evaluate(()=>mana.mod.status.attack)).toBe(8191);
  await page.getByRole('button',{name:'Take flight / land'}).click();
  await page.waitForFunction(()=>mana.ready&&mana.mod.worldFlight&&(mana.read8(0xec)&0x80)&&!(mana.read8(0xe2)&1),null,{timeout:20000});
  const flight=await page.evaluate(()=>{
    mana.pause();const saved=mana.snapshot(),poses=[];
    for(const form of [true,false]){
      if(mana.mod.options.superSaiyan!==form){mana.run(1,[18]);mana.run(40);}
      for(const buttons of [[6],[7],[4,8],[5]]){
        mana.run(12,buttons);const sprite=mana.mod.spriteLayer.plan?.sprite;
        poses.push({sheet:sprite?.sheet,kind:sprite?.kind,column:sprite?.column,mask:mana.snes.joypad1State,expected:buttons.reduce((mask,bit)=>mask|(1<<bit),0)});
      }
    }
    mana.restore(saved);const before=mana.hash(mana.pixels);mana.run(30,[4,6,8]);const after=mana.hash(mana.pixels),ram=mana.hash(mana.snes.ram);
    mana.restore(saved);mana.run(30,[4,6,8]);const replay=ram===mana.hash(mana.snes.ram)&&after===mana.hash(mana.pixels);
    mana.restore(saved);mana.play();return{poses,moved:before!==after,replay};
  });
  for(const pose of flight.poses){expect(pose.kind).toBe('flight');expect(pose.column).toBeGreaterThanOrEqual(pose.sheet==='ssj'?36:40);expect(pose.column).toBeLessThanOrEqual(pose.sheet==='ssj'?39:43);expect(pose.mask).toBe(pose.expected);}
  expect(new Set(flight.poses.map(pose=>pose.sheet))).toEqual(new Set(['goku','ssj']));expect(flight.moved).toBe(true);expect(flight.replay).toBe(true);
  await page.getByRole('button',{name:'Take flight / land'}).click();
  await page.waitForFunction(()=>mana.ready&&!mana.mod.worldFlight&&mana.mod.canAttack,null,{timeout:20000});
  expect(await page.evaluate(()=>mana.mod.status.map)).toBe(131);
  const replay=await page.evaluate(()=>{
    mana.pause();const saved=mana.snapshot(),before=mana.mod.status.y;mana.run(80,[4]);const after=mana.mod.status.y,a=mana.hash(mana.snes.ram);
    mana.restore(saved);mana.run(80,[4]);const b=mana.hash(mana.snes.ram);return {a,b,before,after};
  });
  expect(replay.a).toBe(replay.b);expect(replay.before-replay.after).toBeGreaterThan(60);
  // Traverse the real opening event scripts using controller inputs alone.
  const story=await page.evaluate(async()=>{
    mana.restore(window.__nativeOpening);mana.mod.configure({superSaiyan:false});
    mana.run(130,[4]);mana.run(22,[7]);mana.run(24,[4]);mana.run(180);
    let taps=0;
    while(mana.read16(0xdc)!==260&&taps<40){mana.run(2,[0]);mana.run(180);taps++;await new Promise(r=>setTimeout(r,0));}
    const map=mana.read16(0xdc),flag=mana.read8(0xcf10);return{map,flag,taps};
  });
  expect(story.map).toBe(260);expect(story.flag).toBe(6);expect(errors).toEqual([]);
});
