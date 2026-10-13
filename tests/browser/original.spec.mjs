import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
test('main game keeps the editable BOY name and native bridge, fall and waterfall before Goku arrives',async({page})=>{
  test.setTimeout(180000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the local US ROM.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.waitForFunction(()=>window.mana?.ready);await expect(page.locator('#boot-screen')).toBeHidden();
  const title=await page.evaluate(()=>{
    mana.pause();mana.run(960);const saved=mana.snapshot();
    mana.mod.configure({enabled:false});mana.run(1);const original=mana.hash(mana.pixels);
    mana.restore(saved);mana.mod.configure({enabled:true});mana.run(1);return{original,modded:mana.hash(mana.pixels),map:mana.mod.status.map};
  });
  expect(title.modded).toBe(title.original);expect(title.map).toBe(0);
  const name=await page.evaluate(()=>{
    mana.run(2,[3]);mana.run(180);mana.run(2,[0]);mana.run(180);
    return{length:mana.read8(0xa1cc),tiles:[0,1,2].map(i=>mana.read16(0x90d2+i*2)),canAttack:mana.mod.canAttack,goku:mana.mod.gokuActive};
  });
  expect(name).toEqual({length:3,tiles:[0x205c,0x2090,0x20b8],canAttack:false,goku:false});
  const edit=await page.evaluate(()=>{
    mana.run(2,[0]);mana.run(10);const added=mana.read8(0xa1cc);mana.run(2,[1]);mana.run(10);return{added,length:mana.read8(0xa1cc)};
  });
  expect(edit).toEqual({added:4,length:3});
  const lore=await page.evaluate(()=>{mana.run(2,[3]);mana.run(300);return{event:mana.read8(0xd0),name:Array.from(mana.snes.ram.slice(0xcc00,0xcc04)),charging:mana.mod.charging};});
  expect(lore.name).toEqual([0x9c,0xa9,0xb3,0]);expect(lore.event).not.toBe(0);expect(lore.charging).toBe(false);
  const opening=await page.evaluate(async()=>{
    let bridgeChecks=0,bridgeMismatches=0;
    const checkBridge=()=>{
      if(mana.read16(0xdc)===256){
        const state=mana.snapshot();mana.mod.configure({enabled:false});mana.run(1);const native=mana.hash(mana.pixels);
        mana.restore(state);mana.mod.configure({enabled:true});mana.run(1);bridgeChecks++;if(mana.hash(mana.pixels)!==native)bridgeMismatches++;
      }
    };
    for(let i=0;i<6;i++){
      mana.run(600);checkBridge();
      await new Promise(r=>setTimeout(r,0));
    }
    let taps=0;while(!(mana.read16(0xdc)===128&&mana.read8(0xd0)===0)&&taps<24){mana.run(2,[0]);mana.run(240);checkBridge();taps++;await new Promise(r=>setTimeout(r,0));}
    const before=mana.mod.status.x;mana.run(12,[7]);const right=mana.mod.status.x;mana.run(12,[6]);
    return{map:mana.read16(0xdc),event:mana.read8(0xd0),drum:mana.read8(0xcc48),right,taps,before,hidden:mana.mod.hiddenLastFrame.length,goku:mana.mod.gokuActive,bridgeChecks,bridgeMismatches};
  });
  expect(opening.map).toBe(128);expect(opening.event).toBe(0);expect(opening.drum).toBe(0x27);
  expect(opening.right).toBeGreaterThan(opening.before);expect(opening.goku).toBe(false);expect(opening.hidden).toBe(0);
  expect(opening.bridgeChecks).toBeGreaterThan(0);expect(opening.bridgeMismatches).toBe(0);expect(errors).toEqual([]);
});
