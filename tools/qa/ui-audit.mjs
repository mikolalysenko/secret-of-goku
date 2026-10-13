import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {comparePresentation} from './presentation.mjs';

const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=resolve(option('--out','.local/graphics-audit/ui'));
const statePath=option('--state',null),url=option('--url','http://127.0.0.1:5173');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scenes:[],errors:[]};
try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(statePath?url:url+'/engine.html');
  if(!statePath)await page.locator('#boot-local').click();
  await page.waitForFunction(()=>window.mana?.ready,{},{timeout:120000});
  await page.evaluate(()=>mana.pause());
  if(statePath){
    const state=JSON.parse(await readFile(statePath,'utf8'));
    // Diagnostic states can have a temporary door/entry script in their ROM
    // copy. Require idle ground play before reusing one with the normal cart.
    const root=state.nodes[state.root.$ref].props,ram=state.nodes[root.ram.$ref].values;
    if(ram[0xd0]!==0||ram[0xe4]!==1||ram[0xe5]!==1)throw Error('UI audit requires an idle ground checkpoint.');
    await page.evaluate(state=>{state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);},state);
  }
  await page.evaluate(()=>{mana.mod.configure({power:false});mana.run(2);});
  const base=await page.evaluate(()=>mana.snapshot());
  async function capture(name){
    const result=await comparePresentation(page);
    await page.locator('#screen').screenshot({path:resolve(out,name+'.png')});
    report.scenes.push({name,...result});
    console.log(name+': '+result.unexpected+' unexpected pixels, '+result.portraits+' Goku portrait(s)');
  }
  await capture('party-hud');
  await page.evaluate(()=>{mana.run(2,[1]);mana.run(90);});
  await capture('weapon-ring');const ring=await page.evaluate(()=>mana.snapshot());
  await page.evaluate(()=>{mana.run(2,[4]);mana.run(90);});await capture('item-ring');
  await page.evaluate(ring=>{mana.restore(ring);mana.run(2,[5]);mana.run(90);},ring);
  await capture('options-ring');const options=await page.evaluate(()=>mana.snapshot());
  const panels=['armor-ring','button-configuration','controller-assignment','action-grid','weapon-skills','status','targeting'];
  for(let i=0;i<panels.length;i++){
    await page.evaluate(({options,i})=>{
      mana.restore(options);for(let n=0;n<i;n++){mana.run(2,[7]);mana.run(30);}
      mana.run(2,[0]);mana.run(90);
    },{options,i});
    await capture(panels[i]);
  }
  // The other two character HUDs and sprites must remain native when the
  // controlled character changes; the party baseline enables these cases.
  for(let i=1;i<=2;i++){
    await page.evaluate(({base,i})=>{mana.restore(base);for(let n=0;n<i;n++){mana.run(2,[2]);mana.run(20);}}, {base,i});
    await capture('party-selection-'+i);
  }
  report.passed=report.errors.length===0&&report.scenes.every(scene=>scene.unexpected===0);
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  const html='<!doctype html><meta charset="utf-8"><title>Native UI graphics audit</title><style>body{font:14px system-ui;background:#151515;color:#eee;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px}figure{margin:0}img{width:100%;image-rendering:pixelated}figcaption{padding:8px 0}p{color:#aaa}</style><h1>Native UI graphics audit</h1><p>Original PPU comparison outside the intended Goku replacement regions. Diagnostic party state; this is a graphics check, not a story playthrough.</p><main>'+report.scenes.map(scene=>'<figure><img src="'+scene.name+'.png"><figcaption>'+scene.name+' — '+scene.unexpected+' unexpected pixels</figcaption></figure>').join('')+'</main>';
  await writeFile(resolve(out,'index.html'),html);
  if(!report.passed)process.exitCode=1;
}finally{await browser.close();}
