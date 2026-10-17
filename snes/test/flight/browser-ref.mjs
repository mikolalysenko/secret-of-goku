#!/usr/bin/env node
// Browser-mod reference traces for the flight scenarios (scenarios.mjs):
// loads the player in headless Chromium (dev server from this checkout,
// private ROM and fixture under .local/), restores the fixture state, warps
// like the browser tests' enter(), plays the inputs and records per frame
// map, position, terrain, localFlight and localLift.
//   node snes/test/flight/browser-ref.mjs [scenario ...]
// Output: .local/snes-test/flight/browser/<scenario>.json
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scenarios} from './scenarios.mjs';
import {mainCheckout} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const want=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const list=scenarios.filter(s=>!want.length||want.includes(s.name));
const out=resolve(repo,'.local/snes-test/flight/browser');mkdirSync(out,{recursive:true});
const shared=p=>[resolve(repo,p),resolve(mainCheckout(),p)].find(existsSync)??resolve(repo,p);
const fixtures={'graphics-audit__party':shared('.local/graphics-audit/party.json'),
  'animation-audit__native__rabite-field-b':shared('.local/animation-audit/native/rabite-field-b.json')};
for(const sc of list)if(!existsSync(fixtures[sc.fixture]))throw Error('missing fixture '+fixtures[sc.fixture]);
const BUTTON={b:0,y:1,select:2,start:3,up:4,down:5,left:6,right:7,a:8,x:9,l:10,r:11};
const port=5191;
const server=spawn(process.execPath,[resolve(repo,'scripts/serve.mjs')],{cwd:repo,env:{...process.env,PORT:String(port)},stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(()=>window.mana&&mana.ready,{},{timeout:120000});
  for(const sc of list){
    const state=JSON.parse(readFileSync(fixtures[sc.fixture],'utf8'));
    const trace=await page.evaluate(({state,sc,BUTTON})=>{
      mana.pause();state.romHash=mana.hash(mana.snes.cart.data);mana.restore(state);
      Object.assign(mana.mod.options,{enabled:true,power:true,superSaiyan:false});mana.run(3);
      const m=mana.mod,c=mana.snes.cart.data,e=c.slice(0x742b0,0x742b5),d=c.slice(0x8300c,0x83010);
      if(sc.enter){
        const {map,x,y,layer=0,flags={}}=sc.enter;
        try{c.set([4,24,3,5,0],0x742b0);c.set([map&255,x*2+(map>>8),y*2+layer,0],0x8300c);
          for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
          mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
        }finally{c.set(e,0x742b0);c.set(d,0x8300c);}
      }
      m.powerIntro?.restore({flight:true,superSaiyan:true});m.radio?.restore({firstFlight:true});
      for(const p of sc.prep??[]){
        if(p==='clearActors')for(let i=1;i<12;i++)mana.write8(0xe000+i*512,0);
        if(p==='clearSupport')mana.snes.ram.fill(0,0xe200,0xe600);
        if(p==='ssj')m.options.superSaiyan=true;
        if(p==='restore')m.localFlightHook.restore();
        if(typeof p==='object'&&p.w){for(const[a,v,n]of p.w)n===2?mana.write16(a,v):mana.write8(a,v);}
        else if(typeof p==='object'){mana.write16(0xe002,p.x);mana.write16(0xe004,p.y);m.teleport.follow({x:p.x,y:p.y,terrain:mana.read8(0xe00b)});}
      }
      const rec=()=>{const s=m.status,a=m.action;return {map:mana.read16(0xdc),x:mana.read16(0xe002),y:mana.read16(0xe004),t:mana.read8(0xe00b),fly:!!m.localFlight,lift:m.localLift,can:m.canAttack,
        act:a?.kind==='teleport',age:a?.kind==='teleport'?a.age:0,cx:s.cameraX,cy:s.cameraY,tg:m.lastTeleportTarget,pend:!!m.teleport?.pending,
        en:Array.from({length:9},(_,k)=>k+3).filter(i=>mana.read8(0xe000+i*512)&1).map(i=>`${i}:${mana.read16(0xe002+i*512)},${mana.read16(0xe004+i*512)}`).join(' '),
        gap:!!m.gapFlight?.active,ev:mana.read8(0xd0),party:`${mana.read16(0xe202)},${mana.read16(0xe204)} ${mana.read16(0xe402)},${mana.read16(0xe404)}`,cf:mana.read8(0xcf01)*256+mana.read8(0xcf03)};};
      const frames=[rec()];
      for(const st of sc.steps){
        const buttons=(st.b??[]).map(k=>BUTTON[k]);
        for(let i=0;i<st.n;i++){mana.run(1,buttons);frames.push(rec());}
      }
      return frames;
    },{state,sc,BUTTON});
    writeFileSync(join(out,`${sc.name}.json`),JSON.stringify(trace));
    const last=trace.at(-1);
    console.log(`${sc.name}: ${trace.length} frames, start ${trace[0].x},${trace[0].y} end map ${last.map} ${last.x},${last.y} fly ${last.fly}`);
  }
  if(errors.length)console.log('page errors:',errors.slice(0,5));
}finally{await browser.close();server.kill();}
