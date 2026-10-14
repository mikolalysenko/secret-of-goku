import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

test.setTimeout(180000);
const fixture='.local/graphics-audit/party.json';
for(const mask of[0,1,2,3])test(`earned Shenron wish visits living Randi and finishes on Kai’s planet, party mask ${mask}`,async({page})=>{
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixture and ROM.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(async({state,mask})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);
  Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:true});
  for(let i=0;i<2;i++)if(!(mask>>i&1))mana.snes.ram.fill(0,0xe200+i*0x200,0xe400+i*0x200);
  await mana.mod.ending.ready;
  // Presentation fixtures represent a completed quest; the Frieza browser
  // suite separately reaches these prerequisites through both real fights.
  mana.mod.quest.restore({mask:127,seedMask:127});
  mana.mod.frieza.restore({stage:'defeated',stolen:false,permanent:true,popoiMember:!!(mask&2)});
  mana.mod.challenge.restore({fed:true,started:true,won:true});
  mana.mod.worldScars.strike({id:'potos',name:'Potos',x:1000,y:1000},true);
  mana.write8(0xcf4e,8);mana.run(3);
 },{state:JSON.parse(readFileSync(fixture,'utf8')),mask});
 expect(await page.evaluate(()=>mana.mod.story.request(0x42f))).toBe(true);
 const seen=new Set();let complete=false;
 for(let i=0;i<110;i++){
  const status=await page.evaluate(()=>{mana.run(90,[11]);return{ending:mana.mod.ending.status,error:mana.mod.story.status.error};});
  expect(status.error).toBe(null);
  if(status.ending){
   const phase=status.ending.phase;
   if(!seen.has(phase)){
    seen.add(phase);
    if(phase==='village'){
     expect(await page.evaluate(()=>({map:mana.read16(0xdc),native:mana.mod.ending.nativeBoy,dead:mana.read8(0xe191)&128}))).toEqual({map:131,native:true,dead:0});
     await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:test.info().outputPath('randi-in-potos.png')});
    }
    if(phase==='dragon'){
     await page.evaluate(()=>{mana.run(90);document.querySelector('#native-pause').hidden=true;});
     await page.locator('#screen').screenshot({path:test.info().outputPath('shenron.png')});
     const replay=await page.evaluate(()=>{
      const saved=mana.snapshot();mana.run(10);const a=mana.hash(mana.pixels);mana.restore(saved);mana.run(10);return{a,b:mana.hash(mana.pixels)};
     });expect(replay.a).toBe(replay.b);
    }
   }
   if(phase==='complete'){complete=true;break;}
  }
 }
 expect(complete,JSON.stringify([...seen])).toBe(true);expect([...seen]).toEqual(['summon','dragon','wish','village','depart','kai','complete']);
 const end=await page.evaluate(()=>({map:mana.read16(0xdc),native:mana.mod.ending.nativeBoy,ending:mana.mod.ending.status,scars:mana.mod.worldScars.snapshot(),wished:mana.mod.quest.status.wished,
  hp:mana.read16(0xe182),dead:mana.read8(0xe191)&0x80,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],error:mana.mod.story.status.error}));
 expect(end).toMatchObject({map:131,native:false,ending:{outcome:'good',phase:'complete'},wished:true,dead:0,party:[mask&1,mask>>1&1],error:null});expect(end.hp).toBeGreaterThan(0);expect(end.scars).toEqual([]);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:test.info().outputPath('kai-good-ending.png')});
});
