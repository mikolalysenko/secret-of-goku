import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(300000);
async function load(page,mask=0){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native fixture and ROM required.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,mask})=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});for(let i=0;i<2;i++)if(!(mask>>i&1))mana.snes.ram.fill(0,0xe200+i*512,0xe400+i*512);mana.mod.radio.restore({firstFlight:true});mana.run(3);},{state:JSON.parse(readFileSync(fixture)),mask});
}
async function late(page,kind='battle'){
 return page.evaluate(async kind=>{
  const {buildLateCheckpoint}=await import('/engine/quick-start.js'),seen=[];
  await buildLateCheckpoint(kind,{mod:mana.mod,pump:async(f,b)=>{mana.run(f,b);const s=mana.mod.frieza.status;if(s.scene?.kind==='lift')seen.push({kind:s.scene.kind,species:mana.read8(0xe580),active:mana.read8(0xe400)&1,graphics:mana.read16(0xe470)});},capture:()=>mana.snapshot(),cache:()=>{},progress:()=>{}});
  return{seen,frieza:mana.mod.frieza.status,status:mana.mod.status};
 },kind);
}

test('Dryad’s late-game visit starts Frieza immediately; stolen Balls cannot be wished and old deliveries do not complete the quest',async({page})=>{
 await load(page);const guards=await page.evaluate(()=>{const m=mana.mod;m.quest.restore({mask:127,seedMask:0,delivered:7});const delivered=m.frieza.eligible;m.quest.restore({mask:127,seedMask:63});const six=m.frieza.eligible;m.quest.restore({mask:127,seedMask:127});return{delivered,six,seven:m.frieza.eligible};});
 expect(guards).toEqual({delivered:false,six:false,seven:true});
 await late(page,'late');
 await page.evaluate(()=>{mana.mod.story.request(0xa7);mana.run(200,[11]);});
 // The altar theft leaves no crisis; Mech Rider III's Fortress deck hosts the Death Ball.
 for(let i=0;i<80;i++){if(await page.evaluate(()=>mana.mod.frieza.status.stage==='palace'&&mana.mod.canAttack&&!mana.read8(0xd0)))break;await page.evaluate(()=>{mana.run(26);mana.run(4,[11]);});}
 expect(await page.evaluate(()=>[mana.mod.frieza.status.stage,mana.mod.frieza.crisisActive])).toEqual(['palace',false]);
 await page.evaluate(()=>{mana.mod.story.travel(0x3df);for(let i=0;i<40&&!(mana.read16(0xdc)===418&&mana.mod.canAttack);i++)mana.run(20,[11]);mana.write8(0xcf44,6);mana.run(30);mana.mod.story.travel(0x3dd);});
 for(let i=0;i<200;i++){if(await page.evaluate(()=>mana.mod.worldFlight&&mana.mod.frieza.status.crisis?.flightNotified))break;await page.evaluate(()=>{const m=mana.mod,b=m.entities().find(e=>e.active&&e.index>=3&&e.hp>0);if(b&&m.canAttack&&m.status.map===237)m.hit(b,60000,0,-1);mana.run(26);mana.run(4,[11]);});}
 const result=await page.evaluate(async()=>{const m=mana.mod,{radarTarget}=await import('/engine/dragon-radar.js');m.quest.wish();return{state:m.frieza.status,quest:m.quest.status,target:radarTarget(mana.snes.cart.data,m.quest.status,{frieza:m.frieza.status,fortress:{x:123,y:456}}),world:m.worldFlight,flags:[m.read8(0xcf41),m.read8(0xcf44)],error:m.story.status.error};});
 expect(result.state).toMatchObject({stage:'hunt',stolen:true,eighth:true,permanent:false});expect(result.quest).toMatchObject({held:0,seedMask:127,wished:false});expect(result.target.id).toBe('mana-tree');expect(result.error).toBe(null);
 expect(result.world).toBe(true);expect(result.flags[0]).toBe(3);expect(result.flags[1]).toBeGreaterThanOrEqual(6);expect(result.state.crisis).toMatchObject({active:true,minutes:5,flightNotified:true});
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:test.info().outputPath('dryad.png')});
});

