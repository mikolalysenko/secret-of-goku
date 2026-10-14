import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(240000);
async function prepare(page,kind='battle',mask=0){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 return page.evaluate(async({s,kind,mask})=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);
  const m=mana.mod;Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});
  for(let i=0;i<2;i++)if(!(mask>>i&1))mana.snes.ram.fill(0,0xe200+i*512,0xe400+i*512);
  mana.run(3);const {buildLateCheckpoint}=await import('/engine/quick-start.js');
  await buildLateCheckpoint(kind,{mod:m,pump:async(f,b)=>mana.run(f,b),capture:()=>mana.snapshot(),cache:()=>{},progress:()=>{}});
  document.querySelector('#native-pause').hidden=true;
  return{stage:m.frieza.status.stage,trial:m.frieza.trial,canAttack:m.canAttack};
 },{s:JSON.parse(readFileSync(fixture)),kind,mask});
}
for(const mask of[0,3])test(`Frieza sponsors native Thanatos, then duels without absent-actor waits, party ${mask}`,async({page})=>{
 await prepare(page,'frieza',mask);let lich=false,duel=false,empower=false,lichHP=0;
 for(let i=0;i<110;i++){
  const s=await page.evaluate(()=>{
   const m=mana.mod,b=m.entities().find(e=>e.active&&!e.custom&&e.species===121&&e.hp);
   const result={lich:!!b,lichHP:b?.maxHp??0,duel:m.frieza.fighting&&m.canAttack,empower:m.frieza.status.scene?.kind==='empower'};
   if(b&&m.canAttack)m.hit(b,60000,0,-1);
   if(!result.duel)mana.run(60,[11]);
   return{...result,error:m.story.status.error};
  });lich||=s.lich;lichHP=Math.max(lichHP,s.lichHP);empower||=s.empower;expect(s.error).toBe(null);
  if(s.duel){duel=true;break;}
 }
 expect({lich,duel,empower,lichHP}).toEqual({lich:true,duel:true,empower:true,lichHP:48000});
 expect(await page.evaluate(()=>({won:mana.mod.frieza.status.trialWon,party:mana.mod.frieza.popoiMember,native:mana.mod.entities().some(e=>e.active&&!e.custom&&e.species===121)}))).toEqual({won:true,party:!!(mask&2),native:false});
 await page.locator('#screen').screenshot({path:test.info().outputPath('duel-after-thanatos.png')});
});

test('Frieza escalates through a fractured deck and cosmic beam, then returns safe control with exact checkpoints',async({page})=>{
 await prepare(page);
 const base=await page.evaluate(()=>mana.snapshot());writeFileSync(test.info().outputPath('battle.json'),JSON.stringify(base));
 await page.locator('#screen').screenshot({path:test.info().outputPath('duel.png')});
 const phase1=await page.evaluate(()=>{
  const m=mana.mod,grid=mana.hash(mana.snes.ram.slice(0x10000,0x18000));m.frieza.hit(m.frieza.entity(),1e8);mana.run(50);
  return{grid,hp:m.frieza.status.hp,tier:m.frieza.status.boss.tier,locked:m.frieza.inputLocked,scars:m.frieza.status.boss.arena.scars.length};
 });
 expect(phase1).toMatchObject({hp:64000,tier:1,locked:true});expect(phase1.scars).toBeGreaterThan(1);
 await page.locator('#screen').screenshot({path:test.info().outputPath('deck-burst.png')});
 await page.evaluate(()=>mana.run(45));
 const phase2=await page.evaluate(()=>{
  const m=mana.mod;m.frieza.hit(m.frieza.entity(),1e8);mana.run(112);
  return{hp:m.frieza.status.hp,tier:m.frieza.status.boss.tier,cinematic:m.frieza.cinematic?.kind,damage:m.frieza.status.boss.arena.scars.length,saved:mana.snapshot()};
 });
 expect(phase2).toMatchObject({hp:32000,tier:2,cinematic:'frieza-cosmic'});
 await page.locator('#screen').screenshot({path:test.info().outputPath('cosmic-clash.png')});
 const replay=await page.evaluate(saved=>{
  const m=mana.mod,position=[m.status.x,m.status.y],hp=m.status.hp;
  mana.run(35,[10,1,7]);const pixels=mana.hash(mana.pixels),a=m.frieza.snapshot();
  mana.restore(saved);mana.run(35,[10,1,7]);const exact=JSON.stringify(a)===JSON.stringify(m.frieza.snapshot())&&pixels===mana.hash(mana.pixels);
  const during={position:[m.status.x,m.status.y],hp:m.status.hp,nativeButtons:mana.snes.joypad1State};
  mana.run(75);return{exact,position,hp,during,cinematic:m.frieza.cinematic,locked:m.frieza.inputLocked,control:m.canAttack,grid:mana.hash(mana.snes.ram.slice(0x10000,0x18000)),error:m.story.status.error};
 },phase2.saved);
 expect(replay.exact).toBe(true);expect(replay.during).toEqual({position:replay.position,hp:replay.hp,nativeButtons:0});
 expect(replay).toMatchObject({cinematic:null,locked:false,control:true,grid:phase1.grid,error:null});
 await page.locator('#screen').screenshot({path:test.info().outputPath('shattered-deck.png')});
 const movement=await page.evaluate(()=>{const m=mana.mod,before=m.status;mana.run(6,[8,7]);return{before,after:m.status};});
 expect(movement.after.x).toBeGreaterThan(movement.before.x);
 // An old save predating the new fight still initializes all effect state.
 const old=await page.evaluate(()=>{const m=mana.mod,s=m.frieza.snapshot();for(const key of['tier','surge','arena','afterimages','hazards'])delete s.boss[key];m.frieza.restore(s);mana.run(2);return m.story.status.error;});
 expect(old).toBe(null);
});
