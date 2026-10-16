import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

const fixture='.local/graphics-audit/party.json';
async function until(page,predicate,limit=3600){
 for(let n=0;n<limit;n+=40){if(await page.evaluate(predicate))return;await page.evaluate(()=>mana.run(40,[11]));}
 expect(await page.evaluate(predicate),JSON.stringify(await page.evaluate(()=>({status:mana.mod.status,trial:mana.mod.trial.status,story:mana.mod.story.status,party:[0xe000,0xe200,0xe400].map(a=>mana.read8(a))})))).toBe(true);
}
for(const mask of[0,1,2,3])test(`Vegeta spars alone and returns lineup ${mask} after a draw or a rest`,async({page})=>{
 test.setTimeout(180000);test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and native checkpoint');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,mask})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod,c=mana.snes.cart.data;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.powerIntro.restore({flight:true,superShown:true});
  for(let i=1;i<=2;i++)if(!(mask&(1<<(i-1))))mana.write8(0xe000+i*512,0);
  const e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set(c.slice(0x83000+0x304*4,0x83004+0x304*4),0x8300c);mana.write8(0xcf3f,4);
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);}
 },{state:JSON.parse(readFileSync(fixture)),mask});
 const entry=await page.evaluate(()=>{const m=mana.mod;return{mask:m.trial.partyMask,state:m.trial.status,enemy:m.trial.entity(),camera:m.status};});
 expect(entry.mask).toBe(mask);expect(entry.enemy.screenX).toBeGreaterThan(30);expect(entry.enemy.screenX).toBeLessThan(225);
 expect(entry.enemy.screenY).toBeGreaterThan(95);expect(entry.enemy.screenY).toBeLessThan(185);
 await until(page,()=>mana.mod.trial.status?.phase==='battle'&&mana.mod.canAttack);
 expect(await page.evaluate(()=>mana.mod.entities().filter(e=>e.active).map(e=>e.index))).toEqual([0,3]);
 const battle=await page.evaluate(()=>mana.snapshot());
 if(mask===3){
  const ring=await page.evaluate(()=>{const m=mana.mod;mana.run(2,[9]);mana.run(90);const before=m.trial.snapshot();mana.run(120);const after=m.trial.snapshot();mana.run(2,[9]);mana.run(90);return{before,after,closed:!(mana.read8(0xec)&0xfe),hp:m.status.hp};});
  expect(ring.after).toEqual(ring.before);expect(ring.closed).toBe(true);expect(ring.hp).toBeGreaterThan(0);
 }
 // Exercise the real native return script, including ADD_CHARACTER and the
 // Joch reveal. The separate route test kills both phases with real input.
 await page.evaluate(()=>{const t=mana.mod.trial;t.hit(t.entity(),1000000);});
 if(mask===0){
  await page.evaluate(()=>{mana.run(100);document.querySelector('#native-pause').hidden=true;});
  await page.locator('#screen').screenshot({path:test.info().outputPath('vegeta-transformation.png')});
 }
 await until(page,()=>mana.mod.trial.status?.tier===1&&mana.mod.trial.status?.phase==='battle');
 if(mask===0){
  await page.evaluate(()=>{mana.run(84-mana.mod.trial.status.action.age);document.querySelector('#native-pause').hidden=true;});
  await page.locator('#screen').screenshot({path:test.info().outputPath('vegeta-galick-gun.png')});
 }
 await page.evaluate(()=>{const t=mana.mod.trial;t.hit(t.entity(),1000000);});
 expect(await page.evaluate(()=>mana.mod.trial.status.phase)).toBe('draw');
 if(mask===0){
  await page.evaluate(()=>{mana.run(90);document.querySelector('#native-pause').hidden=true;});
  await page.locator('#screen').screenshot({path:test.info().outputPath('vegeta-draw.png')});
 }
 await until(page,()=>mana.mod.status.map===18&&mana.read8(0xcf3f)===6&&mana.mod.canAttack,6000);
 const win=await page.evaluate(()=>({party:[0xe000,0xe200,0xe400].map(b=>!!(mana.read8(b)&1)),hp:mana.mod.status.hp,error:mana.mod.story.status.error}));
 expect(win).toEqual({party:[true,!!(mask&1),!!(mask&2)],hp:999,error:null});
 await page.evaluate(state=>{mana.restore(state);mana.mod.cancelCombat();mana.write16(0xe182,1);mana.write16(0xe1f1,999);mana.write8(0xe1f0,3);},battle);
 await until(page,()=>mana.mod.status.map===18&&mana.mod.canAttack,6000);
 const lose=await page.evaluate(()=>({party:[0xe000,0xe200,0xe400].map(b=>!!(mana.read8(b)&1)),hp:mana.mod.status.hp,stage:mana.read8(0xcf3f),error:mana.mod.story.status.error}));
 expect(lose).toEqual({party:[true,!!(mask&1),!!(mask&2)],hp:999,stage:4,error:null});expect(errors).toEqual([]);
});

