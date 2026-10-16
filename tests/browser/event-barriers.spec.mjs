import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

async function load(page){
 const fixture='.local/graphics-audit/party.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.mod.powerIntro.restore({flight:true,superSaiyan:true});},JSON.parse(readFileSync(fixture)));
}
async function enter(page,map,x,y,flags={}){
 await page.evaluate(({map,x,y,flags})=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2,0],0x8300c);for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{c.set(e,0x742b0);c.set(d,0x8300c);}
 },{map,x,y,flags});
}

for(const scene of[{map:233,stage:2,target:208},{map:234,stage:4,target:217},{map:235,stage:6,target:236,cutscene:true}])test(`Pure Land gate ${scene.map} breaks by punch and beam, then traverses its native route`,async({page},testInfo)=>{
 test.setTimeout(240000);await load(page);
 // Start the final Tree arrival without companions. This test checks its
 // native entry, not the subsequent lengthy Tree conversation.
 await page.evaluate(()=>{mana.write8(0xe200,0);mana.write8(0xe400,0);});
 await enter(page,scene.map,21,9,{70:0});const baseline=await page.evaluate(()=>mana.snapshot()),results=[];
 for(const punch of[true,false]){
  await page.evaluate(s=>mana.restore(s),baseline);
  const result=await page.evaluate(async({scene,punch})=>{
   const m=mana.mod,hash=mana.hash(mana.snes.cart.data),start=mana.snapshot();
   mana.run(35,[4]);const locked={map:m.status.map,event:mana.read8(0xd0)};mana.restore(start);
   mana.run(3,[4]);if(punch){mana.run(2,[0]);mana.run(85);}else{mana.run(100,[10,1]);mana.run(1);mana.run(85);}
   const broken={status:m.status,stage:mana.read8(0xcf46),barriers:m.barriers.status,radio:m.radio.snapshot()},checkpoint=mana.snapshot();
   const cross=async()=>{
    mana.run(45,[4]);
    const maps=new Set([m.status.map]);let choices=0;
    for(let n=0;n<100&&!(m.status.map===scene.target&&(scene.cutscene?mana.read8(0xd0)!==0:m.canAttack));n++){
     mana.run(30,[11]);maps.add(m.status.map);
     if(mana.fastForward.state(0x800).choice){
      // The gate offers the original save menu. Choose No, then continue.
      // Detection precedes the native cursor becoming ready for input.
      mana.run(90);mana.run(8,[7]);mana.run(20);mana.run(6,[0]);mana.run(20);choices++;
     }
     if(n%10===0)await new Promise(r=>setTimeout(r,0));
    }
    return{status:m.status,stage:mana.read8(0xcf46),maps:[...maps],choices,error:m.story.status.error,lastEvent:m.story.status.lastEvent};
   };
   const crossed=await cross();mana.restore(checkpoint);const replay=await cross();
   return{punch,locked,broken,crossed,replay,romUnchanged:hash===mana.hash(mana.snes.cart.data)};
  },{scene,punch});results.push(result);
 }
 writeFileSync(testInfo.outputPath('gate-results.json'),JSON.stringify(results,null,2));
 for(const r of results){const detail=JSON.stringify(r);expect(r.locked.map,detail).toBe(scene.map);expect(r.locked.event,detail).not.toBe(0);expect(r.broken.status.canAttack,detail).toBe(true);expect(r.broken.status.map).toBe(scene.map);expect(r.broken.stage,detail).toBe(scene.stage);expect(r.broken.radio.barrierCount).toBe(1);expect(r.broken.barriers.completed).toContain(`pure-land-gate-${scene.map-232}`);for(const c of[r.crossed,r.replay]){expect(c.status.map,detail).toBe(scene.target);expect(c.status.canAttack,detail).toBe(!scene.cutscene);if(scene.cutscene)expect(c.lastEvent).toBe(0x5f8);expect(c.error).toBe(null);}expect(r.replay).toEqual(r.crossed);expect(r.romUnchanged).toBe(true);}
});

test('flight bypasses the Pandora castle guards without changing the castle story',async({page})=>{
 await load(page);await enter(page,266,5,17,{18:0,19:6});
 const r=await page.evaluate(()=>{
  const m=mana.mod,start=mana.snapshot();mana.run(40,[4]);const walk=m.status;mana.restore(start);mana.run(40,[8,4]);mana.run(30);return{walk,fly:m.status,passes:m.localFlightHook.npcPasses,flags:[mana.read8(0xcf12),mana.read8(0xcf13)],land:m.localFlightHook.canLand(m.status.x,m.status.y),error:m.story.status.error};
 });
 expect(r.walk.y).toBeGreaterThan(240);expect(r.fly.map).toBe(266);expect(r.fly.y).toBeLessThan(170);expect(r.fly.canAttack).toBe(true);expect(r.fly.localFlight).toBe(false);expect(r.land).toBe(true);expect(r.passes).toBeGreaterThan(0);expect(r.flags).toEqual([0,6]);expect(r.error).toBe(null);
});

test('Goku can enter the Dwarf Village pit without finding or granting a Magic Rope',async({page})=>{
 await load(page);await enter(page,287,24,33,{20:6,27:1,215:0});
 const result=await page.evaluate(()=>{
  const m=mana.mod;mana.write8(0xe00b,1); // Diagnostic entry is on the upper floor, above the pit.
  const before={...m.status,rope:mana.read8(0xcfd7)};mana.run(45,[5]);mana.run(240);return{before,after:m.status,rope:mana.read8(0xcfd7),error:m.story.status.error};
 });
 expect(result.before.map).toBe(287);expect(result.before.canAttack).toBe(true);expect(result.before.rope).toBe(0);expect(result.after.map,JSON.stringify(result)).toBe(311);expect(result.after.canAttack).toBe(true);expect(result.rope).toBe(0);expect(result.error).toBe(null);
});