test('Frieza fires lethal projectiles; flying returns discs, attacks hit him, menus pause shots, and checkpoint replay is exact',async({page})=>{
 await load(page);const entry=await late(page);expect(entry.frieza).toMatchObject({stage:'battle',permanent:true,fallen:true,popoiMember:false});expect(entry.seen).toEqual([],'The direct battle test start skips the confrontation');
 const result=await page.evaluate(()=>{
  const m=mana.mod,base=mana.snapshot();let flying=0;
  // Start with an armed disc coming back across the arena. Fly past its
  // owner so he lies between the chasing disc and Goku. Circling at a
  // constant radius forever does not necessarily make that intersection.
  const state=m.frieza.snapshot(),owner=state.boss;
  owner.shots=[{kind:'disc',x:owner.x-60,y:owner.y,angle:0,speed:3,age:41,trail:[]}];owner.clock=999;
  m.frieza.restore(state);
  for(let f=0;f<40&&!m.frieza.status.discHits;f++){
   mana.run(1,f<9?[8,4]:[8]);if(m.localFlight)flying++;
  }
  const circles={flying,discs:m.frieza.status.discHits,boss:m.frieza.status.hp,hits:m.frieza.status.playerHits};
  mana.restore(base);for(let f=0;f<4000&&!mana.battleRetry.defeated;f++)mana.run(1);
  const dead={hp:m.status.hp,frozen:mana.battleRetry.defeated,map:m.status.map,hits:m.frieza.status.playerHits};
  mana.restore(base);m.instantTransmission();mana.run(14);mana.run(50,[10,1]);mana.run(1);mana.run(70);const beam=m.frieza.status.hp;
  mana.restore(base);mana.run(130);const checkpoint=mana.snapshot();mana.run(50,[8,7]);const a=m.frieza.snapshot();mana.restore(checkpoint);mana.run(50,[8,7]);const b=m.frieza.snapshot();
  // Native ring is a real modal pause, and X returns to the same fight.
  mana.restore(base);mana.run(2,[9]);mana.run(70);const opened=!!(m.read8(0xec)&12),before=m.frieza.status.boss.age;mana.run(100);const after=m.frieza.status.boss.age;mana.run(3,[9]);mana.run(90);const resumed=m.frieza.status.boss.age;
  m.configure({superSaiyan:false});m.write8(0xe191,m.read8(0xe191)|32);mana.run(3);const poison=m.options.superSaiyan;m.write8(0xe190,m.read8(0xe190)|16);mana.run(3);
  return{circles,dead,beam,replay:JSON.stringify(a)===JSON.stringify(b),menu:{opened,before,after,resumed},poison,sleep:m.options.superSaiyan,bossBlocksEscape:m.ceiling.bossActive,vanillaBoss:m.entities().some(e=>!e.custom&&e.active&&e.species===121),error:m.story.status.error};
 });
 writeFileSync(test.info().outputPath('combat.json'),JSON.stringify(result,null,2));
 expect(result.circles.flying).toBeGreaterThan(8);expect(result.circles.discs).toBeGreaterThan(0);expect(result.circles.boss).toBeLessThan(96000);
 expect(result.dead).toMatchObject({hp:0,frozen:true,map:246});expect(result.dead.hits).toBeGreaterThanOrEqual(6);expect(result.beam).toBeLessThan(96000);
 expect(result.replay).toBe(true);expect(result.menu.opened).toBe(true);expect(result.menu.before).toBe(result.menu.after);expect(result.menu.resumed).toBeGreaterThan(result.menu.after);expect(result.poison&&result.sleep).toBe(true);expect(result.bossBlocksEscape).toBe(true);expect(result.vanillaBoss).toBe(false);expect(result.error).toBe(null);
});

