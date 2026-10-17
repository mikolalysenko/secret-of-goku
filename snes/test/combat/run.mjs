#!/usr/bin/env node
// COMBAT module tests: each scenario imports a browser-mod state into the
// cartridge (Mesen) and runs the same state and input through the browser
// mod's own engine/mana-mod.js on the vendored SnesJs core (jsref.mjs), then
// compares the two frame by frame: action clock (kind, age, combo, contact
// hold), charge, form, every enemy's queued damage and HP, launch paths and
// rewards. The cartridge may show the previous frame's combat state on a
// lag frame (its game logic did not finish), never anything else.
//   node snes/test/combat/run.mjs [scenario ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/combat/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {runJsRef,parseScript} from './jsref.mjs';
import {compare} from './compare.mjs';
import {SCENARIOS} from './scenarios.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const outRoot=resolve(repo,'.local/snes-test/combat');
mkdirSync(outRoot,{recursive:true});
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc)){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${romSrc}`],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('combat: build failed');process.exit(1);}
}
const cps=checkpointDir();
const main=mainCheckout(),importRoot=join(main,'.local/snes-import')+'/';
const catalog=JSON.parse(readFileSync(join(importRoot,'catalog.json'),'utf8'));
const sourceOf=name=>{const e=(Array.isArray(catalog)?catalog:Object.values(catalog)).find(x=>x.name===name);return e?join(main,e.source):null;};
const lib=readFileSync(join(here,'lib.lua'),'utf8');

function luaFor(sc){
  const setup=[];
  if(sc.ssj)setup.push('H.w8(C.CB + 0x11, 1)','H.w8(0x7ED740, 1)');
  if(sc.gi!==undefined)setup.push(`H.w8(0x7EE1E1, ${sc.gi?22:21})`);
  for(const [a,v] of sc.poke??[])setup.push(`H.w8(${a}, ${v})`);
  return `IMPORT_ROOT=${JSON.stringify(importRoot)}\n${lib}
function test()
  H.wait(5)
  if not C.import(${JSON.stringify(sc.bundle)}) then return end
  H.w8(0x316001, 1)
  H.w8(0x316200, 0)
  H.wait(2)
  ${setup.join('\n  ')}
  local trace = {}
  C.run(${JSON.stringify(sc.script)}, trace)
  H.result('trace', trace)
  ${sc.shots?`H.shot('end')`:''}
  H.result('failures', C.failures)
end
`;
}

const results=[];
for(const sc of SCENARIOS){
  if(only.length&&!only.includes(sc.name))continue;
  const state=sourceOf(sc.bundle);
  if(!existsSync(join(importRoot,sc.bundle))||!state||!existsSync(state)){console.log(`combat ${sc.name}: skipped (no ${sc.bundle})`);continue;}
  const rom=privateRom(romSrc,`combat-${sc.name}`);
  const r=await runMesen({rom,test:luaFor(sc),outDir:join(outRoot,sc.name),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
  let note='';
  if(r.results?.trace){
    // The browser runs the same frames after the import settles (2 frames).
    const steps=[{mask:0,frames:2+(sc.jsLead??0)},...parseScript(sc.script)];
    const js=runJsRef({state,steps,superSaiyan:!!sc.ssj,gi:sc.gi??null}).frames.slice(2+(sc.jsLead??0));
    const cart=r.results.trace;
    writeFileSync(join(outRoot,sc.name,'js.json'),JSON.stringify(js));
    writeFileSync(join(outRoot,sc.name,'cart.json'),JSON.stringify(cart));
    const c=compare(js,cart,sc);
    note=c.summary;
    failures.push(...c.failures);
  }else failures.push('no trace');
  const ok=r.code===0&&!failures.length;
  results.push({scenario:sc.name,ok,ms:r.ms,failures,note});
  console.log(`combat ${sc.name}: ${ok?'pass':'FAIL'} (${r.ms} ms) ${note}`);
  if(!ok)for(const f of failures.slice(0,12))console.log('   ',f);
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