test('an early Snapdragon defeat opens the original palace bridge and reaches Dryad',async({page},testInfo)=>{
 test.setTimeout(180000);await load(page);await enter(page,430,24,35,{65:0,68:0});
 const result=await page.evaluate(async()=>{
  const m=mana.mod,hash=mana.hash(mana.snes.cart.data);mana.run(40,[8,4]);mana.run(1);m.options.superSaiyan=true;
  const start={status:m.status,stage:mana.read8(0xcf44),bridge:mana.read8(0xcf4b)},boss=m.entities().find(e=>e.active&&e.species===95);
  mana.run(3,[4]);mana.run(75,[10,1]);mana.run(1);mana.run(160);
  for(let n=0;n<80&&(!m.canAttack||mana.read8(0xcf44)<2);n++){mana.run(30,[11]);if(n%10===0)await new Promise(r=>setTimeout(r,0));}
  const defeated={status:m.status,stage:mana.read8(0xcf44),bridge:mana.read8(0xcf4b),hp:boss?mana.read16(boss.base+0x182):null};
  mana.run(15,[8,4]);mana.run(1);const across=m.status;
  // Dryad's door is down the western stair. Follow live floor geometry over
  // the rebuilt bridge; crossing the doorway must execute its normal loader.
  const h=m.localFlightHook,{width,height}=h.bounds(),origin=(m.status.y>>4)*128+(m.status.x>>4),goal=37*128+18,queue=[origin],parents=new Map([[origin,null]]);
  for(let i=0;i<queue.length&&!parents.has(goal);i++)for(const[dx,dy]of[[0,-1],[-1,0],[1,0],[0,1]]){
   const x=queue[i]%128+dx,y=(queue[i]>>7)+dy,k=y*128+x;
   if(x<0||y<0||x>=width/16||y>=height/16||parents.has(k)||!Array.from({length:17},(_,d)=>h.canFly(x*16+8-dx*d,y*16+8-dy*d)).every(Boolean))continue;
   parents.set(k,queue[i]);queue.push(k);
  }
  const path=[];if(parents.has(goal))for(let k=goal;k!==origin;k=parents.get(k))path.unshift(k);
  const stalls=[];for(const k of path){
   for(let f=0;f<80&&m.status.map===430;f++){
    const dx=k%128*16+8-m.status.x,dy=(k>>7)*16+8-m.status.y;if(Math.abs(dx)<=2&&Math.abs(dy)<=2)break;
    mana.run(1,[...(Math.max(Math.abs(dx),Math.abs(dy))>20?[8]:[]),Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);
    if(f===79)stalls.push({k,status:m.status});
   }
   if(m.status.map!==430)break;
  }
  mana.run(240,[11]);
  return{start,defeated,across,after:m.status,path,stalls,flags:[mana.read8(0xcf41),mana.read8(0xcf44)],error:m.story.status.error,romUnchanged:hash===mana.hash(mana.snes.cart.data)};
 });
 writeFileSync(testInfo.outputPath('snapdragon.json'),JSON.stringify(result,null,2));
 expect(result.start.stage).toBe(1);expect(result.start.bridge).toBe(0);expect(result.defeated.stage,JSON.stringify(result)).toBe(2);expect(result.defeated.bridge).toBe(1);expect(result.defeated.hp).toBe(0);expect(result.across.y,JSON.stringify(result)).toBeLessThan(480);expect(result.path.length).toBeGreaterThan(0);expect(result.after.map,JSON.stringify(result)).toBe(431);expect(result.after.canAttack).toBe(true);expect(result.error).toBe(null);expect(result.romUnchanged).toBe(true);
});

test('a normal Kamehameha opens and saves Watts’s outside shortcut without granting Gnome progress',async({page},info)=>{
 test.setTimeout(120000);await load(page);await enter(page,73,44,60,{20:0,194:0});
 const result=await page.evaluate(()=>{
  const m=mana.mod,rom=mana.hash(mana.snes.cart.data),flags=Array.from(mana.snes.ram.slice(0xcf14,0xcf17));
  mana.run(3,[5]);const before=m.plants.metadata(44,63).tile;
  mana.run(110,[10,1]);mana.run(1);mana.run(160,[11]);
  const opened={tile:m.plants.metadata(44,63).tile,doors:m.barriers.status.doors,flags:Array.from(mana.snes.ram.slice(0xcf14,0xcf17)),weapon:mana.read8(0xcfc2)},save=mana.snapshot();
  const cross=()=>{mana.run(40,[5]);mana.run(240);return{map:m.status.map,can:m.canAttack,error:m.story.status.error};};
  const first=cross();mana.restore(save);const restored=cross();
  return{before,opened,first,restored,flags,romUnchanged:rom===mana.hash(mana.snes.cart.data),super:m.options.superSaiyan};
 });
 writeFileSync(info.outputPath('gaia-shortcut.json'),JSON.stringify(result,null,2));
 expect(result.before).not.toBe(result.opened.tile);expect(result.opened.doors).toContain('gaia-shortcut');expect(result.opened.flags).toEqual(result.flags);expect(result.opened.weapon).toBe(0);expect(result.first).toEqual({map:288,can:true,error:null});expect(result.restored).toEqual(result.first);expect(result.romUnchanged).toBe(true);expect(result.super).toBe(false);
});
