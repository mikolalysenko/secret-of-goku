import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

async function load(page){
 const fixture='.local/graphics-audit/party.json';
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(fixture)));
}
async function enter(page,map,x,y,flag,value,layer=1){
 await page.evaluate(({map,x,y,flag,value,layer})=>{
  const c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+layer,0],0x8300c);mana.write8(0xcf00+flag,value);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{c.set(e,0x742b0);c.set(d,0x8300c);}
 },{map,x,y,flag,value,layer});
}

test('Goku enters Undine cave early without advancing the Water Palace plot, including checkpoint replay',async({page})=>{
 for(const flag of[0,12,13]){
  await load(page);await page.evaluate(()=>{mana.write8(0xe200,0);mana.write8(0xe400,0);});await enter(page,109,13,9,0x11,flag,0);
  const result=await page.evaluate(()=>{
   const m=mana.mod,hash=mana.hash(mana.snes.cart.data),checkpoint=mana.snapshot();
   const cross=()=>{mana.run(40,[4]);mana.run(180);return m.status;};const crossed=cross();mana.restore(checkpoint);const replay=cross();
   return{crossed,replay,flag:mana.read8(0xcf11),undine:mana.read8(0xcfa9),party:m.entities().slice(0,3).map(e=>e.active),error:m.story.status.error,unchanged:hash===mana.hash(mana.snes.cart.data)};
  });const detail=JSON.stringify(result);
  expect(result.crossed.map,detail).toBe(275);expect(result.crossed.canAttack).toBe(true);expect(result.replay).toEqual(result.crossed);expect(result.flag).toBe(flag);expect(result.undine).toBe(0);expect(result.party).toEqual([true,false,false]);expect(result.error).toBe(null);expect(result.unchanged).toBe(true);
 }
});

test('Pandora script locks break by punch or beam, preserve the plot and stay broken in both room variants',async({page})=>{
 for(const s of[{map:164,flag:0,punch:false},{map:167,flag:7,punch:true}]){
  await load(page);await enter(page,s.map,28,43,0x1a,s.flag);
  const result=await page.evaluate(async s=>{
   const m=mana.mod,hash=mana.hash(mana.snes.cart.data),start=mana.snapshot();
   mana.run(28,[4]);const locked={map:m.status.map,event:mana.read8(0xd0)};mana.restore(start);
   mana.run(1,[4]);if(s.punch){mana.run(2,[0]);mana.run(85);}else{mana.run(100,[10,1]);mana.run(1);mana.run(85);}
   const broken={...m.barriers.status,map:m.status.map,flag:mana.read8(0xcf1a),radio:m.radio.status};
   const checkpoint=mana.snapshot();mana.run(45,[4]);mana.run(180);const crossed=m.status;mana.restore(checkpoint);mana.run(45,[4]);mana.run(180);const replay=m.status;
   return{locked,broken,crossed,replay,unchanged:mana.hash(mana.snes.cart.data)===hash,error:m.story.status.error};
  },s);
  expect(result.locked.map).toBe(s.map);expect(result.locked.event).not.toBe(0);expect(result.broken.map,JSON.stringify(result)).toBe(s.map);expect(result.broken.doors).toContain('pandora-ruins-exit');expect(result.broken.flag).toBe(s.flag);expect(result.broken.radio.current?.text).toContain('lock');
  expect(result.crossed.map,JSON.stringify(result)).toBe(163);expect(result.crossed.canAttack).toBe(true);expect([result.replay.map,result.replay.x,result.replay.y]).toEqual([result.crossed.map,result.crossed.x,result.crossed.y]);expect(result.unchanged).toBe(true);expect(result.error).toBe(null);
 }
});

