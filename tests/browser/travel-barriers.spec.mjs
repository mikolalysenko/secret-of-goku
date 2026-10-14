import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

async function load(page){
 const fixture='.local/graphics-audit/party.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.mod.powerIntro.restore({flight:true,superSaiyan:true});},JSON.parse(readFileSync(fixture)));
}
async function enter(page,map,x,y,flags={},layer=0){
 await page.evaluate(({map,x,y,flags,layer})=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+layer,0],0x8300c);for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{c.set(e,0x742b0);c.set(d,0x8300c);}
 },{map,x,y,flags,layer});
}

for(const [x,ferry] of[[24,0],[26,0],[29,0],[26,1]])test(`Goku flies both ways between Karon's piers at column ${x} with ferry stage ${ferry}`,async({page},testInfo)=>{
 test.setTimeout(150000);await load(page);await enter(page,32,x,17,{148:ferry},1);
 const result=await page.evaluate(async x=>{
  const m=mana.mod,h=m.localFlightHook,hash=mana.hash(mana.snes.cart.data),start=mana.snapshot(),before=m.status;
  mana.run(30,[5]);const walked=m.status;mana.restore(start);
  const steer=y=>{const direction=m.status.y<y?5:4;for(let n=0;n<180&&(direction===5?m.status.y<y:m.status.y>y)&&m.status.map===32;n++)mana.run(1,[8,direction]);};
  steer(408);mana.run(30);const hovered={status:m.status,land:h.canLand(m.status.x,m.status.y),tile:h.tileAt(m.status.x,m.status.y),passengers:h.passengers,visiblePassengers:m.ownership.ppuOwners.flatMap((o,i)=>h.passengers.includes(o?.base)&&!m.hiddenLastFrame.includes(i)&&((mana.snes.ppu.oam[i*2]>>8)<224)?[i]:[])},checkpoint=mana.snapshot();
  const finish=()=>{steer(714);mana.run(20);return{status:m.status,party:m.entities().slice(0,3),passengers:h.passengers,land:h.canLand(m.status.x,m.status.y),error:m.story.status.error};};
  const south=finish();mana.restore(checkpoint);const replay=finish();
  steer(280);mana.run(20);const north={status:m.status,party:m.entities().slice(0,3),land:h.canLand(m.status.x,m.status.y)};
  // The north shore's original exit must still lead into the Moon Palace.
  for(let n=0;n<80&&m.status.x<520;n++)mana.run(1,[8,7]);mana.run(1);
  for(let n=0;n<100&&m.status.map===32;n++)mana.run(1,[8,4]);mana.run(180);
  return{before,walked,hovered,south,replay,north,exit:m.status,progress:mana.read8(0xcf94),radio:m.radio.snapshot(),romUnchanged:hash===mana.hash(mana.snes.cart.data)};
 },x);
 writeFileSync(testInfo.outputPath('crossing.json'),JSON.stringify(result,null,2));const detail=JSON.stringify(result);
 expect(result.walked.y-result.before.y).toBeLessThan(18);expect(result.hovered.status.map).toBe(32);expect(result.hovered.status.localFlight,detail).toBe(true);expect(result.hovered.land).toBe(false);expect(result.hovered.status.y).toBeGreaterThan(390);expect(result.hovered.status.y).toBeLessThan(430);
 expect(result.hovered.passengers).toEqual([0xe200,0xe400]);expect(result.hovered.visiblePassengers,detail).toEqual([]);expect(result.south.passengers).toEqual([]);
 for(const r of[result.south,result.replay,result.north]){expect(r.status.map,detail).toBe(32);expect(r.status.canAttack).toBe(true);expect(r.status.localFlight).toBe(false);expect(r.land).toBe(true);for(const p of r.party)expect(Math.hypot(p.x-r.status.x,p.y-r.status.y),detail).toBeLessThan(34);}
 expect(result.replay).toEqual(result.south);expect(result.exit.map,detail).toBe(48);expect(result.exit.canAttack).toBe(true);expect(result.progress).toBe(ferry);expect(result.romUnchanged).toBe(true);
 expect(result.radio.barrierCount).toBe(ferry?0:1);expect(result.radio.current?.kind).not.toBe('barrier');
 if(!ferry)expect(result.radio.barriers).toContain('32:moon-ferry');
});

