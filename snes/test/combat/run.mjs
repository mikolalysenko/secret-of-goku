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

// Frieza's ground fight (sc.frieza = {x, y, permanent}): the battle
// reference's goku.frieza with Frieza at (x, y) (his feet; entity() and
// combat's boxes use y + 12) as his only node and no attack due. The
// cartridge gets it through the frieza module's own field mapping
// (snes/test/frieza/state.mjs) and keeps him there before every combat
// step; the browser's frieza.js is restored from it and never ticked.
function friezaSnapshot(sc){
  const goku=JSON.parse(readFileSync(sourceOf(sc.bundle),'utf8')).goku;
  const f=JSON.parse(JSON.stringify(goku.frieza)),{x,y}=sc.frieza;
  Object.assign(f.boss,{x,y,nodes:[{x,y}],node:0,clock:9999});
  if(sc.frieza.permanent===false)f.permanent=false;
  return {frieza:f,challenge:goku.challenge};
}
// Frieza's field mapping (snes/test/frieza/state.mjs) comes with the frieza
// module; its scenarios run only when that module is in the build and
// registered with combat (frieza_virtual_target in the ROM's symbols).
const fzState=existsSync(join(here,'../frieza/state.mjs'))?await import('../frieza/state.mjs'):null;
const fz=fzState?.defs;
const friezaReady=rom=>!!fzState&&symbols(rom).has('frieza_virtual_target');
const w=n=>`0x${(0x7E0000|fz[n]).toString(16)}`;
function friezaLua(sc){
  const {frieza,challenge}=friezaSnapshot(sc),{x,y}=sc.frieza;
  return [
    `for _, v in ipairs(${fzState.luaWrites(fzState.friezaWrites(frieza,challenge))}) do if v[3] == 2 then H.w16(v[1], v[2]) else H.w8(v[1], v[2]) end end`,
    `H.w8(0x316002, ${frieza.permanent?1:0})          -- !persist_ssj_lock`,
    `H.w8(${w('fz_music')}, ${fz.FZM_BATTLE})          -- the battle theme counts as playing (no song load)`,
    `emu.addMemoryCallback(function() H.w16(${w('fzf_x')}, ${x}) H.w16(${w('fzf_y')}, ${y}) H.w16(${w('fzf_clock')}, 9999) end, emu.callbackType.exec, 0x00B0AC, 0x00B0AC)`,
    `C.extra = function(p) p.fzhp = H.r16(${w('fzf_hp_lo')}) | (H.r8(${w('fzf_hp_hi')}) << 16) end`,
  ];
}

// Test ROM (-DCOMBAT_TEST: the mailbox, a receive hook, the beam API probe;
// module.asm !CBT) for scenarios with testRom, built once per run.
let testRom=null;
function buildTestRom(){
  if(testRom)return testRom;
  testRom=resolve(repo,'.local/snes-test/roms/combat-test.sfc');
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict','-DCOMBAT_TEST=1',`--out=${testRom}`],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('combat: test ROM build failed');process.exit(1);}
  return testRom;
}
const CBT=0x317F00;
// The cartridge's pokes: the scenario's (also given to the browser), its
// cartridge-only ones (test mailbox settings), and the input locks as
// mailbox commands (owner $8000: 1 hold, 3 unlock).
function cartPokes(sc){
  const locks=(sc.locks??[]).flatMap(([at,what])=>[[at,CBT+2,0x8000,2],[at,CBT,what==='hold'?1:what==='lock'?2:3,2]]);
  return [...(sc.pokes??[]),...(sc.cartPokes??[]),...locks];
}

// --profile: combat's cost in scanlines (1364 master clocks), from the ROM's
// symbol file: its logic hook (all steps of a field frame, between the
// game's pad read and movement), its frame-end callback, and the calls of
// the virtual targets' query and hit routines (theirs included).
const profiling=args.includes('--profile');
function symbols(rom){
  const map=new Map();
  for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)$/i);if(m)map.set(m[3],parseInt(m[1]+m[2],16));}
  return map;
}
function profilePairs(rom){
  const s=symbols(rom),at=n=>{if(!s.has(n))throw Error(`combat profile: no symbol ${n}`);return s.get(n);};
  // cb_hook_logic_read + 17: the PLD after JSR cb_logic_frame; modules_field_frame
  // + 16: the JSL after combat_field_frame's (title, story, debug, combat)
  const pairs=[[at('cb_hook_logic_read'),at('cb_hook_logic_read')+17],[at('combat_field_frame'),at('modules_field_frame')+16]];
  if(s.has('cb_vt_query'))pairs.push([at('cb_vt_query'),at('cb_vt_query_ret')],[at('cb_vt_hit_call'),at('cb_vt_hit_call_ret')]);
  return pairs;
}
function profileNote(cart){
  const rows=cart.filter(f=>f.prof),sum=k=>rows.reduce((n,f)=>n+(f.prof[k]??0),0),L=c=>c/1364;
  const steps=((rows[rows.length-1].cbf-rows[0].cbf)&0xffff)+1;
  const busy=rows.filter(f=>f.act||f.fxmask||f.charging);
  const calls=(k,name)=>sum(k+1)?`, ${name} ${sum(k+1)} x ${(L(sum(k))/sum(k+1)).toFixed(2)}`:'';
  return `combat lines: logic ${(L(sum(0))/steps).toFixed(2)}/step (${steps} steps; busy frames ${(L(busy.reduce((n,f)=>n+f.prof[0],0))/Math.max(1,busy.length)).toFixed(1)}), `+
    `frame end ${(L(sum(2))/rows.length).toFixed(2)}/frame`+calls(4,'queries')+calls(6,'hits');
}

