import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {encodeText} from '../../engine/event-codec.js';
test.setTimeout(240000);
async function load(page){
  const path='.local/graphics-audit/party.json';
  test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
  await page.goto('/');await page.waitForFunction(()=>mana.ready);
  await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path)));
}
test('native Feed seeds choice creates a survivable multi-beam boss, earned wards, and real danger',async({page})=>{
  await load(page);
  await page.evaluate(()=>{
    for(const base of[0xe200,0xe400]){mana.write8(base,0);mana.write8(base+0x2c,0);}
    mana.mod.quest.restore({mask:0,delivered:0});for(let i=0;i<7;i++)mana.mod.quest.collect(i);
    mana.write8(0xcf4e,8);mana.mod.story.request(0x429);
  });
  const signature=[0x50,...encodeText('GOKU:Just one little snack?')];
  const choice=await page.evaluate(async signature=>{
    const ready=()=>mana.read8(0xd0)===0x81&&signature.every((b,i)=>mana.snes.cart.read(mana.read8(0xd3),mana.read16(0xd1)+i)===b);
    for(let i=0;i<80&&!ready();i++){mana.run(2,[16]);mana.run(150);await new Promise(r=>setTimeout(r,0));}
    return ready();
  },signature);expect(choice).toBe(true);
  await page.evaluate(()=>{mana.run(4,[7]);mana.run(16);mana.run(2,[16]);mana.run(120);});
  expect(await page.evaluate(()=>mana.mod.challenge.status.fed)).toBe(true);
  for(let i=0;i<25;i++){
    if(await page.evaluate(()=>mana.mod.canAttack&&mana.read16(0xdc)===253))break;
    await page.evaluate(()=>{mana.run(2,[16]);mana.run(150);});
  }
  const initial=await page.evaluate(()=>({s:mana.mod.status,c:mana.mod.challenge.status,boss:mana.read16(0xe782),quest:mana.mod.quest.status}));
  expect(initial.s.canAttack).toBe(true);expect(initial.boss).toBe(65535);expect(initial.c.wards).toBe(7);expect(initial.quest).toMatchObject({count:7,earned:7,delivered:0});
  const state=await page.evaluate(()=>mana.snapshot());
  const renderer=await page.evaluate(()=>{
    const saved=mana.snapshot();mana.run(8);const native=mana.hash(mana.snes.ppu.vram);
    mana.restore(saved);const m=mana.mod,s=m.status;
    m.teleport.follow({x:s.x,y:s.y,terrain:mana.read8(0xe00b),layer:0});m.feedback.pulse(36);mana.run(8);
    const result={same:mana.hash(mana.snes.ppu.vram)===native,pending:m.teleport.pending,quake:mana.read8(0x49)};
    mana.restore(saved);return result;
  });
  expect(renderer).toEqual({same:true,pending:false,quake:0});
  const beam=await page.evaluate(()=>{
    mana.mod.options.superSaiyan=true;mana.run(1,[4]);mana.run(60,[10,1]);mana.run(1);mana.run(65);
    return{hp:mana.read16(0xe782),flag:mana.read8(0xcf4e),error:mana.mod.story.status.error};
  });
  expect(beam.hp).toBeGreaterThan(0);expect(beam.hp).toBeLessThan(65535);expect(beam.flag).toBe(8);expect(beam.error).toBe(null);
  // Stand in one of the native-art warning circles; the queued impact must
  // spend one ward. Then repeat the same frames from a saved state.
  await page.evaluate(s=>mana.restore(s),state);
  const replay=await page.evaluate(()=>{
    for(let i=0;i<1000&&!mana.mod.challenge.status.burst;i++)mana.run(1);
    const saved=mana.snapshot();mana.run(160);const expected=JSON.stringify(mana.mod.challenge.snapshot()),hp=mana.read16(0xe182);
    mana.restore(saved);mana.run(160);
    return{same:expected===JSON.stringify(mana.mod.challenge.snapshot()),hp,again:mana.read16(0xe182),blocked:mana.mod.challenge.status.blocked};
  });expect(replay.same).toBe(true);expect(replay.again).toBe(replay.hp);expect(replay.blocked).toBeGreaterThan(0);
  await page.evaluate(s=>mana.restore(s),state);
  // Explicitly choose the same challenge without palace rewards. The real
  // native damage consumer must be able to kill Goku, without auto-rescue.
  const danger=await page.evaluate(()=>{
    mana.mod.challenge.restore({...mana.mod.challenge.snapshot(),wards:0,grace:0});mana.run(1);
    for(let i=0;i<5&&mana.read16(0xe182);i++){
      mana.write16(0xe1f1,450);mana.write8(0xe1f0,3);mana.write8(0xe1ec,0);mana.run(140);
    }
    // The native hurt animation finishes before its death status is latched.
    for(let i=0;i<30&&!(mana.read8(0xe191)&0x80);i++)mana.run(20);
    return{hp:mana.read16(0xe182),dead:mana.read8(0xe191)&0x80,c:mana.mod.challenge.status};
  });expect(danger.hp).toBe(0);expect(danger.dead).toBe(128);expect(danger.c.hits).toBeGreaterThan(1);
  await page.evaluate(s=>{mana.restore(s);mana.mod.quest.restore({mask:127,delivered:0});mana.mod.challenge.choose(true);mana.mod.options.superSaiyan=true;mana.run(1);},state);
  let won=false;
  for(let i=0;i<80;i++){
    const result=await page.evaluate(()=>{
      const m=mana.mod;
      if(m.canAttack){m.instantTransmission();mana.run(15);mana.run(65,[10,1]);mana.run(1);mana.run(80);}
      else{mana.run(2,[16]);mana.run(100);}
      return{won:mana.read8(0xcf4e)>=9,hp:mana.read16(0xe182),error:m.story.status.error};
    });expect(result.error).toBe(null);expect(result.hp).toBeGreaterThan(0);if(result.won){won=true;break;}
  }
  expect(won).toBe(true);expect(await page.evaluate(()=>mana.mod.quest.status.wished)).toBe(true);
});

test('first hover and Super Saiyan reveals preserve controls and replay only once',async({page})=>{
  await load(page);
  const result=await page.evaluate(()=>{
    const m=mana.mod;mana.run(8,[8,7]);const moved=m.status.x,flight=m.powerIntro.snapshot();mana.run(1);mana.run(96,[10,8]);
    const reveal={...m.action},saved=mana.snapshot();mana.run(24);const image=mana.hash(mana.pixels);mana.restore(saved);mana.run(24);
    const same=mana.hash(mana.pixels)===image;mana.run(80);mana.run(2,[18]);mana.run(30);mana.run(96,[10,8]);
    return{moved,flight,reveal,same,repeat:m.action,flags:m.powerIntro.snapshot(),radio:m.radio.snapshot()};
  });
  expect(result.flight.flight).toBe(true);expect(result.reveal).toMatchObject({kind:'transform',duration:72,reveal:true});expect(result.same).toBe(true);
  expect(result.repeat).toMatchObject({kind:'transform',duration:32});expect(result.repeat.reveal).toBeUndefined();expect(result.flags).toEqual({flight:true,superShown:true});
});
