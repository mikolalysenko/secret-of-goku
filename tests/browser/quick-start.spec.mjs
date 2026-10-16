import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {quickStartLabels} from '../../engine/quick-start.js';

test('Thanatos query recruits the full party and carries their membership into the Frieza confrontation',async({page})=>{
 test.setTimeout(180000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=thanatos');await page.waitForFunction(()=>mana.ready,{},{timeout:30000});
 const start=await page.evaluate(()=>{mana.pause();const m=mana.mod;return{map:m.status.map,stage:m.frieza.status.stage,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],graphics:[mana.read16(0xe270),mana.read16(0xe470)],hp:[mana.read16(0xe382),mana.read16(0xe582)],rom:mana.hash(mana.snes.cart.data)};});
 expect(start).toMatchObject({map:246,stage:'trial',party:[1,1],hp:[999,999]});expect(start.graphics.every(Boolean)).toBe(true);
 await page.reload();await page.waitForFunction(()=>mana.ready,{},{timeout:15000});
 expect(await page.evaluate(()=>{mana.pause();return[mana.read8(0xe200)&1,mana.read8(0xe400)&1];})).toEqual([1,1]);
 const follow=await page.evaluate(async()=>{
  const m=mana.mod;let fought=false,court=null,transfer=null,lift=null,departure=null,music=null,boosts=0,bossFrames=0,returning=null,gold=null,lastPose=null;
  const spawns=[],write=mana.snes.write;
  mana.snes.write=function(address,value,dma){if((address&0xffffff)===0x7ecf4e&&value===6&&m.frieza.trial)spawns.push({brightness:this.ppu.brightness,blank:this.ppu.forcedBlank});return write.call(this,address,value,dma);};
  const {friezaScenePose}=await import('/engine/frieza-staging.js');
  for(let f=0;f<18000&&m.frieza.status.stage!=='battle';f+=20){
   const s=m.frieza.status,c=s.scene;
   if(c?.kind==='trial-taunt'&&!court)court={camera:[m.status.cameraX,m.status.cameraY],actors:m.entities().filter(e=>e.active).map(e=>({species:e.species,x:e.screenX,y:e.screenY})),frieza:friezaScenePose(c,m.status)};
   if(c?.kind==='empower'&&!transfer)transfer={target:c.target,thanatos:m.entities().find(e=>e.active&&e.species===0xbf),frieza:friezaScenePose(c,m.status)};
   if(c?.kind==='trial-leave')departure=friezaScenePose(c,m.status);
   if(c?.kind==='taunt'&&c.age>=120&&!returning)returning={pose:friezaScenePose(c,m.status),hero:{x:m.status.screenX,y:m.status.screenY},super:m.options.superSaiyan};
   if(c?.kind==='gold'){gold={super:m.options.superSaiyan,permanent:s.permanent};lastPose=friezaScenePose(c);}
   if(c?.kind==='lift'&&c.age>=90&&!lift){const body=m.ownership.ppuOwners.find(o=>o?.base===0xe400&&o.kind==='body');lift={x:m.read16(0xe402),goku:m.status.x,anchor:body?.anchor,frieza:friezaScenePose(c,m.status)};}
   const boss=m.entities().find(e=>e.active&&!e.custom&&e.species===121&&e.hp);
   if(boss&&m.canAttack){
    fought=true;bossFrames+=20;
    if(bossFrames>=40&&!music)music={native:m.read8(0x1e05),custom:m.frieza.music,scene:c};
    boosts=m.challenge.status.lich?.buffs??0;
    if(boosts<2)m.write16(boss.base+0x182,boosts?12000:30000);
    else m.hit(boss,60000,0,-1);
   }
   mana.run(20,[11]);if(f%240===0)await new Promise(r=>setTimeout(r,0));
  }
  mana.snes.write=write;
  return{fought,court,transfer,lift,departure,music,boosts,returning,gold,lastPose,spawns,boss:m.frieza.status.boss,stage:m.frieza.status.stage,primm:m.frieza.status.primmMember,popoi:m.frieza.popoiMember,fallen:m.frieza.fallen,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],can:m.canAttack,rom:mana.hash(mana.snes.cart.data),error:m.story.status.error};
 });
 await test.info().attach('full-party-staging',{body:JSON.stringify(follow),contentType:'application/json'});
 expect(follow).toMatchObject({fought:true,stage:'battle',primm:true,popoi:true,fallen:true,party:[0,0],can:true,error:null});expect(follow.rom).toBe(start.rom);expect(errors).toEqual([]);
 expect(follow.court.camera).toEqual([152,260]);expect(follow.court.actors.map(a=>a.species).sort()).toEqual([128,129,130,172,191]);
 for(const a of [...follow.court.actors,follow.court.frieza]){expect(a.x).toBeGreaterThan(16);expect(a.x).toBeLessThan(240);expect(a.y).toBeGreaterThanOrEqual(108);expect(a.y).toBeLessThan(196);}
 expect(new Set(follow.court.actors.map(a=>`${a.x},${a.y}`)).size).toBe(5);
 expect(follow.transfer.target).toEqual({x:follow.transfer.thanatos.x,y:follow.transfer.thanatos.y-16});
 expect(follow.departure.y).toBeLessThanOrEqual(-100);expect(follow.music).toMatchObject({native:0x0c,custom:null,scene:null});expect(follow.boosts).toBe(2);
 expect(follow.spawns.length).toBeGreaterThan(0);expect(follow.spawns.every(p=>p.blank||p.brightness===0)).toBe(true);
 expect(follow.lift.x).toBe(follow.lift.goku-40);expect(follow.lift.anchor.renderedFeetY-32).toBeGreaterThan(76);expect(follow.lift.frieza.x-follow.lift.anchor.x).toBeGreaterThanOrEqual(32);
 expect(follow.returning.super).toBe(false);expect(follow.returning.pose.x).toBe(follow.returning.hero.x);expect(follow.returning.pose.y).toBeLessThan(follow.returning.hero.y-30);
 expect(follow.gold).toEqual({super:true,permanent:true});expect(follow.boss.x).toBe(follow.lastPose.x);expect(Math.abs(follow.boss.y+8-follow.lastPose.y)).toBeLessThanOrEqual(2);
});

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
  const transition=await page.evaluate(async()=>{mana.pause();const s=mana.mod.frieza.status.boss.surge,{cosmicDuration}=await import('/engine/frieza-cinematic.js');mana.run(cosmicDuration+1);return{age:s.age,kind:s.kind,space:mana.mod.frieza.orbit?.kind,canAttack:mana.mod.canAttack};});
  expect(transition.age).toBeLessThan(72);expect(transition).toMatchObject({kind:'frieza-cosmic',space:'frieza-orbit',canAttack:true});
  expect(errors).toEqual([]);
});

