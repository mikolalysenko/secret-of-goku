import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

const fixture='.local/graphics-audit/party.json';
const paths=[
 {map:128,cases:[{x:712,y:808,buttons:[7],to:129},{x:712,y:824,buttons:[7],to:129,flight:false}]},
 {map:129,cases:[{x:296,y:584,buttons:[6],to:128},{x:232,y:984,buttons:[6],to:130},
  // Flying along the bottom bank used to miss the door and reach x=8.
  {x:232,y:1000,buttons:[6],to:130},{x:200,y:984,buttons:[6,5],to:130},
  // Inward flight along that same bank must not catch the exit behind him.
  {x:184,y:1000,buttons:[7],to:129}]},
 {map:130,cases:[{x:488,y:184,buttons:[7],to:129},{x:488,y:504,buttons:[7],to:131},
  // The next field has the same one-tile exit beside a flyable bank.
  {x:488,y:520,buttons:[7],to:131},{x:512,y:504,buttons:[7,5],to:131}]},
 {map:131,cases:[{x:120,y:376,buttons:[6],to:130},{x:536,y:624,buttons:[5],to:16}]},
];

for(const ssj of[false,true])test(`opening field exits catch ${ssj?'Super Saiyan':'base-form'} flight along the path and its banks`,async({page})=>{
 test.setTimeout(180000);
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires the private ROM and native checkpoint.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 const saved=JSON.parse(readFileSync(fixture));
 const results=await page.evaluate(({saved,paths,ssj})=>{
  mana.pause();saved.romHash=mana.hash(mana.snes.cart.data);const hash=saved.romHash,results=[];
  for(const {map,cases}of paths){
   mana.restore(saved);Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:ssj});
   const c=mana.snes.cart.data,event=c.slice(0x742b0,0x742b5),door=c.slice(0x8300c,0x83010);
   try{
    c.set([4,24,3,5,0],0x742b0);c.set([map&255,40+(map>>8),80,0],0x8300c);
    mana.write8(0xcf10,1);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
   }finally{c.set(event,0x742b0);c.set(door,0x8300c);}
   mana.mod.powerIntro.restore({flight:true,superSaiyan:true});mana.mod.radio.restore({firstFlight:true});
   for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
   const baseline=mana.snapshot();
   for(const path of cases){
    mana.restore(baseline);mana.write16(0xe002,path.x);mana.write16(0xe004,path.y);mana.write8(0xe00b,2);
    mana.mod.teleport.follow({x:path.x,y:path.y,terrain:2});mana.run(35);
    const tiles=mana.hash(mana.snes.ram.slice(0x10000,0x18000)),states=[];
    for(let f=0;f<100&&mana.read16(0xdc)===map;f++){
     mana.run(1,[...(path.flight===false?[]:[8]),...path.buttons]);
     states.push({map:mana.read16(0xdc),x:mana.read16(0xe002),y:mana.read16(0xe004)});
    }
    const changed=mana.read16(0xdc)!==map,departed=states.at(-1);
    // The replacement lookup does not paint another door into the map.
    const untouched=mana.hash(mana.snes.ram.slice(0x10000,0x18000))===tiles;
    mana.run(180);
    // Entering the first Rabite field also runs its one-time conversation.
    // Confirm its pages normally rather than treating an open box as a lock.
    for(let n=0;n<40&&!mana.mod.canAttack;n++){mana.run(2,[0]);mana.run(12,[11]);}
    mana.run(2);
    results.push({map,path,changed,departed,untouched,actual:mana.read16(0xdc),canAttack:mana.mod.canAttack,event:mana.read8(0xd0),error:mana.mod.story.status.error,romUnchanged:mana.hash(c)===hash});
   }
  }
  return results;
 },{saved,paths,ssj});
 await test.info().attach('exit-results',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});
 for(const r of results){
  expect.soft(r.changed,JSON.stringify(r)).toBe(r.map!==r.path.to);expect.soft(r.actual,JSON.stringify(r)).toBe(r.path.to);
  expect.soft(r.canAttack,JSON.stringify(r)).toBe(true);expect.soft(r.error).toBe(null);expect.soft(r.romUnchanged).toBe(true);
  // The loader changes the map ID before replacing the old tile buffer.
  expect.soft(r.untouched,JSON.stringify(r)).toBe(true);
 }
 expect(errors).toEqual([]);
});
