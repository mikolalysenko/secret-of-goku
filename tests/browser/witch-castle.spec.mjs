import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
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
  // Absent companions leave through the cartridge's REMOVE_CHARACTER.
  const bytes=[];for(let i=0;i<2;i++)if(!(mask>>i&1))bytes.push(0x2c,i+1);
  if(bytes.length){
   bytes.push(0);const cart=mana.snes.cart.data,table=0x90000+0x98*2,pointer=cart.slice(table,table+2),code=cart.slice(0x9f300,0x9f300+bytes.length);
   try{cart.set([0,0xf3],table);cart.set(bytes,0x9f300);if(!mana.mod.story.request(0x98))throw Error('Cannot prepare party');mana.run(120);}
   finally{cart.set(pointer,table);cart.set(code,0x9f300);}
  }
 },{state:JSON.parse(readFileSync(fixture)),mask});
}
// Elinee's throne room (309, walk-on 1E7) is the only way into Spikey
// Tiger's arena (310), which has no exit and holds the boss only at CF17
// stage 5. Retail arrives at 3, after Elinee's first scene; 0, 1 and 2 are
// arrivals that skipped the gate, the jailed soldiers or that scene. 1E7 sets
// each retail stage, so every arrival meets a live Spikey Tiger.
for(const [name,mask,stage] of[
 ['in retail order, with the full party',3,3],
 ['past the gate stage, alone',0,0],
 ['past the jailed soldiers, with the girl',1,1],
 ['past Elinee\'s first scene, with the sprite',2,2],
])test(`Elinee's throne room ${name}: Spikey Tiger fights, then Elinee yields`,async({page},info)=>{
 await load(page,mask);
 const scene=await page.evaluate(({stage})=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n);
  for(const[k,v]of Object.entries({0x17:stage,0x18:0,0xd8:0,0xd9:0}))mana.write8(0xcf00+Number(k),v);
  const travelled=m.story.travel(0x130);let elinee=-1;
  for(let f=0;f<9000&&m.status.map!==310;f+=10){
   if(elinee<0&&m.status.map===309&&m.entities().some(e=>e.active&&e.species===0xba))elinee=flag(0x17);
   mana.run(10,[11]);
  }
  return{travelled,elinee,map:m.status.map,arena:flag(0x17),entered:m.story.status.recentEvents.includes(0x1e7),party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 },{stage});
 expect(scene,JSON.stringify(scene)).toMatchObject({travelled:true,map:310,arena:5,entered:true,party:[mask&1,mask>>1&1],error:null});
 expect(scene.elinee,'Elinee stands in her throne room for the scene').toBeGreaterThanOrEqual(3);expect(scene.elinee).toBeLessThanOrEqual(4);
 // Spikey Tiger is created and drawn: visible PPU OAM entries in enemy
 // palettes (Goku and the HUD use 0-3) around its screen position, lit.
 const boss=await page.evaluate(()=>{
  const m=mana.mod,p=mana.snes.ppu,find=()=>m.entities().find(e=>e.active&&e.species===0x5b);
  const drawn=b=>{const slots=[];for(let i=0;i<128;i++){
   const at=i*2,y=p.oam[at]>>8;let x=p.oam[at]&255;if(p.highOam[at>>4]>>(at&15)&1)x-=256;
   if(y<224&&(p.oam[at+1]>>9&7)>=4&&Math.abs(x-b.screenX)<=64&&y>=b.screenY-80&&y<=b.screenY+16)slots.push(i);
  }return slots;};
  let slots=[];
  for(let i=0;i<120;i++){const b=find();if(b&&!p.forcedBlank&&p.brightness>=15&&m.canAttack&&(slots=drawn(b)).length>=4)break;mana.run(5);}
  return{boss:find()??null,slots,lit:!p.forcedBlank&&p.brightness>=15,can:m.canAttack};
 });
 expect(boss.boss,JSON.stringify(boss)).toBeTruthy();
 expect(boss.boss.hp).toBe(boss.boss.maxHp);expect(boss.boss.hp).toBeGreaterThan(0);
 expect(boss.slots.length,JSON.stringify(boss)).toBeGreaterThanOrEqual(4);expect(boss.lit).toBe(true);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:info.outputPath('spikey.png')});
 // Instant Transmission when it is far, punches when close, until its defeat
 // event (1E2) returns Goku to the throne room at stage 6.
 const fight=await page.evaluate(()=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n),find=()=>m.entities().find(e=>e.active&&e.species===0x5b),full=find().maxHp;
  let hurt=null,frames=0;
  for(;frames<20000&&!(m.status.map===309&&flag(0x17)>=6&&m.canAttack);){
   const b=find();
   if(b&&b.hp>0&&m.canAttack){
    const dx=b.x-m.status.x,dy=b.y-m.status.y,dir=Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4;
    if(Math.hypot(dx,dy)>40){mana.run(2,[10,0]);mana.run(30);frames+=32;}
    else{mana.run(2,[dir]);mana.run(2,[0]);mana.run(2);frames+=6;}
   }else{mana.run(10,[11]);frames+=10;}
   const now=find();if(hurt===null&&now&&now.hp<full)hurt=now.hp;if(hurt===null&&!now)hurt=0;
  }
  return{hurt,full,frames,map:m.status.map,stage:flag(0x17),can:m.canAttack,error:m.story.status.error};
 });
 expect(fight.hurt,JSON.stringify(fight)).not.toBeNull();expect(fight.hurt).toBeLessThan(fight.full);
 expect(fight,JSON.stringify(fight)).toMatchObject({map:309,stage:6,can:true,error:null});
 // The story continues: Elinee, beaten, yields in the room before (1E3 ->
 // 1ED: stage 7 and her two chests).
 const surrender=await page.evaluate(()=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n),actor=species=>m.entities().find(e=>e.active&&e.species===species);
  const until=(done,limit=12000)=>{let f=0;for(;f<limit&&!done();f+=20)mana.run(20,[11]);return done();};
  m.story.travel(0x12e);
  const arrived=until(()=>m.status.map===306&&m.canAttack&&!!actor(0xba),3000);
  mana.run(30);const elinee=actor(0xba);
  const asked=!!elinee&&m.story.request(0x1e3,{actor:elinee.base-0xe000});
  const yielded=until(()=>flag(0x17)>=7&&m.canAttack);
  return{arrived,asked,yielded,stage:flag(0x17),chests:[flag(0xd8),flag(0xd9)],map:m.status.map,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 });
 writeFileSync(info.outputPath('witch-castle.json'),JSON.stringify({scene,boss,fight,surrender},null,2));
 expect(surrender,JSON.stringify(surrender)).toMatchObject({arrived:true,asked:true,yielded:true,stage:7,chests:[1,1],map:306,party:[mask&1,mask>>1&1],error:null});
});
