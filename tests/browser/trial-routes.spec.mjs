import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

async function load(page,map,x,y,flags){
 const fixture='.local/graphics-audit/party.json';test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,map,x,y,flags})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod;Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});m.powerIntro.restore({flight:true,superSaiyan:true});mana.write8(0xe200,0);mana.write8(0xe400,0);
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2,0],0x8300c);for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{c.set(e,0x742b0);c.set(d,0x8300c);}
 },{state:JSON.parse(readFileSync(fixture)),map,x,y,flags});
}
async function steer(page,{event,tile}){
 return page.evaluate(async({event,tile})=>{
  const {floorTileEvent}=await import('/engine/native-barriers.js'),m=mana.mod,h=m.localFlightHook,map=m.status.map,{width,height}=h.bounds();
  const goals=new Set();if(tile)goals.add(tile[1]*128+tile[0]);
  else for(let y=0;y<height/16;y++)for(let x=0;x<width/16;x++)if(floorTileEvent(m,h.tileAt(x*16+8,y*16+8))===event)goals.add(y*128+x);
  const origin=(m.status.y>>4)*128+(m.status.x>>4),queue=[origin],parents=new Map([[origin,null]]);let end=null;
  for(let i=0;i<queue.length;i++){
   const cell=queue[i];if(goals.has(cell)){end=cell;break;}
   for(const[dx,dy]of[[0,-1],[-1,0],[1,0],[0,1]]){const x=cell%128+dx,y=(cell>>7)+dy,k=y*128+x;
    if(x<0||y<0||x>=width/16||y>=height/16||parents.has(k)||!h.canFly(x*16+8,y*16+8))continue;
    const source=floorTileEvent(m,h.tileAt(x*16+8,y*16+8));if(source!==null&&source>=0x800&&!goals.has(k))continue;
    parents.set(k,cell);queue.push(k);
   }
  }
  const path=[];if(end!==null)for(let k=end;k!==origin;k=parents.get(k))path.unshift(k);
  const stalls=[];for(const k of path){
   for(let f=0;f<80&&m.status.map===map;f++){const dx=k%128*16+8-m.status.x,dy=(k>>7)*16+8-m.status.y;if(Math.abs(dx)<=2&&Math.abs(dy)<=2)break;const direction=Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4;mana.run(1,Math.max(Math.abs(dx),Math.abs(dy))>8?[8,direction]:[direction]);if(f===79)stalls.push({k,status:m.status});}
   if(m.status.map!==map)break;
  }
  mana.run(180,[11]);return{map,goals:[...goals],found:end!==null,path,stalls,status:m.status};
 },{event,tile});
}
async function fight(page,predicate){
 for(let i=0;i<24;i++){
  if(await page.evaluate(predicate))return;
  await page.evaluate(()=>{
   const m=mana.mod,target=m.entities().find(e=>e.index>=3&&e.active&&e.species<128&&e.species!==85&&e.hp&&!(mana.read8(e.base+0x191)&128));
   if(m.canAttack&&target){const dx=target.x-m.status.x,dy=target.y-m.status.y;mana.run(2,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);mana.run(m.options.superSaiyan?60:105,[10,1]);mana.run(1);mana.run(100,[11]);}
   else mana.run(150,[11]);
  });
 }
 expect(await page.evaluate(predicate)).toBe(true);
}

test('early solo Undine route keeps its native boss, spell reward and return to the Water Palace',async({page},testInfo)=>{
 test.setTimeout(180000);await load(page,109,13,9,{17:0,169:0});const steps=[];
 steps.push(await steer(page,{event:0x231}));expect(steps.at(-1).status.map,JSON.stringify(steps.at(-1))).toBe(275);
 steps.push(await steer(page,{event:0x944}));expect(steps.at(-1).status.map,JSON.stringify(steps.at(-1))).toBe(277);
 await fight(page,()=>mana.read8(0xcfa9)===1&&mana.mod.canAttack);
 steps.push(await steer(page,{event:0x946}));expect(steps.at(-1).status.map,JSON.stringify(steps.at(-1))).toBe(278);
 steps.push(await steer(page,{tile:[20,14]}));expect(steps.at(-1).found).toBe(true);
 await page.evaluate(()=>{mana.run(16,[4]);mana.run(1);mana.run(3,[16]);});
 for(let i=0;i<80&&!await page.evaluate(()=>mana.read8(0xcfa9)===2&&mana.mod.canAttack);i++)await page.evaluate(()=>mana.run(60,[11]));
 const reward=await page.evaluate(()=>({status:mana.mod.status,undine:mana.read8(0xcfa9),spells:[mana.read8(0xe3c9),mana.read8(0xe5c9)],plot:mana.read8(0xcf11),party:mana.mod.entities().slice(0,3).map(e=>e.active),error:mana.mod.story.status.error}));
 expect(reward.undine,JSON.stringify(reward)).toBe(2);expect(reward.spells).toEqual([0x38,7]);expect(reward.plot).toBe(0);expect(reward.party).toEqual([true,false,false]);expect(reward.status.canAttack).toBe(true);expect(reward.error).toBe(null);
 // The cave's south exit is a native boundary-transition cell, not an
 // 80-prefix floor event. Steer through its actual original doorway.
 steps.push(await steer(page,{tile:[15,34]}));
 for(const event of[0x943,0x941,0x93f])steps.push(await steer(page,{event}));
 writeFileSync(testInfo.outputPath('undine-route.json'),JSON.stringify({steps,reward},null,2));
 expect(steps.at(-1).status.map,JSON.stringify(steps.at(-1))).toBe(136);expect(steps.at(-1).status.canAttack).toBe(true);
});

