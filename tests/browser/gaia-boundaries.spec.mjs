import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test.setTimeout(180000);
async function enter(page,map,x,y,flags={}){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private native cartridge and fixture.');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(({state,map,x,y,flags})=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);
  const m=mana.mod,c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
  Object.assign(m.options,{enabled:true,power:true,superSaiyan:false});m.powerIntro.restore({flight:true,superShown:true});
  mana.snes.ram.fill(0,0xe200,0xe600);mana.write8(0xcf0d,0);mana.write8(0xcf0e,0);
  try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2,0],0x8300c);
   for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
   mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{c.set(e,0x742b0);c.set(d,0x8300c);}
  document.querySelector('#native-pause').hidden=true;
 },{state:JSON.parse(readFileSync(fixture)),map,x,y,flags});
}
test('Gaia rock ceiling blocks flight and recovers an older checkpoint stranded inside it',async({page})=>{
 await enter(page,286,18,48);
 const result=await page.evaluate(()=>{
  const m=mana.mod,h=m.localFlightHook,grid=mana.hash(mana.snes.ram.slice(0x10000,0x18000));
  const blocked=!h.canFly(23*16+8,47*16+8,0),start=m.status;
  mana.run(70,[8,7]);const stopped=m.status;
  mana.write16(0xe002,23*16+8);mana.write16(0xe004,47*16+8);m.localFlight=true;mana.run(8,[8]);
  return{blocked,start,stopped,recovered:m.status,safe:h.canLand(),grid,afterGrid:mana.hash(mana.snes.ram.slice(0x10000,0x18000)),error:m.story.status.error};
 });
 writeFileSync(test.info().outputPath('boundary.json'),JSON.stringify(result,null,2));
 expect(result.blocked).toBe(true);expect(result.stopped.x).toBeLessThan(20*16);
 expect(result.recovered.map).toBe(286);expect(result.safe).toBe(true);expect(result.afterGrid).toBe(result.grid);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:test.info().outputPath('solid-rock-boundary.png')});
});
test('a normal Kamehameha opens the original Underground Palace entrance before recruiting Popoi',async({page})=>{
 await enter(page,287,24,25,{0x14:0,0x15:0,0x1b:0,0x18:0,0x91:0,0xa8:0});
 await page.locator('#screen').screenshot({path:test.info().outputPath('sealed-palace.png')});
 const result=await page.evaluate(async()=>{
  const m=mana.mod,rom=mana.hash(mana.snes.cart.data),before=m.status;mana.run(1,[4]);mana.run(100,[10,1]);mana.run(1);
  for(let f=0;f<2000;f+=20){mana.run(20,[11]);if(f>100&&m.canAttack&&mana.read8(0xcf14)>=6)break;if(f%200===0)await new Promise(r=>setTimeout(r,0));}
  const opened={status:m.status,flag:mana.read8(0xcf14),barriers:m.barriers.status},saved=mana.snapshot();
  const cross=()=>{mana.run(55,[4]);mana.run(240);return{map:m.status.map,can:m.canAttack,orbs:m.entities().filter(e=>e.active&&e.species===0x55).map(e=>m.orbs.describe(e))};};
  const reached=cross();mana.restore(saved);const replay=cross();
  const orb=m.entities().find(e=>e.active&&e.species===0x55);
  if(orb){mana.write16(0xe002,orb.x);mana.write16(0xe004,orb.y+32);m.teleport.follow({x:orb.x,y:orb.y+32,terrain:mana.read8(0xe00b)});mana.run(60);mana.run(1,[4]);mana.run(100,[10,1]);mana.run(1);mana.run(240,[11]);}
  return{before,opened,reached,replay,orbActivated:mana.read8(0xcf18),orbError:m.orbs.error,party:[mana.read8(0xe200)&1,mana.read8(0xe400)&1],seed:mana.read8(0xcf91),gnome:mana.read8(0xcfa8),romUnchanged:rom===mana.hash(mana.snes.cart.data),error:m.story.status.error};
 });
 writeFileSync(test.info().outputPath('palace-breach.json'),JSON.stringify(result,null,2));
 expect(result.opened.flag,JSON.stringify(result)).toBe(6);expect(result.opened.barriers.completed).toContain('underground-palace');
 expect(result.reached).toMatchObject({map:291,can:true});expect(result.reached.orbs).toHaveLength(1);expect(result.replay).toEqual(result.reached);
 expect(result.orbActivated).toBe(2);expect(result.orbError).toBe(null); // Native orb stops at the opened stage, even from an early stage-0 entry.
 expect(result.party).toEqual([0,0]);expect(result.seed).toBe(0);expect(result.gnome).toBe(0);expect(result.romUnchanged).toBe(true);expect(result.error).toBe(null);
 await page.locator('#screen').screenshot({path:test.info().outputPath('early-palace-orb.png')});
});
