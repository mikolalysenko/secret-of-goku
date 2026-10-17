#!/usr/bin/env node
// Dev aid: flight-bank instructions per video frame while a scenario
// (scenarios.mjs) plays on the cartridge, with the costliest frames' top
// routines (buckets = top-level labels of bank A3).
//   node snes/test/flight/scost.mjs <scenario> [rom] [--frames=n,m]
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {scenarios} from './scenarios.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const [name,romArg]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const sc=scenarios.find(s=>s.name===name);if(!sc)throw Error('no scenario '+name);
const rom=romArg??resolve(repo,'.local/snes-test/roms/flight-test.sfc');
const labels=[];let section='';
for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
  if(line.startsWith('['))section=line.trim();
  if(section!=='[labels]')continue;
  const m=line.match(/^A3:([0-9A-F]{4}) ([A-Za-z_]\S*)$/i);if(!m)continue;
  const addr=0xa30000+parseInt(m[1],16),n=m[2];
  if(/_[a-z0-9]+$/.test(n)&&labels.some(l=>n.startsWith(l.name+'_')))continue;
  labels.push({addr,name:n});
}
labels.sort((a,b)=>a.addr-b.addr);
const buckets=labels.map((l,i)=>`{${JSON.stringify(l.name)},0x${l.addr.toString(16)},0x${(labels[i+1]?.addr??0xa40000).toString(16)}}`);
const lua=v=>Array.isArray(v)?`{${v.map(lua).join(',')}}`:v&&typeof v==='object'?`{${Object.entries(v).map(([k,x])=>`${/^\d+$/.test(k)?`[${k}]`:k}=${lua(x)}`).join(',')}}`:typeof v==='string'?JSON.stringify(v):String(v);
const show=(process.argv.find(a=>a.startsWith('--frames='))?.slice(9)??'').split(',').filter(Boolean).map(Number);
const test=`SC=${lua(sc)}\n${show.length?`SHOW={${show.map(n=>`[${n}]=true`).join(',')}}\n`:''}BUCKETS={${buckets.join(',')}}\nIMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(join(here,'debug_scost.lua'),'utf8');
const cart=privateRom(rom,'flight-dev');
const r=await runMesen({rom:cart,test,outDir:join(repo,'.local/snes-test/flight/scost',name),state:join(checkpointDir(),'waterfall.mss')});
cleanupRom(cart);
console.log((r.results?.log??[]).join('\n'));
if(r.results?.error)console.log('ERROR',r.results.error);
