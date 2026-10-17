#!/usr/bin/env node
// Reference captures from the browser mod (the behaviour the cartridge must
// reproduce). For each `?start=` preset, loads the player in headless
// Chromium, saves the full snapshot (SnesJs core + the mod's own JS state),
// screenshots at the requested frame offsets, and converts the snapshot into a
// Mesen import bundle (.local/snes-import/preset__<name>/).
//   node snes/tools/ref-capture.mjs [preset ...] [--frames=0,60,240] [--out=.local/snes-ref]
// Presets: trial late intro hexas rider tree fortress buffy slime flight frieza
// thanatos battle orbit space beast good-ending bad-ending explosion title sword sandship
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportState} from './snesjs-export.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..');
const args=process.argv.slice(2);
const opt=(n,d)=>{const a=args.find(x=>x.startsWith(`--${n}=`));return a?a.slice(n.length+3):d;};
const ALL=['trial','late','intro','hexas','rider','tree','fortress','buffy','slime','flight','frieza','thanatos','battle','orbit','space','beast','good-ending','bad-ending','explosion','title','sword','sandship'];
const presets=args.filter(a=>!a.startsWith('--'));
const list=presets.length?presets:ALL;
const frames=opt('frames','0,60,240').split(',').map(Number);
const out=resolve(repo,opt('out','.local/snes-ref'));
const port=Number(opt('port','5199'));
const server=spawn(process.execPath,[resolve(repo,'scripts/serve.mjs')],{cwd:repo,env:{...process.env,PORT:String(port)},stdio:'ignore'});
await new Promise(r=>setTimeout(r,1500));
const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
try{
  for(const preset of list){
    const dir=join(out,preset);mkdirSync(dir,{recursive:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const t0=Date.now();
    try{
      await page.goto(`http://127.0.0.1:${port}/?start=${preset}&debug=true`);
      await page.waitForFunction(()=>window.mana&&mana.ready,{},{timeout:240000});
      await page.evaluate(()=>{mana.pause();const p=document.querySelector('#native-pause');if(p)p.hidden=true;});
      const state=await page.evaluate(()=>JSON.stringify(mana.snapshot()));
      writeFileSync(join(dir,'state.json'),state);
      let at=0;
      for(const f of frames){
        if(f>at){await page.evaluate(n=>mana.run(n),f-at);at=f;}
        await page.locator('#screen').screenshot({path:join(dir,`frame-${String(f).padStart(5,'0')}.png`)});
      }
      const info=await page.evaluate(()=>({map:mana.mod.read16?mana.mod.read16(0xdc):null,status:mana.mod.status?{hp:mana.mod.status.hp}:null}));
      let bundle=null;
      try{exportState(join(dir,'state.json'),resolve(repo,`.local/snes-import/preset__${preset}`));bundle=`.local/snes-import/preset__${preset}`;}catch(e){bundle=`not exported: ${e.message}`;}
      writeFileSync(join(dir,'info.json'),JSON.stringify({preset,frames,ms:Date.now()-t0,info,bundle,errors},null,1));
      console.log(preset,'ok',Date.now()-t0,'ms',bundle);
    }catch(e){
      writeFileSync(join(dir,'info.json'),JSON.stringify({preset,error:String(e.message),errors},null,1));
      console.log(preset,'FAILED',e.message.split('\n')[0]);
    }
    await page.close();
  }
}finally{await browser.close();server.kill();}
