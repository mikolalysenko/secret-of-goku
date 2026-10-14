import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {barrierFloorEvents} from '../../engine/native-barriers.js';
async function load(page,path='.local/graphics-audit/party.json'){
 test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path)));
}
async function enter(page,map,x,y,flags={},layer=0,quiet=false){
 await page.evaluate(({map,x,y,flags,layer,quiet})=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010),word=a=>c[a]|c[a+1]<<8;
  const start=0x80000+word(0x87000+map*2),end=0x80000+word(0x87002+map*2),objects=c.slice(start,end);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+layer,0],0x8300c);
   // Gate tests retain the native map/event engine but hide enemy spawns;
   // otherwise their offscreen spell windups interrupt remote-switch shots.
   if(quiet)for(let at=start+8;at<end;at+=8)if(c[at+5]<0x80){c[at]=0;c[at+1]=0xff;}
   for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);c.set(objects,start);}
 },{map,x,y,flags,layer,quiet});
}
test('Haunted Forest gates open by beam or punch and stay open after leaving',async({page})=>{
 for(const [map,x,y,flag,min,punch]of[[29,15,23,0x5e,1,false],[29,15,21,0x5e,1,true],[30,15,30,0x5f,3,false]]){
  await load(page);await enter(page,map,x,y,{[flag]:0});
  const result=await page.evaluate(({punch,flag})=>{
   const before=mana.hash(mana.snes.ram.slice(0x10000,0x18000));mana.run(1,[4]);
   if(punch){mana.run(2,[0]);mana.run(80);}else{mana.run(100,[10,1]);mana.run(1);mana.run(160);}
   return{before,after:mana.hash(mana.snes.ram.slice(0x10000,0x18000)),flag:mana.read8(0xcf00+flag),error:mana.mod.story.status.error,canAttack:mana.mod.canAttack,radio:mana.mod.radio.status};
  },{punch,flag});
  expect(result.flag,JSON.stringify({map,punch,result})).toBe(min);expect(result.error).toBe(null);expect(result.after).not.toBe(result.before);expect(result.canAttack).toBe(true);
  expect(result.radio.current?.kind).toBe('barrier');expect(result.radio.current.text).toContain(map===29?'Elinee':'security system');expect(result.radio.barrierCount).toBe(1);
  await enter(page,131,18,22);await enter(page,map,x,y);
  expect(await page.evaluate(flag=>mana.read8(0xcf00+flag),flag)).toBe(min);
 }
});
test('a beam operates native hit switches and smashes the palace combination without altering later progress',async({page})=>{
 for(const s of[{map:285,x:14,y:7,flag:0x60,min:1,flags:{0x60:0,0x61:0}},{map:286,x:45,y:31,flag:0x60,min:7,flags:{0x60:0,0x61:0}},{map:390,x:16,y:18,flag:0x35,min:3,flags:{0x35:0}},{map:415,x:21,y:27,flag:0x48,min:1,flags:{0x48:0}},{map:43,x:31,y:49,flag:0x42,min:4,flags:{0x42:3,0x43:0}}]){
  await load(page);await enter(page,s.map,s.x,s.y,s.flags);
  const result=await page.evaluate(s=>{
   for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
   mana.run(1,[4]);if(s.map===285||s.map===286)mana.write8(0xcf61,0);mana.run(100,[10,1]);mana.run(1);mana.run(180);
   return{flag:mana.read8(0xcf00+s.flag),barriers:mana.mod.barriers.status,status:mana.mod.status,error:mana.mod.story.status.error};
  },s);
  expect(result.flag,JSON.stringify({s,result})).toBe(s.min);expect(result.error).toBe(null);
  if(s.map===43){await page.evaluate(()=>{mana.run(100,[10,1]);mana.run(1);mana.run(180);});expect(await page.evaluate(()=>mana.read8(0xcf42))).toBe(4);}
 }
});
test('flight crosses multiple Gaia ledges and Haunted Forest vines with valid ground at both ends',async({page})=>{
 for(const s of[{map:25,x:360,y:970,frames:45,min:300},{map:28,x:232,y:360,frames:16,min:80}]){
  await load(page);await enter(page,s.map,s.x>>4,s.y>>4);
  const result=await page.evaluate(s=>{
   const h=mana.mod.localFlightHook;for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
   mana.mod.options.superSaiyan=true;mana.write16(0xe002,s.x);mana.write16(0xe004,s.y);mana.mod.teleport.follow({x:s.x,y:s.y,terrain:mana.read8(0xe00b)});mana.run(30);
   const start=mana.mod.status,phase=h.phased;mana.run(s.frames,[8,4]);const end=mana.mod.status;
   return{map:end.map,distance:start.y-end.y,phased:h.phased-phase,flyable:h.canFly(end.x,end.y),outside:h.canFly(-8,end.y)};
  },s);
  expect(result.map).toBe(s.map);expect(result.distance,JSON.stringify(result)).toBeGreaterThanOrEqual(s.min);expect(result.phased).toBeGreaterThan(0);expect(result.flyable).toBe(true);expect(result.outside).toBe(false);
 }
});
test('Haunted Forest vines can be punched or blasted into native walkable grass',async({page})=>{
 for(const punch of[true,false]){
  await load(page);await enter(page,28,14,22);
  const r=await page.evaluate(punch=>{
   const h=mana.mod.localFlightHook;mana.write16(0xe002,232);mana.write16(0xe004,322);mana.mod.teleport.follow({x:232,y:322,terrain:2});mana.run(30);
   const before=h.tileAt(232,296),walkBefore=h.canLand(232,296);mana.run(1,[4]);
   if(punch){mana.run(2,[0]);mana.run(55);}else{mana.run(100,[10,1]);mana.run(1);mana.run(80);}
   return{before,walkBefore,after:h.tileAt(232,296),walkAfter:h.canLand(232,296),cuts:mana.mod.plants.completed,radio:mana.mod.radio.status};
  },punch);
  expect(r.before.tile).toBe(132);expect(r.walkBefore).toBe(false);expect(r.after.tile,JSON.stringify(r)).toBe(122);expect(r.walkAfter).toBe(true);expect(r.cuts.length).toBeGreaterThan(0);
  expect(r.radio.current?.kind).toBe('barrier');expect(r.radio.current.text).toContain('vines');expect(r.radio.barrierCount).toBe(1);
 }
});
test('carved forest heads are flyable and break into native grass across every map using them',async({page})=>{
 test.setTimeout(180000);await load(page);const baseline=await page.evaluate(()=>mana.snapshot()),results=[];
 for(const map of[19,23,27,39,40,41,49,52,53,54,55]){
  await page.evaluate(s=>mana.restore(s),baseline);await enter(page,map,8,8,{},0,true);
  results.push(await page.evaluate(map=>{
   const m=mana.mod,h=m.localFlightHook,{width,height}=h.bounds();let candidate=null,heads=0,unsafe=[];
   for(let y=8;y<height;y+=16)for(let x=8;x<width;x+=16){const t=h.tileAt(x,y,0);if(![171,172].includes(t.tile)||t.code!==0xc1)continue;heads++;if(!h.canFly(x,y,0))unsafe.push({x,y});
    if(!candidate)for(const[dx,dy,button]of[[0,-1,4],[0,1,5],[-1,0,6],[1,0,7]]){const sx=x-dx*32,sy=y-dy*32;if(h.canLand(sx,sy,0,2)&&!(h.tileAt(sx,sy,0).behavior&0x80))candidate={x,y,sx,sy,dx,dy,button};}
   }
   if(!candidate)return{map,heads,unsafe,candidate};
   const {x,y,sx,sy,button}=candidate;mana.write16(0xe002,sx);mana.write16(0xe004,sy);mana.write8(0xe00b,2);m.teleport.follow({x:sx,y:sy,terrain:2});mana.run(25);
   for(let n=0;n<12&&(!m.canAttack||m.teleport.pending);n++)mana.run(10);mana.run(1);
   mana.run(1,[button]);mana.run(100,[10,1]);mana.run(1);mana.run(95);
   return{map,heads,unsafe,candidate,tile:h.tileAt(x,y,0).tile,land:h.canLand(x,y,0,2),canAttack:m.canAttack,error:m.story.status.error,radio:m.radio.snapshot()};
  },map));
 }
 for(const r of results){expect(r.heads,JSON.stringify(r)).toBeGreaterThan(0);expect(r.unsafe,JSON.stringify(r)).toEqual([]);expect(r.candidate,JSON.stringify(r)).toBeTruthy();expect(r.tile,JSON.stringify(r)).toBe(161);expect(r.land).toBe(true);expect(r.canAttack).toBe(true);expect(r.error).toBe(null);expect(r.radio.barrierCount).toBe(1);}
});
test('a real bee sting allows recovery and flight, retains poison, and never reveals a native weapon',async({page})=>{
 await load(page);await enter(page,25,46,39);
 const result=await page.evaluate(()=>{
  for(const a of[0xe200,0xe400])mana.write8(a,0);
  const bee=mana.mod.entities().find(e=>e.active&&e.species===1);if(!bee)return{missing:true};
  mana.write16(0xe002,bee.x-16);mana.write16(0xe004,bee.y);mana.mod.teleport.follow({x:bee.x-16,y:bee.y,terrain:mana.read8(bee.base+11)});mana.run(30);
  mana.mod.options.superSaiyan=true;
  let hit=false;for(let i=0;i<500;i++){mana.run(1);if([0x8d,0x8e].includes(mana.read8(0xe011))){hit=true;break;}}
  const poison=mana.mod.poisoned,saved=mana.snapshot(),start=mana.mod.status,states=[];
  for(let i=0;i<140;i++){mana.run(1,[8,4]);states.push({weapon:!!(mana.read8(0xe01c)&0xa0),hurt:[0x8d,0x8e].includes(mana.read8(0xe011))});}
  const result={hit,poison,superSaiyan:mana.mod.options.superSaiyan,distance:start.y-mana.mod.status.y,states,recovered:mana.mod.hitRecovery.recovered};
  mana.restore(saved);mana.run(140,[8,4]);result.replayY=mana.mod.status.y;result.firstY=start.y-result.distance;return result;
 });
 expect(result.hit).toBe(true);expect(result.poison).toBe(true);expect(result.superSaiyan).toBe(false);expect(result.distance).toBeGreaterThan(100);expect(result.recovered).toBeGreaterThan(0);expect(result.states.some(s=>s.weapon)).toBe(false);expect(result.states.at(-1).hurt).toBe(false);expect(result.replayY).toBe(result.firstY);
});
test('Fortress approach keeps Goku, loads the real deck, and can enter its native doorway',async({page})=>{
 await load(page,'.local/juice-research/flight/request-flight.json');
 const result=await page.evaluate(()=>{
  mana.mod.radio.restore({firstFlight:true});mana.mod.powerIntro.restore({flight:true,superSaiyan:true});
  mana.write16(0x128,mana.read16(0xfa)&4095);mana.write16(0x12a,(mana.read16(0xfc)-32)&4095);mana.write16(0xf4,1);mana.write8(0xf8,200);mana.write8(0xcf,90);mana.write8(0xbf,0);mana.write8(0xc6,0);
  const poses=[];let saved=null;for(let i=0;i<400;i++){mana.run(1);const pose=mana.mod.spriteLayer.plan?.sprite;if(pose?.kind==='fortressApproach'){poses.push(pose);saved??=mana.snapshot();}}
  const deck=mana.mod.status,h=mana.mod.localFlightHook,{width,height}=h.bounds();mana.mod.options.superSaiyan=true;
  for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
  // The original deck winds around tall machinery. Follow its actual floor
  // to the door; a straight northward walk correctly hits a wall halfway up.
  const key=(x,y)=>y*128+x,start=key(deck.x>>4,deck.y>>4),goal=key(20,18),queue=[start],parents=new Map([[start,null]]);
  for(let i=0;i<queue.length&&!parents.has(goal);i++)for(const [dx,dy]of[[0,-1],[1,0],[-1,0],[0,1]]){
   const x=queue[i]%128+dx,y=(queue[i]>>7)+dy,k=key(x,y);
   if(x<0||y<0||x>=width/16||y>=height/16||parents.has(k)||!h.canFly(x*16+8,y*16+8))continue;parents.set(k,queue[i]);queue.push(k);
  }
  const path=[];if(parents.has(goal))for(let k=goal;k!==start;k=parents.get(k))path.unshift(k);
  const stalls=[];
  for(const k of path){for(let f=0;f<80&&mana.read16(0xdc)===255;f++){
   for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
   const dx=k%128*16+8-mana.read16(0xe002),dy=(k>>7)*16+8-mana.read16(0xe004);if(Math.abs(dx)<=2&&Math.abs(dy)<=2)break;
   mana.run(1,[8,Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);
   if(f===79)stalls.push({k,x:mana.read16(0xe002),y:mana.read16(0xe004)});
  }if(mana.read16(0xdc)!==255)break;}
  mana.run(180);const inside=mana.mod.status;
  mana.restore(saved);mana.run(400);const replay=mana.mod.status;
  return{poses:poses.length,deck,inside,replay,pathLength:path.length,stalls,error:mana.mod.flight.error};
 });
 expect(result.poses).toBeGreaterThan(5);expect(result.deck.map).toBe(255);expect(result.deck.x).toBeLessThan(600);expect(result.deck.screenX).toBeGreaterThan(0);expect(result.deck.screenX).toBeLessThan(256);expect(result.error).toBe(null);expect(result.inside.map,JSON.stringify(result)).toBe(248);expect(result.replay.map).toBe(255);expect(result.replay.x).toBe(result.deck.x);
});
test('keyboard Z is a direction modifier, arrows change ring tiers, and pause visibly stops the game',async({page})=>{
 await load(page);await page.evaluate(()=>mana.play());const start=await page.evaluate(()=>mana.mod.status);
 await page.keyboard.down('z');await page.waitForTimeout(500);await page.keyboard.up('z');
 expect(await page.evaluate(()=>[mana.mod.status.x,mana.mod.status.y])).toEqual([start.x,start.y]);
 await page.keyboard.down('z');await page.keyboard.down('ArrowLeft');await expect.poll(()=>page.evaluate(()=>mana.mod.status.x)).toBeLessThan(start.x-30);await page.keyboard.up('ArrowLeft');await page.keyboard.up('z');
 await page.keyboard.press('a');await expect.poll(()=>page.evaluate(()=>mana.read8(0xec)&8)).toBe(8);await page.waitForTimeout(700);
 const tier=await page.evaluate(()=>mana.read8(0x1809));await page.keyboard.press('ArrowUp');await expect.poll(()=>page.evaluate(()=>mana.read8(0x1809))).not.toBe(tier);await page.waitForTimeout(500);await page.keyboard.press('ArrowDown');await expect.poll(()=>page.evaluate(()=>mana.read8(0x1809))).toBe(tier);
 await page.keyboard.press('a');await expect.poll(()=>page.evaluate(()=>mana.read8(0xec)&8)).toBe(0);
 await page.keyboard.press('Escape');await expect(page.locator('#native-pause')).toBeVisible();const frame=await page.evaluate(()=>mana.mod.frame);await page.waitForTimeout(250);expect(await page.evaluate(()=>mana.mod.frame)).toBe(frame);await page.keyboard.press('Space');await expect(page.locator('#native-pause')).toBeHidden();
});
test('aerial shots cover Goku, delayed ki bursts appear, and radar follows actual quest collection',async({page})=>{
 await load(page,'.local/juice-research/flight/request-flight.json');
 const r=await page.evaluate(()=>{
  const m=mana.mod;m.radio.restore({firstFlight:true});m.powerIntro.restore({flight:true,superSaiyan:true});m.quest.restore({mask:0});mana.run(3);
  const first=m.radar.status.target;m.quest.collect(0);m.radio.restore({firstFlight:true});const next=m.radar.status.target;
  mana.run(2,[1]);const layer=m.spriteLayer,draw=m.worldKi.draw;m.worldKi.draw=()=>{};layer.prepare();const body=layer.surface.slice(),mask=layer.effectMask.slice();m.worldKi.draw=draw;layer.prepare();
  let covered=0;for(let i=0;i<body.length;i++)if(body[i]&&!mask[i]&&layer.effectMask[i]&&layer.surface[i]!==body[i])covered++;
  mana.run(35);const bursts=structuredClone(m.worldKi.status.distantBursts);mana.run(40);
  return{first,next,covered,bursts,finished:m.worldKi.status.distantBursts.length,destroyed:m.worldKi.status.fortressDestroyed};
 });
 expect(r.first.name).toBe('Water Palace');expect(r.next.name).toBe('Earth Palace');expect(r.covered).toBeGreaterThan(0);expect(r.bursts.some(b=>b.age>=0)).toBe(true);expect(r.finished).toBe(0);expect(r.destroyed).toBe(false);
});
test('the native ending keeps its blue sky palette when HDMA is enabled late',async({page})=>{
 await load(page,'.local/ending-fix/ending-native.json');
 const result=await page.evaluate(()=>{mana.mod.options.enabled=false;mana.run(600);return[...mana.snes.ppu.cgram.slice(0,4)];});
 expect(result).toEqual([0,0x34c0,0x2480,0x1820]);
});

test('Goku flies across the Water Palace platform gap and hovers safely if released over it',async({page})=>{
 await load(page);await enter(page,139,17,55);
 const r=await page.evaluate(()=>{
  const m=mana.mod,h=m.localFlightHook,start=m.status,hash=mana.hash(mana.snes.cart.data);m.powerIntro.restore({flight:true,superSaiyan:true});m.radio.restore();
  mana.run(14,[8,4]);const over=m.status,saved=mana.snapshot();mana.run(45);const hovering={flight:m.localFlight,y:m.status.y,safe:h.canFly(m.status.x,m.status.y)};
  mana.run(14,[8,4]);mana.run(10);const across=m.status;
  mana.restore(saved);mana.run(45);mana.run(14,[8,4]);mana.run(10);const replay=m.status;
  mana.run(28,[8,5]);mana.run(10);const back=m.status;
  return{start,over,hovering,across,replay,back,radio:m.radio.status,unchanged:mana.hash(mana.snes.cart.data)===hash};
 });
 expect(r.over.y).toBeGreaterThan(768);expect(r.over.y).toBeLessThan(848);expect(r.hovering.flight).toBe(true);expect(r.hovering.safe).toBe(true);expect(Math.abs(r.hovering.y-r.over.y)).toBeLessThanOrEqual(2);expect(r.across.y).toBeLessThan(768);expect(r.across.localFlight).toBe(false);expect(r.across.map).toBe(139);expect([r.replay.x,r.replay.y]).toEqual([r.across.x,r.across.y]);expect(r.back.y).toBeGreaterThan(850);expect(r.back.localFlight).toBe(false);expect(r.unchanged).toBe(true);
 expect(r.radio.current?.kind).toBe('barrier');expect(r.radio.current.text).toContain('bridge');expect(r.radio.barrierCount).toBe(1);
});

test('punches and beams press all 41 native floor-switch event families across palaces, castles and the Fortress',async({page})=>{
 test.setTimeout(600000);
 const cases=[{map:135,x:15,y:27,flag:0xa7,to:1,punch:true},{map:139,x:15,y:53,flag:0xa4,to:1},{map:117,x:10,y:25,flag:0xa4,to:1},{map:302,x:8,y:13,flag:0xa4,to:1},{map:248,x:66,y:15,flag:0x4f,from:1,to:3},
  {map:352,x:14,y:16,flag:0x55,to:2},{map:355,x:24,y:19,flag:0x55,from:2,to:3},{map:357,x:5,y:13,flag:0x56,from:1,to:2},
  {map:368,x:24,y:10,flag:0x39,to:1},{map:370,x:16,y:15,flag:0x38,to:1},{map:374,x:16,y:31,flag:0x38,from:2,to:3},
  {map:312,x:8,y:40,flag:0x1c,to:1},{map:403,x:66,y:70,flag:0x2d,to:1,layer:1},{map:404,x:33,y:64,flag:0x2d,from:2,to:3,layer:1},
  {map:327,x:12,y:15,flag:0x2b,from:1,to:2},{map:240,x:16,y:23,flag:0x2b,from:2,to:3},{map:417,x:14,y:12,flag:0x48,to:1},
  {map:305,x:11,y:17,flag:0x53,to:6},{map:312,x:39,y:40,flag:0x1d,to:1},
  {map:248,x:66,y:70,flag:0x4f,to:2},{map:248,x:72,y:18,flag:0x4f,from:4,to:5},
  {map:248,x:51,y:69,flag:0x4f,from:5,to:6},{map:248,x:55,y:69,flag:0x4f,from:6,to:7},
  {map:248,x:39,y:73,flag:0x4f,from:7,to:9},{map:249,x:64,y:31,flag:0x4f,from:9,to:14},
  {map:417,x:18,y:20,flag:0x48,from:1,to:2},{map:417,x:33,y:12,flag:0x49,to:1},{map:417,x:29,y:20,flag:0x49,from:1,to:2},
  {map:382,x:9,y:22,flag:0xdd,to:2},{map:386,x:14,y:10,flag:0x35,to:2},{map:403,x:34,y:59,flag:0x2d,from:1,to:2,layer:1},
  {map:352,x:19,y:24,flag:0x55,to:1},{map:352,x:25,y:16,flag:0x55,from:1,to:2},
  {map:355,x:6,y:19,flag:0x56,to:1},{map:357,x:9,y:13,flag:0x56,from:1,to:2},
  {map:370,x:18,y:8,flag:0x38,from:1,to:2},{map:374,x:19,y:27,flag:0x38,from:3,to:4},{map:374,x:27,y:16,flag:0x38,from:4,to:5},
  {map:240,x:21,y:26,flag:0x2b,from:4,to:10},{map:139,x:13,y:31,flag:0xa5,to:1},{map:139,x:20,y:31,flag:0xa6,to:1},
  {map:117,x:30,y:23,flag:0xa5,to:1},{map:118,x:10,y:23,flag:0xa6,to:1}];
 const results=[];
 for(const s of cases){
  await load(page);await enter(page,s.map,s.x,s.y+3,{[s.flag]:s.from??0},s.layer??0,true);
  const r=await page.evaluate(s=>{
   const m=mana.mod,h=m.localFlightHook,targets=[];for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
   const range=s.punch?[20,24,28]:[56,72,88,104,120,136,152];
   for(const distance of range)for(const [dx,dy,button]of[[0,1,4],[0,-1,5],[1,0,6],[-1,0,7]]){const x=s.x*16+8+dx*distance,y=s.y*16+8+dy*distance;
    const scriptNearby=[-10,0,10].some(ox=>[-10,0,10].some(oy=>h.tileAt(x+ox,y+oy,s.layer??0)?.behavior&0x80));
    if(h.canLand(x,y,s.layer??0,0)&&!scriptNearby)targets.push({x,y,button});}
   const at=targets[0];if(!at)return{missing:true};
   const terrain=s.layer?0x80:0;mana.write16(0xe002,at.x);mana.write16(0xe004,at.y);mana.write8(0xe00b,terrain);m.teleport.follow({...at,terrain,layer:s.layer??0});mana.run(80);
   const before=mana.read8(0xcf00+s.flag),tile=m.plants.metadata(s.x,s.y);mana.run(1,[at.button]);
   if(s.punch){mana.run(2,[0]);mana.run(80);}else{mana.run(100,[10,1]);mana.run(1);mana.run(150);}
   // Native puzzle sparkles retain their effect lock ($2C) after the map
   // rebuild. Wait for the original animation to return player control.
   for(let i=0;i<12&&!m.canAttack;i++){if(mana.read8(0xd0)&128){mana.run(2,[0]);mana.run(4);}mana.run(60,[11]);}
   mana.run(2);
   return{before,flag:mana.read8(0xcf00+s.flag),tile,barriers:m.barriers.status,error:m.story.status.error,canAttack:m.canAttack,status:m.status,story:m.story.status,radio:m.radio.status};
  },s);
  results.push({s,r});
 }
 await test.info().attach('floor-switch-results',{body:JSON.stringify(results,null,2),contentType:'application/json'});
 writeFileSync(test.info().outputPath('floor-switch-results.json'),JSON.stringify(results,null,2));
 const failed=results.filter(({s,r})=>r.missing||r.before!==(s.from??0)||r.flag!==s.to||r.error!==null||!r.canAttack||r.radio.barrierCount!==1);
 expect(failed).toEqual([]);
 const families=[...new Set(results.flatMap(({r})=>r.barriers.completed.filter(id=>id.startsWith('tile-')).map(id=>Number(id.split('-').at(-1)))))].sort((a,b)=>a-b);
 expect(families).toEqual([...barrierFloorEvents.keys()].sort((a,b)=>a-b));
});