for(const scene of[{name:'solo',girl:0,ship:0,party:false},{name:'with companions',girl:1,ship:0,party:true},{name:'during the native rescue',girl:8,ship:4,party:false}])test(`flying past the Sandship guards ${scene.name} reaches a valid Imperial ambush`,async({page},testInfo)=>{
 test.setTimeout(240000);await load(page);if(!scene.party)await page.evaluate(()=>{mana.write8(0xe200,0);mana.write8(0xe400,0);});
 await enter(page,324,16,11,{13:scene.girl,40:scene.ship});
 const result=await page.evaluate(async scene=>{
  const m=mana.mod,hash=mana.hash(mana.snes.cart.data),party=m.entities().slice(0,3).map(e=>e.active);
  mana.run(40,[8,4]);const entered=m.status;const events=new Set();
  for(let n=0;n<180&&!(m.status.map===99&&m.canAttack);n++){mana.run(30,[11]);events.add(m.story.status.lastEvent);if(n%10===0)await new Promise(r=>setTimeout(r,0));}
  const deck={status:m.status,stage:mana.read8(0xcf28),girl:mana.read8(0xcf0d),party:m.entities().slice(0,3).map(e=>e.active),geshtar:m.entities().find(e=>e.active&&e.species===177)};
  // Approach Geshtar across the deck with flight, then talk normally.
  for(let n=0;n<30&&m.status.x>412;n++)mana.run(1,[8,6]);mana.run(1);
  for(let n=0;n<30&&m.status.y>112;n++)mana.run(1,[8,4]);mana.run(15);mana.run(3,[16]);
  for(let n=0;n<120&&!(m.status.map===340&&m.canAttack);n++){mana.run(30,[11]);if(n%10===0)await new Promise(r=>setTimeout(r,0));}
  const battle={status:m.status,boss:m.entities().find(e=>e.active&&e.species>=87&&e.species<128&&e.hp>0)};
  if(scene.name==='solo'&&battle.boss&&m.canAttack){
   m.options.superSaiyan=true;
   for(let n=0;n<6&&mana.read8(0xcf28)<12;n++){
    const target=m.entities().find(e=>e.active&&e.species>=87&&e.species<128&&e.hp>0);if(!target)break;
    const dx=target.x-m.status.x,dy=target.y-m.status.y;mana.run(3,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);mana.run(75,[10,1]);mana.run(1);mana.run(140,[11]);await new Promise(r=>setTimeout(r,0));
   }
   for(let n=0;n<100&&!(m.status.map===91&&m.canAttack);n++){mana.run(30,[11]);if(n%10===0)await new Promise(r=>setTimeout(r,0));}
  }
  return{party,entered,events:[...events],deck,battle,after:m.status,stage:mana.read8(0xcf28),error:m.story.status.error,romUnchanged:hash===mana.hash(mana.snes.cart.data)};
 },scene);
 writeFileSync(testInfo.outputPath('sandship.json'),JSON.stringify(result,null,2));const detail=JSON.stringify(result);
 expect(result.entered.map,detail).toBe(339);expect(result.deck.status.map,detail).toBe(99);expect(result.deck.status.canAttack).toBe(true);expect(result.deck.stage,detail).toBe(11);expect(result.deck.geshtar,detail).toBeTruthy();
 expect(result.deck.party).toEqual(scene.girl===8?[true,true,false]:result.party);expect(result.deck.girl).toBe(scene.girl===8?1:scene.girl);expect(result.battle.status.map,detail).toBe(340);expect(result.battle.status.canAttack).toBe(true);expect(result.battle.boss,detail).toBeTruthy();
 if(scene.name==='solo'){expect(result.after.map,detail).toBe(91);expect(result.after.canAttack).toBe(true);expect(result.stage).toBe(12);}expect(result.error).toBe(null);expect(result.romUnchanged).toBe(true);
});

test('a punch or wave breaks the Sandship handrail into native deck planks',async({page},testInfo)=>{
 test.setTimeout(120000);const results=[];
 for(const map of[98,99])for(const punch of[true,false]){
  await load(page);await enter(page,map,25,10,{40:11});
  results.push(await page.evaluate(({map,punch})=>{
   const m=mana.mod,h=m.localFlightHook,hash=mana.hash(mana.snes.cart.data),before=h.tileAt(408,152);
   mana.run(3,[4]);if(punch){mana.run(2,[0]);mana.run(50);}else{mana.run(100,[10,1]);mana.run(1);mana.run(80);}
   return{map,punch,before,after:h.tileAt(408,152),land:h.canLand(408,152,0,2),status:m.status,flag:mana.read8(0xcf28),error:m.story.status.error,romUnchanged:hash===mana.hash(mana.snes.cart.data)};
  },{map,punch}));
 }
 writeFileSync(testInfo.outputPath('rails.json'),JSON.stringify(results,null,2));
 for(const r of results){const detail=JSON.stringify(r);expect(r.before.tile).toBe(122);expect(r.after.tile,detail).toBe(10);expect(r.land).toBe(true);expect(r.status.map).toBe(r.map);expect(r.status.canAttack).toBe(true);expect(r.flag).toBe(11);expect(r.error).toBe(null);expect(r.romUnchanged).toBe(true);}
});
