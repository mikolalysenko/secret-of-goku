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
//   menu     Status and Action Grid figure (both forms, blink, Goku off)
//   file     GAME FILE faces and the save confirmation (save from Potos)
//   load     the title's GAME FILE faces after a reset
//   scripted goku_api_scripted (scene-placed cell, frieza introHero) and
//            goku_api_socket, through the test-build caller (GOKU_TRACE)
//   actions  all 51 native player animations x 2 forms (GOKU_TRACE build),
//            replayed through engine/goku-animation.js (difftest.mjs)
//   api      every pose request (punch combos, charge, beam, blast, teleport,
//            ready, focus, transform/revert, deflect/resist, hover, gap
//            flight, ceiling escape, takeoff, landing), replayed the same way
// plus browser-mod reference frames for the field walk (jsref.mjs) and the
// menus (menuref.mjs).
//   node snes/test/goku/run.mjs [test ...] [--no-ref] [--slowrom]
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
const outRoot=resolve(repo,args.includes('--slowrom')?'.local/snes-test/goku-slowrom':'.local/snes-test/goku');
mkdirSync(outRoot,{recursive:true});
const build=(out,defs=[])=>{
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${out}`,...defs],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('goku: build failed');process.exit(1);}
};
// Builds are FastROM by default; --slowrom builds both ROMs with
// -DCORE_SLOWROM=1 (the tests read the map mode from the header).
const slowrom=args.includes('--slowrom');
const romSrc=slowrom?resolve(repo,'.local/snes-test/roms/goku-slowrom.sfc'):resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(slowrom)build(romSrc,['-DCORE_SLOWROM=1']);
else if(!existsSync(romSrc))build(romSrc);
const traceRom=resolve(repo,slowrom?'.local/snes-test/roms/goku-trace-slowrom.sfc':'.local/snes-test/roms/goku-trace.sfc');
if(want('actions')||want('api')||want('scripted'))build(traceRom,slowrom?['-DGOKU_TRACE=1','-DCORE_SLOWROM=1']:['-DGOKU_TRACE=1']);
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
const tests=[['field',romSrc],['status',romSrc],['forms',romSrc],['ring',romSrc],['menu',romSrc],['file',romSrc],['load',romSrc],['scripted',traceRom],['actions',traceRom],['api',traceRom],['budget',romSrc]].filter(([t])=>existsSync(join(here,`${t}.lua`)));
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
    const plan=[{frames:20,shot:'idle'}];
    for(const[b,n]of[['up',12],['right',8],['left',8],['down',12]])for(let i=0;i<n;i++)plan.push({buttons:{up:16,right:128,left:64,down:32}[b],frames:3,shot:b});
    plan.push({frames:8,shot:'idle_down'});
    // Two timing differences: the cartridge's pad path (core pad filter,
    // combat's input layer, as the browser mod's mana-mod.js) hands the game
    // each pad one frame sooner than the bare original read this reference
    // runs, so the reference gets every input one frame early; and the
    // browser poses Goku at the start of a frame from the previous frame's
    // state, while the cartridge's sample is the pose built this frame, so
    // each reference sample is taken one frame later.
    const LEAD=1,pads=[],shots=[];
    for(const st of plan){for(let i=0;i<st.frames;i++)pads.push(st.buttons??0);shots[pads.length-1]=st.shot;}
    const steps=[...pads,0].map((_,f)=>({buttons:pads[f+LEAD]??0,frames:1,shot:shots[f-1]}));
    await renderJsRef({state,outDir:join(outRoot,'field-js'),steps});
    const c=spawnSync(process.execPath,[join(here,'compare.mjs'),join(outRoot,'field'),join(outRoot,'field-js'),join(outRoot,'field-compare.png')],{cwd:repo,encoding:'utf8'});
    console.log('goku field vs browser mod:',(c.stdout.trim().split('\n').pop()??''),'->',join(outRoot,'field-compare.png'));
  }
}
// Browser-mod reference for the menus (same states and inputs, menuref.mjs).
if(!args.includes('--no-ref')&&(want('menu')||want('file'))){
  const {menuRef}=await import('./menuref.mjs');
  const read=t=>{try{return JSON.parse(readFileSync(join(outRoot,t,'results.json'),'utf8'))[t]??null;}catch{return null;}};
  const r=await menuRef({outRoot,local:join(mainCheckout(),'.local'),cart:{menu:want('menu')?read('menu'):null,file:want('file')?read('file'):null}});
  for(const l of r.lines)console.log('goku menu vs browser mod:',l);
  if(r.failures.length){results.push({test:'menu-ref',ok:false,failures:r.failures});for(const f of r.failures)console.log('   ',f);}
  else if(r.lines.length)console.log('goku menu vs browser mod: agree ->',join(outRoot,'menu-compare.png'));
}
// Scripted cell (scripted.lua) against the browser's frieza introHero
// follower (same state, pose and position), and goku_api_socket against
// engine/goku-animation-data.js.
if(want('scripted')){
  const failures=[],lines=[];
  let res=null;try{res=JSON.parse(readFileSync(join(outRoot,'scripted','results.json'),'utf8')).scripted;}catch{}
  if(res){
    const vm=await import('node:vm');const ctx={window:{}};
    vm.runInNewContext(readFileSync(join(repo,'engine/goku-animation-data.js'),'utf8'),ctx);
    const forms=ctx.window.GokuAnimationData.forms;
    for(const q of res.sockets){
      const s=forms[q.sheet?'ssj':'goku'].sockets[q.column]?.[q.row];
      const ok=s?(q.c===1&&q.dx===s[0]-16&&q.dy===s[1]-31):q.c===0;
      if(!ok)failures.push(`socket ${q.sheet}:${q.column}:${q.row} cart ${q.c?`${q.dx},${q.dy}`:'none'} browser ${s?`${s[0]-16},${s[1]-31}`:'none'}`);
    }
    lines.push(`goku_api_socket: ${res.sockets.length-failures.length}/${res.sockets.length} poses as engine/goku-animation-data.js`);
    const state=join(mainCheckout(),'.local/barrier-audit/potos-probe.json');
    if(!args.includes('--no-ref')&&existsSync(state)){
      const {renderJsRef}=await import('./jsref.mjs');
      const {bestShift,pixel}=await import('./menuref.mjs');
      const {readPng}=await import('../../tools/gfx.mjs');
      const h=res.hover;
      await renderJsRef({state,outDir:join(outRoot,'scripted-js'),steps:[{frames:20},{frames:12,shot:'hover'}],introHero:f=>f>20?h:null});
      const js=readPng(join(outRoot,'scripted-js','js-001_hover.png')),cart=readPng(join(outRoot,'scripted','hover.png'));
      const b=bestShift(cart,js,h.x-16,h.y-31,32,32);
      // pixels apart by more than the two renderers' colour rounding (4 levels):
      // only where the cell's 15-colour palette quantizes the browser's art
      let bad=0;
      for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++){
        const p=pixel(cart,h.x-16+xx,h.y-31+yy),q=pixel(js,h.x-16+xx,h.y-31+yy);
        if(Math.max(Math.abs(p[0]-q[0]),Math.abs(p[1]-q[1]),Math.abs(p[2]-q[2]))>4)bad++;
      }
      lines.push(`scripted cell vs browser introHero (${h.x},${h.y} column ${h.column} row ${h.row}): best shift ${b.dx},${b.dy}, ${bad}/1024 pixels apart (palette quantization)`);
      if(b.dx||b.dy||bad>32)failures.push(`scripted cell offset ${b.dx},${b.dy} from the browser's follower, ${bad} pixels apart`);
    }
  }else failures.push('no scripted results');
  for(const l of lines)console.log('goku scripted vs browser mod:',l);
  if(failures.length){results.push({test:'scripted-ref',ok:false,failures});for(const f of failures)console.log('   ',f);}
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
