import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
test.setTimeout(360000);
test.describe.configure({mode:'parallel'});
const fixture='.local/graphics-audit/party.json';
async function load(page,mask){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,mask})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);
  Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});
  mana.run(3);
  // Use the cartridge's REMOVE_CHARACTER command to preserve inactive
  // actor identities and the native party bookkeeping.
  const bytes=[];for(let i=0;i<2;i++)if(!(mask>>i&1))bytes.push(0x2c,i+1);
  if(bytes.length){
   bytes.push(0);const cart=mana.snes.cart.data,table=0x90000+0x98*2,pointer=cart.slice(table,table+2),code=cart.slice(0x9f300,0x9f300+bytes.length);
   try{cart.set([0,0xf3],table);cart.set(bytes,0x9f300);if(!mana.mod.story.request(0x98))throw Error('Cannot prepare party');mana.run(120);}
   finally{cart.set(pointer,table);cart.set(code,0x9f300);}
  }
  for(let i=0;i<2;i++)mana.write8(0xcf0d+i,mask>>i&1);
 },{state:JSON.parse(readFileSync(fixture)),mask});
}
async function enter(page,{map,x,y,flags={},layer=0}){
 await page.evaluate(({map,x,y,flags,layer})=>{
  const cart=mana.snes.cart.data,code=cart.slice(0x742b0,0x742b5),door=cart.slice(0x8300c,0x83010);
  try{
   cart.set([4,24,3,5,0],0x742b0);cart.set([map&255,x*2+(map>>8),y*2+layer,0],0x8300c);
   for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{cart.set(code,0x742b0);cart.set(door,0x8300c);}
 },{map,x,y,flags,layer});
}
async function finish(page,event,flag,value,{npc=0,limit=12000}={}){
 return page.evaluate(({event,flag,value,npc,limit})=>{
  const m=mana.mod,actor=npc?m.entities().find(e=>e.active&&e.species===npc):null;
  if(npc&&!actor)return{missingActor:npc};
  const requested=m.story.request(event,{actor:actor?actor.base-0xe000:0});
  let frames=0;const maps=new Set();
  for(;frames<limit;frames+=20){
   mana.run(20,[11]);maps.add(m.status.map);
   // The shared Sandship update now offers Sneak / KAMEHAMEHA. Select
   // Sneak (the initial cursor) to exercise every native rescue stage.
   if(mana.fastForward.state(1<<11).choice){mana.run(240);mana.run(2,[16]);mana.run(10);}
   if(frames>60&&m.canAttack&&mana.read8(0xcf00+flag)>=value)break;
  }
  return{requested,frames,maps:[...maps],flag:mana.read8(0xcf00+flag),can:m.canAttack,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],map:m.status.map,error:m.story.status.error,event:m.story.status.lastEvent,recent:m.story.status.recentEvents,position:[m.status.x,m.status.y]};
 },{event,flag,value,npc,limit});
}

for(const mask of[0,1,2,3])test(`Sandship capture, kitchen, cabin and Mech Rider preserve party ${mask}`,async({page})=>{
 await load(page,mask);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 const capture=await finish(page,0x28b,0x28,1);
 expect(capture,JSON.stringify(capture)).toMatchObject({can:true,map:271,party:[0,0],error:null});
 expect(await page.evaluate(()=>({flags:[mana.read8(0xcf0d),mana.read8(0xcf0e)],weighted:mana.mod.equipment.weighted,armor:mana.read8(0xe1e1)}))).toEqual({flags:[mask&1?8:0,mask&2?8:0],weighted:false,armor:21});
 // A real checkpoint in captivity must remember who is away from the party.
 await page.evaluate(()=>{const state=mana.snapshot();mana.restore(state);mana.run(2);});
 const sergo=await finish(page,0x291,0x28,2,{npc:168});
 expect(sergo,JSON.stringify(sergo)).toMatchObject({can:true,error:null});
 if(sergo.flag===2){const plan=await finish(page,0x292,0x28,3,{npc:168});expect(plan,JSON.stringify(plan)).toMatchObject({flag:3,can:true,map:271});}
 const escape=await finish(page,0x293,0x28,4,{npc:183});expect(escape,JSON.stringify(escape)).toMatchObject({can:true,flag:4,error:null});
 await enter(page,{map:319,x:8,y:12});
 const kitchen=await finish(page,0x295,0x28,mask&2?5:6);
 expect(kitchen,JSON.stringify(kitchen)).toMatchObject({can:true,error:null});
 expect(kitchen.flag).toBe(mask&2?5:6);
 const popoi=await page.evaluate(()=>mana.mod.entities().some(e=>e.active&&e.species===140));expect(popoi).toBe(!!(mask&2));
 if(mask&2){const rescued=await finish(page,0x296,0x28,6,{npc:140});expect(rescued,JSON.stringify(rescued)).toMatchObject({can:true,party:[0,1]});}
 await enter(page,{map:324,x:16,y:11});
 const guards=await finish(page,0x29a,0x28,7,{npc:183});expect(guards,JSON.stringify(guards)).toMatchObject({can:true,flag:7,error:null});
 await enter(page,{map:339,x:16,y:18,layer:1});
 const cabin=await finish(page,0x29c,0x28,11);
 expect(cabin,JSON.stringify(cabin)).toMatchObject({can:true,map:99,flag:11,party:[mask&1,mask>>1&1],error:null});
 const armed=await page.evaluate(()=>{mana.run(2,[0]);const punch=mana.mod.action?.kind;mana.run(24);mana.run(2,[1]);const ki=mana.mod.action?.kind;mana.run(30);return{punch,ki};});expect(armed).toEqual({punch:'punch',ki:'blast'});
 const rider=await finish(page,0x29e,0x28,11,{npc:177});
 expect(rider,JSON.stringify(rider)).toMatchObject({can:true,map:340,party:[mask&1,mask>>1&1],error:null});
 const won=await page.evaluate(()=>{
  const m=mana.mod;for(let i=0;i<80;i++){
   const boss=m.entities().find(e=>e.active&&e.index>=3&&e.species>=87&&e.species<128&&e.hp);
   if(m.canAttack&&boss){m.instantTransmission();mana.run(16);mana.run(100,[10,1]);mana.run(100);}else mana.run(30,[11]);
   if(m.canAttack&&m.status.map===91&&mana.read8(0xcf28)===12)break;
  }
  return{map:m.status.map,stage:mana.read8(0xcf28),party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],can:m.canAttack,error:m.story.status.error};
 });expect(won,JSON.stringify(won)).toMatchObject({map:91,stage:12,can:true,party:[mask&1,mask>>1&1],error:null});
});

