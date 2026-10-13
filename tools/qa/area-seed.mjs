// Rebuild a PRIVATE diagnostic full-party checkpoint from the supplied ROM.
// Uses the normal title/name/intro, then an in-memory native event script.
// Event flags are deliberately initialized for QA; this is not a play route.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {dirname} from 'node:path';
import {readOptions,loadAuditRom,openAuditPage} from './area-catalog.mjs';
const options=readOptions(),rom=await loadAuditRom(options);await fs.mkdir(dirname(options.state),{recursive:true});await fs.mkdir(options.out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const {page,errors}=await openAuditPage(browser,options,rom);
 const opening=await page.evaluate(async()=>{
  mana.pause();mana.mod.configure({enabled:true,power:true,superSaiyan:false});
  mana.run(960);mana.run(2,[3]);mana.run(180);mana.run(2,[0]);mana.run(180);mana.run(2,[3]);mana.run(300);
  for(let i=0;i<6;i++){mana.run(600);await new Promise(r=>setTimeout(r,0));}
  let taps=0;while(!(mana.read16(0xdc)===128&&mana.mod.canAttack)&&taps<24){mana.run(2,[0]);mana.run(240);taps++;await new Promise(r=>setTimeout(r,0));}
  return {map:mana.read16(0xdc),canAttack:mana.mod.canAttack,taps};
 });
 if(opening.map!==128||!opening.canAttack)throw Error('Original opening failed: '+JSON.stringify(opening));
 console.log('Native waterfall',JSON.stringify(opening));
 await page.evaluate(()=>{
  const r=mana.snes.ram,cart=mana.snes.cart.data;
  cart.set([0x04,0x30,0,2,0x30,0x10,1,0x30,0x0d,1,0x30,0x0e,1,0x1f,1,0x2b,1,0x1f,2,0x2b,2,0x2f,4,0x18,3,0x05,0],0x742b0);
  cart.set([131,33<<1,32<<1,0],0x8300c);
  r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;
 });
 let result;
 for(let i=0;i<24;i++){
  result=await page.evaluate(()=>{
   mana.run(60);
   if(mana.read8(0xa156)===3&&mana.read16(0x9306)===0x2058){mana.run(2,[0]);mana.run(2);mana.run(2,[3]);mana.run(90);}
   return {status:mana.mod.status,party:mana.mod.entities().slice(0,3)};
  });
  if(i>4&&result.status.map===131&&result.status.canAttack&&result.party.every(p=>p.active&&p.hp>0&&p.species===0x80+p.index))break;
 }
 if(result.status.map!==131||!result.status.canAttack||!result.party.every(p=>p.active&&p.hp>0&&p.species===0x80+p.index))throw Error('Party seed failed: '+JSON.stringify(result));
 await page.evaluate(()=>mana.mod.configure({power:false}));
 await fs.writeFile(options.state,await page.evaluate(()=>JSON.stringify(mana.snapshot())));
 await fs.writeFile(options.out+'/seed-proof.json',JSON.stringify({opening,result,errors,diagnostic:true,note:'Native full party; default Goku power applied during seed, disabled during area comparisons.'},null,2));
 const png=await page.evaluate(()=>document.getElementById('screen').toDataURL('image/png'));
 await fs.writeFile(options.out+'/seed.png',Buffer.from(png.split(',')[1],'base64'));
 console.log('Native party seed',JSON.stringify({state:options.state,result,errors}));
 await page.close();
}finally{await browser.close();}