test('the Vegeta test link opens the dialogue, safely frames both fighters, and starts in base form',async({page})=>{
 test.setTimeout(90000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM');
 await page.goto('/?start=trial');await page.waitForFunction(()=>mana.ready,{},{timeout:60000});
 const s=await page.evaluate(()=>{mana.pause();mana.run(90);const m=mana.mod;return{map:m.status.map,phase:m.trial.status?.phase,mask:m.trial.partyMask,ssj:m.options.superSaiyan,pose:m.spriteLayer.plan.sprite,enemy:m.trial.entity(),hero:m.status,event:m.story.status.lastEvent,error:m.story.status.error};});
 expect(s).toMatchObject({map:72,phase:'intro',mask:3,ssj:false,pose:{sheet:'goku',row:0},event:0x3db,error:null});
 expect(s.enemy.screenY).toBeGreaterThan(95);expect(s.enemy.screenY).toBeLessThan(185);
 expect(await page.evaluate(()=>mana.mod.localFlightHook.bounds())).toEqual({width:1024,height:1024});
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);
 await page.locator('#screen').screenshot({path:test.info().outputPath('vegeta-entrance.png')});
});

test('the expanded Time Chamber scrolls with flight, holds its background during rings, and blocks its boundary',async({page},info)=>{
 test.setTimeout(120000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM');
 await page.goto('/?start=trial');await page.waitForFunction(()=>mana.ready,{},{timeout:60000});await page.evaluate(()=>mana.pause());
 await until(page,()=>mana.mod.canAttack&&mana.mod.trial.status?.phase==='battle');
 const result=await page.evaluate(()=>{
  const m=mana.mod,h=m.localFlightHook,t=m.trial.snapshot();
  // Isolate the camera/collision check from battle knockback, without moving
  // Goku or the camera directly. Combat has its own real-input route test.
  m.trial.restore({...t,clock:10000,action:null,shots:[],rocks:[],grace:10000});
  const start=m.status;mana.run(45,[8,5]);const south=m.status;mana.run(90,[8,7]);const east=m.status;mana.run(1);mana.run(20);
  const camera=()=>[mana.read16(0xa8),mana.read16(0xaa)],before=camera();
  mana.run(2,[9]);mana.run(80);const during=camera(),open=!!(mana.read8(0xec)&0xfe);mana.run(2,[9]);mana.run(90);const after=camera();
  const roof=h.canFly(520,280,0),borders=[[24,800],[1000,800],[800,24],[800,1000]].map(p=>h.canFly(...p,0));
  return{start,south,east,before,during,after,open,closed:!(mana.read8(0xec)&0xfe),roof,borders,error:m.story.status.error};
 });
 expect(result.south.y-result.start.y).toBeGreaterThan(250);expect(result.south.cameraY).toBeGreaterThan(result.start.cameraY+150);
 expect(result.east.x).toBeGreaterThan(950);expect(result.east.x).toBeLessThan(992);expect(result.east.cameraX).toBeGreaterThan(result.start.cameraX+250);
 expect(result.open).toBe(true);expect(result.closed).toBe(true);expect(result.during).toEqual(result.before);expect(result.after).toEqual(result.before);
 expect(result.roof).toBe(false);expect(result.borders).toEqual([false,false,false,false]);expect(result.error).toBe(null);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:info.outputPath('chamber-boundary.png')});
});

