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
// Gnome's scene (23B -> 236) adds three stages to CF18 before its door to
// arena 495, whose only Fire Gigas record needs stage 5 and which has no
// exit. Goku reaches the stage room (314, door ED) at the orb's stage 2, at
// the palace floor 1 when he flew over the orb room's gap, or at 0 after an
// early breach of the Dwarf Village wall (CF14 6) before the Elder's stage.
for(const [name,mask,stage,flags] of[
 ['the orb used, full party',3,2,{}],
 ['the orb room gap flown over, alone',0,1,{}],
 ['the orb room gap flown over, with the girl',1,1,{}],
 ['the orb room gap flown over, with the sprite',2,1,{}],
 ['an early wall breach, alone',0,0,{0x14:6}],
])test(`Earth Palace, ${name}: Gnome's scene leads to a live Fire Gigas, then Gnome and the seed`,async({page},info)=>{
 await load(page,mask);
 const scene=await page.evaluate(({stage,flags})=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n);
  for(const[k,v]of Object.entries({...flags,0x18:stage,0x91:0,0xa8:0}))mana.write8(0xcf00+Number(k),v);
  const travelled=m.story.travel(0xed);let frames=0;
  while(m.status.map!==314&&frames<600){mana.run(1);frames++;}
  const entered=flag(0x18);let gnome=-1;
  for(;frames<9000&&m.status.map!==495;frames+=10){
   if(gnome<0&&m.status.map===314&&m.entities().some(e=>e.active&&e.species===0x90))gnome=flag(0x18);
   mana.run(10,[11]);
  }
  return{travelled,entered,gnome,map:m.status.map,arena:flag(0x18),party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 },{stage,flags});
 expect(scene,JSON.stringify(scene)).toMatchObject({travelled:true,entered:2,gnome:3,map:495,arena:5,party:[mask&1,mask>>1&1],error:null});
 // Fire Gigas is created and drawn: visible PPU OAM entries in its picture's
 // box (up to 80 px above its screen position; Goku stands below), lit.
 const boss=await page.evaluate(()=>{
  const m=mana.mod,p=mana.snes.ppu,find=()=>m.entities().find(e=>e.active&&e.species===0x74);
  for(let i=0;i<120&&!(find()&&!p.forcedBlank&&p.brightness>=15&&m.canAttack);i++)mana.run(5);
  mana.run(2);const boss=find(),slots=[];
  if(boss)for(let i=0;i<128;i++){
   const at=i*2,y=p.oam[at]>>8;let x=p.oam[at]&255;if(p.highOam[at>>4]>>(at&15)&1)x-=256;
   if(y<224&&x>=boss.screenX-48&&x<=boss.screenX+40&&y>=boss.screenY-80&&y<boss.screenY-4)slots.push(i);
  }
  return{boss:boss??null,slots,lit:!p.forcedBlank&&p.brightness>=15,can:m.canAttack};
 });
 expect(boss.boss,JSON.stringify(boss)).toBeTruthy();
 expect(boss.boss.hp).toBe(boss.boss.maxHp);expect(boss.boss.hp).toBeGreaterThan(0);
 expect(boss.slots.length,JSON.stringify(boss)).toBeGreaterThanOrEqual(4);expect(boss.lit).toBe(true);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:info.outputPath('fire-gigas.png')});
 // Punches hurt it; keep punching until its defeat event returns Goku to
 // the stage room with Gnome freed.
 const fight=await page.evaluate(()=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n),find=()=>m.entities().find(e=>e.active&&e.species===0x74),full=find().maxHp;
  let hurt=null,frames=0;
  for(;frames<12000&&!(m.status.map===314&&flag(0x18)>=6&&m.canAttack);frames+=6){
   const boss=find();
   if(boss&&boss.hp>0&&m.canAttack){
    if(hurt===null&&boss.hp<full)hurt=boss.hp;
    const dx=boss.x-m.status.x,dy=boss.y-m.status.y;
    if(Math.hypot(dx,dy)>40)mana.run(4,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);
    else{mana.run(2,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);mana.run(2,[0]);mana.run(2);}
   }else{if(hurt===null&&boss&&boss.hp<full)hurt=boss.hp;mana.run(6,[11]);}
  }
  return{hurt,full,frames,map:m.status.map,stage:flag(0x18),gnome:flag(0xa8),can:m.canAttack,error:m.story.status.error};
 });
 expect(fight.hurt,JSON.stringify(fight)).not.toBeNull();expect(fight.hurt).toBeLessThan(fight.full);
 expect(fight,JSON.stringify(fight)).toMatchObject({map:314,stage:6,gnome:1,can:true,error:null});
 // The story continues: Gnome's thanks (22E) and the Earth seed (58B -> 592).
 const story=await page.evaluate(()=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n),actor=species=>m.entities().find(e=>e.active&&e.species===species);
  const until=(done,limit=12000)=>{let f=0;for(;f<limit&&!done();f+=20)mana.run(20,[11]);return done();};
  m.story.travel(0x136);
  const arrived=until(()=>m.status.map===276&&m.canAttack&&!!actor(0x90),3000);
  const gnome=actor(0x90);
  const asked=!!gnome&&m.story.request(0x22e,{actor:gnome.base-0xe000});
  const thanked=until(()=>flag(0xa8)>=2&&m.canAttack);const stageThanks=flag(0x18);
  mana.run(30);const seed=actor(0xdf);
  const touched=!!seed&&m.story.request(0x58b,{actor:seed.base-0xe000});
  const seeded=until(()=>flag(0x91)===1&&flag(0x18)>=8&&m.canAttack);
  return{arrived,asked,thanked,stageThanks,touched,seeded,stage:flag(0x18),seedFlag:flag(0x91),earth:!!(m.quest.status.mask&2),earned:!!(m.quest.status.seedMask&2),
   entered:m.story.status.recentEvents,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 });
 writeFileSync(info.outputPath('earth-palace.json'),JSON.stringify({scene,boss,fight,story},null,2));
 expect(story,JSON.stringify(story)).toMatchObject({arrived:true,asked:true,thanked:true,stageThanks:7,touched:true,seeded:true,stage:8,seedFlag:1,earth:true,earned:true,party:[mask&1,mask>>1&1],error:null});
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:info.outputPath('earth-seed.png')});
});