test('breaking Northtown seal early leads through the native rescue and Vampire fight, and a late return does not restart them',async({page})=>{
 test.setTimeout(180000);await load(page);
 await page.evaluate(()=>{mana.write8(0xe200,0);mana.write8(0xe400,0);});
 await enter(page,402,66,18,0x2d,0);
 const result=await page.evaluate(async()=>{
  const m=mana.mod,hash=mana.hash(mana.snes.cart.data),start=mana.snapshot();
  mana.run(26,[4]);const locked={map:m.status.map,event:mana.read8(0xd0)};mana.restore(start);
  mana.run(1,[4]);mana.run(100,[10,1]);mana.run(1);mana.run(90);
  const broken={map:m.status.map,flag:mana.read8(0xcf2d),doors:m.barriers.status.doors};mana.run(45,[4]);
  for(let n=0;n<180&&!(m.status.map===408&&mana.read8(0xcf2d)===7&&m.canAttack);n++){mana.run(20,[11]);if(n%10===0)await new Promise(r=>setTimeout(r,0));}
  const boss=m.entities().find(e=>e.active&&e.species>=87&&e.species<128&&e.hp>0),entered={status:m.status,flag:mana.read8(0xcf2d),boss};
  if(!boss||!m.canAttack)return{locked,broken,entered,error:m.story.status.error};
  m.options.superSaiyan=true;m.powerIntro.restore({flight:true,superSaiyan:true});
  // The Vampire starts in contact range and flies during its opening.
  // Back away through controller input, then track its current position.
  mana.run(16,[8,5]);mana.run(1);
  for(let n=0;n<6&&mana.read16(boss.base+0x182)>0;n++){
   const target=m.entities()[boss.index],dx=target.x-m.status.x,dy=target.y-m.status.y;
   mana.run(1,[Math.abs(dx)>Math.abs(dy)?dx>0?7:6:dy>0?5:4]);mana.run(70,[10,1]);mana.run(100);await new Promise(r=>setTimeout(r,0));
  }
  for(let n=0;n<220&&!(m.status.map===402&&mana.read8(0xcf2d)>=8&&m.canAttack);n++){mana.run(20,[11]);if(n%10===0)await new Promise(r=>setTimeout(r,0));}
  const rescued={status:m.status,flag:mana.read8(0xcf2d),party:m.entities().slice(0,3).map(e=>e.active)};
  mana.run(55,[8,4]);mana.run(180,[11]);
  return{locked,broken,entered,rescued,returned:{status:m.status,flag:mana.read8(0xcf2d),bosses:m.entities().filter(e=>e.active&&e.species>=87&&e.species<128&&e.hp>0)},error:m.story.status.error,unchanged:mana.hash(mana.snes.cart.data)===hash};
 });
 expect(result.locked.map).toBe(402);expect(result.locked.event).not.toBe(0);expect(result.broken).toEqual({map:402,flag:5,doors:['northtown-ruins-seal']});expect(result.entered.status.map,JSON.stringify(result)).toBe(408);expect(result.entered.flag,JSON.stringify(result)).toBe(7);expect(result.entered.status.canAttack).toBe(true);expect(result.entered.boss).toBeTruthy();
 expect(result.rescued.status.map,JSON.stringify(result)).toBe(402);expect(result.rescued.flag).toBe(8);expect(result.rescued.party).toEqual([true,false,false]);expect(result.returned.status.map,JSON.stringify(result)).toBe(408);expect(result.returned.status.canAttack).toBe(true);expect(result.returned.flag).toBe(8);expect(result.returned.bosses).toEqual([]);expect(result.error).toBe(null);expect(result.unchanged).toBe(true);
});

test('a punched Northtown door reopens after the completed rescue without lowering progress',async({page})=>{
 await load(page);await enter(page,405,66,18,0x2d,8);
 const result=await page.evaluate(()=>{const m=mana.mod;mana.run(1,[4]);mana.run(2,[0]);mana.run(85);const broken=m.barriers.status;mana.run(45,[4]);mana.run(180);return{broken,status:m.status,flag:mana.read8(0xcf2d),error:m.story.status.error};});
 expect(result.broken.doors,JSON.stringify(result)).toContain('northtown-ruins-seal');expect(result.flag).toBe(8);expect(result.status.map).toBe(408);expect(result.status.canAttack).toBe(true);expect(result.error).toBe(null);
});
