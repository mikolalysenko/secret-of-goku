#!/usr/bin/env node
// Dev aid: flight-bank instructions per video frame split by phase (the
// frame's steps and each movement hook) while a scenario (scenarios.mjs)
// plays on the cartridge.
//   node snes/test/flight/phases.mjs <scenario> [rom] [--frames=n,m] [--phases=a,b]
//     [--focus=phase]   (flat profile of the routines run inside one phase)
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {scenarios} from './scenarios.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const pos=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const [name,romArg]=pos;
const sc=scenarios.find(s=>s.name===name);if(!sc)throw Error('no scenario '+name);
const rom=romArg??resolve(repo,'.local/snes-test/roms/flight-test.sfc');
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const at=n=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${n}$`,'mi'));if(!m)throw Error('no symbol '+n);return `0x${m[1]}${m[2]}`;};
const extra=(process.argv.find(a=>a.startsWith('--phases='))?.slice(9)??'').split(',').filter(Boolean);
const names=['flight_frame','fl_settle','fl_lift_update','fl_decide','fl_publish','fl_hook_d651','fl_hook_d778','fl_hook_d359','fl_hook_d9ae','fl_hook_da34','fl_hook_da6e','fl_hook_b683',...extra];
const phases=names.map(n=>`{${JSON.stringify(n)},${at(n)}}`);
const focus=process.argv.find(a=>a.startsWith('--focus='))?.slice(8);
let buckets='';
if(focus){
  const labels=[];let section='';
  for(const line of sym.split('\n')){
    if(line.startsWith('['))section=line.trim();
    if(section!=='[labels]')continue;
    const m=line.match(/^A3:([0-9A-F]{4}) ([A-Za-z_]\S*)$/i);if(!m)continue;
    const addr=0xa30000+parseInt(m[1],16),n=m[2];
    if(/_[a-z0-9]+$/.test(n)&&labels.some(l=>n.startsWith(l.name+'_')))continue;
    labels.push({addr,name:n});
  }
  labels.sort((a,b)=>a.addr-b.addr);
  buckets=`FOCUS=${JSON.stringify(focus)}\nBUCKETS={${labels.map((l,i)=>`{${JSON.stringify(l.name)},0x${l.addr.toString(16)},0x${(labels[i+1]?.addr??0xa40000).toString(16)}}`).join(',')}}\n`;
}
const show=(process.argv.find(a=>a.startsWith('--frames='))?.slice(9)??'').split(',').filter(Boolean).map(Number);
const lua=v=>Array.isArray(v)?`{${v.map(lua).join(',')}}`:v&&typeof v==='object'?`{${Object.entries(v).map(([k,x])=>`${/^\d+$/.test(k)?`[${k}]`:k}=${lua(x)}`).join(',')}}`:typeof v==='string'?JSON.stringify(v):String(v);
const test=`SC=${lua(sc)}\n${show.length?`SHOW={${show.map(n=>`[${n}]=true`).join(',')}}\n`:''}PHASES={${phases.join(',')}}\n${buckets}IMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(join(here,'debug_phases.lua'),'utf8');
const cart=privateRom(rom,'flight-dev');
const r=await runMesen({rom:cart,test,outDir:join(repo,'.local/snes-test/flight/phases',name),state:join(checkpointDir(),'waterfall.mss')});
cleanupRom(cart);
console.log((r.results?.log??[]).join('\n'));
if(r.results?.error)console.log('ERROR',r.results.error);
