import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';

test('Sylphid grants the scouter; L+X scans and Analyzer hits show power levels',async({page})=>{
 test.setTimeout(180000);
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and native fixture.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 const result=await page.evaluate(state=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);mana.run(3);
  // Warp to the Rabite field (map 129) through a borrowed door record.
  const cart=mana.snes.cart.data,code=cart.slice(0x742b0,0x742b5),door=cart.slice(0x8300c,0x83010);
  try{cart.set([4,24,3,5,0],0x742b0);cart.set([129,50,42,0],0x8300c);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);}
  finally{cart.set(code,0x742b0);cart.set(door,0x8300c);}
  const m=mana.mod,before=m.scouter.owned;
  // The real grant event: dialogue, spell bits and the Sylphid flag.
  const requested=m.story.request(0x583);
  for(let f=0;f<3000&&!(f>60&&m.canAttack);f+=20)mana.run(20,[11]);
  const owned=m.scouter.owned,granted=mana.read8(0xe3cb);
  mana.run(30);mana.run(6,[10,9]);mana.run(10,[10]);mana.run(30);
  const scan=m.scouter.status,ring=mana.read8(0xec);
  // Analyzer: the cartridge stores the incoming spell at the target's +181h.
  const enemy=m.entities().find(e=>e.index>=3&&e.active&&e.hp);
  mana.snes.write(0x7e0000|(enemy.base+0x181),0x17);mana.run(30);
  return{before,requested,owned,granted,scan,ring,analyzed:m.scouter.status.readouts.find(r=>r.key===enemy.base),event:m.story.status.lastEvent,error:m.story.status.error};
 },JSON.parse(readFileSync(fixture)));
 expect(result,JSON.stringify(result)).toMatchObject({before:false,requested:true,owned:true,ring:0,error:null});
 expect(result.granted&0x38,'Primm still learns Analyzer').toBe(0x38);
 expect(result.scan.scans).toBe(1);
 expect(result.scan.readouts.length).toBeGreaterThan(1);
 expect(result.scan.jokes).toContain('goku');
 expect(result.analyzed?.source).toBe('analyzer');
 await page.evaluate(()=>{document.querySelector('#native-pause').hidden=true;mana.render();});
 await page.locator('#screen').screenshot({path:test.info().outputPath('scouter.png')});
 expect(errors).toEqual([]);
});
