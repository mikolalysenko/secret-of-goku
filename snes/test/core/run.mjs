#!/usr/bin/env node
// Core service tests in Mesen. Builds a CORE_TEST cartridge (the core's test
// client, snes/test/core/testmod.asm, driven through a WRAM mailbox), makes
// sure the shared checkpoints exist (snes/test/checkpoints.mjs), then runs
// each test with a private ROM copy so battery RAM starts clean.
//   node snes/test/core/run.mjs [test ...]
// Outputs: .local/snes-test/core/<test>/ (results.json, screenshots).
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const outRoot=resolve(repo,'.local/snes-test/core');
mkdirSync(outRoot,{recursive:true});

const testRom=resolve(repo,'.local/snes-test/roms/core-test.sfc');
const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${testRom}`,'-DCORE_TEST=1'],{cwd:repo,stdio:'inherit'});
if(b.status!==0){console.error('core: CORE_TEST build failed');process.exit(1);}

const cps=checkpointDir();
const need=['name-entry','waterfall'];
if(need.some(n=>!existsSync(join(cps,`${n}.mss`)))){
  console.log('core: making checkpoints in',cps);
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('core: checkpoints failed');process.exit(1);}
}

// name, start state (checkpoint name or null for power-on), timeout
const tests=[
  ['title',null],
  ['frames','waterfall'],
  ['input','waterfall'],
  ['menu','name-entry'],
  ['oam','waterfall'],
  ['vram','waterfall'],
  ['sound-event','waterfall'],
  ['world','waterfall'],
  ['save','waterfall'],
  ['lag','waterfall'],
  ['wram',null],
  ['live',null],
  ['xdata',null],
].filter(([n])=>!only.length||only.includes(n));

const importDir=process.env.SNES_IMPORT??join(dirname(cps),'snes-import');
// The xdata probe's address, assigned by build.mjs (dist/snes/gen/xdata.asm).
const xm=readFileSync(join(repo,'dist/snes/gen/xdata.asm'),'utf8').match(/^!XDATA_CORE_PROBE = \$([0-9A-F]{6})$/m);
const lib=`IMPORT_DIR=${JSON.stringify(importDir)}\nXPROBE=${xm?parseInt(xm[1],16):-1}\n`+readFileSync(join(here,'lib.lua'),'utf8');
const summary=[];
for(const [name,cp] of tests){
  const rom=privateRom(testRom,`core-${name}`);
  const t0=Date.now();
  const r=await runMesen({rom,test:lib+'\n'+readFileSync(join(here,`${name}.lua`),'utf8'),outDir:join(outRoot,name),state:cp?join(cps,`${cp}.mss`):null,timeoutMs:600000});
  cleanupRom(rom);
  const res=r.results??{};
  const fails=Object.entries(res).filter(([k,v])=>typeof v==='string'&&v.startsWith('FAIL'));
  const ok=r.code===0&&!res.error&&res.failures===0;
  summary.push({test:name,ok,seconds:((Date.now()-t0)/1000).toFixed(1),fails:fails.map(([k,v])=>`${k}: ${v}`),error:res.error});
  console.log(`core ${name.padEnd(12)} ${ok?'pass':'FAIL'} (${((Date.now()-t0)/1000).toFixed(1)} s)`);
  for(const [k,v] of fails)console.log(`   ${k}: ${v}`);
  if(res.error)console.log('   error:',res.error);
  if(!ok&&r.code!==0&&!res.error)console.log(r.output.slice(-1500));
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
process.exit(summary.every(s=>s.ok)?0:1);
