import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

test.setTimeout(240000);
async function load(page,path){
 test.skip(!existsSync(path)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private user ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{
  mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);
  Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:true});
  for(const base of[0xe200,0xe400])mana.snes.ram.fill(0,base,base+512);
  mana.mod.radio.restore({firstFlight:true});mana.run(3);document.querySelector('#native-pause').hidden=true;
 },JSON.parse(readFileSync(path)));
}
async function capture(page,name){await page.locator('#screen').screenshot({path:test.info().outputPath(`${name}.png`)});}

test('Fortress beam cuts to a replayable planet view, then destruction dooms even a seven-Ball run',async({page})=>{
 await load(page,'.local/juice-research/flight/request-flight.json');
 const shot=await page.evaluate(()=>{
  const m=mana.mod;m.quest.restore({mask:127,seedMask:127});m.frieza.restore({stage:'hunt',stolen:true,eighth:true});
  mana.write8(0xf8,190);mana.run(10);
  for(let f=0;f<60;f++){
   const dx=((mana.read16(0x128)-mana.read16(0xfa)+2048)&4095)-2048,dy=((mana.read16(0x12a)-mana.read16(0xfc)+2048)&4095)-2048;
   // Deliberately off-axis, but inside the full-power beam's hit radius.
   mana.write16(0xf6,(Math.round(Math.atan2(-dx,-dy)*512/Math.PI)+9)&1023);mana.run(1,[10,1]);
  }
  mana.run(18);return m.worldKi.status;
 });
 expect(shot.shot).toMatchObject({mega:true,ki:false,hit:true,target:{id:'mana-fortress'}});
 expect(shot.fortressDestroyed).toBe(true);await capture(page,'one-giant-beam');
 await page.evaluate(()=>{for(let i=0;i<80&&!mana.mod.worldKi.cinematic;i++)mana.run(1);mana.run(22);});
 expect(await page.evaluate(()=>mana.mod.worldKi.cinematic?.age)).toBe(22);await capture(page,'beam-from-space');
 const replay=await page.evaluate(()=>{
  const saved=mana.snapshot();mana.run(80,[8,7]);const a={pixels:mana.hash(mana.pixels),state:mana.mod.worldKi.snapshot()};
  mana.restore(saved);mana.run(80,[8,7]);return{same:a.pixels===mana.hash(mana.pixels)&&JSON.stringify(a.state)===JSON.stringify(mana.mod.worldKi.snapshot()),world:mana.mod.worldFlight};
 });expect(replay).toEqual({same:true,world:true});await capture(page,'space-dust');
 await page.evaluate(()=>mana.run(54));await capture(page,'space-settling');
 let deck=null;
 for(let i=0;i<200;i++){
  const status=await page.evaluate(()=>{mana.run(3);return{...mana.mod.worldKi.collapse.status,blank:mana.snes.ppu.forcedBlank,brightness:mana.snes.ppu.brightness,flight:mana.mod.worldFlight,transition:mana.mod.flightTransition};});
  if(status.active&&!status.blank&&status.scars&&status.brightness>=10){deck=status;break;}
 }
 expect(deck).toMatchObject({active:true,music:0x1b,flight:false});await capture(page,'damaged-fortress-landing');
 const collapseReplay=await page.evaluate(()=>{
  const saved=mana.snapshot(),tiles=mana.hash(mana.snes.ram.slice(0x10000,0x18000));mana.run(12);
  const first={pixels:mana.hash(mana.pixels),state:mana.mod.worldKi.collapse.snapshot()};
  mana.restore(saved);mana.run(12);return{same:first.pixels===mana.hash(mana.pixels)&&JSON.stringify(first.state)===JSON.stringify(mana.mod.worldKi.collapse.snapshot()),tilesIntact:tiles===mana.hash(mana.snes.ram.slice(0x10000,0x18000))};
 });expect(collapseReplay).toEqual({same:true,tilesIntact:true});await capture(page,'damaged-fortress-explosions');
 for(let i=0;i<90;i++){
  if(await page.evaluate(()=>mana.read16(0xdc)===253&&mana.mod.canAttack&&mana.mod.challenge.status.started))break;
  await page.evaluate(()=>mana.run(100,[11]));
 }
 expect(await page.evaluate(()=>({map:mana.read16(0xdc),can:mana.mod.canAttack,challenge:mana.mod.challenge.status,frieza:mana.mod.frieza.status}))).toMatchObject({map:253,can:true,challenge:{fed:true,started:true},frieza:{stage:'hunt',stolen:true}});
 const seen=new Set();let complete=false;
 for(let i=0;i<160;i++){
  const result=await page.evaluate(()=>{
   const m=mana.mod,b=m.entities().find(e=>e.active&&e.species===127&&e.hp);
   if(b&&m.canAttack)m.hit(b,60000,0,-1);
   mana.run(45,[11]);return{ending:m.ending.status,error:m.story.status.error};
  });expect(result.error).toBe(null);
  if(!result.ending)continue;
  const phase=result.ending.phase;
  if(!seen.has(phase)){
   seen.add(phase);
   if(phase==='explode')await page.evaluate(()=>mana.run(Math.max(0,70-mana.mod.ending.status.age)));
   await capture(page,`bad-${phase}`);
   if(phase==='kai'){
    const exact=await page.evaluate(()=>{const saved=mana.snapshot();mana.run(12);const a=mana.hash(mana.pixels);mana.restore(saved);mana.run(12);return a===mana.hash(mana.pixels);});expect(exact).toBe(true);
   }
  }
  if(phase==='complete'){complete=true;break;}
 }
 expect(complete).toBe(true);expect([...seen]).toEqual(['doomed','explode','escape','kai','complete']);
 const end=await page.evaluate(()=>({ending:mana.mod.ending.status,quest:mana.mod.quest.status,frieza:mana.mod.frieza.status,scars:mana.mod.worldScars.status,error:mana.mod.story.status.error}));
 writeFileSync(test.info().outputPath('bad-ending.json'),JSON.stringify(end,null,2));
 expect(end).toMatchObject({ending:{outcome:'bad',reason:'fortress',phase:'complete'},quest:{seedMask:127,wished:false,delivered:0},frieza:{stage:'hunt',stolen:true,crisis:{active:true}},error:null});
 expect(end.frieza.crisis.resolved).not.toBe(true);
 expect(end.scars.length).toBeGreaterThan(0);
});

test('an ordinary early finale cannot invent Balls or summon Shenron',async({page})=>{
 await load(page,'.local/graphics-audit/party.json');
 await page.evaluate(()=>{mana.mod.quest.restore({mask:0,seedMask:0});mana.write8(0xcf4e,8);mana.mod.story.request(0x42f);});
 const seen=new Set();for(let i=0;i<110;i++){
  const s=await page.evaluate(()=>{mana.run(70,[11]);return mana.mod.ending.status;});if(s)seen.add(s.phase);if(s?.phase==='complete')break;
 }
 expect([...seen]).toEqual(['doomed','explode','escape','kai','complete']);
 expect(await page.evaluate(()=>({ending:mana.mod.ending.status,quest:mana.mod.quest.status,error:mana.mod.story.status.error}))).toMatchObject({ending:{outcome:'bad',reason:'balls',phase:'complete'},quest:{count:0,seedMask:0,delivered:0,wished:false},error:null});
 await capture(page,'incomplete-quest-bad-ending');
});
