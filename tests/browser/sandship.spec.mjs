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
   wreck:!!s.wreck,flash:s.flash,songs:s.songs,song:s.lastSong,guards:m.entities().filter(e=>e.active&&[182,183].includes(e.species)).length,monsters:s.monsters,error:m.story.status.error};
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
 // Wrecking the ship gives Goku back the Gi the capture stowed.
 expect(await page.evaluate(()=>[mana.read8(0xe1e1),[...mana.snes.ram.slice(0xcc2c,0xcc38)].includes(0x56)])).toEqual([0x16,true]);
 expect(wrecked,JSON.stringify(wrecked)).toMatchObject({map:271,can:true,wreck:true,flash:0,guards:0,captives:[mask&1?8:0,mask&2?8:0],party:[0,0],error:null});
 expect(wrecked.monsters).toBeGreaterThan(0);
 // The wreck plays the boss battle theme in place of the ship's own song.
 expect(wrecked.songs).toBeGreaterThan(0);
 expect(wrecked.song).toBe(0x04);
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

test('in the wreck, flight crosses inner bulkheads, doors work from any side and punches open walls',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 // Flight passes over the ship walls before the breakout as well.
 const before=await page.evaluate(()=>{mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(2);mana.run(14,[8,7]);return{x:mana.read16(0xe002),cut:!!mana.mod.sandship.status.cut};});
 expect(before.x).toBeGreaterThan(200);expect(before.cut).toBe(false);
 await page.evaluate(()=>{mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(40);mana.run(1,[4]);mana.run(100,[10,1]);mana.run(30);});
 expect((await untilControl(page)).wreck).toBe(true);
 const r=await page.evaluate(()=>{
  const ram=mana.snes.ram,solid=()=>{let n=0;for(let ty=0;ty<30;ty++)for(let tx=0;tx<30;tx++)n+=(ram[0x1b800+ram[0x10000+ty*128+tx]*4]&7)===3;return n;};
  // Cross the inner bulkheads, staying inside the hull. Crossing its outer
  // boundary now blows up the ship; the separate escape test covers that.
  mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(2);
  // The returned Heavy Gi slows Goku: stop at the inner wall's far side,
  // rather than assuming the pre-breakout speed for a fixed frame count.
  for(let f=0;f<60&&mana.read16(0xe002)<216;f++)mana.run(1,[8,7]);
  const flew=mana.read16(0xe002);mana.run(30);
  // A plain punch at a bulkhead opens it.
  const walls=solid();mana.write16(0xe002,72);mana.write16(0xe004,152);mana.run(2);mana.run(2,[7]);mana.run(10);
  for(let i=0;i<4;i++){mana.run(2,[0]);mana.run(14);}mana.run(60);
  return{flew,map:mana.read16(0xdc),opened:walls-solid(),cut:!!mana.mod.sandship.status.cut};
 });
 expect(r.flew,JSON.stringify(r)).toBeGreaterThanOrEqual(216);expect(r.map).toBe(271);expect(r.opened).toBeGreaterThan(0);expect(r.cut).toBe(false);
 // Flying sideways onto the deck hatch still takes it below.
 await enter(page,{map:99,x:27,y:12});
 const hatch=await page.evaluate(()=>{for(let f=0;f<60&&mana.read16(0xdc)===99;f++)mana.run(1,[8,7]);mana.run(200);return mana.read16(0xdc);});
 expect(hatch).toBe(271);
});

