#!/usr/bin/env node
// Runs the flight scenarios (scenarios.mjs) on the cartridge (FLIGHT_TEST
// build, Mesen) and compares each per-frame trace with the browser mod's
// (browser-ref.mjs output). The cartridge decides flight from the pad read
// at the end of the previous frame, one frame after the browser, so the
// comparison aligns the traces on the first frame of motion and reports the
// largest position difference, the end state and the frames where flight
// state differs.
//   node snes/test/flight/compare.mjs [scenario ...] [--rom=path] [--shots=1,2,...]
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {scenarios} from './scenarios.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

const lua=v=>Array.isArray(v)?`{${v.map(lua).join(',')}}`:v&&typeof v==='object'?`{${Object.entries(v).map(([k,x])=>`${k}=${lua(x)}`).join(',')}}`:typeof v==='string'?JSON.stringify(v):String(v);

export async function runScenario(sc,rom,outDir,shots=[]){
  const test=`SC=${lua(sc)}\nSHOTS={${shots.map(n=>`[${n}]=true`).join(',')}}\nIMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(join(here,'scenario.lua'),'utf8');
  const cart=privateRom(rom,`flight-${sc.name}`);
  const r=await runMesen({rom:cart,test,outDir,state:join(checkpointDir(),'waterfall.mss')});
  cleanupRom(cart);
  if(!r.results?.pass)return {error:r.results?.error??r.output.slice(-300)};
  return {trace:JSON.parse(readFileSync(join(outDir,'trace.json'),'utf8'))};
}

export function compareTraces(cart,js){
  const moved=t=>t.findIndex((f,i)=>i>0&&(f.x!==t[0].x||f.y!==t[0].y));
  const a=moved(cart),b=moved(js),shift=a>=0&&b>=0?a-b:0;
  let maxd=0,at=-1,flyDiff=0;
  for(let i=0;i<js.length;i++){
    const c=cart[i+shift];if(!c)continue;
    const d=Math.max(Math.abs(c.x-js[i].x),Math.abs(c.y-js[i].y));
    if(d>maxd){maxd=d;at=i;}
    if(c.fly!==js[i].fly)flyDiff++;
  }
  const ce=cart.at(-1),je=js.at(-1);
  return {shift,maxd,at,flyDiff,startCart:[cart[0].x,cart[0].y],startJs:[js[0].x,js[0].y],
    endCart:{map:ce.map,x:ce.x,y:ce.y,fly:ce.fly},endJs:{map:je.map,x:je.x,y:je.y,fly:je.fly}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const rom=resolve(args.find(a=>a.startsWith('--rom='))?.slice(6)??resolve(repo,'.local/snes-test/roms/flight-test.sfc'));
  if(!args.some(a=>a.startsWith('--rom='))){
    const b=spawnSync(process.execPath,[resolve(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${rom}`,'-DFLIGHT_TEST=1'],{cwd:repo,stdio:'inherit'});
    if(b.status!==0)process.exit(1);
  }
  const want=args.filter(a=>!a.startsWith('--'));
  const shots=(args.find(a=>a.startsWith('--shots='))?.slice(8)??'').split(',').filter(Boolean).map(Number);
  for(const sc of scenarios.filter(s=>!want.length||want.includes(s.name))){
    const outDir=resolve(repo,'.local/snes-test/flight/scenarios',sc.name);mkdirSync(outDir,{recursive:true});
    const r=await runScenario(sc,rom,outDir,shots);
    if(r.error){console.log(`${sc.name}: ERROR ${r.error}`);continue;}
    const ref=resolve(repo,'.local/snes-test/flight/browser',`${sc.name}.json`);
    if(!existsSync(ref)){console.log(`${sc.name}: no browser reference (run browser-ref.mjs)`);continue;}
    const js=JSON.parse(readFileSync(ref,'utf8'));
    const c=compareTraces(r.trace,js);
    writeFileSync(join(outDir,'compare.json'),JSON.stringify(c,null,1));
    console.log(`${sc.name.padEnd(14)} shift ${c.shift} max |d| ${c.maxd}${c.at>=0?` @${c.at}`:''} fly-diff ${c.flyDiff}  start cart ${c.startCart} js ${c.startJs}  end cart ${JSON.stringify(c.endCart)} js ${JSON.stringify(c.endJs)}`);
  }
}
