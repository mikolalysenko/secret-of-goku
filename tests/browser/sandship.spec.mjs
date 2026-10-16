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

// Goku frees the engine-room slaves with a wave the player fires himself.
// The white-out returns the hold as a wreck: guards gone, desert monsters
// in, nobody rejoined. Each captive is fetched before Geshtar's Mech Rider.
async function untilControl(page){
 return page.evaluate(()=>{
  // Hold R: fast-forward pulses B itself, whatever the frame parity.
  const m=mana.mod;for(let f=0;f<6000;f++){mana.run(1,mana.read8(0xd0)?[11]:[]);if(f>120&&m.canAttack&&!mana.read8(0xd0)&&!m.sandship.status.cut)break;}
  const s=m.sandship.status;
  return{map:m.status.map,can:m.canAttack,stage:mana.read8(0xcf28),captives:[mana.read8(0xcf0d),mana.read8(0xcf0e)],party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],
   wreck:!!s.wreck,flash:s.flash,songs:s.songs,guards:m.entities().filter(e=>e.active&&[182,183].includes(e.species)).length,monsters:s.monsters,error:m.story.status.error};
 });
}
// Walk through a real door, then let any scene that starts play out.
async function walkThrough(page,dir){
 return page.evaluate(dir=>{
  const m=mana.mod,from=m.status.map;
  for(let f=0;f<120&&m.status.map===from;f++)mana.run(1,[dir]);
  for(let f=0;f<6000;f++){mana.run(1,mana.read8(0xd0)?[11]:[]);if(f>120&&m.canAttack&&!mana.read8(0xd0))break;}
  return{map:m.status.map,can:m.canAttack,captives:[mana.read8(0xcf0d),mana.read8(0xcf0e)],error:m.story.status.error};
 },dir);
}
async function wreckAndEscape(page,mask){
 const wrecked=await untilControl(page);
 expect(wrecked,JSON.stringify(wrecked)).toMatchObject({map:271,can:true,wreck:true,flash:0,guards:0,captives:[mask&1?8:0,mask&2?8:0],party:[0,0],error:null});
 expect(wrecked.monsters).toBeGreaterThan(0);
 // The wreck plays the crisis cue in place of the ship's own song.
 expect(wrecked.songs).toBeGreaterThan(0);
 // Each rescue starts by just walking into the room, no talking needed.
 if(mask&2){await enter(page,{map:318,x:28,y:46});expect(await walkThrough(page,4)).toMatchObject({map:319,can:true,captives:[mask&1?8:0,1],error:null});}
 await enter(page,{map:324,x:16,y:10});
 expect(await page.evaluate(()=>mana.mod.entities().filter(e=>e.active&&e.species===183).length)).toBe(0);
 if(mask&1)expect(await walkThrough(page,4)).toMatchObject({map:339,can:true,captives:[1,mask>>1&1],error:null});
 expect(await page.evaluate(()=>[mana.read8(0xcf0d),mana.read8(0xcf0e),mana.read8(0xe200)&1,mana.read8(0xe400)&1])).toEqual([mask&1,mask>>1&1,mask&1,mask>>1&1]);
 await enter(page,{map:99,x:24,y:27});
 return page.evaluate(()=>{
  const m=mana.mod;for(let f=0;f<8000&&!(m.status.map===340&&m.canAttack);f+=20)mana.run(20,f%40?[]:[11]);
  return{map:m.status.map,can:m.canAttack,stage:mana.read8(0xcf28),party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 });
}
for(const mask of[0,1,2,3])test(`Kamehameha breakout wrecks the ship and each captive is rescued before Mech Rider, party ${mask}`,async({page})=>{
 await load(page,mask);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 const armed=await page.evaluate(()=>{
  const m=mana.mod,sergo=m.entities().find(e=>e.active&&e.species===168);
  if(!sergo||!m.story.request(0x291,{actor:sergo.base-0xe000}))return null;
  for(let f=0;f<6000;f++){
   // Choose KAMEHAMEHA, the second option.
   if(mana.fastForward.state(1<<11).choice){mana.run(240);mana.run(4,[7]);mana.run(16);mana.run(2,[16]);mana.run(10);}
   mana.run(1,f%20<2?[11]:[]);if(m.sandship.status.armed&&m.canAttack&&!mana.read8(0xd0))break;
  }
  // Nothing fires by itself: no transformation, no beam.
  mana.run(120);
  return{armed:m.sandship.status.armed,super:m.options.superSaiyan,beam:m.effects.some(e=>e.kind==='beam'),events:m.story.status.recentEvents};
 });
 expect(armed).toMatchObject({armed:true,super:false,beam:false});
 for(const id of[0x72,0x75])expect(armed.events).toContain(id);
 // The player charges L+Y to full power and releases.
 const white=await page.evaluate(()=>{mana.run(2,[5]);mana.run(100,[10,1]);let max=0;for(let f=0;f<60;f++){mana.run(1);max=Math.max(max,mana.mod.sandship.status.flash);}return max;});
 expect(white).toBe(1);
 const rider=await wreckAndEscape(page,mask);
 expect(rider,JSON.stringify(rider)).toMatchObject({map:340,can:true,stage:11,party:[mask&1,mask>>1&1],error:null});
});

test('a full-power wave fired in the hold wrecks the ship without Sergo',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 await page.evaluate(()=>{mana.run(1,[4]);mana.run(100,[10,1]);mana.run(30);});
 const rider=await wreckAndEscape(page,3);
 expect(rider,JSON.stringify(rider)).toMatchObject({map:340,can:true,stage:11,party:[1,1],error:null});
});

test('in the wreck, flight crosses every wall, doors work from any side and punches open bulkheads',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 // Flight passes over the ship walls before the breakout as well.
 const before=await page.evaluate(()=>{mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(2);mana.run(80,[8,7]);return mana.read16(0xe002);});
 expect(before).toBeGreaterThan(300);
 await page.evaluate(()=>{mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(40);mana.run(1,[4]);mana.run(100,[10,1]);mana.run(30);});
 expect((await untilControl(page)).wreck).toBe(true);
 const r=await page.evaluate(()=>{
  const ram=mana.snes.ram,solid=()=>{let n=0;for(let ty=0;ty<30;ty++)for(let tx=0;tx<30;tx++)n+=(ram[0x1b800+ram[0x10000+ty*128+tx]*4]&7)===3;return n;};
  // Fly right from the hold floor across the bulkheads into the far hull.
  mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(2);mana.run(80,[8,7]);const flew=mana.read16(0xe002);mana.run(30);
  // A plain punch at a bulkhead opens it.
  const walls=solid();mana.write16(0xe002,72);mana.write16(0xe004,152);mana.run(2);mana.run(2,[7]);mana.run(10);
  for(let i=0;i<4;i++){mana.run(2,[0]);mana.run(14);}mana.run(60);
  return{flew,map:mana.read16(0xdc),opened:walls-solid()};
 });
 expect(r.flew).toBeGreaterThan(440);expect(r.map).toBe(271);expect(r.opened).toBeGreaterThan(0);
 // Flying sideways onto the deck hatch still takes it below.
 await enter(page,{map:99,x:27,y:12});
 const hatch=await page.evaluate(()=>{for(let f=0;f<60&&mana.read16(0xdc)===99;f++)mana.run(1,[8,7]);mana.run(200);return mana.read16(0xdc);});
 expect(hatch).toBe(271);
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
