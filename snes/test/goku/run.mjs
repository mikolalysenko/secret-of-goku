#!/usr/bin/env node
// GOKU module tests in Mesen, from browser-mod states imported with
// H.importSnesJs:
//   field    four facings, walk cycle, push, palette, OAM, VRAM bytes, HUD,
//            a native weapon swing draws no sword cells under Goku
//   status   poison / petrify / ghost / sleep / moogle / snowman / pygmy /
//            barrel / waterfall (palette slot 5)
//   forms    Super Saiyan art, palette and HUD portrait; transformation and
//            reversion with their per-frame palettes; cell override
//   ring     the boy's ring marker (bank-1 tiles 0A/0B/1A/1B) is Goku's head
//            in either form; the girl's and sprite's markers stay native
//   actions  all 51 native player animations x 2 forms (GOKU_TRACE build),
//            replayed through engine/goku-animation.js (difftest.mjs)
//   api      every pose request (punch combos, charge, beam, blast, teleport,
//            ready, focus, transform/revert, deflect/resist, hover, gap
//            flight, ceiling escape, takeoff, landing), replayed the same way
// plus browser-mod reference frames for the field walk (jsref.mjs).
//   node snes/test/goku/run.mjs [test ...] [--no-ref]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/goku/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {diff} from './difftest.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/goku');
mkdirSync(outRoot,{recursive:true});
const build=(out,defs=[])=>{
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${out}`,...defs],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('goku: build failed');process.exit(1);}
};
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc))build(romSrc);
const traceRom=resolve(repo,'.local/snes-test/roms/goku-trace.sfc');
if(want('actions')||want('api'))build(traceRom,['-DGOKU_TRACE=1']);
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('goku: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
function prelude(rom){
  // Symbols for the Lua checks (WLA .sym written next to the ROM).
  const sym={};
  for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
    const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (goku_\w+)$/i);
    if(m)sym[m[3]]=parseInt(m[1]+m[2],16);
  }
  return `SYM={${Object.entries(sym).map(([k,v])=>`${k}=0x${v.toString(16)}`).join(',')}}\nGOKU_IMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
}
const tests=[['field',romSrc],['status',romSrc],['forms',romSrc],['ring',romSrc],['actions',traceRom],['api',traceRom],['budget',romSrc]].filter(([t])=>existsSync(join(here,`${t}.lua`)));
const results=[];
for(const[t,src]of tests){
  if(!want(t))continue;
  const rom=privateRom(src,`goku-${t}`);
  const r=await runMesen({rom,test:prelude(src)+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  let ok=r.code===0&&r.results?.pass===true;
  const failures=[...(r.results?.failures??(r.results?.error?[r.results.error]:ok?[]:['no results']))];
  let note='';
  if(ok&&(t==='actions'||t==='api')){
    const d=diff(readFileSync(join(outRoot,t,'trace.csv'),'utf8'));
    note=` ${d.results.length-d.bad.length}/${d.results.length} frames match engine/goku-animation.js`;
    if(d.bad.length){ok=false;for(const b of d.bad.slice(0,8))failures.push(`${b.tag}/${b.form} frame ${b.frame}: js ${JSON.stringify(b.expect)} cart ${JSON.stringify(b.got)}`);}
  }
  results.push({test:t,ok,ms:r.ms,failures,note});
  console.log(`goku ${t}: ${ok?'pass':'FAIL'} (${r.ms} ms)${note}`);
  if(!ok)for(const f of failures)console.log('   ',f);
}
// Browser-mod reference for the field walk (same state and inputs).
if(!args.includes('--no-ref')&&want('field')){
  const {renderJsRef}=await import('./jsref.mjs');
  const state=join(mainCheckout(),'.local/barrier-audit/potos-probe.json');
  if(existsSync(state)){
    const steps=[{frames:20,shot:'idle'}];
    for(const[b,n]of[['up',12],['right',8],['left',8],['down',12]])for(let i=0;i<n;i++)steps.push({buttons:{up:16,right:128,left:64,down:32}[b],frames:3,shot:b});
    steps.push({frames:8,shot:'idle_down'});
    await renderJsRef({state,outDir:join(outRoot,'field-js'),steps});
    const c=spawnSync(process.execPath,[join(here,'compare.mjs'),join(outRoot,'field'),join(outRoot,'field-js'),join(outRoot,'field-compare.png')],{cwd:repo,encoding:'utf8'});
    console.log('goku field vs browser mod:',(c.stdout.trim().split('\n').pop()??''),'->',join(outRoot,'field-compare.png'));
  }
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
