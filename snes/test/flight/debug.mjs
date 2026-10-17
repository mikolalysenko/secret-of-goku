#!/usr/bin/env node
// Runs one flight Lua script (with lib.lua) in Mesen and prints its log.
//   node snes/test/flight/debug.mjs <script.lua> [rom] [--state=checkpoint]
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,checkpointDir} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2),pos=args.filter(a=>!a.startsWith('--'));
const [lua,rom=join(repo,'dist/snes/secret-of-goku.sfc')]=pos;
const test=`IMPORT=${JSON.stringify(join(mainCheckout(),'.local/snes-import')+'/')}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n'+readFileSync(resolve(lua),'utf8');
const r=await runMesen({rom,test,outDir:join(repo,'.local/snes-test/flight/debug'),state:join(checkpointDir(),'waterfall.mss')});
console.log((r.results?.log??[]).join('\n'));
if(r.results?.error)console.log('ERROR',r.results.error);
