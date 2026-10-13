// Set diagnostic status bits, then let the original game animate each state.
// Miniature/barrel flags were independently verified via native item use.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {comparePresentation} from './presentation.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=resolve(option('--out','.local/graphics-audit/status')),url=option('--url','http://127.0.0.1:5173');
const base=JSON.parse(await readFile(option('--state','.local/graphics-audit/party.json'),'utf8'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scenes:[],errors:[]};
try{
  const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>window.mana?.ready,{},{timeout:120000});await page.evaluate(()=>mana.pause());
  for(const [name,first,second]of [['normal',0,0],['unconscious',0x10,0],['snowman',0x20,0],['petrify',0x40,0],['poison',0,0x20],['moogle',0,0x10],['dead',0,0x80],['miniature',0,2],['barrel',0,4],['balloon',0,1],['engulf',0,0x40]]){
    await page.evaluate(({base,first,second})=>{
      base.romHash=mana.hash(mana.snes.cart.data);mana.restore(base);mana.mod.configure({enabled:true,power:false,superSaiyan:false});
      mana.write8(0xe190,first);mana.write8(0xe191,second);mana.run(30);
    },{base,first,second});
    const comparison=await comparePresentation(page);
    const {png,...state}=await page.evaluate(()=>({png:document.querySelector('#screen').toDataURL('image/png').split(',')[1],status:[mana.read8(0xe190),mana.read8(0xe191)],species:mana.read8(0xe180),canAttack:mana.mod.canAttack,fxPixels:mana.mod.spriteLayer.effectMask.reduce((sum,p)=>sum+p,0)}));
    await writeFile(resolve(out,name+'-goku.png'),Buffer.from(png,'base64'));
    report.scenes.push({name,...state,...comparison});console.log(name+': '+comparison.unexpected+' unexpected pixels, species '+state.species);
    if(name==='miniature'){
      await page.evaluate(()=>{mana.run(120);mana.run(110,[10,1]);});
      const charge=await page.evaluate(()=>({charging:mana.mod.charging,charge:mana.mod.charge,sprite:mana.mod.spriteLayer.plan.sprite,png:document.querySelector('#screen').toDataURL('image/png').split(',')[1]}));
      await writeFile(resolve(out,'miniature-charge.png'),Buffer.from(charge.png,'base64'));
      if(!charge.charging||charge.sprite.width!==16)throw Error('Miniature did not retain charge control and 16-pixel body.');
    }
  }
  report.passed=report.errors.length===0&&report.scenes.every(scene=>scene.unexpected===0);if(!report.passed)process.exitCode=1;
}finally{
  await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Native status graphics audit</title><style>body{background:#17191e;color:#eee;font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(3,256px);gap:16px}figure{margin:0}img{width:256px;height:240px;image-rendering:pixelated}figcaption{margin:6px 0}</style><h1>Native status graphics audit</h1><p>Diagnostic status bits followed by original animation, palette and OBJ evaluation.</p><main>'+report.scenes.map(s=>'<figure><img src="'+s.name+'-goku.png"><figcaption>'+s.name+' — '+s.unexpected+' unexpected pixels</figcaption></figure>').join('')+'</main>');
}
