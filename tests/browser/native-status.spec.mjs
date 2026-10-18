import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';
async function load(page){
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Private native fixtures required');
 await page.goto('/');await page.waitForFunction(()=>mana.ready);
 await page.evaluate(s=>{mana.pause();s.romHash=mana.hash(mana.snes.cart.data);mana.restore(s);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(4);},JSON.parse(readFileSync(fixture)));
}

for(const gold of[false,true])for(const weighted of[false,true])test(`Goku status matches gameplay and survives menu/gear/checkpoint rebuilds (SSJ ${gold}, gi ${weighted})`,async({page})=>{
 await load(page);
 const result=await page.evaluate(({gold,weighted})=>{
  const m=mana.mod,r=mana.snes.ram;
  const tap=b=>{mana.run(2,[b]);mana.run(70);},close=()=>{for(let i=0;i<4&&!m.canAttack;i++)tap(9);};
  // Use the native armor ring to remove and optionally re-equip the gi.
  // This also executes the real level-99, armor and derived-stat rebuild.
  tap(9);tap(0);tap(0);tap(0);if(weighted){tap(0);tap(0);}close();
  m.configure({superSaiyan:gold});mana.run(60);const before=m.statPage.stats;
  const flags=mana.read16(0xe199);m.updatePowerStats();const afterFlags=mana.read16(0xe199);
  const checkpoint=mana.snapshot();
  m.fireKi({super:gold,facing:0,hand:0});const ki=m.effects.find(e=>e.kind==='ki')?.damage;
  m.startCharge();m.charge=gold?45:90;m.releaseCharge();const beam=m.effects.find(e=>e.kind==='beam')?.damage;
  mana.restore(checkpoint);mana.run(4);tap(9);
  for(let i=0;i<12&&(r[0x1809]!==2||r[0x180a]!==2);i++)tap(7);tap(0);
  const during=m.statPage.stats,active=m.statPage.active,body=m.spriteLayer.plan?.sprite;
  const menu=mana.snapshot();m.write8(0xe1e1,weighted?21:22);m.options.superSaiyan=!gold;mana.run(10);
  mana.restore(menu);mana.run(60);const restored=m.statPage.stats;
  document.querySelector('#native-pause').hidden=true;const png=document.querySelector('#screen').toDataURL();
  close();const after=m.statPage.stats;const gone=!m.statPage.active;
  // Reopening STATUS must neither compound weight nor rebuild defenses twice.
  tap(9);tap(0);const reopened=m.statPage.stats,reopenedActive=m.statPage.active;close();
  return{before,during,restored,after,reopened,reopenedActive,active,gone,body,flags,afterFlags,ki,beam,can:m.canAttack,png};
 },{gold,weighted});
 const attack=Math.round((gold?8191:4095)*(weighted?.9:1));
 writeFileSync(test.info().outputPath('status.png'),Buffer.from(result.png.split(',')[1],'base64'));
 writeFileSync(test.info().outputPath('stats.json'),JSON.stringify({...result,png:undefined},null,2));
 expect(result.active).toBe(true);expect(result.reopenedActive).toBe(true);expect(result.gone).toBe(true);expect(result.can).toBe(true);
 expect(result.before).toMatchObject({level:99,form:gold?'SUPER SAIYAN':'SAIYAN',weighted,strength:weighted?230:255,agility:weighted?79:99,attack,power:(gold?150000000:90000)*(weighted?.9:1)});
 expect(result.during).toEqual(result.before);expect(result.restored).toEqual(result.before);expect(result.after).toEqual(result.before);expect(result.reopened).toEqual(result.before);
 expect(result.body.sheet).toBe(gold?'ssj':'goku');expect(result.flags).toBe(result.afterFlags);
 expect(result.ki).toBe(Math.round(attack*.4));expect(result.beam).toBe(attack);
 await test.info().attach('status',{path:test.info().outputPath('status.png'),contentType:'image/png'});
});

test('companion status and other native menu pages keep their own displays',async({page})=>{
 await load(page);
 const result=await page.evaluate(()=>{
  const m=mana.mod,base=mana.snapshot(),out=[];
  const tap=b=>{mana.run(2,[b]);mana.run(70);};
  for(const actor of[0,1,2])for(const item of[6,5,4,2]){
   mana.restore(base);for(let i=0;i<actor;i++)tap(2);tap(9);
   // Companions initially open their weapon tier; select their actual
   // options ring before rotating to the page under test.
   for(let i=0;i<6&&mana.read8(0x1809)!==2;i++)tap(4);
   for(let i=0;i<12&&mana.read8(0x180a)!==item;i++)tap(7);tap(0);
   out.push({actor,item,active:m.statPage.active,mode:mana.snes.ppu.mode,owner:mana.read8(0x19fe)});
  }return out;
 });
 for(const row of result){expect(row.mode,JSON.stringify(row)).toBe(5);expect(row.active,JSON.stringify(row)).toBe(row.actor===0&&row.item===2);}
});

test('Menu/back closes Status and the editors wherever the options ring last stopped',async({page})=>{
 await load(page);
 const rows=await page.evaluate(()=>{
  const m=mana.mod,r=mana.snes.ram,base=mana.snapshot(),out=[];
  const tap=b=>{mana.run(2,[b]);mana.run(70);};
  // $1876 is the option under the cursor; $180A counts from the option the
  // ring last opened, which becomes the ring's starting point.
  const toOption=o=>{for(let i=0;i<8&&r[0x1876]!==o;i++)tap(7);return r[0x1876]===o;};
  const back=()=>{for(let i=0;i<5&&m.menuActive;i++)tap(9);return !m.menuActive;};
  for(const [first,option] of [[0,2],[3,2],[4,2],[4,4],[0,5],[5,5],[0,6],[2,6]]){
   mana.restore(base);mana.run(4);
   tap(9);toOption(first);tap(0);const reset=back();
   tap(9);const reached=toOption(option),cursor=r[0x180a];tap(0);
   out.push({first,option,cursor,reset,reached,opened:mana.snes.ppu.mode===5,status:m.statPage.active,closed:back()});
  }
  return out;
 });
 for(const row of rows){
  expect(row,JSON.stringify(row)).toMatchObject({reset:true,reached:true,opened:true,closed:true,status:row.option===2});
 }
 // The reported case: Status opened with the cursor at 5, where editors sit.
 expect(rows.find(row=>row.first===4&&row.option===2).cursor).toBe(5);
});