// Run to the Mech Rider arena, then stand in for its defeat (2A1 is the
// event the fight itself runs) and play on to the dunes.
// Equipped head/body/accessory/weapon of Goku, the girl and the sprite,
// and the Gi's armor-ring entry with its wearer bits.
const gear=page=>page.evaluate(()=>({slots:[0xe000,0xe200,0xe400].map(b=>Array.from(mana.snes.ram.slice(b+0x1e0,b+0x1e4))),ring:Array.from(mana.snes.ram.slice(0xcc2c,0xcc38))}));
async function riderThenEnding(page){
 return page.evaluate(()=>{
  const m=mana.mod,party=()=>[mana.read8(0xe200)&1,mana.read8(0xe400)&1];
  // Fast-forward stops at choices: answer the boarding prompt with B (Yes).
  const pulse=f=>mana.fastForward.state(1<<11).choice?(f%20<2?[0]:[]):mana.read8(0xd0)?[11]:[];
  for(let f=0;f<9000&&!(m.status.map===340&&m.canAttack&&!mana.read8(0xd0));f++)mana.run(1,pulse(f));
  const fight={map:m.status.map,can:m.canAttack,party:party(),stage:mana.read8(0xcf28)};
  m.story.request(0x2a1);
  for(let f=0;f<6000;f++){mana.run(1,mana.read8(0xd0)?[11]:[]);if(f>120&&m.status.map===91&&m.canAttack&&!mana.read8(0xd0))break;}
  return{fight,map:m.status.map,can:m.canAttack,party:party(),captives:[mana.read8(0xcf0d),mana.read8(0xcf0e)],stage:mana.read8(0xcf28),wreck:!!m.sandship.status.wreck,ending:m.sandship.status.ending,events:m.story.status.recentEvents,error:m.story.status.error};
 });
}
test('the roof takeoff off an unfinished ship blows it up into the Mech Rider, then the reunion',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 await enter(page,{map:99,x:30,y:11});
 // L+R takeoff no longer punches out through the roof.
 const boom=await page.evaluate(()=>{
  const m=mana.mod,said=new Set();mana.run(3,[10,11]);let white=0;
  for(let f=0;f<400;f++){mana.run(1);white=Math.max(white,m.sandship.status.flash);const t=m.radio?.status.current?.text;if(t)said.add(t);}
  return{white,said:[...said],ending:m.sandship.status.ending,wreck:!!m.sandship.status.wreck,ceiling:!!m.ceiling?.busy,maps:m.status.map};
 });
 expect(boom).toMatchObject({white:1,ending:'crash',wreck:true,ceiling:false});
 expect(boom.said.some(t=>t.includes('broke the whole ship'))).toBe(true);
 const r=await riderThenEnding(page);
 expect(r.fight).toEqual({map:340,can:true,party:[0,0],stage:11});
 expect(r,JSON.stringify(r)).toMatchObject({map:91,can:true,party:[1,1],captives:[1,1],stage:12,wreck:false,ending:null,error:null});
 for(const id of[0x7d,0x29e,0x2a1])expect(r.events).toContain(id);
});

test('flying out past the hull blows the ship up; flying over its walls does not',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 const r=await page.evaluate(()=>{
  const m=mana.mod,w=a=>mana.read16(a);
  // Across the hold's inner walls (4 tiles at most from its floor): fine.
  mana.write16(0xe002,136);mana.write16(0xe004,210);mana.run(2);mana.run(14,[8,7]);mana.run(10);
  const over={x:w(0xe002),cut:!!m.sandship.status.cut,escaped:m.sandship.status.escaped};
  // On out into the void beyond the hull.
  mana.run(70,[8,7]);let white=0;for(let f=0;f<300;f++){mana.run(1);white=Math.max(white,m.sandship.status.flash);}
  return{over,x:w(0xe002),white,ending:m.sandship.status.ending};
 });
 expect(r.over).toMatchObject({cut:false,escaped:false});expect(r.over.x).toBeGreaterThan(200);
 expect(r).toMatchObject({white:1,ending:'crash'});
});

test('Instant Transmission to a foe on the wreck stairs lands at their foot, and the stairs climb normally',async({page})=>{
 await load(page,3);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 await page.evaluate(()=>{mana.run(1,[4]);mana.run(100,[10,1]);mana.run(30);});
 expect((await untilControl(page)).wreck).toBe(true);
 const r=await page.evaluate(()=>{
  const m=mana.mod,w=a=>mana.read16(a),foe=m.entities().find(e=>e.index>=3&&e.active&&e.species<128&&e.hp);
  // The hold's stairs (tiles 14-15, rows 14-17) climb to the deck.
  mana.write16(foe.base+2,14*16+8);mana.write16(foe.base+4,16*16+8);mana.run(2);
  mana.run(2,[10,0]);mana.run(30);
  const at={x:w(0xe002)>>4,y:w(0xe004)>>4},tile=m.localFlightHook.tileAt(w(0xe002),w(0xe004));
  // Move the foe aside, then walk up the stairs.
  mana.write16(foe.base+2,8*16);mana.write16(foe.base+4,8*16);
  for(let f=0;f<120&&m.status.map===271;f++)mana.run(1,[4]);
  return{at,stair:(tile.code&0xf0)===0x20,door:!!(tile.behavior&0x80),height:mana.read8(0xe00b)&3,map:m.status.map};
 });
 expect(r.stair).toBe(false);expect(r.door).toBe(false);
 expect(r.at.x).toBeGreaterThanOrEqual(13);expect(r.at.x).toBeLessThanOrEqual(16);expect(r.at.y).toBeGreaterThanOrEqual(18);
 expect(r.map).toBe(99);
});