// The Dwarf Village quake (1BE, on entering the village at CF15 5) is the
// only way into Tropicallo's arena (290), which holds the boss only through
// stage 3 of CF14 and has no exit. An early breach of the palace wall sets
// CF14 6 and buying Watts's axe afterwards 7, before the quake on that route.
// Popoi has not joined yet; the native naming screen gets a letter and Start.
for(const [name,mask,stage,earth] of[
 ['before any breach, with the girl',1,2,0],
 ['after an early wall breach, alone',0,6,0],
 ['after the breach, Watts\'s axe and the whole palace, with the girl',1,7,8],
])test(`Dwarf Village quake ${name}: Tropicallo fights, then Popoi joins`,async({page},info)=>{
 await load(page,mask);
 const quake=await page.evaluate(({stage,earth})=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n);
  m.options.superSaiyan=true;m.powerIntro.restore({flight:true,superSaiyan:true});
  for(const[k,v]of Object.entries({0x14:stage,0x15:5,0x60:0,0x18:earth}))mana.write8(0xcf00+Number(k),v);
  const travelled=m.story.travel(0x149);
  for(let f=0;f<6000&&!(m.status.map===290&&m.canAttack);f+=10)mana.run(10,[11]);
  return{travelled,map:m.status.map,stage:flag(0x14),boss:m.entities().find(e=>e.active&&e.species===0x59)??null,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:m.story.status.error};
 },{stage,earth});
 expect(quake,JSON.stringify(quake)).toMatchObject({travelled:true,map:290,stage:3,party:[mask&1,0],error:null});
 expect(quake.boss,JSON.stringify(quake)).toBeTruthy();expect(quake.boss.hp).toBe(quake.boss.maxHp);
 // Charged waves (Instant Transmission first when it is far) until its
 // defeat event (1B9) hands control back with the sprite and the Elder.
 const fight=await page.evaluate(()=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n),find=()=>m.entities().find(e=>e.active&&e.species===0x59),full=find().maxHp;
  let hurt=null,frames=0;
  for(;frames<20000&&!(m.canAttack&&flag(0x14)>=4&&m.entities().some(e=>e.active&&e.species===0x8c));){
   const boss=find();
   if(boss&&boss.hp>0&&m.canAttack){
    const dx=boss.x-m.status.x,dy=boss.y-m.status.y;
    if(Math.hypot(dx,dy)>180){mana.run(2,[10,0]);mana.run(35);frames+=37;continue;}
    mana.run(3,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);mana.run(60,[10,1]);mana.run(1);mana.run(100);frames+=164;
   }else if(mana.fastForward.state(1<<11).choice){mana.run(60);mana.run(2,[0]);mana.run(20);frames+=82;}
   else{mana.run(10,[11]);frames+=10;}
   const now=find();if(hurt===null&&now&&now.hp<full)hurt=now.hp;if(hurt===null&&!now)hurt=0;
  }
  return{hurt,full,frames,stage:flag(0x14),can:m.canAttack,map:m.status.map,error:m.story.status.error};
 });
 expect(fight.hurt,JSON.stringify(fight)).not.toBeNull();expect(fight.hurt).toBeLessThan(fight.full);
 expect(fight,JSON.stringify(fight)).toMatchObject({stage:4,can:true,map:290,error:null});
 const joined=await page.evaluate(()=>{
  const m=mana.mod,flag=n=>mana.read8(0xcf00+n),actor=species=>m.entities().find(e=>e.active&&e.species===species);
  const until=(done,limit=12000)=>{
   for(let f=0;f<limit&&!done();f+=10){
    if(mana.fastForward.state(1<<11).choice){mana.run(60);mana.run(2,[0]);mana.run(20);continue;}
    // The naming screen waits for a name and Start.
    if(f%300===290&&mana.read8(0xd0)===1){if(!mana.read8(0xa1cc)){mana.run(2,[0]);mana.run(12);}mana.run(2,[3]);mana.run(20);mana.run(2,[0]);mana.run(60);}
    mana.run(10,[11]);
   }
   return done();
  };
  const sprite=actor(0x8c),asked=!!sprite&&m.story.request(0x1d3,{actor:sprite.base-0xe000});
  const named=until(()=>flag(0x14)>=6&&m.canAttack);
  const stage=flag(0x14),popoi=mana.read8(0xe400)&1;
  const elder=actor(0x9b),told=!!elder&&m.story.request(0x1d4,{actor:elder.base-0xe000});
  const left=until(()=>m.status.map!==290&&m.canAttack);
  return{asked,named,stage,popoi,told,left,map:m.status.map,earth:flag(0x18),error:m.story.status.error};
 });
 writeFileSync(info.outputPath('tropicallo.json'),JSON.stringify({quake,fight,joined},null,2));
 expect(joined,JSON.stringify(joined)).toMatchObject({asked:true,named:true,stage:6,popoi:1,told:true,left:true,map:287,earth:earth+1,error:null});
});
