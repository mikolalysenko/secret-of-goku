import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const fixture='.local/graphics-audit/party.json';

test('Sylphid unlocks the optional ring scouter; default off, native toggle on/off and checkpoint restore',async({page},testInfo)=>{
 test.setTimeout(180000);
 test.skip(!existsSync(fixture)||!existsSync('.local/rom/secret-of-mana-us.sfc'),'Requires private ROM and native fixture.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>window.mana?.ready);
 const result=await page.evaluate(state=>{
  mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);mana.run(3);
  const m=mana.mod,r=mana.snes.ram,tap=b=>{mana.run(3,[b]);mana.run(65);};
  const cart=mana.snes.cart.data,code=cart.slice(0x742b0,0x742b5),door=cart.slice(0x8300c,0x83010);
  try{cart.set([4,24,3,5,0],0x742b0);cart.set([129,50,42,0],0x8300c);r.set([1,0xb0,0x42,0xc7],0xd0);mana.run(240);}
  finally{cart.set(code,0x742b0);cart.set(door,0x8300c);}
  const before=m.scouter.owned,requested=m.story.request(0x583);
  for(let f=0;f<3000&&!(f>60&&m.canAttack);f+=20)mana.run(20,[11]);
  const granted=r[0xe3cb],owned=m.scouter.owned;
  const enemy=m.entities().find(e=>e.index>=3&&e.active&&e.hp);
  mana.snes.write(0x7e0000|(enemy.base+0x181),0x17);mana.run(30);
  const initial=m.scouter.status;
  mana.run(3,[10,9]);mana.run(65);const comboRing=r[0xec]&12;tap(9);
  tap(9);for(let i=0;i<6&&r[0x1809]!==2;i++)tap(4);
  for(let i=0;i<10&&r[0x1876]!==1;i++)tap(7);
  const selected=r[0x1876],off=document.querySelector('#screen').toDataURL();tap(0);
  const ringOn={enabled:m.scouter.enabled,ring:r[0xec]&12};
  const on=document.querySelector('#screen').toDataURL();tap(9);mana.run(40);
  const active=m.scouter.status,save=mana.snapshot();
  // Remembered first item resolves to Scouter even though cursor becomes 0.
  tap(9);const cursor=r[0x180a],reselected=r[0x1876];tap(0);tap(9);mana.run(30);
  const disabled=m.scouter.status;mana.restore(save);mana.run(30);const restored=m.scouter.status;
  return{before,requested,owned,granted,initial,comboRing,selected,ringOn,active,cursor,reselected,disabled,restored,off,on,error:m.story.status.error};
 },JSON.parse(readFileSync(fixture)));
 expect(result,JSON.stringify({...result,off:undefined,on:undefined})).toMatchObject({before:false,requested:true,owned:true,selected:1,comboRing:8,ringOn:{enabled:true,ring:8},cursor:0,reselected:1,error:null});
 expect(result.granted&0x38,'Primm still learns Analyzer').toBe(0x38);
 expect(result.initial).toMatchObject({enabled:false,scans:0,readouts:[]});
 expect(result.active.enabled).toBe(true);expect(result.active.readouts.length).toBeGreaterThan(1);
 expect(result.disabled).toMatchObject({enabled:false,readouts:[]});expect(result.restored.enabled).toBe(true);
 for(const key of['off','on'])writeFileSync(testInfo.outputPath(`scouter-${key}.png`),Buffer.from(result[key].split(',')[1],'base64'));
 expect(errors).toEqual([]);
});
