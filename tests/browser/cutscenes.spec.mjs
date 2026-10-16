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
   // Grandpa offers a real save prompt after Sylphid. Decline it; entering
   // the file menu is a successful scene, but not the field-control check.
   if(mana.fastForward.state(1<<11).choice){mana.run(240);mana.run(4,[7]);mana.run(16);mana.run(2,[16]);mana.run(10);}
   if(frames>60&&m.canAttack&&mana.read8(0xcf00+flag)>=value)break;
  }
  return{requested,frames,maps:[...maps],flag:mana.read8(0xcf00+flag),can:m.canAttack,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],map:m.status.map,error:m.story.status.error,event:m.story.status.lastEvent};
 },{event,flag,value,npc,limit});
}
test('Goku plays along in the original goblin pot and escapes without recruiting the rescuing NPC',async({page})=>{
 await load(page,0);await enter(page,{map:133,x:16,y:19,flags:{0x0a:0,0x2e:0}});
 const result=await finish(page,0x4e8,0x2e,1);
 expect(result,JSON.stringify(result)).toMatchObject({requested:true,can:true,flag:1,party:[0,0],error:null});
 expect(result.frames).toBeLessThan(12000);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:test.info().outputPath('goblins-escaped.png')});
});

for(const mask of[0,1,2,3])test(`elemental, dragon rescue and Mana Tree scenes preserve party ${mask}`,async({page})=>{
 for(const scene of[
  {name:'Gnome',map:276,x:14,y:21,flags:{0xa8:1,0x18:1},event:0x22e,flag:0xa8,value:2,npc:144},
  {name:'Earth seed',map:276,x:14,y:17,flags:{0xa8:2,0x18:2,0x91:0},event:0x592,flag:0x91,value:1,npc:223},
  {name:'Wind elder',map:273,x:12,y:18,flags:{0x21:3},event:0x4e2,flag:0x21,value:5,npc:157},
  {name:'Flammie',map:134,x:30,y:38,flags:{0x24:5},event:0x4e4,flag:0x24,value:8,npc:181},
  {name:'Mana Tree',map:235,x:20,y:24,flags:{0x46:6},event:0x5f8,flag:0xc0,value:9},
 ]){
  await load(page,mask);await enter(page,scene);
  const limit=scene.name==='Mana Tree'?24000:12000;
  const result=await finish(page,scene.event,scene.flag,scene.value,{npc:scene.npc,limit});
  expect(result,scene.name+' '+JSON.stringify(result)).toMatchObject({requested:true,can:true,party:[mask&1,mask>>1&1],error:null});
  expect(result.frames,scene.name).toBeLessThan(limit);
  await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
  await page.locator('#screen').screenshot({path:test.info().outputPath(scene.name.replaceAll(' ','-')+'.png')});
 }
});

for(const mask of[0,1,2,3])test(`Northtown Dyluck encounter and Vampire retain party ${mask}`,async({page})=>{
 await load(page,mask);await enter(page,{map:402,x:66,y:27,flags:{0x2d:4},layer:1});
 const talk=await finish(page,0x555,0x2d,5,{npc:172});
 expect(talk,JSON.stringify(talk)).toMatchObject({requested:true,can:true,party:[mask&1,mask>>1&1],flag:5,error:null});
 // Continue up the actual stair approach, including Dyluck's walk-on
 // reminder. Event 55B then dispatches the native Vampire scene.
 const result=await page.evaluate(()=>{
  const m=mana.mod,start=m.frame;let battle=false,won=false,frames=0;m.options.superSaiyan=true;m.powerIntro.restore({flight:true,superSaiyan:true});
  for(;frames<10000;frames=m.frame-start){
   const boss=m.entities().find(e=>e.index>=3&&e.active&&e.species>=87&&e.species<128&&e.hp);
   if(!battle&&m.canAttack&&m.status.map===402)mana.run(20,[8,4]);
   else if(m.canAttack&&m.status.map===408&&boss){battle=true;m.instantTransmission();mana.run(15);mana.run(105,[10,1]);mana.run(100);}
   else mana.run(1,[11]);
   if(battle&&mana.read8(0xcf2d)>=8&&m.canAttack){won=true;break;}
  }
  return{battle,won,frames,map:m.status.map,x:m.status.x,y:m.status.y,flag:mana.read8(0xcf2d),party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 });
 expect(result,JSON.stringify(result)).toMatchObject({battle:true,won:true,flag:8,map:402,party:[mask&1,mask>>1&1],error:null});
});

test('an old Northtown checkpoint with captive Primm still completes her native rescue',async({page})=>{
 await load(page,2);await enter(page,{map:408,x:14,y:26,flags:{0x2d:5,0x0d:8},layer:1});
 const result=await finish(page,0x558,0x2d,7);
 expect(result,JSON.stringify(result)).toMatchObject({requested:true,can:true,flag:7,map:408,party:[1,1],error:null});
 expect(await page.evaluate(()=>mana.mod.entities().some(e=>e.active&&e.species===98&&e.hp>0))).toBe(true);
});

// Popoi's kitchen scenes alone raise CF28 to 7. Without a captive Primm
// ($CF0D=8) the cabin must take the authored boarding scene, not the retail
// rescue that ends with ADD_CHARACTER for Primm.
test('the Sandship cabin never recruits a Primm who was not captured',async({page})=>{
 await load(page,2);await enter(page,{map:339,x:16,y:18,flags:{0x28:7,0x0d:0,0x0e:1}});
 const result=await finish(page,0x29c,0x28,10);
 expect(result,JSON.stringify(result)).toMatchObject({requested:true,can:true,party:[0,1],error:null});
 expect(await page.evaluate(()=>mana.read8(0xcf0d))).toBe(0);
});