test('the chamber fades through black, clears both native planes, and never hides a walking or flying body',async({page},info)=>{
 test.setTimeout(120000);test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and checkpoint');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 const frames=await page.evaluate(state=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:true});mana.write8(0xcf3f,4);
  if(!m.story.travel(0x304))throw Error('Cannot enter Time Chamber');
  const out=[];
  for(let n=0;n<360;n++){
   mana.run(1);const t=m.trial.status,s=m.status,p=mana.snes.ppu;
   let white=0;
   if(n<5)for(let y=80;y<176;y++)for(let x=16;x<240;x++){
    const k=y*1536+x*6;if(p.pixelOutput[k]>210&&p.pixelOutput[k+1]>210&&p.pixelOutput[k+2]>210)white++;
   }
   out.push({n,loaded:m.trial.roomLoaded,blank:p.forcedBlank,b:p.brightness,entrance:t?.entrance,ssj:m.options.superSaiyan,pose:m.spriteLayer.plan.sprite,view:[s.x,s.y,s.cameraX,s.cameraY],white:white/(96*224)});
  }return out;
 },JSON.parse(readFileSync(fixture)));
 expect(frames.slice(0,5).every(f=>!f.loaded&&f.white<.65)).toBe(true);
 expect(frames.some(f=>f.blank)).toBe(true);
 const settling=frames.filter(f=>f.loaded&&!f.blank&&!f.entrance?.revealed);
 expect(settling.length).toBeGreaterThan(20);expect(settling.every(f=>f.b===0)).toBe(true);
 const reveal=frames.filter(f=>f.entrance?.revealed&&f.b>0&&f.b<15);
 expect(reveal.length).toBeGreaterThan(40);expect(new Set(reveal.map(f=>JSON.stringify(f.view))).size).toBe(1);
 expect(reveal.every(f=>!f.ssj&&f.pose?.sheet==='goku'&&f.pose?.row===0)).toBe(true);
 await until(page,()=>mana.mod.canAttack&&mana.mod.trial.status?.phase==='battle');
 const result=await page.evaluate(()=>{
  const m=mana.mod,r=mana.snes.ram,t=m.trial.snapshot();let dirty=0;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(r[0x14000+y*128+x])dirty++;
  m.trial.restore({...t,clock:10000,action:null,shots:[],rocks:[],grace:10000});
  const p=mana.snes.ppu,old=p.getColor;let samples=0,hidden=0;
  p.getColor=function(sub,x,y){const out=old.call(this,sub,x,y);if(!sub&&m.spriteLayer.customLine[x]&&![2,3].includes(out[1])){samples++;if(out[1]!==4)hidden++;}return out;};
  try{for(const buttons of[[5],[7],[4],[6],[6],[5],[8,7],[8,4]])mana.run(60,buttons);}finally{p.getColor=old;}
  return{dirty,samples,hidden,error:m.story.status.error};
 });
 expect(result.dirty).toBe(0);expect(result.samples).toBeGreaterThan(10000);expect(result.hidden).toBe(0);expect(result.error).toBe(null);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:info.outputPath('complete-goku-body.png')});
});

