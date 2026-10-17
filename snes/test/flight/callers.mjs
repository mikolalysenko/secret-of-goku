#!/usr/bin/env node
// Dev aid: who calls a flight routine, per logic frame while flying.
//   node snes/test/flight/callers.mjs fl_fetch fl_step ...
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=join(repo,'dist/snes/secret-of-goku.sfc');
const labels=[];let section='';
for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
  if(line.startsWith('['))section=line.trim();
  if(section!=='[labels]')continue;
  const m=line.match(/^A3:([0-9A-F]{4}) ([A-Za-z_]\S*)$/i);if(m)labels.push({addr:parseInt(m[1],16),name:m[2]});
}
labels.sort((a,b)=>a.addr-b.addr);
const at=a=>{let best=null;for(const l of labels)if(l.addr<=a)best=l;return best?`${best.name}+${(a-best.addr).toString(16)}`:a.toString(16);};
const targets=process.argv.slice(2).map(n=>{const l=labels.find(x=>x.name===n);if(!l)throw Error('no label '+n);return `{${JSON.stringify(n)},0xa3${l.addr.toString(16).padStart(4,'0')}}`;});
const test=`TARGETS={${targets.join(',')}}\nIMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(join(here,'debug_callers.lua'),'utf8');
const cart=privateRom(rom,'flight-dev');
const r=await runMesen({rom:cart,test,outDir:join(repo,'.local/snes-test/flight/callers'),state:join(checkpointDir(),'waterfall.mss')});
cleanupRom(cart);
for(const l of r.results?.log??[]){const m=l.match(/^(\S+) <- ([0-9A-F]{4})\s+(\S+)/);console.log(m?`${m[1].padEnd(18)} <- ${at(parseInt(m[2],16)).padEnd(34)} ${m[3]}`:l);}
if(r.results?.error)console.log('ERROR',r.results.error);
