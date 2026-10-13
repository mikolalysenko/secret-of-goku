// Additional original-engine UI states, initialized through native commands.
// Scratch scripts and spell availability affect only this diagnostic browser.
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {comparePresentation} from './presentation.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=resolve(option('--out','.local/graphics-audit/event-ui')),url=option('--url','http://127.0.0.1:5173');
const base=JSON.parse(await readFile(option('--state','.local/graphics-audit/party.json'),'utf8'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scenes:[],errors:[]};
try{
  const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>window.mana?.ready,{},{timeout:120000});await page.evaluate(()=>mana.pause());
  async function restore(){await page.evaluate(base=>{base.romHash=mana.hash(mana.snes.cart.data);mana.restore(base);mana.mod.configure({enabled:true,power:false,superSaiyan:false});},base);}
  async function event(script){await restore();await page.evaluate(script=>{
    mana.snes.cart.data.set(script,0x742b0);mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(180);
  },script);}
  async function capture(name){
    const result=await comparePresentation(page),png=await page.evaluate(()=>document.getElementById('screen').toDataURL('image/png').split(',')[1]);
    await writeFile(resolve(out,name+'.png'),Buffer.from(png,'base64'));report.scenes.push({name,...result});
    console.log(name+': '+result.unexpected+' unexpected pixels');
  }
  // Original buy/sell/upgrade opcodes and the original save-question event50.
  for(const [name,script]of [['shop-buy',[0x5d,0x5f,0x2d,8,0x2e,0,0x5e,0]],['shop-sell',[0x5d,0x5f,0x0e,0x5e,0]],['weapon-upgrade',[0x0f,0]],['save-question',[0x10,0x50,0]]]){
    await event(script);await capture(name);
    if(name==='shop-buy'){await page.evaluate(()=>{mana.run(2,[0]);mana.run(90);});await capture('shop-buy-detail');}
  }
  await page.evaluate(()=>{mana.run(2,[0]);mana.run(120);});await capture('save-slots');
  await page.evaluate(()=>{
    // Save into this isolated browser's empty SRAM and reopen the native list.
    for(let i=0;i<3;i++){mana.run(2,[0]);mana.run(180);}
    mana.snes.cart.data.set([0x1f,6,0],0x742b0);
    mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(180);
  });await capture('save-filled-slot');
  await restore();
  await page.evaluate(()=>{
    const r=mana.snes.ram;r[0xe386]=r[0xe387]=99;r.fill(0,0xe3c8,0xe3d0);r[0xe3cf]=0x38;r.fill(0x33,0xe3c4,0xe3c8);
    mana.run(2,[2]);mana.run(60);mana.run(2,[1]);mana.run(60);
    for(let i=0;i<4&&r[0x1809]!==1;i++){mana.run(2,[4]);mana.run(60);}
  });await capture('spell-element-ring');
  await page.evaluate(()=>{mana.run(2,[0]);mana.run(90);});await capture('spell-selection-ring');
  // Permit the original Lucent Beam record to target party members so its
  // target UI can be inspected in an enemy-free diagnostic village.
  await page.evaluate(()=>{mana.snes.cart.data[0x1034d8]=0;mana.run(2,[6]);mana.run(60);mana.run(2,[0]);mana.run(90);});await capture('spell-target-ring');
  report.passed=report.errors.length===0&&report.scenes.every(scene=>scene.unexpected===0);
  if(!report.passed)process.exitCode=1;
}finally{
  await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Native event UI audit</title><style>body{background:#17191e;color:#eee;font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(3,256px);gap:16px}figure{margin:0}img{width:256px;height:240px;image-rendering:pixelated}figcaption{margin:6px 0}</style><h1>Native event UI audit</h1><p>Original shops, weapon upgrade, save and spell menus; diagnostic full-party checkpoint.</p><main>'+report.scenes.map(s=>'<figure><img src="'+s.name+'.png"><figcaption>'+s.name+' — '+s.unexpected+' unexpected pixels</figcaption></figure>').join('')+'</main>');
}
