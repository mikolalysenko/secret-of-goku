import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
test('Senzu and Fly keep their art in all twelve item slots, both forms and ring rotation',async({page})=>{
 test.skip(!existsSync('.local/rom/secret-of-mana-us.sfc')||!existsSync(fixture),'Requires local ROM and party fixture.');
 test.setTimeout(120000);
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 await page.evaluate(state=>{mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);Object.assign(mana.mod.options,{enabled:true,power:true});mana.run(4);},JSON.parse(readFileSync(fixture,'utf8')));
 const results=await page.evaluate(()=>{
  const saved=mana.snapshot(),results=[];
  for(const gold of[false,true])for(let offset=0;offset<12;offset++){
   mana.restore(saved);mana.mod.options.superSaiyan=gold;
   const order=Array.from({length:12},(_,i)=>(i+offset)%12);
   mana.snes.ram.set(order.map(id=>id===7?0x27:0x60|id),0xcc48);
   mana.run(2,[9]);mana.run(60);for(let i=0;i<4&&mana.read8(0x1809)!==0;i++){mana.run(2,[4]);mana.run(60);}
   const seen=[],layer=mana.mod.spriteLayer;
   function inspect(){
    const icons=[...layer.plan.portraits].filter(([,p])=>p.kind==='senzu'||p.kind==='fly');
    return icons.map(([index,p])=>({kind:p.kind,id:order[index/2-18],hidden:layer.plan.hidden.has(index)}));
   }
   seen.push(inspect());mana.run(2,[7]);for(let i=0;i<24;i++){mana.run(1);seen.push(inspect());}
   // The Fly silhouette must stay complete and still across animation clocks.
   const fly=[...layer.plan.portraits.values()].find(p=>p.kind==='fly'),rasters=[];
   for(const age of[0,8,16,24]){
    const pixels=[];mana.mod.frame+=age;
    for(let y=0;y<16;y++){layer.customLine.fill(0);layer.injectPortrait(mana.snes.ppu,fly.y+y,fly);pixels.push(...layer.customLine.slice(fly.x,fly.x+16));}
    rasters.push(pixels);
   }
   mana.run(2,[9]);mana.run(90);
   results.push({gold,offset,seen,opaque:rasters[0].filter(Boolean).length,stable:rasters.every(p=>p.every((c,i)=>c===rasters[0][i])),closed:!(mana.read8(0xec)&12),leftover:[...layer.plan.portraits.values()].some(p=>p.kind==='senzu'||p.kind==='fly')});
  }
  return results;
 });
 for(const r of results){
  for(const seen of r.seen){expect(seen,JSON.stringify(r)).toHaveLength(2);for(const i of seen){expect(i.hidden).toBe(true);expect(i.id).toBe(i.kind==='senzu'?5:7);}}
  expect(r.opaque).toBeGreaterThan(60);expect(r.stable).toBe(true);expect(r.closed).toBe(true);expect(r.leftover).toBe(false);
 }
});