for(const mask of[0,1,2,3])test(`flying straight to the Sandship cabin returns only captured companions ${mask}`,async({page})=>{
 await load(page,mask);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).can).toBe(true);
 await enter(page,{map:339,x:16,y:18,layer:1});
 const result=await finish(page,0x29c,0x28,11);
 expect(result,JSON.stringify(result)).toMatchObject({can:true,map:99,party:[mask&1,mask>>1&1],error:null});
 expect(await page.evaluate(()=>[mana.read8(0xcf0d),mana.read8(0xcf0e)])).toEqual([mask&1,mask>>1&1]);
});

// Goku frees the engine-room slaves with a Super Saiyan wave instead of
// sneaking. The chaos returns only captured companions and opens the fight.
async function untilRider(page){
 return page.evaluate(()=>{
  const m=mana.mod;for(let f=0;f<6000&&!(m.status.map===340&&m.canAttack);f+=20)mana.run(20,f%40?[]:[11]);
  return{map:m.status.map,can:m.canAttack,stage:mana.read8(0xcf28),captives:[mana.read8(0xcf0d),mana.read8(0xcf0e)],party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 });
}
for(const mask of[0,1,2,3])test(`Kamehameha breakout frees the hold and starts Mech Rider at once, party ${mask}`,async({page})=>{
 await load(page,mask);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 const seen=await page.evaluate(()=>{
  const m=mana.mod,sergo=m.entities().find(e=>e.active&&e.species===168);
  if(!sergo||!m.story.request(0x291,{actor:sergo.base-0xe000}))return null;
  const out={super:false,mega:false,events:new Set()};
  for(let f=0;f<6000&&!out.events.has(0x76);f++){
   // Choose KAMEHAMEHA, the second option.
   if(mana.fastForward.state(1<<11).choice){mana.run(240);mana.run(4,[7]);mana.run(16);mana.run(2,[16]);mana.run(10);}
   mana.run(1,f%20<2?[11]:[]);out.super||=m.options.superSaiyan;out.mega||=m.effects.some(e=>e.kind==='beam'&&e.mega);
   for(const id of m.story.status.recentEvents)out.events.add(id);
  }
  return{...out,events:[...out.events]};
 });
 expect(seen).toMatchObject({super:true,mega:true});
 for(const id of[0x72,0x75,0x78,0x76])expect(seen.events).toContain(id);
 expect(seen.events).not.toContain(0x293);
 const rider=await untilRider(page);
 expect(rider,JSON.stringify(rider)).toMatchObject({map:340,can:true,stage:11,captives:[mask&1,mask>>1&1],party:[mask&1,mask>>1&1],error:null});
});

test('a full-power wave fired in the hold starts the breakout without Sergo',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 await page.evaluate(()=>{mana.run(1,[4]);mana.run(100,[10,1]);mana.run(30);});
 const rider=await untilRider(page);
 expect(rider,JSON.stringify(rider)).toMatchObject({map:340,can:true,stage:11,captives:[1,1],party:[1,1],error:null});
});

test('?start=sandship enters the desert with the full party and plays into the Sandship',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM.');
 test.setTimeout(600000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=sandship');
 await page.waitForFunction(()=>window.mana?.ready&&mana.read16(0xdc)===67,{},{timeout:540000});
 const start=await page.evaluate(()=>{mana.pause();const party=[1,2].map(i=>({on:mana.read8(0xe000+i*512)&1,hp:mana.read16(0xe182+i*512),max:mana.read16(0xe184+i*512)}));
  return{party,names:mana.mod.names.status,stage:mana.read8(0xcf28),event:mana.read8(0xd0)!==0};});
 expect(start).toMatchObject({names:{1:'Primm',2:'Popoi'},stage:0,event:true});
 for(const c of start.party){expect(c.on).toBe(1);expect(c.hp).toBeLessThanOrEqual(c.max);}
 // The desert thirst scene returns control; the ship is reachable.
 const after=await page.evaluate(()=>{for(let f=0;f<3000&&!(mana.mod.canAttack&&!mana.read8(0xd0));f+=20)mana.run(20,f%40?[]:[11]);return{can:mana.mod.canAttack,map:mana.mod.status.map,error:mana.mod.story.status.error};});
 expect(after).toEqual({can:true,map:67,error:null});
 expect(errors).toEqual([]);
});
