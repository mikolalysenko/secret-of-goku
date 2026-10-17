#!/usr/bin/env node
// Builds the cartridge, then runs every module's test runner
// (snes/test/<module>/run.mjs) against it and prints a summary.
//   node snes/test/run-all.mjs [module ...]
// A module runner receives the ROM path in SNES_ROM and must exit non-zero on
// failure. Outputs belong under .local/snes-test/<module>/.
import {spawnSync} from 'node:child_process';
import {readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..');
const only=process.argv.slice(2);
const build=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet'],{cwd:repo,stdio:'inherit'});
if(build.status!==0){console.error('build failed');process.exit(1);}
const rom=join(repo,'dist/snes/secret-of-goku.sfc');
const modules=readdirSync(here,{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(here,d.name,'run.mjs'))).map(d=>d.name).filter(m=>!only.length||only.includes(m)).sort();
const results=[];
for(const m of modules){
  const t0=Date.now();
  const r=spawnSync(process.execPath,[join(here,m,'run.mjs')],{cwd:repo,stdio:'inherit',env:{...process.env,SNES_ROM:rom}});
  results.push({module:m,ok:r.status===0,seconds:((Date.now()-t0)/1000).toFixed(1)});
}
console.log('\nmodule'.padEnd(16)+'result  seconds');
for(const r of results)console.log(r.module.padEnd(15)+(r.ok?'pass  ':'FAIL  ')+'  '+r.seconds);
process.exit(results.every(r=>r.ok)?0:1);
