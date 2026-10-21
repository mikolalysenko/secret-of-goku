#!/usr/bin/env node
// CPU budget regression: imports each browser-mod scene once into the
// original cartridge, saves a full Mesen state at the wait loop, loads that
// same state into both the original and the build, walks for 300 frames, and
// compares the scanline at which frame logic ends plus the number of
// completed logic frames.
// Fails if the build adds lag frames (>3%) or its p90 finish line grows by
// more than 40 scanlines in any scene. Missing bundles are skipped.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {PERF_SCENES} from '../gameplay/cases.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const original=resolve(repo,'rom/secret-of-mana-us.sfc');
const lua=readFileSync(resolve(here,'budget.lua'),'utf8');
const scenes=(process.env.PERF_SCENES??PERF_SCENES.map(n=>'preset__'+n).join(',')).split(',');
// Lines after the NMI wrap to the next frame: normalise so later = larger.
const norm=l=>l<0?l:(l<200?l+262:l);
// Original-ROM states contain only 8 KiB SRAM. The expanded cartridge's
// remaining SRAM must not come from Mesen's filename-based battery save
// (especially when other worktrees run a ROM with the same basename).
async function isolated(src,tag,options){
  const copy=privateRom(src,`perf-${tag}`);
  try{return await runMesen({...options,rom:copy});}
  finally{cleanupRom(copy);}
}
let ok=true;
console.log('scene'.padEnd(26)+'orig p90/lag   build p90/lag');
for(const scene of scenes){
  const bundle=resolve(repo,'.local/snes-import',scene);
  if(!existsSync(bundle)){console.log(scene.padEnd(26)+'skipped (no bundle)');continue;}
  // One identical full Mesen state (APU/DSP phase included) for both carts.
  const stateDir=resolve(repo,'.local/snes-test/perf/states',scene),state=resolve(stateDir,'scene.mss');
  if(!existsSync(state)){
    const r=await isolated(original,`state-${scene}`,{test:`BUNDLE_PATH=${JSON.stringify(bundle)}\nMAKE_STATE=true\n`+lua,outDir:stateDir});
    if(!r.results?.saved){console.log(scene.padEnd(26)+'could not create state');ok=false;continue;}
  }
  const one=async(cart,tag)=>(await isolated(cart,`${tag}-${scene}`,{state,test:`BUNDLE_PATH=${JSON.stringify(bundle)}\n`+lua,outDir:resolve(repo,'.local/snes-test/perf',tag,scene)})).results??{};
  const a=await one(original,'original'),b=await one(rom,'build');
  if(a.error||b.error){console.log(scene.padEnd(26)+'error',a.error??b.error);ok=false;continue;}
  const lagA=a.missedVblanks,lagB=b.missedVblanks;
  const valid=a.videoFrames===300&&b.videoFrames===300&&a.nmiFrames===300&&b.nmiFrames===300;
  const grow=norm(b.p90)-norm(a.p90),bad=!valid||lagB>lagA+Math.ceil(a.videoFrames*0.03)||grow>40;
  if(bad)ok=false;
  console.log(scene.padEnd(26)+`${String(a.p90).padStart(4)}/${String(lagA).padStart(3)}      ${String(b.p90).padStart(4)}/${String(lagB).padStart(3)}  ${bad?'REGRESSION':''}`);
}
process.exit(ok?0:1);
