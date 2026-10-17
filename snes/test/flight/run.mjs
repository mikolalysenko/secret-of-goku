#!/usr/bin/env node
// FLIGHT module tests in Mesen (also run by snes/test/run-all.mjs):
//   classify  terrain differential: every tile of imported scenes classified
//             by the cartridge and by engine/native-local-flight.js
//   water     Water Palace gap: fly over, hover on release, cross, return
//   ... (see docs/agents/snes-port/flight.md)
//   node snes/test/flight/run.mjs [test ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc (the classify test builds
// its own FLIGHT_TEST cartridge). Outputs: .local/snes-test/flight/
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/flight');
mkdirSync(outRoot,{recursive:true});
const build=(out,defs=[])=>{
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${out}`,...defs],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('flight: build failed');process.exit(1);}
};
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc))build(romSrc);
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('flight: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
const prelude=()=>`IMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
const results=[];
let ok=true;

if(want('classify')){
  const {classify,DEFAULT_BUNDLES}=await import('./classify.mjs');
  const testRom=resolve(repo,'.local/snes-test/roms/flight-test.sfc');
  build(testRom,['-DFLIGHT_TEST=1']);
  const t0=Date.now();
  const res=await classify({bundles:DEFAULT_BUNDLES,rom:testRom,outRoot:join(outRoot,'classify')});
  let tiles=0,bad=0,scenes=0;const failures=[];
  for(const r of res){
    if(r.skipped)continue;
    if(r.error){failures.push(`${r.name}: ${r.error}`);continue;}
    // The Mana Beast streams its Mode 7 art through the collision buffers
    // every frame: a multi-frame snapshot cannot be compared there.
    if(r.map===253)continue;
    scenes++;tiles+=r.tiles;const n=r.bad.fly+r.bad.land+r.bad.low;bad+=n;
    if(n||r.moved)failures.push(`${r.name} (map ${r.map}): fly ${r.bad.fly} land ${r.bad.land} low ${r.bad.low} moved ${r.moved} ${JSON.stringify(r.examples.slice(0,3))}`);
  }
  const pass=!failures.length;ok&&=pass;
  results.push({test:'classify',ok:pass,ms:Date.now()-t0,failures,note:` ${scenes} scenes, ${tiles-bad}/${tiles} tiles equal to native-local-flight.js`});
}

for(const t of ['water']){
  if(!want(t)||!existsSync(join(here,`${t}.lua`)))continue;
  const rom=privateRom(romSrc,`flight-${t}`);
  const r=await runMesen({rom,test:prelude()+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const pass=r.code===0&&r.results?.pass===true;ok&&=pass;
  results.push({test:t,ok:pass,ms:r.ms,failures:r.results?.failures??[r.results?.error??'no results'],note:'',log:r.results?.log});
}

for(const r of results){
  console.log(`flight ${r.test}: ${r.ok?'pass':'FAIL'} (${r.ms} ms)${r.note}`);
  if(!r.ok)for(const f of r.failures)console.log('   ',f);
  if(r.log&&(!r.ok||args.includes('--verbose')))for(const l of r.log)console.log('     ',l);
}
writeFileSync(join(outRoot,'results.json'),JSON.stringify(results,null,1));
process.exit(ok?0:1);
