#!/usr/bin/env node
// Dev aid: entries of chosen flight routines per video frame while a
// scenario (scenarios.mjs) plays on the cartridge.
//   node snes/test/flight/calls.mjs <scenario> name[,name...] [rom] [--frames=n,m]
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {scenarios} from './scenarios.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const pos=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const [name,names,romArg]=pos;
const sc=scenarios.find(s=>s.name===name);if(!sc)throw Error('no scenario '+name);
const rom=romArg??resolve(repo,'.local/snes-test/roms/flight-test.sfc');
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const targets=names.split(',').map(n=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${n}$`,'mi'));if(!m)throw Error('no symbol '+n);return `{${JSON.stringify(n)},0x${m[1]}${m[2]}}`;});
const show=(process.argv.find(a=>a.startsWith('--frames='))?.slice(9)??'').split(',').filter(Boolean).map(Number);
const lua=v=>Array.isArray(v)?`{${v.map(lua).join(',')}}`:v&&typeof v==='object'?`{${Object.entries(v).map(([k,x])=>`${k}=${lua(x)}`).join(',')}}`:typeof v==='string'?JSON.stringify(v):String(v);
const test=`SC=${lua(sc)}\n${show.length?`SHOW={${show.map(n=>`[${n}]=true`).join(',')}}\n`:''}TARGETS={${targets.join(',')}}\nIMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(join(here,'debug_calls.lua'),'utf8');
const cart=privateRom(rom,'flight-dev');
const r=await runMesen({rom:cart,test,outDir:join(repo,'.local/snes-test/flight/calls',name),state:join(checkpointDir(),'waterfall.mss')});
cleanupRom(cart);
console.log((r.results?.log??[]).join('\n'));
if(r.results?.error)console.log('ERROR',r.results.error);
