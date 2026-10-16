#!/usr/bin/env node
// GOKU module tests in Mesen: field substitution, status palettes, forms and
// native actions, from browser-mod states imported with H.importSnesJs, plus
// reference frames from the browser mod's own renderer (jsref.mjs) for a
// side-by-side comparison.
//   node snes/test/goku/run.mjs [test ...] [--no-ref]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/goku/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const outRoot=resolve(repo,'.local/snes-test/goku');
mkdirSync(outRoot,{recursive:true});
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc)){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict'],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('goku: build failed');process.exit(1);}
}
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('goku: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
// Symbols for the Lua checks (WLA .sym written next to the ROM).
const sym={};
const symPath=romSrc.replace(/\.sfc$/,'.sym');
if(existsSync(symPath))for(const line of readFileSync(symPath,'utf8').split('\n')){
  const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (goku_\w+)$/i);
  if(m)sym[m[3]]=parseInt(m[1]+m[2],16);
}
const prelude=`SYM={${Object.entries(sym).map(([k,v])=>`${k}=0x${v.toString(16)}`).join(',')}}\nGOKU_IMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';

const tests=['field','status','forms','actions'].filter(t=>existsSync(join(here,`${t}.lua`)));
const results=[];
for(const t of tests){
  if(only.length&&!only.includes(t))continue;
  const rom=privateRom(romSrc,`goku-${t}`);
  const r=await runMesen({rom,test:prelude+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const ok=r.code===0&&r.results?.pass===true;
  results.push({test:t,ok,ms:r.ms,failures:r.results?.failures??[r.results?.error??'no results']});
  console.log(`goku ${t}: ${ok?'pass':'FAIL'} (${r.ms} ms)`);
  if(!ok)for(const f of results.at(-1).failures)console.log('   ',f);
}
// Browser-mod reference for the field walk (same state and inputs).
if(!args.includes('--no-ref')&&(!only.length||only.includes('field'))){
  const {renderJsRef}=await import('./jsref.mjs');
  const state=join(mainCheckout(),'.local/barrier-audit/potos-probe.json');
  if(existsSync(state)){
    const steps=[{frames:20,shot:'idle'}];
    for(const[b,n]of[['up',12],['right',8],['left',8],['down',12]])for(let i=0;i<n;i++)steps.push({buttons:{up:16,right:128,left:64,down:32}[b],frames:3,shot:b});
    steps.push({frames:8,shot:'idle_down'});
    await renderJsRef({state,outDir:join(outRoot,'field-js'),steps});
    console.log('goku field: browser-mod reference frames in',join(outRoot,'field-js'));
  }
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
