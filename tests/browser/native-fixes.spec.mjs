import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
async function load(page,path=fixture){
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(path),'Requires local ROM and native party fixture.');
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:false,superSaiyan:false});mana.run(3);},JSON.parse(readFileSync(path,'utf8')));
}
test('Senzu Beans fully heal injured allies, revive fallen allies and preserve full-health inventory',async({page})=>{
 await load(page);const results=await page.evaluate(()=>{
  const saved=mana.snapshot(),results=[];
  for(const target of[0,1,2,-1]){
   mana.restore(saved);mana.snes.ram.fill(255,0xcc48,0xcc54);mana.write8(0xcc48,0x65);mana.write16(0xe184,50);
   for(let i=0;i<3;i++){const b=0xe000+i*512;mana.write8(b+0x191,mana.read8(b+0x191)&127);mana.write16(b+0x182,mana.read16(b+0x184));}
   if(target>=0){const b=0xe000+target*512;mana.write16(b+0x182,target===2?0:1);if(target===2)mana.write8(b+0x191,mana.read8(b+0x191)|128);}
   // Let the native death/fall transition finish before opening the item ring.
   mana.run(120);const before=mana.mod.senzu.used;
   mana.run(2,[9]);mana.run(90);for(let i=0;i<4&&mana.read8(0x1809)!==0;i++){mana.run(2,[4]);mana.run(60);}
   mana.run(2,[16]);mana.run(55);mana.run(2,[16]);mana.run(220);
   results.push({target,used:mana.mod.senzu.used-before,inventory:mana.read8(0xcc48),party:[0,1,2].map(i=>{const b=0xe000+i*512;return{hp:mana.read16(b+0x182),max:mana.read16(b+0x184),dead:!!(mana.read8(b+0x191)&128)};})});
  }
  return results;
 });
 await test.info().attach('senzu-results',{body:JSON.stringify(results),contentType:'application/json'});
 for(const r of results){expect(r.used,JSON.stringify(r)).toBe(r.target<0?0:1);expect(r.inventory,JSON.stringify(r)).toBe(r.target<0?0x65:0x45);for(const member of r.party){expect(member.hp,JSON.stringify(r)).toBe(member.max);expect(member.dead).toBe(false);}}
});
test('confirming in an empty field cannot start the hidden native sword or charge attack',async({page})=>{
 await load(page,'.local/animation-audit/native/rabite-field-b.json');
 const result=await page.evaluate(()=>{const poses=[];for(let f=0;f<100;f++){mana.run(1,[16]);poses.push(mana.read8(0xe01c));}return{poses,suppressed:mana.mod.interaction.suppressed,charging:mana.mod.charging,beams:mana.mod.effects.filter(e=>e.kind==='beam').length};});
 expect(result.poses.some(flags=>flags&32)).toBe(false);expect(result.suppressed).toBeGreaterThan(0);expect(result.charging).toBe(false);expect(result.beams).toBe(0);
});
test('early-area flight crosses foreground Potos shrubs, forest flowers, bushes and cave rocks',async({page})=>{
 await load(page);const results=[];
 for(const scene of[{map:131,x:304,y:408,button:7,frames:24,min:110},{map:131,x:184,y:224,button:5,frames:24,min:110},{map:128,x:520,y:912,button:5,frames:12,min:48},{map:129,x:400,y:344,button:7,frames:12,min:48},{map:286,x:592,y:568,button:7,frames:12,min:48}]){
  results.push(await page.evaluate(s=>{
   const cart=mana.snes.cart.data,event=cart.slice(0x742b0,0x742b5),door=cart.slice(0x8300c,0x83010),h=mana.mod.localFlightHook;
   Object.assign(mana.mod.options,{power:true,superSaiyan:true});
   try{cart.set([4,24,3,5,0],0x742b0);cart.set([s.map&255,(Math.floor(s.x/16)<<1)|(s.map>>8),Math.floor(s.y/16)<<1,0],0x8300c);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}finally{cart.set(event,0x742b0);cart.set(door,0x8300c);}
   for(let i=0;i<3;i++){mana.write16(0xe002+i*512,s.x);mana.write16(0xe004+i*512,s.y);mana.write8(0xe00b+i*512,2);}mana.run(4);
   const start=mana.mod.status,phase=h.phased;mana.run(s.frames,[8,s.button]);const end=mana.mod.status;
   return{map:end.map,expected:s.map,distance:s.button===7?end.x-start.x:end.y-start.y,min:s.min,phases:h.phased-phase};
  },scene));
 }
 for(const result of results){expect(result.map).toBe(result.expected);expect(result.phases).toBeGreaterThan(0);expect(result.distance,JSON.stringify(result)).toBeGreaterThanOrEqual(result.min);}
});
