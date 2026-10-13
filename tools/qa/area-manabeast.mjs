// Private graphics QA: enter the original final battle through its own event.
// Flag/address facts: SecretOfManaRandomizer, attributed in map-names.json.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {isMain,readOptions,loadAuditRom,openAuditPage} from './area-catalog.mjs';
import {comparePresentation} from './presentation.mjs';

export async function initializeManaBeast(page){
  await page.evaluate(()=>{
    // Flag 0x4E=8 makes native species127 visible. Event429 runs the original
    // outside-fortress conversation, music and door0xBC into the Mode7 arena.
    mana.snes.cart.data.set([0x30,0x4e,8,0x14,0x29,0],0x742b0);
    const r=mana.snes.ram;r[0xd1]=0xb0;r[0xd2]=0x42;r[0xd3]=0xc7;r[0xd0]=1;
    mana.run(240);
  });
  const history=[];let frames=240;
  for(let i=0;i<60;i++){
    const status=await page.evaluate(()=>{
      mana.run(2,[0]);mana.run(180);
      return{map:mana.read16(0xdc),mode:mana.snes.ppu.mode,event:mana.read8(0xd0),canAttack:mana.mod.canAttack,flag78:mana.read8(0xcf4e),bossSpecies:mana.read8(0xe780),bossHp:mana.read16(0xe782)};
    });
    frames+=182;history.push({frames,...status});
    if(status.map===253&&status.mode===7&&status.canAttack&&status.bossSpecies===127){
      return{kind:'native-special-event',event:0x429,flag:{id:0x4e,value:8},frames,history};
    }
  }
  throw Error('Original event0x429 did not initialize the Mode7 Mana Beast battle: '+JSON.stringify(history.at(-1)));
}

async function main(){
  const options=readOptions(),rom=await loadAuditRom(options),state=JSON.parse(await fs.readFile(options.state,'utf8'));
  const out=options.out+'/special-manabeast';await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'}),history=[];
  try{
    const {page,errors}=await openAuditPage(browser,options,rom);
    await page.evaluate(state=>{state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);mana.mod.configure({enabled:true,power:false,superSaiyan:false});},state);
    const initialization=await initializeManaBeast(page);
    for(let i=0;i<40;i++){
      const result=await page.evaluate(()=>{
        mana.run(60);const p=mana.snes.ppu;
        return{status:mana.mod.status,mode:p.mode,brightness:p.brightness,blank:p.forcedBlank,
          bossSpecies:mana.read8(0xe780),bossHp:mana.read16(0xe782),flag78:mana.read8(0xcf4e),
          cgram:[...p.cgram],oam:[...p.oam],highOam:[...p.highOam],
          png:document.getElementById('screen').toDataURL('image/png')};
      });
      const {png,...record}=result,label=`phase-${String(i).padStart(2,'0')}`;
      await fs.writeFile(out+'/'+label+'.png',Buffer.from(png.split(',')[1],'base64'));
      record.comparison=await comparePresentation(page);history.push({label,frames:(i+1)*60+i,...record});
      if(record.status.map!==253)break;
    }
    const rendererSourceHash=createHash('sha256').update(await fs.readFile('engine/sprite-layer.js')).digest('hex');
    await fs.writeFile(out+'/report.json',JSON.stringify({initialization,rendererSourceHash,errors,history},null,2));
    const cards=history.map(h=>`<figure><img src="${h.label}.png"><figcaption>${h.frames} frames · map${h.status.map} · unexpected pixels ${h.comparison.unexpected}</figcaption></figure>`).join('');
    await fs.writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><title>Native Mana Beast graphics audit</title><style>body{margin:24px;background:#10141d;color:#dde5f0;font:14px system-ui}main{display:grid;grid-template-columns:repeat(4,256px);gap:16px}figure{margin:0}img{width:256px;height:240px;image-rendering:pixelated}</style><h1>Original Mana Beast battle</h1><p>Native event0x429, flag0x4E=8 and original door0xBC. No battle graphics are fabricated.</p><main>${cards}</main>`);
    console.log(JSON.stringify({out,frames:history.length,unexpected:history.reduce((sum,h)=>sum+h.comparison.unexpected,0),pageErrors:errors.length}));
    await page.close();
  }finally{await browser.close();}
}
if(isMain(import.meta.url))await main();