function luaFor(sc,rom){
  const setup=[];
  if(profiling)setup.push(`C.spansAt({${profilePairs(rom).map(p=>`{${p.join(',')}}`).join(',')}})`);
  if(sc.testRom)setup.push('C.TEST = true');
  if(sc.ssj)setup.push('H.w8(C.CB + 0x11, 1)','H.w8(0x7ED740, 1)');
  if(sc.gi!==undefined)setup.push(`H.w8(0x7EE1E1, ${sc.gi?22:21})`);
  for(const [a,v] of sc.poke??[])setup.push(`H.w8(${a}, ${v})`);
  if(sc.frieza)setup.push(...friezaLua(sc));
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
  C.run(${JSON.stringify(sc.script)}, trace, {${cartPokes(sc).map(p=>`{${p.join(',')}}`).join(',')}})
  H.result('trace', trace)
  ${sc.shots?`H.shot('end')`:''}
  H.result('failures', C.failures)
end
`;
}

// Cases checked on the cartridge alone (the browser behaviour they follow
// is pinned by the browser's own tests).
const CASES={
  async icons(){
    const {runIcons}=await import('./icons.mjs');
    return runIcons({romSrc,outRoot,importRoot,cps,state:sourceOf('graphics-audit__party'),lib});
  },
  async geometry(){
    const rom=privateRom(buildTestRom(),'combat-geometry');
    const test=`IMPORT_ROOT=${JSON.stringify(importRoot)}\n${lib}\n${readFileSync(join(here,'geometry.lua'),'utf8')}`;
    const r=await runMesen({rom,test,outDir:join(outRoot,'geometry'),state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
    if(r.results?.queries!==192)failures.push('geometry cases did not finish');
    return {ok:r.code===0&&!failures.length,failures,ms:r.ms,note:`${r.results?.queries??0} facing/boundary/target eligibility queries`};
  },
  async meter(){
    const rom=privateRom(romSrc,'combat-meter');
    const test=`IMPORT_ROOT=${JSON.stringify(importRoot)}\n${lib}\n${readFileSync(join(here,'meter.lua'),'utf8')}`;
    const r=await runMesen({rom,test,outDir:join(outRoot,'meter'),state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
    return {ok:r.code===0&&!failures.length,failures,ms:r.ms,note:'native stamina/charge HUD cleanup and ki charging'};
  },
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
  // X never reaches the game as native X while Goku is inactive: a press at
  // every offset 8-32 frames after the Potos import opens the controlled
  // character's ring (goku.md, Requests: member 1's ring on one press frame
  // in five while combat masked X only after seeing the press).
  async xrace(){
    const bundle='barrier-audit__potos-probe';
    if(!existsSync(join(importRoot,bundle)))return {skip:`no ${bundle}`};
    const rom=privateRom(romSrc,'combat-xrace');
    const test=`IMPORT_ROOT=${JSON.stringify(importRoot)}\nXRACE_BUNDLE=${JSON.stringify(bundle)}\n${lib}\n${readFileSync(join(here,'xrace.lua'),'utf8')}`;
    const r=await runMesen({rom,test,outDir:join(outRoot,'xrace'),state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
    const rows=r.results?.rows??[];
    if(rows.length!==25)failures.push(`${rows.length} of 25 presses tried`);
    const bad=rows.filter(x=>!x.opened||x.owner!==0);
    return {ok:r.code===0&&!failures.length,failures,ms:r.ms,note:`${rows.length-bad.length}/${rows.length} presses opened the boy's ring${bad.length?` (not at ${bad.map(x=>x.offset).join(', ')})`:''}`};
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
  if(sc.frieza&&!friezaReady(sc.testRom?buildTestRom():romSrc)){console.log(`combat ${sc.name}: skipped (no frieza module in the build)`);continue;}
  const romUsed=sc.testRom?buildTestRom():romSrc,rom=privateRom(romUsed,`combat-${sc.name}`);
  const r=await runMesen({rom,test:luaFor(sc,romUsed),outDir:join(outRoot,sc.name),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const failures=[...(r.results?.failures??[]),...(r.results?.error?[r.results.error]:[])];
  let note='';
  if(r.results?.trace){
    // The browser runs the same frames after the import settles (2 frames).
    const steps=[{mask:0,frames:2+(sc.jsLead??0)},...parseScript(sc.script)];
    // pokes land one frame later on the cartridge's clock (input latency
    // alignment in compare.mjs), so the browser gets them one frame later too
    const js=runJsRef({state,steps,superSaiyan:!!sc.ssj,gi:sc.gi??null,pokes:sc.pokes??[],pokeBase:2+(sc.jsLead??0),
      frieza:sc.frieza?friezaSnapshot(sc).frieza:null,locks:sc.locks??null}).frames.slice(2+(sc.jsLead??0));
    const cart=r.results.trace;
    writeFileSync(join(outRoot,sc.name,'js.json'),JSON.stringify(js));
    writeFileSync(join(outRoot,sc.name,'cart.json'),JSON.stringify(cart));
    const c=compare(js,cart,sc);
    note=c.summary+(profiling?`; ${profileNote(cart)}`:'');
    failures.push(...c.failures);
  }else failures.push('no trace');
  const ok=r.code===0&&!failures.length;
  results.push({scenario:sc.name,ok,ms:r.ms,failures,note});
  console.log(`combat ${sc.name}: ${ok?'pass':'FAIL'} (${r.ms} ms) ${note}`);
  if(!ok)for(const f of failures.slice(0,12))console.log('   ',f);
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
