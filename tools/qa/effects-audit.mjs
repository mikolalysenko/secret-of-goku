// Exercise real hold/release inputs against the original engine. Captures and
// state stay local; no source ROM, native graphics or palettes are rewritten.
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=resolve(option('--out','.local/graphics-audit/effects')),url=option('--url','http://127.0.0.1:5173'),statePath=option('--state',null);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scenes:[],errors:[]};
try{
  const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(url+'/engine.html');await page.locator('#boot-local').click();
  await page.waitForFunction(()=>window.mana?.ready,{},{timeout:120000});await page.evaluate(()=>mana.pause());
  if(statePath){const state=JSON.parse(await readFile(statePath,'utf8'));await page.evaluate(state=>{state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);},state);}
  await page.evaluate(()=>{mana.mod.configure({power:false,superSaiyan:false});mana.run(2);});
  const base=await page.evaluate(()=>mana.snapshot());
  async function capture(name){
    const {png,...record}=await page.evaluate(()=>({png:document.getElementById('screen').toDataURL('image/png'),map:mana.read16(0xdc),charge:mana.mod.charge,charging:mana.mod.charging,superSaiyan:mana.mod.options.superSaiyan,effects:mana.mod.effects,sprite:mana.mod.spriteLayer.plan?.sprite,canAttack:mana.mod.canAttack,fxPixels:mana.mod.spriteLayer.effectMask.reduce((sum,pixel)=>sum+pixel,0)}));
    await writeFile(resolve(out,name+'.png'),Buffer.from(png.split(',')[1],'base64'));report.scenes.push({name,...record});return record;
  }
  for(const superSaiyan of [false,true])for(const [direction,button]of [['down',5],['left',6],['right',7],['up',4]]){
    const name=(superSaiyan?'super-':'base-')+direction;
    await page.evaluate(({base,button,superSaiyan})=>{mana.restore(base);mana.mod.configure({enabled:true,power:false,superSaiyan});mana.run(36);mana.run(2,[button]);mana.run(2);mana.run(110,[0]);},{base,button,superSaiyan});
    const charge=await capture(name+'-charge');assert.equal(charge.charging,true);assert.equal(charge.charge,superSaiyan?45:90);assert.ok(charge.fxPixels>0);
    await page.evaluate(()=>{mana.run(1);mana.run(3);});const beam=await capture(name+'-beam');assert.equal(beam.charging,false);assert.equal(beam.effects.filter(effect=>effect.kind==='beam').length,1);assert.ok(beam.fxPixels>0);
    await page.evaluate(()=>{mana.run(30);mana.run(2,[0]);mana.run(3);});const punch=await capture(name+'-punch');assert.ok(punch.effects.some(effect=>effect.kind==='punch'));assert.equal(punch.sprite.kind,'punch');
    // A whiff has the sheet's white motion arc, never a fake impact spark.
    if(!punch.effects.some(effect=>effect.kind==='impact'))assert.equal(punch.fxPixels,0);
    console.log(name+': native charge/beam cells and full punch pose visible');
  }
  await page.evaluate(()=>{mana.run(30);mana.run(70,[0]);mana.run(2,[1]);mana.run(90);});
  const ring=await capture('ring-cancels-effects');assert.equal(ring.canAttack,false);assert.equal(ring.charging,false);assert.equal(ring.fxPixels,0);
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;}finally{
  await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Native spell art audit</title><style>body{background:#17191e;color:#eee;font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(3,256px);gap:16px}figure{margin:0}img{width:256px;height:240px;image-rendering:pixelated}figcaption{margin:6px 0}</style><h1>Native spell art audit</h1><p>Real controller hold/release, all four directions, both forms. Goku choreography assembled from original spell cells.</p><main>'+report.scenes.map(s=>'<figure><img src="'+s.name+'.png"><figcaption>'+s.name+'</figcaption></figure>').join('')+'</main>');
  console.log(JSON.stringify({passed:report.passed,scenes:report.scenes.length,failure:report.failure,out}));
}