for(const mask of[0,1,2,3])test(`Frieza route reaches the wish and restores only recruited Popoi, party ${mask}`,async({page})=>{
 await load(page,mask);await late(page,'frieza');
 for(let i=0;i<110;i++){
  const ready=await page.evaluate(()=>{const m=mana.mod,b=m.entities().find(e=>e.active&&!e.custom&&e.species===121&&e.hp);if(b&&m.canAttack)m.hit(b,60000,0,-1);if(m.frieza.fighting&&m.canAttack)return true;mana.run(60,[11]);return false;});if(ready)break;
 }
 expect(await page.evaluate(()=>mana.mod.frieza.popoiMember)).toBe(!!(mask&2));
  await page.evaluate(()=>{
   const m=mana.mod;for(let i=0;i<200&&m.frieza.status.stage==='battle';i++){
    const clash=m.frieza.orbit?.clash;
    if(clash?.phase==='charge'){mana.run(50,[10,1]);mana.run(1);}
    else if(clash?.phase==='struggle'){mana.run(1,[0]);mana.run(3);}
    else{if(!m.frieza.inputLocked)m.frieza.hit(m.frieza.entity(),1e8);mana.run(20);}
   }
  });
 let beast=false;for(let i=0;i<70;i++){
  const s=await page.evaluate(()=>{mana.run(100,[11]);return{map:mana.mod.status.map,control:mana.mod.canAttack,event:mana.mod.story.status.lastEvent};});
  if(s.event===0x9a)await page.evaluate(()=>{mana.run(3,[0]);mana.run(30);});
  if(s.map===253&&s.control){beast=true;break;}
 }
 expect(beast).toBe(true);expect(await page.evaluate(()=>mana.mod.quest.status.held)).toBe(7);expect(await page.evaluate(()=>mana.mod.challenge.status)).toMatchObject({fed:true,started:true,won:false});
 for(let i=0;i<150;i++){
  const complete=await page.evaluate(()=>{const m=mana.mod,b=m.entities().find(e=>e.active&&e.species===127&&e.hp);if(b&&m.canAttack)m.hit(b,60000,0,-1);mana.run(70,[11]);return m.ending.complete;});if(complete)break;
 }
 const end=await page.evaluate(()=>({map:mana.mod.status.map,complete:mana.mod.ending.complete,ending:mana.mod.ending.status,challenge:mana.mod.challenge.status,wished:mana.mod.quest.status.wished,fallen:mana.mod.frieza.fallen,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],popoiHP:mana.read16(0xe582),permanent:mana.mod.frieza.permanent,crisis:mana.mod.frieza.status.crisis,error:mana.mod.story.status.error}));
 expect(end).toMatchObject({map:131,complete:true,ending:{outcome:'good',phase:'complete'},challenge:{fed:true,started:true,won:true},wished:true,fallen:false,party:[mask&1,mask>>1&1],permanent:true,crisis:{active:false,resolved:true},error:null});if(mask&2)expect(end.popoiHP).toBeGreaterThan(0);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:test.info().outputPath('ending.png')});
});

test('native GAME FILE keeps Frieza theft separate from other saves',async({page})=>{
 await load(page);await page.evaluate(()=>{const m=mana.mod;m.quest.restore({mask:127,seedMask:127});m.frieza.restore({stage:'hunt',stolen:true,eighth:true,hinted:true});const c=mana.snes.cart.data,r=mana.snes.ram,old=c.slice(0x742b0,0x742b3);try{c.set([0x10,0x50,0],0x742b0);r.set([1,0xb0,0x42,0xc7],0xd0);mana.run(180);for(let i=0;i<5;i++){mana.run(2,[0]);mana.run(100);}}finally{c.set(old,0x742b0);}});
 expect(await page.evaluate(()=>mana.battery.metadataFor(0)?.frieza.stolen)).toBe(true);
 await page.reload();await page.waitForFunction(()=>mana.ready);
 const loaded=await page.evaluate(()=>{mana.pause();mana.run(960);mana.run(2,[3]);mana.run(180);mana.run(2,[5]);mana.run(60);mana.run(2,[0]);mana.run(180);mana.run(4,[0]);mana.run(360);return{stage:mana.mod.frieza.status.stage,held:mana.mod.quest.status.held,seedMask:mana.mod.quest.status.seedMask,canAttack:mana.mod.canAttack,crisis:mana.mod.frieza.status.crisis};});
 expect(loaded).toMatchObject({stage:'hunt',held:0,seedMask:127,canAttack:true,crisis:{active:true,minutes:5}});
});
