import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(180000);
async function load(page,crisis=false){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private ROM and native fixture required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,crisis})=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.mod.radio.restore({firstFlight:true});if(crisis){mana.mod.quest.restore({mask:127,seedMask:127});mana.mod.frieza.restore({stage:'hunt',stolen:true,eighth:true,hinted:true});}mana.run(3);},{state:JSON.parse(readFileSync(fixture)),crisis});
}
async function late(page){await page.evaluate(async()=>{const{buildLateCheckpoint}=await import('/engine/quick-start.js');await buildLateCheckpoint('late',{mod:mana.mod,pump:async(f,b)=>mana.run(f,b),capture:()=>mana.snapshot(),cache:()=>{},progress:()=>{}});});}
for(const balls of[0,3,7])test(`native continent transition always introduces Frieza and the Death Ball with ${balls} Balls`,async({page})=>{
 await load(page);await late(page);
 await page.evaluate(balls=>{const mask=(1<<balls)-1;mana.mod.quest.restore({mask,seedMask:mask});mana.mod.story.request(0x4a4);},balls);
 let complete=false,impact=false,charge=false;
 for(let i=0;i<110;i++){
  const r=await page.evaluate(()=>{mana.run(75,[11]);const m=mana.mod;return{scene:m.frieza.status.scene?.kind,world:m.worldFlight,control:mana.read8(0x8c),notified:m.frieza.status.crisis?.flightNotified,choice:mana.fastForward.state(1<<11).choice};});
  // No B, direction, or menu confirmation is supplied anywhere in this scene.
  expect(r.choice).toBe(false);impact||=r.scene==='core-impact';charge||=r.scene==='core-charge';
  if(r.world&&r.control===0&&r.notified){complete=true;break;}
 }
 expect(complete).toBe(true);expect(impact&&charge).toBe(true);
 const result=await page.evaluate(()=>({state:mana.mod.frieza.status,quest:mana.mod.quest.status,flags:[mana.read8(0xcf41),mana.read8(0xcf44)],rearView:!(mana.read8(0xf2)&0x80),radio:mana.mod.radio.status,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:mana.mod.story.status.error}));
 expect(result).toMatchObject({state:{stage:'hunt',stolen:true,stolenMask:(1<<balls)-1,eighth:true,crisis:{active:true,minutes:5,flightNotified:true}},quest:{count:balls,seedCount:balls,wished:false},party:[1,1],error:null,rearView:true});
 expect(result.radio.current?.text).toContain('LOOK AT THE SKY');
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:test.info().outputPath('world.png')});
});

test('concerned shopkeepers keep Buy/Sell and inn choices usable, with one greeting per conversation',async({page})=>{
 for(const door of[250,92]){
  await load(page,true);
  await page.evaluate(door=>{mana.mod.story.travel(door);mana.run(240);const npc=mana.mod.entities().find(e=>e.active&&e.base>=0xe600);if(!npc)throw Error('Missing service NPC');mana.mod.story.request(mana.read16(npc.base+0x3e)&2047,{actor:npc.base-0xe000});mana.run(90);},door);
  expect(await page.evaluate(()=>mana.mod.story.status.greetingCount)).toBe(1);
  // The greeting itself can be checkpointed without replaying or dropping
  // the underlying NPC event. Advancing lands on its original choice menu.
  const replay=await page.evaluate(()=>{const save=mana.snapshot();mana.run(900,[11]);const a=mana.hash(mana.pixels);mana.restore(save);mana.run(900,[11]);return a===mana.hash(mana.pixels);});expect(replay).toBe(true);
  expect(await page.evaluate(()=>({greetings:mana.mod.story.status.greetingCount,event:mana.read8(0xd0),can:mana.mod.canAttack}))).toEqual({greetings:1,event:129,can:false});
  await page.locator('#screen').screenshot({path:test.info().outputPath(`service-${door}.png`)});
  if(door===250){
   // Enter Buy, then leave the original item ring. The mod must not grab
   // B/Y as combat while a transaction is open.
   const menu=await page.evaluate(()=>{mana.run(2,[0]);mana.run(100);mana.run(2,[1]);return{can:mana.mod.canAttack,action:mana.mod.action?.kind??null};});expect(menu.can).toBe(false);expect(menu.action).not.toBe('blast');
  }
  for(let i=0;i<6;i++){if(await page.evaluate(()=>mana.mod.canAttack))break;await page.evaluate(()=>{mana.run(3,[9]);mana.run(100);});}
  expect(await page.evaluate(()=>mana.mod.canAttack)).toBe(true);
  const resumed=await page.evaluate(()=>{mana.run(3,[1]);return{action:mana.mod.action?.kind,minutes:mana.mod.frieza.status.crisis.minutes,error:mana.mod.story.status.error};});expect(resumed).toEqual({action:'blast',minutes:5,error:null});
 }
});

for(const mask of[0,3])test(`Frieza's Death Ball replaces the Tree attack dialogue without stalling party ${mask}`,async({page})=>{
 test.setTimeout(240000);
 await load(page,true);
 await page.evaluate(mask=>{
  const c=mana.snes.cart.data;
  if(mask===0){
   const table=0x90000+0x98*2,pointer=c.slice(table,table+2),code=c.slice(0x9f300,0x9f305);
   try{c.set([0,0xf3],table);c.set([0x2c,1,0x2c,2,0],0x9f300);mana.mod.story.request(0x98);mana.run(120);}
   finally{c.set(pointer,table);c.set(code,0x9f300);}
  }
  for(let i=0;i<2;i++)mana.write8(0xcf0d+i,mask>>i&1);
  const event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([235,40,48,0],0x8300c);mana.write8(0xcf46,6);mana.snes.ram.set([1,0xb0,0x42,0xc7],0xd0);mana.run(240);}
  finally{c.set(event,0x742b0);c.set(door,0x8300c);}
 },mask);
 const result=await page.evaluate(()=>{
  const m=mana.mod,requested=m.story.request(0x5f8),maps=new Set();let frames=0;
  for(;frames<24000;frames+=40){
   mana.run(40,[11]);maps.add(m.status.map);
   // The Tree approach offers a native save choice. Fast-forward correctly
   // stops there; decline explicitly before continuing its choreography.
   if(mana.fastForward.state(1<<11).choice){mana.run(240);mana.run(4,[7]);mana.run(16);mana.run(2,[16]);mana.run(10);}
   if(frames>60&&m.canAttack&&mana.read8(0xcfc0)>=9)break;
  }
  return{requested,frames,maps:[...maps],can:m.canAttack,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],crisis:m.frieza.status.crisis,stolen:m.frieza.unresolved,error:m.story.status.error};
 });
 expect(result,JSON.stringify(result)).toMatchObject({requested:true,can:true,party:[mask&1,mask>>1&1],crisis:{active:true,minutes:5},stolen:true,error:null});
 expect(result.frames).toBeLessThan(24000);expect(result.maps).toContain(236);
});
