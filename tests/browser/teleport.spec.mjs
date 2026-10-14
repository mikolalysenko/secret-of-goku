import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
async function load(page){
 const file='.local/animation-audit/native/rabite-field-b.json';
 test.skip(!existsSync(file)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires user ROM and native river fixture.');
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(file)));
}
test('Instant Transmission chooses the enemy side of a riverbank and copies its terrain height',async({page})=>{
 await load(page);
 const r=await page.evaluate(()=>{
  const m=mana.mod;mana.write16(0xe002,312);mana.write16(0xe004,248);mana.write8(0xe00b,1);
  mana.write16(0xe602,352);mana.write16(0xe604,248);mana.write8(0xe60b,2);
  mana.write8(0xe800,0);mana.write8(0xea00,0);m.localFlightHook.restore();
  mana.run(4,[19]);const landed=m.status,target=m.entities()[m.lastTeleportTarget];
  return{landed,target,terrain:mana.read8(0xe00b),targetTerrain:mana.read8(target.base+11),clear:m.localFlightHook.canLand(),bank:m.localFlightHook.tileAt(328,248)};
 });
 expect(r.bank.flags&7).toBe(3);expect(r.clear).toBe(true);expect(r.terrain).toBe(r.targetTerrain);
 expect(r.landed.x).toBeGreaterThan(r.target.x);expect(Math.hypot(r.landed.x-r.target.x,r.landed.y-r.target.y)).toBeLessThan(40);
});
test('an offscreen teleport streams the map into view and leaves movement and the native ring usable',async({page})=>{
 await load(page);
 const r=await page.evaluate(()=>{
  const m=mana.mod,before=m.status;mana.write8(0xe600,0);mana.write8(0xe800,0);
  const target=m.entities()[5];mana.run(80,[10,0]);const landed=m.status;
  const clear=m.localFlightHook.canLand(),pending=m.teleport.pending,scrolls=m.teleport.scrolls;
  mana.run(1);mana.run(6,[5]);const moved=Math.hypot(m.status.x-landed.x,m.status.y-landed.y);
  mana.run(2,[9]);mana.run(90);return{before,target,landed,clear,pending,scrolls,moved,ring:mana.read8(0xec),blank:mana.snes.ppu.forcedBlank};
 });
 expect(r.target.screenX).toBeLessThan(0);expect(r.scrolls).toBeGreaterThan(4);expect(r.pending).toBe(false);expect(r.clear).toBe(true);
 expect(r.landed.screenX).toBeGreaterThan(48);expect(r.landed.screenX).toBeLessThan(208);expect(r.landed.screenY).toBeGreaterThan(40);expect(r.landed.screenY).toBeLessThan(192);
 expect(r.moved).toBeGreaterThan(3);expect(r.ring&0xfe).not.toBe(0);expect(r.blank).toBe(false);
 await page.locator('#screen').screenshot({path:'.local/dbz-audio/teleport-ring.png'});
});
test('flight crosses the Potos-path riverbanks and can rescue an old bank-stranded checkpoint',async({page})=>{
 await load(page);
 const r=await page.evaluate(()=>{
  const m=mana.mod,h=m.localFlightHook;for(const base of[0xe000,0xe200,0xe400]){mana.write16(base+2,360);mana.write16(base+4,248);mana.write8(base+11,2);}
  h.restore();m.teleport.follow({x:360,y:248,terrain:2,layer:0});mana.run(30);
  mana.run(12,[8,6]);const river=m.status;mana.run(15,[8,7]);const shore=m.status;
  mana.write16(0xe002,328);mana.write16(0xe004,248);mana.write8(0xe00b,1);h.restore();mana.run(14,[8,7]);
  return{river,shore,rescued:m.status,clear:h.canLand(),phased:h.phased};
 });
 expect(r.river.x).toBeLessThan(324);expect(r.river.x).toBeGreaterThan(272);expect(r.shore.x).toBeGreaterThan(348);
 expect(r.rescued.x).toBeGreaterThan(348);expect(r.clear).toBe(true);expect(r.phased).toBeGreaterThan(0);
});
test('flight lands on the new floor height after bypassing a terrain transition',async({page})=>{
 await load(page);
 const r=await page.evaluate(()=>{
  const m=mana.mod,h=m.localFlightHook;for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
  mana.write16(0xe002,312);mana.write16(0xe004,200);mana.write8(0xe00b,1);h.restore();m.teleport.follow({x:312,y:200,terrain:1,layer:0});mana.run(30);
  mana.run(5,[8,5]);mana.run(12);
  return{status:m.status,terrain:mana.read8(0xe00b),clear:h.canLand(),tile:h.tileAt(m.status.x,m.status.y)};
 });
 expect(r.status.y,JSON.stringify(r)).toBeGreaterThan(215);expect(r.terrain).toBe(2);expect(r.clear).toBe(true);expect(r.status.localFlight).toBe(false);
});