test('all finale query links initialize native scenes, preserve saves and show loading progress',async({page})=>{
 test.setTimeout(180000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=late');await expect(page.locator('#test-loading')).toBeVisible();
 await page.waitForFunction(()=>mana.ready&&mana.mod.status.map===431,{},{timeout:30000});
 const initial=await page.evaluate(async()=>{mana.pause();mana.snes.cart.write(0x30,0x7fff,0xa5);mana.battery.flush();await mana.saveCheckpoint();return{rom:mana.hash(mana.snes.cart.data),sram:mana.hash(mana.snes.cart.sram)}});
 await page.getByText('Test scenes',{exact:true}).click();
 await expect(page.locator('#quick-checkpoints a')).toHaveCount(Object.keys(quickStartLabels).length);
 for(const kind of['tree','fortress','buffy','slime','flight','beast','good-ending','bad-ending','explosion']){
   await page.goto(`/?start=${kind}`);await page.waitForFunction(()=>mana.ready,{},{timeout:30000});
   const state=await page.evaluate(()=>{mana.pause();const m=mana.mod;return{map:m.status.map,canAttack:m.canAttack,flight:m.worldFlight,hp:m.status.hp,challenge:m.challenge.status,ending:m.ending.status,rom:mana.hash(mana.snes.cart.data),sram:mana.hash(mana.snes.cart.sram),error:m.story.status.error};});
   expect(state.rom).toBe(initial.rom);expect(state.sram).toBe(initial.sram);expect(state.error).toBe(null);expect(state.hp).toBe(999);
   if(kind==='fortress')expect(state).toMatchObject({map:255,canAttack:true});
   if(kind==='tree')expect([235,236]).toContain(state.map);
   if(kind==='buffy'||kind==='slime'){
     expect(state).toMatchObject({map:kind==='buffy'?244:488,canAttack:true});
     expect(await page.evaluate(species=>mana.mod.entities().some(e=>e.active&&e.species===species&&e.hp>0),kind==='buffy'?120:124)).toBe(true);
   }
   if(kind==='flight')expect(state.flight).toBe(true);
   if(kind==='beast')expect(state).toMatchObject({map:253,canAttack:true,challenge:{started:true,fed:true,won:false}});
   if(kind==='good-ending'){
     expect(state.ending).toMatchObject({outcome:'good',phase:'transition'});
     const wish=await page.evaluate(()=>{
       const m=mana.mod;for(let f=0;f<600&&m.ending.status.phase==='transition';f++)mana.run(1);
       return{phase:m.ending.status.phase,error:m.story.status.error};
     });expect(wish).toEqual({phase:'summon',error:null});
   }
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
