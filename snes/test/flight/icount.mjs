#!/usr/bin/env node
// Dev aid: instructions executed per logic frame in each flight routine
// (buckets = top-level labels of bank A3 from the symbol file).
//   node snes/test/flight/icount.mjs [rom]
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const pos=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const rom=pos[0]??join(repo,'dist/snes/secret-of-goku.sfc');
const walk=process.argv.includes('--walk');
const labels=[];
let section='';
for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
  if(line.startsWith('['))section=line.trim();
  if(section!=='[labels]')continue;
  const m=line.match(/^A3:([0-9A-F]{4}) ([A-Za-z_]\S*)$/i);if(!m)continue;
  const addr=0xa30000+parseInt(m[1],16),name=m[2];
  if(/_[a-z0-9]+$/.test(name)&&labels.some(l=>name.startsWith(l.name+'_')))continue; // sublabel
  labels.push({addr,name});
}
labels.sort((a,b)=>a.addr-b.addr);
const buckets=labels.map((l,i)=>`{${JSON.stringify(l.name)},0x${l.addr.toString(16)},0x${(labels[i+1]?.addr??0xa40000).toString(16)}}`);
const sym=n=>labels.find(l=>l.name===n)?.addr;
const phases=[['d651',sym('fl_hook_d651')],['other',0x00d655],['d778',sym('fl_hook_d778')],['other',0x00d77c],['other',0x00d7f3],
  ['frame',sym('flight_frame')],['other',0x00b077],['d359',sym('fl_hook_d359')],['other',0x00d360],['other',0x00d38e]];
const test=(walk?'ICOUNT_INPUT={up=true}\n':'')+`PHASES={${phases.map(p=>`{${JSON.stringify(p[0])},0x${p[1].toString(16)}}`).join(',')}}\nBUCKETS={${buckets.join(',')}}\nIMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(join(here,'debug_icount.lua'),'utf8');
const cart=privateRom(rom,'flight-dev');
const r=await runMesen({rom:cart,test,outDir:join(repo,'.local/snes-test/flight/icount'),state:join(checkpointDir(),'waterfall.mss')});
cleanupRom(cart);
console.log((r.results?.log??[]).join('\n'));
if(r.results?.error)console.log('ERROR',r.results.error);