test('Joch trial can be cleared by a solo Kamehameha and its original exit finishes the trial',async({page},testInfo)=>{
 test.setTimeout(180000);await load(page,72,16,20,{63:4});
 await page.evaluate(()=>mana.run(1200,[11])); // Finish the native clone initialization and opening challenge.
 // The original trial gate waits for the three native death animations to
 // finish (actor death bit 0x80), not just for their HP to reach zero.
 await fight(page,()=>mana.mod.canAttack&&[0xe791,0xe991,0xeb91].every(a=>mana.read8(a)&0x80));
 const exit=await steer(page,{event:0x3df});
 for(let i=0;i<100&&!await page.evaluate(()=>mana.read8(0xcf3f)===6&&mana.mod.canAttack);i++)await page.evaluate(()=>mana.run(60,[11]));
 const result=await page.evaluate(()=>({status:mana.mod.status,stage:mana.read8(0xcf3f),actors:mana.mod.entities().filter(e=>e.active),error:mana.mod.story.status.error}));writeFileSync(testInfo.outputPath('trial.json'),JSON.stringify({exit,result},null,2));
 expect(result.stage).toBe(6);expect(result.status.map).toBe(18);expect(result.status.canAttack).toBe(true);expect(result.error).toBe(null);
});

test('a solo blast defeats the Tasnica imposter and talking to the king restores the original throne room',async({page},testInfo)=>{
 test.setTimeout(180000);await load(page,121,14,20,{60:3});
 await fight(page,()=>mana.mod.canAttack&&!mana.mod.entities().some(e=>e.index>=3&&e.active&&e.species===77&&e.hp&&!(mana.read8(e.base+0x191)&128)));
 const approach=await steer(page,{tile:[12,14]});await page.evaluate(()=>{mana.run(16,[4]);mana.run(1);mana.run(3,[16]);});
 for(let i=0;i<100&&!await page.evaluate(()=>mana.read8(0xcf3c)>=4&&mana.mod.canAttack);i++)await page.evaluate(()=>mana.run(60,[11]));
 const result=await page.evaluate(()=>({status:mana.mod.status,stage:mana.read8(0xcf3c),error:mana.mod.story.status.error}));writeFileSync(testInfo.outputPath('tasnica.json'),JSON.stringify({approach,result},null,2));
 expect(result.stage).toBe(4);expect(result.status.map).toBe(51);expect(result.status.canAttack).toBe(true);expect(result.error).toBe(null);
});

test('the castle jail keeps Metal Mantis alive until Goku defeats it and opens the original escape',async({page},testInfo)=>{
 test.setTimeout(180000);await load(page,377,15,20,{52:3});
 const entry=await page.evaluate(()=>({stage:mana.read8(0xcf34),boss:mana.mod.entities().some(e=>e.active&&e.species===99&&e.hp)}));
 expect(entry).toEqual({stage:3,boss:true});
 await fight(page,()=>mana.read8(0xcf34)===4&&mana.mod.canAttack);
 const exit=await steer(page,{event:0xb46});
 writeFileSync(testInfo.outputPath('metalmantis.json'),JSON.stringify({entry,exit},null,2));
 expect(exit.status.map,JSON.stringify(exit)).toBe(378);expect(exit.status.canAttack).toBe(true);
 expect(await page.evaluate(()=>mana.mod.story.status.error)).toBe(null);
});