test('breaking bulkheads while still sneaking crashes the ship into the Mech Rider fight, then everyone reunites',async({page})=>{
 // Primm was aboard and is held in the cabin; Popoi never joined.
 await load(page,1);await enter(page,{map:91,x:24,y:24,flags:{0x28:0,0x36:1}});
 const before=await gear(page);
 expect((await finish(page,0x28b,0x28,1)).map).toBe(271);
 // The capture stows Goku's Gi.
 expect((await gear(page)).slots[0][1]).not.toBe(before.slots[0][1]);
 const broke=await page.evaluate(()=>{
  const m=mana.mod,said=new Set();
  // A real punch opens a hold bulkhead before any breakout, and counts.
  mana.write16(0xe002,72);mana.write16(0xe004,152);mana.run(30);mana.run(2,[7]);mana.run(8);
  for(let k=0;k<4;k++){mana.run(2,[0]);mana.run(14);}mana.run(60);
  const first=m.sandship.status.breaks;
  for(let i=0;i<4;i++){m.sandship.onDemolish({tiles:[{tx:1,ty:1,demolition:true}]});for(let f=0;f<50;f++){mana.run(1);const t=m.radio?.status.current?.text;if(t)said.add(t);}}
  let white=0;for(let f=0;f<400;f++){mana.run(1);white=Math.max(white,m.sandship.status.flash);}
  return{first,white,said:[...said],ending:m.sandship.status.ending,wreck:!!m.sandship.status.wreck};
 });
 expect(broke).toMatchObject({first:1,white:1,ending:'crash',wreck:true});
 expect(broke.said.some(t=>t.includes('STOP'))).toBe(true);
 const r=await riderThenEnding(page);
 // Goku fights alone; the dunes bring back Primm, and only Primm.
 expect(r.fight).toEqual({map:340,can:true,party:[0,0],stage:11});
 expect(r,JSON.stringify(r)).toMatchObject({map:91,can:true,party:[1,0],captives:[1,0],stage:12,wreck:false,ending:null,error:null});
 for(const id of[0x7d,0x29e,0x2a1])expect(r.events).toContain(id);
 // Everyone has exactly their own equipment back, the Gi included.
 const after=await gear(page);
 expect(after.slots.slice(0,2)).toEqual(before.slots.slice(0,2));expect(after.ring).toEqual(before.ring);
 // The dunes are a closed basin. Flight crosses the wreckage, and takeoff
 // leaves through Kakkara with the next story stage and its hint.
 const left=await page.evaluate(()=>{
  const m=mana.mod,said=new Set();
  mana.write16(0xe002,17*16+8);mana.write16(0xe004,21*16+8);mana.run(4);const x0=mana.read16(0xe002);mana.run(20,[8,7]);const x1=mana.read16(0xe002);mana.run(30);
  const ok=m.requestFlight();for(let f=0;f<900;f++){mana.run(1);const t=m.radio?.status.current?.text;if(t)said.add(t);}
  return{crossed:x1-x0,ok,map:m.status.map,world:m.worldFlight,stage:mana.read8(0xcf28),said:[...said]};
 });
 expect(left).toMatchObject({ok:true,map:89,world:true,stage:14});
 expect(left.crossed).toBeGreaterThan(100);
 expect(left.said.some(t=>t.includes('Fire Palace'))).toBe(true);
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
