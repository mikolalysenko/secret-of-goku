import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(240000);
async function prepare(page,kind,party=0){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native fixtures.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(async({s,kind,party})=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);const m=mana.mod;Object.assign(m.options,{enabled:true,power:true});for(let i=0;i<2;i++)if(!(party>>i&1))mana.snes.ram[0xe200+i*512]=0;const{buildLateCheckpoint}=await import('/engine/quick-start.js');await buildLateCheckpoint(kind,{mod:m,pump:async(f,b)=>mana.run(f,b),capture:()=>mana.snapshot(),cache:()=>{},progress:()=>{}});document.querySelector('#native-pause').hidden=true;},{s:JSON.parse(readFileSync(fixture)),kind,party});
}
test('Frieza kills the native Emperor and takes the Balls; his Death Ball follows Mech Rider III on the Fortress deck',async({page},info)=>{
 await prepare(page,'intro');
 const scenes=new Set(),captures=[],errors=[],views=new Set(),pan=[];let finished=false,emperor=false,palace=false,whiteHit=false,flyby=0;
 for(let i=0;i<4000;i++){
  const s=await page.evaluate(()=>{mana.run(8,[11]);const m=mana.mod,c=m.frieza.status.scene;
   let beam=null;
   if(c?.kind==='emperor-shot'&&c.age>=10&&c.age<22){const body=m.ownership.ppuOwners.find(o=>o?.base===c.base&&o.kind==='body');if(body){const y=body.anchor.renderedFeetY-15;beam=[mana.snes.ppu.getColor(false,0,y)[0],mana.snes.ppu.getColor(false,255,y)[0],mana.snes.ppu.getColor(false,200,160)[0],mana.snes.ppu.getColor(false,128,224)[0]];}}
   return{kind:c?.kind,age:c?.age,frame:m.frame,beam,hero:m.frieza.introHero,sprite:m.spriteLayer.plan?.sprite,emperor:m.entities().find(e=>e.active&&e.species===176),target:c?.target,status:m.status,frieza:m.frieza.status,bosses:mana.read8(0xcf4e),error:m.story.status.error,exterior:m.frieza.exteriorScene,jema:m.entities().filter(e=>e.active&&e.species===160),oldJemaHidden:m.frieza.hideOwner({base:0xe600,kind:'body',native:{species:160}}),otherNpcHidden:m.frieza.hideOwner({base:0xe800,kind:'body',native:{species:161}})};});
  emperor||=!!s.emperor;if(s.error)errors.push(s.error);flyby=Math.max(flyby,s.frieza.flyby?.age??0);
  if(s.beam){expect(s.beam).toEqual([32767,32767,0,0]);whiteHit=true;}
  if(s.kind==='reveal')pan.push(s.status.cameraY);
  if(s.kind&&!scenes.has(s.kind)){scenes.add(s.kind);captures.push(s);await page.locator('#screen').screenshot({path:info.outputPath(`${s.kind}.png`)});}
  const beats={'emperor-shot':[12,24],reveal:[150,300],'steal':[32],'temple-exit':[48,96,144],'core-arrival':[48,96],'core-escape':[48,84],'core-charge':[180,216],'core-shot':[48,80,94],'core-impact':[24,60,100,156]};
  for(const age of beats[s.kind]??[]){const label=`${s.kind}-${age}`;if(s.age>=age&&!views.has(label)){views.add(label);await page.locator('#screen').screenshot({path:info.outputPath(`${label}.png`)});}}
  // The altar ends without a crisis; skip ahead to Rider III's room. Its
  // defeat on the Fortress deck brings Frieza back for the Death Ball.
  if(s.frieza.stage==='palace'&&s.status.canAttack&&!palace){palace=true;expect(s.frieza.crisis?.active??false).toBe(false);expect(s.status.map).toBe(431);
   await page.evaluate(()=>{mana.write8(0xcf44,6);mana.mod.story.travel(0x3dd);});}
  if(palace&&s.status.map===237&&s.status.canAttack&&s.frieza.stage==='palace')await page.evaluate(()=>{const m=mana.mod,b=m.entities().find(e=>e.active&&e.index>=3&&e.hp>0);if(b)m.hit(b,60000,0,-1);});
  if(s.frieza.tree==='pursuit'&&s.frieza.eighth&&s.status.worldFlight){finished=true;expect(s.bosses).toBe(0);expect(s.frieza.emperorKilled).toBe(true);expect(s.frieza.crisis?.active).toBe(true);break;}
 }
 writeFileSync(info.outputPath('entrance.json'),JSON.stringify(captures,null,2));
 expect(emperor).toBe(true);expect(palace).toBe(true);expect(flyby).toBeGreaterThan(400);expect([...scenes]).toEqual(expect.arrayContaining(['emperor-shot','emperor-fall','reveal','altar-approach','steal','altar-leave','core-arrival','core-charge']));expect(finished).toBe(true);expect(errors).toEqual([]);expect(whiteHit).toBe(true);
 for(let i=1;i<pan.length;i++){expect(pan[i]).toBeLessThanOrEqual(pan[i-1]);expect(pan[i-1]-pan[i]).toBeLessThanOrEqual(8);}
 const theft=captures.find(s=>s.kind==='steal');expect(theft.status.cameraY).toBe(64);expect(theft.status.y).toBeLessThan(274);expect(theft.status.screenY).toBeLessThan(200);
 for(const s of captures.filter(s=>['reveal','steal','altar-leave'].includes(s.kind)))expect(s.status.map).toBe(431);
 for(const s of captures.filter(s=>['core-arrival','core-charge','core-shot','core-impact'].includes(s.kind)))expect(s.status.map).toBe(237);

});
for(const party of[0,3])test(`Mana Tree pursuit plays native destruction and unlocks Frieza, party ${party}`,async({page},info)=>{
 await prepare(page,'tree',party);const scenes=new Set(),maps=new Set(),captures=[];let done=false,woke=false;
 for(let i=0;i<360;i++){
  const s=await page.evaluate(()=>{mana.run(40,[11]);if(mana.fastForward.state(1<<11).choice){mana.run(240);mana.run(4,[7]);mana.run(16);mana.run(2,[16]);mana.run(10);}const m=mana.mod;return{scene:m.frieza.status.scene,tree:m.frieza.status.tree,status:m.status,needsTree:m.frieza.needsTree,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],flags:[mana.read8(0xcf46),mana.read8(0xcf4e)],error:m.story.status.error};});maps.add(s.status.map);expect(s.error).toBe(null);
  if(s.scene&&!scenes.has(s.scene.kind)){scenes.add(s.scene.kind);captures.push(s);await page.locator('#screen').screenshot({path:info.outputPath(`${s.scene.kind}.png`)});}
  if(s.status.map===198){
   if(s.scene?.kind==='tree-return')expect(await page.evaluate(()=>[0,100,224].map(y=>mana.snes.ppu.getColor(false,128,y)[0]))).toEqual([0,0,0]);
   const wake=await page.evaluate(()=>({pose:mana.read8(0xe011),held:mana.read8(0xe190)&1,brightness:mana.snes.ppu.brightness,hidden:mana.read8(0xe00e)&128,sprite:mana.mod.spriteLayer.plan?.sprite}));
   if(wake.pose===0x87&&wake.held&&wake.brightness===15){expect(wake.hidden).toBe(0);expect(wake.sprite).toMatchObject({kind:'proneRecovery'});if(!woke)await page.locator('#screen').screenshot({path:info.outputPath('goku-waking.png')});woke=true;}
  }
  if(s.tree==='complete'&&s.status.canAttack){done=true;expect(s.needsTree).toBe(false);expect(s.flags).toEqual([8,0]);expect(s.party).toEqual([party&1,party>>1&1]);break;}
 }
 writeFileSync(info.outputPath('tree.json'),JSON.stringify(captures,null,2));expect(done).toBe(true);expect(woke).toBe(true);expect([...maps]).toEqual(expect.arrayContaining([236,198]));expect([...scenes]).toEqual(expect.arrayContaining(['tree-establish','tree-arrival','tree-charge','tree-shot','tree-impact','tree-leave','tree-return','tree-wake']));
 const route=await page.evaluate(()=>{const m=mana.mod,save=mana.snapshot();mana.restore(save);const complete=m.frieza.status.tree;mana.run(8);const requested=m.story.request(0x4e1);for(let i=0;i<60&&!m.frieza.trial;i++)mana.run(8);return{requested,complete,stage:m.frieza.status.stage,trial:m.frieza.trial,error:m.story.status.error};});expect(route).toMatchObject({requested:true,complete:'complete',trial:true,error:null});
});

test('destroying the Fortress before pursuing Frieza still enters the doomed route',async({page})=>{
 await prepare(page,'fortress');
 expect(await page.evaluate(()=>{const m=mana.mod;m.frieza.restore({...m.frieza.snapshot(),tree:'pursuit'});m.worldKi.restore({...m.worldKi.snapshot(),fortressDestroyed:true});return m.story.request(0x8b);})).toBe(true);
 let state;
 for(let i=0;i<300;i++){state=await page.evaluate(()=>{mana.run(20,[11]);const m=mana.mod;return{map:m.status.map,can:m.canAttack,tree:m.frieza.status.tree,destroyed:m.worldKi.status.fortressDestroyed,error:m.story.status.error};});if(state.map===253&&state.can)break;}
 expect(state).toMatchObject({map:253,can:true,tree:'pursuit',destroyed:true,error:null});
});
