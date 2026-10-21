#!/usr/bin/env node
// Glitch hunt: one-frame transients after each scene-select preset.
// Each preset starts from power-on exactly as in run.mjs (preset.lua), then
// every frame for --frames frames is screenshotted with exact frames. A
// transient pixel differs from both neighbouring pictures by more than 48
// (summed 8-bit RGB) while the neighbours differ by 24 or less: a one-frame
// flash, blink, torn frame or wrong palette. Legitimate effects (quakes,
// hit flashes, 30 Hz native flicker, window animations) flag too, so
// --browser records the same frames from the browser mod (screenshots only:
// no state export, unlike snes/tools/ref-capture.mjs) and reports both
// counts side by side. Only flagged frames and their neighbours are kept.
//   node snes/test/debug/hunt.mjs [preset ...] [--frames=480] [--jobs=5] [--browser]
// SNES_ROM selects the cartridge. Output: .local/snes-test/debug-hunt/
// (<preset>/ cartridge frames, browser/<preset>/ browser frames, report.json).
import {readFileSync,readdirSync,rmSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const {PNG}=createRequire(resolve(repo,'package.json'))('pngjs');
const args=process.argv.slice(2);
const opt=(n,d)=>{const a=args.find(x=>x.startsWith(`--${n}=`));return a?a.slice(n.length+3):d;};
const rom=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const catalog=JSON.parse(readFileSync(join(repo,'dist/snes/gen/debug/catalog.json'),'utf8'));
const kinds=catalog.presets.map(p=>p.kind);
const only=args.filter(a=>!a.startsWith('--'));
for(const k of only)if(!kinds.includes(k))throw Error(`unknown preset ${k}`);
const list=only.length?only:kinds;
const frames=Number(opt('frames','480')),jobs=Number(opt('jobs','5'));
const out=resolve(repo,'.local/snes-test/debug-hunt');
mkdirSync(out,{recursive:true});
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const m=sym.match(/^([0-9A-F]{2}):([0-9A-F]{4}) debug_addresses$/m);
const work=m?parseInt(m[1]+m[2],16):0x317600;
const lua=readFileSync(join(here,'preset.lua'),'utf8');

export const DIFF=48,SAME=24;
// Transients of the frame-NNNNN.png sequence in dir (frame 00000, the
// capture point, is skipped); keeps flagged frames and their neighbours.
export function transients(dir,{prune=true}={}){
  const files=readdirSync(dir).filter(f=>/^frame-\d{5}\.png$/.test(f)&&f!=='frame-00000.png').sort();
  const img=files.map(f=>PNG.sync.read(readFileSync(join(dir,f))));
  const d=(a,b,i)=>Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
  const found=[];
  for(let t=1;t<img.length-1;t++){
    const A=img[t-1],B=img[t],C=img[t+1];
    if(A.width!==B.width||B.width!==C.width||A.height!==B.height||B.height!==C.height)continue;
    let n=0,x0=1e9,y0=1e9,x1=-1,y1=-1;
    for(let i=0;i<B.data.length;i+=4){
      if(d(A,B,i)>DIFF&&d(B,C,i)>DIFF&&d(A,C,i)<=SAME){
        n++;const p=i/4,x=p%B.width,y=(p/B.width)|0;
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      }
    }
    // Pixel counts are reported at the cartridge's scale.
    if(n>0)found.push({frame:Number(files[t].slice(6,11)),pixels:Math.round(n*256*224/(B.width*B.height)),box:[x0,y0,x1,y1]});
  }
  if(prune){
    const keep=new Set();
    for(const o of found)for(const j of [o.frame-1,o.frame,o.frame+1])keep.add(`frame-${String(j).padStart(5,'0')}.png`);
    for(const f of files)if(!keep.has(f))rmSync(join(dir,f));
  }
  return {frames:files.length,flagged:found};
}

async function cartridge(kind){
  const index=kinds.indexOf(kind);
  const shots=Array.from({length:frames},(_,i)=>i+1).join(',');
  const prelude=`DBG_WORK=${work}\nPRESET=${index}\nMAXF=${kind==='sword'?26000:16000}\nSHOTS={${shots}}\n`;
  const copy=privateRom(rom,`hunt-${kind}`);
  const dir=join(out,kind);
  const r=await runMesen({rom:copy,test:prelude+lua,outDir:dir,timeoutMs:1500000,exactFrames:true});
  cleanupRom(copy);
  const status=['idle','running','done','failed','aborted'][r.results?.status]??'error';
  return {status,...(existsSync(dir)?transients(dir):{frames:0,flagged:[]})};
}

// The browser mod's frames for the same presets (?start=<preset>), one
// screenshot per mana.run(1), in one headless Chromium.
async function browserFrames(kinds){
  const {chromium}=await import('@playwright/test');
  const port=Number(opt('port','5241'));
  const server=spawn(process.execPath,[join(repo,'scripts/serve.mjs')],{cwd:repo,env:{...process.env,PORT:String(port)},stdio:'ignore'});
  await new Promise(r=>setTimeout(r,1500));
  const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
  const result={};
  try{
    for(const kind of kinds){
      const dir=join(out,'browser',kind);
      rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
      const page=await browser.newPage({viewport:{width:1440,height:1000}});
      try{
        await page.goto(`http://127.0.0.1:${port}/?start=${kind}&debug=true`);
        await page.waitForFunction(()=>window.mana&&mana.ready,{},{timeout:240000});
        await page.evaluate(()=>{mana.pause();const p=document.querySelector('#native-pause');if(p)p.hidden=true;});
        const screen=page.locator('#screen');
        for(let f=0;f<=frames;f++){
          if(f)await page.evaluate(()=>mana.run(1));
          await screen.screenshot({path:join(dir,`frame-${String(f).padStart(5,'0')}.png`)});
        }
        result[kind]=transients(dir);
      }catch(e){result[kind]={error:e.message.split('\n')[0]};}
      await page.close();
    }
  }finally{await browser.close();server.kill();}
  return result;
}

const queue=[...list],reports={};
await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{
  while(queue.length){const k=queue.shift();reports[k]={cartridge:await cartridge(k)};}
}));
if(args.includes('--browser')){
  const b=await browserFrames(list);
  for(const k of list)reports[k].browser=b[k];
}
const top=r=>[...(r?.flagged??[])].sort((a,b)=>b.pixels-a.pixels).slice(0,3).map(o=>`${o.frame}:${o.pixels}`).join(' ');
console.log('preset        status  cartridge flagged     browser flagged   largest (frame:pixels)');
for(const k of list){
  const c=reports[k].cartridge,b=reports[k].browser;
  const bs=b?(b.error?'error':`${b.flagged.length}/${b.frames}`):'-';
  console.log(`${k.padEnd(13)} ${c.status.padEnd(7)} ${`${c.flagged.length}/${c.frames}`.padEnd(21)} ${bs.padEnd(17)} ${top(c)}${b&&!b.error?`  | browser ${top(b)}`:''}`);
}
writeFileSync(join(out,'report.json'),JSON.stringify(reports,null,1));
console.log('report',join(out,'report.json'));
