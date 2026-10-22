import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

// Decorative cave stalagmites (engine/cave-stalagmites.js) through the real
// controller: punch and charged Kamehameha, collision, re-entering the map.
async function load(page){
 const fixture='.local/graphics-audit/party.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(fixture)));
}
// The QA door loader: a native door to (x, y) of the map, enemies hidden.
async function enter(page,map,x,y){
 await page.evaluate(({map,x,y})=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),word=a=>c[a]|c[a+1]<<8;
  const start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2,0],0x8300c);for(let at=start+8;at<end;at+=8)if(c[at+5]<0x80){c[at]=0;c[at+1]=0xff;}
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}
  finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,start);}
  const m=mana.mod;for(let n=0;n<40&&!m.canAttack;n++)mana.run(10);
 },{map,x,y});
}
// Stand on (tx, ty), face a direction (4 up, 5 down, 6 left, 7 right) and
// strike: a punch, or a fully charged base-form Kamehameha.
async function strike(page,{tx,ty,height,button,punch}){
 return page.evaluate(({tx,ty,height,button,punch})=>{
  const m=mana.mod,start={x:tx*16+8,y:ty*16+8,terrain:height,layer:0};
  mana.write16(0xe002,start.x);mana.write16(0xe004,start.y);mana.write8(0xe00b,start.terrain);m.teleport.follow(start);
  for(let n=0;n<30;n++){mana.run(10);if(!m.teleport.pending&&m.canAttack)break;}
  mana.run(3,[button]);
  if(punch){mana.run(2,[0]);mana.run(45);}else{mana.run(100,[10,1]);mana.run(1);mana.run(90);}
  for(let n=0;n<12&&!m.canAttack;n++)mana.run(60,[11]);mana.run(20);
  return m.status;
 },{tx,ty,height,button,punch});
}
const cells=(page,list)=>page.evaluate(list=>list.map(([x,y])=>mana.read8(0x10000+y*128+x)),list);
const watts=[[19,10],[20,10],[21,10],[19,11],[20,11],[21,11]];

for(const punch of[true,false])test(`Watts's stalagmites fall to ${punch?'one punch':'a Kamehameha'}, open his stairs and stay open on later visits`,async({page},testInfo)=>{
 test.setTimeout(180000);await load(page);await enter(page,294,9,21);
 const hash=await page.evaluate(()=>mana.hash(mana.snes.cart.data));
 expect(await page.evaluate(()=>[mana.mod.status.map,mana.read8(0xcf14)])).toEqual([294,0]);
 expect(await cells(page,watts)).toEqual([0x69,0x69,0x69,0x79,0x79,0x79]);
 await page.screenshot({path:testInfo.outputPath('watts-before.png')});
 const status=await strike(page,{tx:20,ty:12,height:2,button:4,punch});
 expect(status.map).toBe(294);expect(status.canAttack).toBe(true);
 expect(await cells(page,watts),'the retail opened floor of piece 99').toEqual(Array(6).fill(0x46));
 await page.screenshot({path:testInfo.outputPath('watts-after.png')});
 const after=await page.evaluate(()=>({doors:mana.mod.barriers.status.doors,cf14:mana.read8(0xcf14),error:mana.mod.story.status.error}));
 expect(after).toEqual({doors:['watts-shortcut'],cf14:0,error:null});
 // Collision: up through the gap and the stairs to Watts's shortcut (map 288).
 const climbed=await page.evaluate(()=>{for(let n=0;n<8&&mana.mod.status.map===294;n++)mana.run(20,[4]);for(let n=0;n<30&&!mana.mod.canAttack;n++)mana.run(10);return mana.mod.status;});
 expect(climbed.map,JSON.stringify(climbed)).toBe(288);
 // A checkpoint keeps the latch; every later visit shows the opened stairs.
 const checkpoint=await page.evaluate(()=>mana.snapshot());
 await load(page);await page.evaluate(s=>mana.restore(s),checkpoint);
 expect(await page.evaluate(()=>mana.mod.barriers.status.doors)).toEqual(['watts-shortcut']);
 await enter(page,294,9,21);
 expect(await page.evaluate(()=>[mana.mod.status.map,mana.read8(0xcf14)])).toEqual([294,0]);
 expect(await cells(page,watts),'piece 99 on re-entering').toEqual(Array(6).fill(0x46));
 await page.screenshot({path:testInfo.outputPath('watts-reentered.png')});
 expect(await page.evaluate(()=>mana.hash(mana.snes.cart.data))).toBe(hash);
});

test('a Dwarf Village plaza stalagmite falls whole to the plaza floor and grows back on the next visit',async({page},testInfo)=>{
 test.setTimeout(180000);await load(page);await enter(page,287,24,36);
 const plaza=[[25,34],[25,35],[26,35],[26,36]];
 expect(await cells(page,plaza)).toEqual([0x6a,0x79,0x6a,0x79]);
 await page.screenshot({path:testInfo.outputPath('plaza-before.png')});
 await strike(page,{tx:24,ty:36,height:1,button:7,punch:true});
 expect(await cells(page,plaza)).toEqual(Array(4).fill(0x2b));
 await page.screenshot({path:testInfo.outputPath('plaza-after.png')});
 // A same-room native rebuild (event 6C: refresh-map) regrows the pieces;
 // the smashed object is replayed, spires included.
 const rebuilt=await page.evaluate(list=>{const m=mana.mod;if(!m.story.request(0x6c))return null;let regrown=false;
  for(let n=0;n<40;n++){mana.run(5);if(mana.read8(0x10000+34*128+25)===0x6a)regrown=true;if(regrown&&m.canAttack&&!m.plants.pending)break;}
  mana.run(10);return{regrown,tiles:list.map(([x,y])=>mana.read8(0x10000+y*128+x))};},plaza);
 expect(rebuilt).toEqual({regrown:true,tiles:Array(4).fill(0x2b)});
 const walked=await page.evaluate(()=>{mana.run(30,[7]);return mana.mod.status;});
 expect(walked.x,JSON.stringify(walked)).toBeGreaterThan(26*16+8);
 expect(await page.evaluate(()=>mana.mod.barriers.status.doors)).toEqual([]);
 await enter(page,294,9,21);await enter(page,287,24,36);
 expect(await cells(page,plaza),'native respawn after leaving').toEqual([0x6a,0x79,0x6a,0x79]);
});