test('a real Kamehameha locks Final Flash and mashing pushes the collision ball before sparring resumes',async({page},info)=>{
 test.setTimeout(120000);test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?start=trial');await page.waitForFunction(()=>mana.ready,{},{timeout:60000});await page.evaluate(()=>mana.pause());
 await until(page,()=>mana.mod.canAttack&&mana.mod.trial.status?.phase==='battle');
 const locked=await page.evaluate(()=>{
  const m=mana.mod;m.options.superSaiyan=true;mana.run(2,[7]);
  const h=m.status,x=h.x+104,y=h.y,t=m.trial.snapshot();
  m.trial.restore({...t,tier:1,hp:60000,x,y,facing:2,grace:1000,shots:[],action:{kind:'beam',age:0,dx:-1,dy:0,x,y}});
  mana.run(68,[10,1]);mana.run(1);
  for(let n=0;n<35&&!m.trial.status.clash;n++)mana.run(1);
  return{trial:m.trial.status,hero:m.status};
 });
 expect(locked.trial.clash?.phase).toBe('lock');expect(locked.trial.clashes).toBe(1);
 await page.evaluate(()=>{document.querySelector('#native-pause').hidden=true;});
 await page.locator('#screen').screenshot({path:info.outputPath('final-flash-lock.png')});
 await page.evaluate(()=>{while(mana.mod.trial.status.clash.phase!=='struggle')mana.run(1);});
 const saved=await page.evaluate(()=>mana.snapshot());
 const held=await page.evaluate(()=>{const before=mana.mod.trial.status.clash;mana.run(70,[0]);return{before,after:mana.mod.trial.status.clash,hero:mana.mod.status};});
 expect(held.after.taps-held.before.taps).toBe(1);expect(held.after.shown).toBeLessThan(held.before.shown);
 expect([held.hero.x,held.hero.y]).toEqual([locked.hero.x,locked.hero.y]);
 const pushed=await page.evaluate(()=>{
  const t=mana.mod.trial;mana.run(1);for(let n=0;n<12;n++){mana.run(2,[0]);mana.run(8);}
  return t.status.clash;
 });
 expect(pushed.shown).toBeGreaterThan(held.after.shown);
 await page.evaluate(()=>document.querySelector('#native-pause').hidden=true);await page.locator('#screen').screenshot({path:info.outputPath('final-flash-struggle.png')});
 const detonation=await page.evaluate(()=>{
  const m=mana.mod;
  for(let n=0;n<90&&m.trial.status.clash?.phase!=='release';n++){mana.run(2,[0]);mana.run(8);}
  while(m.trial.status.clash.age<54)mana.run(1);
  return{hp:m.trial.status.hp,result:m.trial.status.clash.result,hero:[m.status.x,m.status.y]};
 });
 expect(detonation).toEqual({hp:locked.trial.hp,result:'win',hero:[locked.hero.x,locked.hero.y]});
 await page.locator('#screen').screenshot({path:info.outputPath('final-flash-detonation.png')});
 const won=await page.evaluate(()=>{
  const m=mana.mod;for(let n=0;n<90&&m.trial.status.clash;n++){mana.run(2,[0]);mana.run(8);}
  mana.run(1);return{trial:m.trial.status,hero:m.status,effects:m.effects.map(e=>e.kind)};
 });
 expect(won.trial.clash).toBe(null);expect(won.trial.hp).toBeLessThan(locked.trial.hp-15000);expect(won.trial.phase).toBe('battle');expect(won.hero.hp).toBeGreaterThan(0);
 const lost=await page.evaluate(state=>{
  mana.restore(state);const m=mana.mod,before=m.status.hp;
  for(let n=0;n<600&&m.trial.status.clash;n++)mana.run(1);
  mana.run(75);return{before,after:m.status.hp,phase:m.trial.status.phase,clash:m.trial.status.clash,can:m.canAttack};
 },saved);
 expect(lost.clash).toBe(null);expect(lost.phase).toBe('battle');expect(lost.after).toBeLessThan(lost.before);expect(lost.after).toBeGreaterThan(0);expect(lost.can).toBe(true);expect(errors).toEqual([]);
});
test('Vegeta is drawn against the scrolled background, not Goku\'s wobbling sprite camera',async({page})=>{
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and native checkpoint');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(state=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);const m=mana.mod,c=mana.snes.cart.data;
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.powerIntro.restore({flight:true,superShown:true});
  const e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set(c.slice(0x83000+0x304*4,0x83004+0x304*4),0x8300c);mana.write8(0xcf3f,4);
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);}
 },JSON.parse(readFileSync(fixture)));
 await until(page,()=>mana.mod.trial.status?.phase==='battle'&&mana.mod.canAttack);
 const r=await page.evaluate(async()=>{
  const {viewCamera}=await import('/engine/view-camera.js');
  const m=mana.mod,ppu=mana.snes.ppu,ev=ppu.evaluateSprites,seen=[];
  // Sample both cameras where custom sprites are prepared: line 0.
  ppu.evaluateSprites=function(line){if(line===0){const v=viewCamera(m),s=m.status;seen.push([v.cameraX,s.cameraX,this.bgHoff[0]]);}return ev.call(this,line);};
  for(const dir of[7,7,7,7,7,7,6,6,6,6,6,6])mana.run(1,[8,dir]);
  ppu.evaluateSprites=ev;
  return{view:new Set(seen.map(s=>s[0]-s[2])).size,status:new Set(seen.map(s=>s[1]-s[2])).size};
 });
 // The view camera moves only with BG1 itself; the OAM-derived one wobbled.
 expect(r.view).toBe(1);
});
