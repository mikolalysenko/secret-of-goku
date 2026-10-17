#!/usr/bin/env node
// Smoke test: the cartridge boots, the title runs and field frames dispatch.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const r=await runMesen({rom,test:readFileSync(resolve(here,'boot.lua'),'utf8'),outDir:resolve(repo,'.local/snes-test/boot')});
const ok=r.code===0&&r.results?.reached_field===true;
console.log(`boot: ${ok?'pass':'FAIL'} (core_frame ${r.results?.core_frame}, map ${r.results?.map}, ${r.ms} ms)`);
if(!ok&&r.results?.error)console.log(r.results.error);
process.exit(ok?0:1);
