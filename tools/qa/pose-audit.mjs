// Original event opcode 31 drives the native actor animation. The temporary
// scratch event exists only in this browser's cartridge copy and is restored.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
const out='.local/animation-audit/poses',report={scenes:[],errors:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.mana?.ready);
  const base=JSON.parse(await readFile('.local/graphics-audit/party.json','utf8'));
  const events={gesture:0x88,flinch:0x8c,knockback:0x8d,tumble:0x8e,recover:0x8f,chest:0x9b,fall:0xa0,hop:0xa1,landing:0xa2,rest:0xa3,bossRecoil:0xaa,bossReward:0xab,pitfall:0xae,ghost:0xaf};
  for(const superSaiyan of [false,true])for(const [name,animation]of Object.entries(events)){
    const scene=await page.evaluate(({base,superSaiyan,animation})=>{
      mana.pause();base.romHash=mana.hash(mana.snes.cart.data);mana.restore(base);
      Object.assign(mana.mod.options,{enabled:true,power:false,superSaiyan});
      mana.write8(0xe200,0);mana.write8(0xe400,0);mana.run(4,[6]);mana.run(8);
      const cart=mana.snes.cart.data,original=cart.slice(0x742b0,0x742b8),history=[],screens=[];
      if(!original.every(byte=>byte===0xff))throw Error('The diagnostic event scratch region is occupied.');
      cart.set([0x31,0,animation,0x28,0xff,0],0x742b0);
      mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);
      try{for(let f=0;f<180;f++){
        mana.run(1);const sprite=mana.mod.spriteLayer.plan?.sprite;
        history.push({f,native:mana.read8(0xe011),nativeFrame:mana.read16(0xe026),height:mana.read8(0xe045),sprite:{...sprite}});
        if([2,7,12,17,22,27,37,47,62,72,87,107,117,137,157,177].includes(f))screens.push({f,png:document.querySelector('#screen').toDataURL()});
      }}finally{cart.set(original,0x742b0);}
      return{history,screens};
    },{base,superSaiyan,animation});
    const stem=(superSaiyan?'super-':'base-')+name,contact=new PNG({width:256*8,height:240*2});
    for(const [i,frame]of scene.screens.entries()){
      const source=PNG.sync.read(Buffer.from(frame.png.split(',')[1],'base64'));
      for(let y=0;y<240;y++)for(let x=0;x<256;x++){
        const from=(y*2*source.width+x*2)*4,to=((Math.floor(i/8)*240+y)*contact.width+(i%8)*256+x)*4;
        source.data.copy(contact.data,to,from,from+4);
      }
    }
    delete scene.screens;report.scenes.push({name:stem,animation,...scene});
    await writeFile(`${out}/${stem}.png`,PNG.sync.write(contact));console.log(stem);
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;}
finally{
  await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  await writeFile(`${out}/index.html`,`<!doctype html><meta charset="utf-8"><title>Native scripted poses</title><style>body{background:#10151b;color:#eee;font:16px system-ui}img{max-width:100%;image-rendering:pixelated}</style><h1>Native scripted poses</h1><p>Original event animations, both forms. Frames 2, 7, 12, 17, 22, 27, 37, 47 / 62, 72, 87, 107, 117, 137, 157, 177.</p>${report.scenes.map(scene=>`<h2>${scene.name}</h2><img src="${scene.name}.png">`).join('')}`);
  console.log(JSON.stringify({passed:report.passed,scenes:report.scenes.length,failure:report.failure}));
}
