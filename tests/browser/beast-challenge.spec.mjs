import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
test.setTimeout(240000);
async function load(page){
  const path='.local/graphics-audit/party.json';
  test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
  await page.goto('/');await page.waitForFunction(()=>mana.ready);
  await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path)));
}
test('seven Balls feed a multi-beam Beast; hits hurt immediately and native death and victory work',async({page})=>{
  await load(page);
  await page.evaluate(()=>{
    for(const base of[0xe200,0xe400]){mana.write8(base,0);mana.write8(base+0x2c,0);}
    mana.mod.quest.restore({mask:0,delivered:0});for(let i=0;i<7;i++)mana.mod.quest.collect(i);
    mana.mod.frieza.restore({stage:'defeated',stolen:false,permanent:true});
    mana.write8(0xcf4e,8);mana.mod.story.request(0x429);
  });
  // There is no opt-out choice when all seven seeds are earned. Advance
  // native dialogue with R only; the feed scene must lead into the battle.
  for(let i=0;i<60;i++){
    if(await page.evaluate(()=>mana.mod.canAttack&&mana.read16(0xdc)===253))break;
    await page.evaluate(()=>mana.run(100,[11]));
  }
  expect(await page.evaluate(()=>mana.mod.challenge.status.fed)).toBe(true);
  const initial=await page.evaluate(()=>({s:mana.mod.status,c:mana.mod.challenge.status,boss:mana.read16(0xe782),quest:mana.mod.quest.status}));
  expect(initial.s.canAttack).toBe(true);expect(initial.boss).toBe(65535);expect(initial.c.wards).toBeUndefined();expect(initial.quest).toMatchObject({count:7,earned:7,delivered:0});
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
  // Stand in one of the native-art light lanes. The very first impact
  // must hurt; replaying the same frames must reproduce the same injury.
  await page.evaluate(s=>mana.restore(s),state);
  const replay=await page.evaluate(()=>{
    for(let i=0;i<1000&&!mana.mod.challenge.status.burst;i++)mana.run(1);
    const saved=mana.snapshot();mana.run(160);const expected=JSON.stringify(mana.mod.challenge.snapshot()),hp=mana.read16(0xe182);
    mana.restore(saved);mana.run(160);
    return{same:expected===JSON.stringify(mana.mod.challenge.snapshot()),hp,again:mana.read16(0xe182),hits:mana.mod.challenge.status.hits};
  });expect(replay.same).toBe(true);expect(replay.again).toBe(replay.hp);expect(replay.hp).toBeLessThan(999);expect(replay.hits).toBeGreaterThan(0);
  await page.evaluate(s=>mana.restore(s),state);
  // Even an older checkpoint containing ward fields cannot restore shields.
  // The real native damage consumer can kill Goku, without auto-rescue.
  const danger=await page.evaluate(()=>{
    mana.mod.challenge.restore({...mana.mod.challenge.snapshot(),wards:7,grace:0});mana.run(1);
    mana.write16(0xe182,80);
    for(let i=0;i<12&&mana.read16(0xe182);i++){
      mana.write16(0xe1f1,450);mana.write8(0xe1f0,3);mana.write8(0xe1ec,0);mana.run(140);
    }
    return{hp:mana.read16(0xe182),dead:mana.battleRetry.defeated,map:mana.mod.status.map,c:mana.mod.challenge.status};
  });expect(danger.hp).toBe(0);expect(danger.dead).toBe(true);expect(danger.map).toBe(253);expect(danger.c.hits).toBeGreaterThan(0);
  // Verify native defeat/ending progression independently of survival AI;
  // the beam above already proves the upgraded HP and damage resistance.
  await page.evaluate(s=>{mana.restore(s);mana.mod.quest.restore({mask:127,delivered:0});mana.mod.options.superSaiyan=true;mana.run(1);},state);
  let won=false;
  for(let i=0;i<80;i++){
    const result=await page.evaluate(()=>{
      const m=mana.mod;
      if(m.canAttack){const boss=m.entities().find(e=>e.active&&e.species===127&&e.hp);if(boss)m.hit(boss,65535*8,0,-1);mana.run(60);}
      else{mana.run(2,[16]);mana.run(100);}
      return{won:m.challenge.status.won&&m.quest.status.wished,hp:mana.read16(0xe182),error:m.story.status.error};
    });expect(result.error).toBe(null);expect(result.hp).toBeGreaterThan(0);if(result.won){won=true;break;}
  }
  expect(won).toBe(true);expect(await page.evaluate(()=>mana.mod.quest.status.wished)).toBe(true);expect(await page.evaluate(()=>mana.mod.ending.status)).toMatchObject({outcome:'good'});
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
