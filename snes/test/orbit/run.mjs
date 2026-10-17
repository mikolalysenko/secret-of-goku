#!/usr/bin/env node
// Orbit module tests (Mesen):
//   node snes/test/orbit/run.mjs [case ...]
// Builds dist/snes/orbit-test.sfc (-DORBIT_TIMING) unless SNES_ROM is set,
// writes outputs under .local/snes-test/orbit/<case>/ and exits non-zero on
// failure. Cases:
//   globe  the Mode 7 globe and starfield at the browser's cameras, compared
//          with reference.mjs (the browser's planet()/sky() formulas)
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {readPng} from '../../tools/gfx.mjs';
import {renderSpace,compareShots} from './reference.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const out=resolve(repo,'.local/snes-test/orbit');
const imports=process.env.SNES_IMPORT??resolve(repo,'.local/snes-import');
const checkpoint=process.env.SNES_CHECKPOINT??resolve(repo,'.local/snes-checkpoints/waterfall.mss');
const mainImports='/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-import';
const bundleDir=name=>existsSync(join(imports,name))?join(imports,name):join(mainImports,name);
const mainCheckpoint='/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-checkpoints/waterfall.mss';
const state=existsSync(checkpoint)?checkpoint:mainCheckpoint;

function buildRom(){
  if(process.env.SNES_ROM)return process.env.SNES_ROM;
  const rom=resolve(repo,'dist/snes/orbit-test.sfc');
  const r=spawnSync('node',[resolve(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${rom}`,'-DORBIT_TIMING'],{encoding:'utf8'});
  if(r.status!==0){console.error(r.stdout+r.stderr);process.exit(1);}
  return rom;
}
const lua=(v)=>Array.isArray(v)?'{'+v.map(lua).join(',')+'}':typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>`${k}=${lua(x)}`).join(',')+'}':typeof v==='string'?JSON.stringify(v):String(v);

const cases={
  async globe(rom){
    // The browser's cameras: idle fight (space preset), moving, beam,
    // clash-wide, and an off-centre hero.
    const cams=[
      {name:'idle',x:95,y:154,r:104,lon:1848,lat:3527,age:0},
      {name:'moving',x:99,y:150,r:84,lon:2300,lat:3300,age:5},
      {name:'beam',x:90,y:158,r:68,lon:600,lat:1200,age:100},
      {name:'wide',x:114,y:164,r:56,lon:3900,lat:2000,age:200},
      {name:'right',x:118,y:146,r:92,lon:100,lat:300,age:7},
    ];
    const dir=join(out,'globe');
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nCAMS=${lua(cams)}\nSPIN=240\n`;
    const r=await runMesen({rom,state,test:pre+readFileSync(join(here,'globe.lua'),'utf8'),outDir:dir});
    const res=r.results??{};
    const report={live:res.live,imported:res.imported,shots:{}};
    let ok=r.code===0&&res.live===true;
    for(const c of cams){
      const shot=join(dir,c.name+'.png');
      if(!existsSync(shot)){ok=false;continue;}
      const ref=renderSpace(c);
      writeFileSync(join(dir,c.name+'-ref.png'),ref.png);
      const cmp=compareShots(readPng(shot),ref,{maxLine:196});
      report.shots[c.name]={...cmp,lines:res['lines_'+c.name]};
      // The approximations (linear longitude, decimated texture, flat light)
      // keep most pixels close; the disc and rim edges must match exactly.
      if(cmp.edgeMismatch>0.02||cmp.meanError>0.12)ok=false;
    }
    report.lonAfterSpin=res.lon_after_spin;report.spinFrames=res.spin_frames;report.spinWorstLine=res.spin_worst_line;
    // Every spin frame completes (no lag) and advances the longitude by 2.
    if(res.spin_frames!==240||res.lon_after_spin!==((cams[0].lon+2*240)&4095))ok=false;
    writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,1));
    console.log(`globe: ${ok?'pass':'FAIL'}`,JSON.stringify(report.shots));
    if(res.error)console.log(res.error);
    return ok;
  },
};

const rom=buildRom();
mkdirSync(out,{recursive:true});
const names=process.argv.slice(2).filter(a=>!a.startsWith('-'));
let failed=0;
for(const name of names.length?names:Object.keys(cases)){
  if(!cases[name]){console.log(`unknown case ${name}`);failed++;continue;}
  if(!await cases[name](rom))failed++;
}
process.exit(failed?1:0);
