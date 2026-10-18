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
  -- Goku active and a clean combat block before the import too: the import
  -- restores only the game's 8 KiB of SRAM, and the frame it lands in
  -- already runs with these
  H.w8(0x316001, 1)
  H.w8(0x316200, 0)
  if not C.import(${JSON.stringify(sc.bundle)}) then return end
  H.w8(0x316001, 1)
  H.w8(0x316200, 0)
  H.wait(2)
  ${setup.join('\n  ')}
  local trace = {}
  C.run(${JSON.stringify(sc.script)}, trace, {${(sc.pokes??[]).map(p=>`{${p.join(',')}}`).join(',')}})
  H.result('trace', trace)
  ${sc.shots?`H.shot('end')`:''}
  H.result('failures', C.failures)
end
`;
}

// Cases checked on the cartridge alone (the browser behaviour they follow
// is pinned by the browser's own tests).
const CASES={
  // X / Menu-back closes every options page wherever the ring last stopped
  // (mana-mod.js panelBack reads the open option $1876; browser f376330):
  // the same eight page pairs as tests/browser/native-status.spec.mjs.
  async panel(){
    const bundle='graphics-audit__party';
    if(!existsSync(join(importRoot,bundle)))return {skip:`no ${bundle}`};
    const rom=privateRom(romSrc,'combat-panel');
    const test=`IMPORT_ROOT=${JSON.stringify(importRoot)}\nPANEL_BUNDLE=${JSON.stringify(bundle)}\n${lib}\n${readFileSync(join(here,'panel.lua'),'utf8')}`;
    const r=await runMesen({rom,test,outDir:join(outRoot,'panel'),state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
    const rows=r.results?.rows??[];
    if(rows.length!==8)failures.push(`${rows.length} of 8 pages tried`);
    const reported=rows.find(x=>x.first===4&&x.option===2);
    if(reported&&reported.cursor!==5)failures.push(`Status after option 4 opened at cursor ${reported.cursor}, not 5 (the reported case)`);
    return {ok:r.code===0&&!failures.length,failures,ms:r.ms,note:rows.map(x=>`${x.first}>${x.option}@${x.cursor}${x.closed?'':' STUCK'}`).join(' ')};
  },
};

const results=[];
for(const [name,run] of Object.entries(CASES)){
  if(only.length&&!only.includes(name))continue;
  const c=await run();
  if(c.skip){console.log(`combat ${name}: skipped (${c.skip})`);continue;}
  results.push({scenario:name,ok:c.ok,ms:c.ms,failures:c.failures,note:c.note});
  console.log(`combat ${name}: ${c.ok?'pass':'FAIL'} (${c.ms} ms) ${c.note}`);
  if(!c.ok)for(const f of c.failures.slice(0,12))console.log('   ',f);
}
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
    // pokes land one frame later on the cartridge's clock (input latency
    // alignment in compare.mjs), so the browser gets them one frame later too
    const js=runJsRef({state,steps,superSaiyan:!!sc.ssj,gi:sc.gi??null,pokes:sc.pokes??[],pokeBase:2+(sc.jsLead??0)}).frames.slice(2+(sc.jsLead??0));
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
