import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {bossRushDeathTiming as T} from '../../engine/boss-rush-death.js';
test.setTimeout(180000);
for(const kind of['thanatos','battle','space','beast'])test(`${kind}: character death precedes black, planet destruction and Game Over`,async({page},info)=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?start=${kind}`);await page.waitForFunction(()=>mana.ready,{},{timeout:45000});
 const initial=await page.evaluate(async kind=>{
  mana.pause();const m=mana.mod;
  for(let f=0;f<10000;f+=20){
   if(m.canAttack&&(m.frieza.fighting||m.entities().some(e=>e.active&&e.species===(kind==='beast'?127:121)&&e.hp)))break;
   mana.run(20,[11]);if(f%400===0)await new Promise(r=>setTimeout(r,0));
  }
  if(!m.canAttack)throw Error('Boss did not start');
  const rom=mana.hash(mana.snes.cart.data),sram=mana.hash(mana.snes.cart.sram);
  mana.run(2);
  // The Beast caps damage: leave a fatal amount of health, then let the
  // actual native damage worker execute the death rather than setting it.
  if(kind==='beast'){m.challenge.restore({...m.challenge.snapshot(),grace:0});m.write16(0xe182,80);}
  m.write16(0xe1f1,2000);m.write8(0xe1f0,0);m.write8(0xe1ec,0);
  for(let f=0;f<90&&!mana.battleRetry.defeated;f++)mana.run(1);
  return{defeated:mana.battleRetry.defeated,hp:m.status.hp,frames:mana.snes.frames,rom,sram,map:m.status.map};
 },kind);
 expect(initial.defeated).toBe(true);expect(initial.hp).toBe(0);
 const base=await page.evaluate(()=>{
  mana.run(24,[0,1,8,9,10,11,16]);document.querySelector('#native-pause').hidden=true;
  return{gold:mana.mod.options.superSaiyan,hp:mana.mod.status.hp,can:mana.mod.canAttack,age:mana.mod.ending.status.age};
 });
 expect(base).toEqual({gold:false,hp:0,can:false,age:24});
 await page.locator('#screen').screenshot({path:info.outputPath('reverted.png')});
 const character=await page.evaluate(()=>{
  mana.run(156);const saved=mana.snapshot();mana.run(60);const pixels=mana.hash(mana.pixels);
  mana.restore(saved);mana.run(60);const m=mana.mod;document.querySelector('#native-pause').hidden=true;
  return{replay:mana.hash(mana.pixels)===pixels,age:m.ending.status.age,ghost:!!(m.read8(0xe191)&128),animation:m.read8(0xe011),frames:mana.snes.frames,map:m.status.map,hp:m.status.hp,can:m.canAttack};
 });
 expect(character).toMatchObject({replay:true,age:240,map:initial.map,hp:0,can:false});
 if(kind==='space')expect(character.frames).toBe(initial.frames);
 // The original reaper temporarily replaces the actor's body OAM; during
 // those frames there is deliberately no custom Goku sprite plan.
 else{expect(character.frames).toBe(initial.frames+240);expect(character.ghost).toBe(true);expect([0,0xaf]).toContain(character.animation);}
 await page.locator('#screen').screenshot({path:info.outputPath(kind==='space'?'falling-to-planet.png':'native-reaper.png')});
 const black=await page.evaluate(T=>{
  const m=mana.mod;mana.run(T.black-m.ending.status.age);
  const dark=()=>mana.snes.ppu.pixelOutput.slice(1536,225*1536).every(v=>v===0),first=dark();
  mana.run(T.planet-T.black-1);document.querySelector('#native-pause').hidden=true;
  return{first,last:dark(),frames:mana.snes.frames,ram:mana.hash(mana.snes.ram),age:m.ending.status.age};
 },T);
 expect(black.first&&black.last).toBe(true);expect(black.age).toBe(T.planet-1);
 await page.locator('#screen').screenshot({path:info.outputPath('black-pause.png')});
 await page.evaluate(T=>mana.run(T.blast+50-mana.mod.ending.status.age),T);
 await page.locator('#screen').screenshot({path:info.outputPath('planet-exploding.png')});
 const end=await page.evaluate(T=>{
  mana.run(T.gameOver-mana.mod.ending.status.age);const m=mana.mod;document.querySelector('#native-pause').hidden=true;
  return{phase:m.ending.status.phase,gameOver:mana.battleRetry.gameOver,retry:mana.battleRetry.retry(),hp:m.status.hp,frames:mana.snes.frames,ram:mana.hash(mana.snes.ram),rom:mana.hash(mana.snes.cart.data),sram:mana.hash(mana.snes.cart.sram),map:m.status.map};
 },T);
 expect(end).toEqual({phase:'gameover',gameOver:true,retry:false,hp:0,frames:black.frames,ram:black.ram,rom:initial.rom,sram:initial.sram,map:initial.map});
 await page.locator('#screen').screenshot({path:info.outputPath('game-over.png')});expect(errors).toEqual([]);
 await page.evaluate(()=>mana.play());await page.waitForFunction(()=>mana.ready&&!mana.mod.ending.active);
 expect(await page.evaluate(()=>{mana.pause();return{fight:mana.mod.frieza.fighting,defeated:mana.battleRetry.defeated};})).toEqual({fight:false,defeated:false});
});
