#!/usr/bin/env node
// Second and third opinions: the cartridge on snes9x and bsnes (their
// libretro cores, driven headless by snes/tools/retro-host) next to Mesen.
//   node snes/test/emulators/run.mjs [snes9x|bsnes|bsnes-accurate ...]
//        [--presets[=late,flight,...]] [--power-on[=...] [--bisect]]
//        [--dma-watch[=scenario,late,...]] [--no-mesen] [--refresh-mesen]
// Each core plays snes/test/emulators/scenario.mjs from power-on with noise
// in battery RAM and WRAM: ExHiROM detection (core log, CPU-bus probe of the
// extended banks and save RAM), title pictures against Mesen's at the same
// frames (best of a +-6 frame window), the name editor at Mesen's measured
// background-scroll phase (+-2 frames), the opening up to map
// 128, a native save, a power cycle with battery RAM kept, and a load. A
// separate session checks the cold-boot SPC image, music and cue variation
// from each core's own name-screen state, with real audio callback levels.
// Mesen plays the same steps once per ROM (mesen-ref.lua, cached), rendering
// every frame. --presets instead starts scene-select presets (presets.mjs;
// all 22 without a list) on every core and compares their end state and
// pictures with Mesen running snes/test/debug/preset.lua.
// Cores are looked up in $SNES_CORES, else .local/tools/emu here and in the
// main checkout; without any the module is skipped (exit 0). Build them with
//   make -C snes/tools/retro-host cores
// Outputs: .local/snes-test/emulators/<variant>/ (PNGs, results.json,
// diff-*.png: Mesen | core | red where SNES colours differ), summary.json;
// presets under presets/<variant>/<preset>/ and presets.json.
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RetroHost,buildHost,findCore,coreDirs,mainCheckout} from './retro.mjs';
import {playScenario,playBatteryLoad,probeCode,probeReads,exhiromByte,TITLE_FRAMES,WINDOW,SHOT_WINDOW} from './scenario.mjs';
import {load15,bestMatch,agreement,diffSheet} from './compare.mjs';
import {presetSetup,playPreset,mesenPreset,stateDiffs,maxFramesOf,PRESET_SHOTS,PRESET_POWER_ON} from './presets.mjs';
import {FILLS,presetRun,sigDiffs,bisect} from './poweron.mjs';
import {playAudio} from './audio.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const presetArg=args.find(a=>a==='--presets'||a.startsWith('--presets='));
const powerArg=args.find(a=>a==='--power-on'||a.startsWith('--power-on='));
const dmaArg=args.find(a=>a==='--dma-watch'||a.startsWith('--dma-watch='));
const listOf=(arg,all)=>arg?.includes('=')?arg.split('=')[1].split(',').filter(Boolean):all;
const outRoot=join(repo,'.local/snes-test/emulators');

// bsnes runs with power-on randomisation off (its seed is the process clock);
// the host fills WRAM with seeded noise instead, as real WRAM powers up.
const VARIANTS=[
  {name:'snes9x',core:'snes9x',kind:'snes9x',options:{}},
  {name:'bsnes',core:'bsnes',kind:'bsnes',options:{bsnes_entropy:'None'}},
  {name:'bsnes-accurate',core:'bsnes',kind:'bsnes',options:{bsnes_entropy:'None',bsnes_ppu_fast:'OFF',bsnes_dsp_fast:'OFF'}},
];
const POWER_ON={sram:'noise:1993',wramInit:'noise:2026'};
// Minimum share of SNES colours within one level of Mesen's (snes9x rounds
// colour math differently; exact agreement is reported as well).
const THRESHOLD={title:0.99,name:0.99,waterfall:0.99,loaded:0.99,preset:0.99};

function romPath(){
  const p=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
  if(!existsSync(p)&&!process.env.SNES_ROM){
    const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet'],{cwd:repo,stdio:'inherit'});
    if(b.status!==0){console.error('emulators: build failed');process.exit(1);}
  }
  if(!existsSync(p)){console.error(`emulators: no ROM at ${p}`);process.exit(1);}
  return p;
}
// The 32-byte probe snes/gen/core-xdata.mjs places in the extended banks.
function findProbe(rom){
  const sig=Buffer.from('SECRET OF GOKU XDATA PROBE');
  const at=Buffer.from(rom.buffer,rom.byteOffset,rom.length).indexOf(sig,0x400000);
  if(at<0||(at&0xFFFF)>=0x8000)return null;
  return (0x40+((at-0x400000)>>16))<<16|(at&0xFFFF);
}
function sha(data){return createHash('sha256').update(data).digest('hex');}

// ../mesen.mjs when Mesen is installed here or in the main checkout.
async function mesenModule(){
  if(args.includes('--no-mesen'))return {skipped:'--no-mesen'};
  try{
    const m=await import('../mesen.mjs');
    if(!process.env.MESEN){
      const shared=join(mainCheckout(),'.local/tools/mesen/Mesen.app/Contents/MacOS/Mesen');
      try{m.mesenPath();}catch{if(existsSync(shared))process.env.MESEN=shared;}
    }
    m.mesenPath();
    return {m};
  }catch(e){return {skipped:`Mesen not found (${e.message})`};}
}

// Mesen reference for the scenario, cached per ROM and script.
async function mesenReference(rom,romFile,xprobe){
  const {m,skipped}=await mesenModule();
  if(!m)return {skipped};
  const lua=readFileSync(join(here,'mesen-ref.lua'),'utf8');
  const prelude=`PROBE_CODE={${probeCode(xprobe,0).join(',')}}\nTITLE_FRAMES={${TITLE_FRAMES.join(',')}}\n`;
  // Every frame rendered, so screenshots are of the frame they name.
  const dir=join(outRoot,'mesen'),key=sha(rom)+':'+sha(prelude+lua+m.EXACT_FRAMES.join(' '));
  const keyFile=join(dir,'key.txt');
  if(!args.includes('--refresh-mesen')&&existsSync(keyFile)&&readFileSync(keyFile,'utf8')===key&&existsSync(join(dir,'results.json')))
    return {dir,results:JSON.parse(readFileSync(join(dir,'results.json'),'utf8')),cached:true};
  const {privateRom,cleanupRom}=await import('../checkpoints.mjs');
  const copy=privateRom(romFile,'emulators-ref');
  console.log('emulators: Mesen reference run (once per ROM)…');
  const r=await m.runMesen({rom:copy,test:prelude+lua,outDir:dir,timeoutMs:900000,exactFrames:true});
  cleanupRom(copy);
  if(r.code!==0||!r.results||r.results.error)return {dir,error:r.results?.error??r.output.slice(-1500)};
  writeFileSync(keyFile,key);
  return {dir,results:r.results,cached:false,ms:r.ms};
}

// One power-on session of `play` on a core; outputs in `out`.
async function session(v,romFile,out,play,powerOn=POWER_ON){
  rmSync(out,{recursive:true,force:true});
  mkdirSync(out,{recursive:true});
  const t0=Date.now();
  let h=null,res=null,error=null,results=null;
  try{
    h=await RetroHost.start({host:v.host,core:v.corePath,rom:romFile,out,options:v.options,...powerOn});
    res=await play(h);
  }catch(e){error=e.message;}
  if(h){results=await h.close().catch(()=>null);if(error)h.kill();}
  return {variant:v,out,res,error,results,seconds:(Date.now()-t0)/1000};
}

function detection(results){
  const text=[...(results?.log??[]),...(results?.stdout??[])].join('\n');
  const m=text.match(/(ExHiROM|HiROM|LoROM)[^\n]*/);
  return {logged:m?m[0].trim():null,exhirom:/ExHiROM|Map_ExtendedHiROMMap/.test(text)};
}

// Mesen's <ref> against the core's window of pictures base(k), k in offsets.
const span=n=>[...Array(2*n+1)].map((_,i)=>i-n);
function comparePicture(out,kind,refDir,{name,ref,base,offsets,kindName}){
  const refFile=refDir&&join(refDir,ref);
  if(!refFile||!existsSync(refFile))return {name,skipped:true};
  const cands=offsets.map(k=>({file:base(k),offset:k})).filter(c=>existsSync(join(out,c.file)))
    .map(c=>({...c,label:c.file,img:load15(join(out,c.file),kind)}));
  if(!cands.length)return {name,missing:true};
  const r=load15(refFile,'mesen');
  const m=bestMatch(r,cands);
  const best=cands.find(c=>c.label===m.best.label);
  diffSheet(r,best.img,m.best.dy,join(out,`diff-${name}.png`));
  return {name,kind:kindName,agreement:m.best.agreement,near:agreement(r,best.img,m.best.dy,1),shot:best.file,offset:m.best.offset,dy:m.best.dy,
    atSameFrame:m.rows.find(x=>x.offset===0)?.agreement,size:`${best.img.w}x${best.img.h} vs Mesen ${r.w}x${r.h}`};
}
const pct=v=>v==null?'-':(v*100).toFixed(2)+'%';
function pictureCheck(p){
  return {name:`picture_${p.name}`,pass:p.near>=THRESHOLD[p.kind],detail:`${pct(p.agreement)} of pixels equal to Mesen`+
    (p.near>p.agreement?`, ${pct(p.near)} within one colour level`:'')+
    ` (frame ${p.offset>=0?'+':''}${p.offset}; same frame ${pct(p.atSameFrame)})`+(p.dy?`, shifted ${p.dy} lines`:'')};
}

async function scenarioMain(avail,romFile,rom,xprobe){
  // The scenario, then a second process started with the battery RAM the
  // first one left (sram.bin; for bsnes its own .srm), as a player's next day.
  const reference=mesenReference(rom,romFile,xprobe);
  const [ref,...runs]=await Promise.all([reference,
    ...avail.map(async v=>{
      const out=join(outRoot,v.name);
      const run=await session(v,romFile,out,h=>playScenario(h,{rom,xprobe,
        nameScroll:async()=>(await reference).results?.name_scroll??null}));
      if(existsSync(join(out,'audio-name.state')))
        run.audio=await session(v,romFile,join(out,'audio'),h=>playAudio(h,{rom,state:join(out,'audio-name.state')}));
      if(existsSync(join(out,'sram.bin'))){
        const again=await session(v,romFile,join(out,'battery'),h=>playBatteryLoad(h,{savedHero:run.res?.values?.loaded_hero}),
          {sram:join(out,'sram.bin'),wramInit:'noise:7'});
        run.battery=again;
      }
      return run;
    })]);
  if(ref.skipped)console.log(`emulators: Mesen comparison skipped: ${ref.skipped}`);
  if(ref.error)console.log(`emulators: Mesen reference failed: ${ref.error}`);
  const mr=ref.results;
  let mesenProbe=null;
  if(mr?.probe){
    const sram=new Uint8Array(0x8000);
    [sram[0],sram[0x203E],sram[0x7FFF]]=mr.probe_sram;
    mesenProbe={xdata:String.fromCharCode(...mr.probe.slice(0,26)),
      reads:probeReads(xprobe).map((r,i)=>({addr:r.addr.toString(16),got:mr.probe[0x20+i],want:exhiromByte(rom,sram,r.addr)}))};
  }
  const summary={rom:romFile,romSha256:sha(rom),xprobe:xprobe.toString(16),mesen:mr?{cached:ref.cached,events:mr.events,
    loaded_hero:mr.loaded_hero,saved_hero:mr.saved_hero,probe:mesenProbe}:ref,variants:[]};
  let failed=false;
  for(const run of runs){
    const v=run.variant,det=detection(run.results);
    const checks=[...(run.res?.checks??[])];
    if(run.audio)checks.push(...(run.audio.res?.checks??[]),...(run.audio.error?[{name:'audio_error',pass:false,detail:run.audio.error}]:[]));
    else checks.push({name:'audio_boot_state',pass:false,detail:'no name-screen SPC state'});
    if(run.error)checks.push({name:'scenario_error',pass:false,detail:run.error});
    if(run.battery)checks.push(...(run.battery.res?.checks??[]),...(run.battery.error?[{name:'battery_error',pass:false,detail:run.battery.error}]:[]));
    else checks.push({name:'battery_image',pass:false,detail:'no sram.bin after the scenario'});
    if(v.core==='snes9x')checks.push({name:'core_logged_exhirom',pass:det.exhirom,detail:det.logged??'no map in the core log'});
    const specs=[
      ...TITLE_FRAMES.map(F=>({name:`title-${F}`,kindName:'title',ref:`title-${F}.png`,base:k=>`title-${F}-${F+k}.png`,offsets:span(WINDOW)})),
      ...['name','waterfall','loaded'].map(n=>({name:n,kindName:n,ref:`${n}.png`,base:k=>`${n}${k<0?'':'+'}${k}.png`,offsets:span(SHOT_WINDOW)})),
    ];
    const pics=specs.map(s=>comparePicture(run.out,v.kind,ref.dir,s));
    for(const p of pics)if(p.agreement!=null)checks.push(pictureCheck(p));
    const ev=run.res?.events??{};
    if(mr?.events)for(const k of ['editor','control','loaded'])
      if(ev[k]!=null&&mr.events[k]!=null)checks.push({name:`timing_${k}`,pass:true,info:true,detail:`frame ${ev[k]} (Mesen ${mr.events[k]}, ${ev[k]-mr.events[k]>=0?'+':''}${ev[k]-mr.events[k]})`});
    const lh=run.res?.values?.loaded_hero;
    if(lh&&mr?.loaded_hero)checks.push({name:'loaded_position_matches_mesen',pass:lh[0]===mr.loaded_hero[0]&&lh[1]===mr.loaded_hero[1],detail:`${lh} (Mesen ${mr.loaded_hero})`});
    const bad=checks.filter(c=>!c.pass);
    if(bad.length)failed=true;
    summary.variants.push({variant:v.name,core:run.results?.core,options:v.options,seconds:run.seconds,frames:run.results?.frames,
      pixelFormat:run.results?.pixel_format,memory:run.results?.memory,state:run.results?.state,detection:det,
      events:ev,values:run.res?.values,audio:run.audio?.res,pictures:pics,checks,error:run.error});
    console.log(`\nemulators ${v.name.padEnd(15)} ${bad.length?'FAIL':'pass'}  (${run.results?.core?.library_name??'?'} ${run.results?.core?.library_version??''}, ${run.seconds.toFixed(1)} s, ${run.results?.frames??'?'} frames)`);
    for(const c of checks)console.log(`  ${c.info?'info':c.pass?'ok  ':'FAIL'} ${c.name.padEnd(30)} ${c.detail??''}`);
  }
  writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
  console.log(`\nemulators: ${failed?'FAIL':'pass'} (details: ${join(outRoot,'summary.json')})`);
  return !failed;
}

async function presetsMain(avail,romFile,rom){
  const {kinds,work}=presetSetup(romFile);
  const sel=listOf(presetArg,kinds);
  for(const k of sel)if(!kinds.includes(k)){console.error(`emulators: unknown preset ${k} (${kinds.join(', ')})`);process.exit(1);}
  const romSha=sha(rom);
  // Mesen references one at a time, next to the cores.
  const mesenJob=(async()=>{
    const {m,skipped}=await mesenModule();
    const refs={};
    if(!m){console.log(`emulators: Mesen comparison skipped: ${skipped}`);return refs;}
    for(const kind of sel)refs[kind]=await mesenPreset({kind,index:kinds.indexOf(kind),work,romFile,romSha,outRoot});
    return refs;
  })();
  const coreJobs=avail.map(async v=>{
    const rows={};
    for(const kind of sel)rows[kind]=await session(v,romFile,join(outRoot,'presets',v.name,kind),
      h=>playPreset(h,{index:kinds.indexOf(kind),work,maxFrames:maxFramesOf(kind)}),PRESET_POWER_ON);
    return rows;
  });
  const [refs,...perCore]=await Promise.all([mesenJob,...coreJobs]);
  const report=[];
  let failed=false;
  console.log(`\n${'preset'.padEnd(12)} ${'core'.padEnd(15)} status  wall frames (Mesen)  pictures +0/+60/+240 (equal, within one level)  state differences`);
  for(const kind of sel){
    const ref=refs[kind],mr=ref?.results;
    avail.forEach((v,i)=>{
      const run=perCore[i][kind],res=run.res??{};
      const status=['idle','running','done','failed','aborted'][res.status]??(run.error||res.error?'error':'?');
      const pics=PRESET_SHOTS.map(at=>{
        const tag=String(at).padStart(5,'0');
        return comparePicture(run.out,v.kind,ref?.dir,{name:`frame-${tag}`,kindName:'preset',ref:`frame-${tag}.png`,base:k=>`frame-${tag}${k<0?'':'+'}${k}.png`,offsets:span(2)});
      });
      const diffs=mr?.state&&res.state?stateDiffs(res.state,mr.state):[];
      const mstatus=mr?['idle','running','done','failed','aborted'][mr.status]??'?':'-';
      const bad=status!=='done'||(mr&&(mstatus!==status||diffs.length||pics.some(p=>p.near!=null&&p.near<THRESHOLD.preset)));
      if(bad)failed=true;
      report.push({preset:kind,variant:v.name,status,mesenStatus:mstatus,frames:res.frames,trace:res.trace,mesenTrace:mr?.trace,
        wallFrames:res.wall_frames,mesenWallFrames:mr?.wall_frames,error:run.error??res.error,
        pictures:pics,stateDiffs:diffs,map:res.state?.map,mesenMap:mr?.state?.map,seconds:run.seconds});
      const pic=pics.map(p=>p.agreement==null?'-':`${(p.agreement*100).toFixed(0)}`+(p.near>p.agreement?`/${(p.near*100).toFixed(0)}`:'')).join(' ');
      console.log(`${kind.padEnd(12)} ${v.name.padEnd(15)} ${(bad?'FAIL ':'ok   ')+status.padEnd(6)} ${String(res.wall_frames??'-').padStart(5)} (${String(mr?.wall_frames??'-').padStart(5)})  ${pic.padEnd(22)} ${diffs.length?diffs.map(d=>d.k).join(','):(run.error??res.error??'-')}`);
    });
  }
  writeFileSync(join(outRoot,'presets.json'),JSON.stringify({rom:romFile,romSha256:romSha,report},null,1));
  console.log(`\nemulators presets: ${failed?'FAIL':'pass'} (details: ${join(outRoot,'presets.json')})`);
  return !failed;
}

// Power-on sensitivity on one core (poweron.mjs). Reports, does not fail:
// native code also reads uninitialised RAM (see presets.mjs).
async function powerOnMain(avail,romFile){
  const {kinds,work}=presetSetup(romFile);
  const sel=listOf(powerArg,kinds);
  const v=avail.find(x=>x.name==='snes9x')??avail[0];
  const startHost=({out,sram,wramInit})=>RetroHost.start({host:v.host,core:v.corePath,rom:romFile,out,options:v.options,sram,wramInit});
  const report=[];
  console.log(`power-on sensitivity on ${v.name}: ${FILLS.map(f=>f.name).join(', ')}`);
  // Presets in parallel (one host each, a few at a time).
  const queue=[...sel],jobs=Number(args.find(a=>a.startsWith('--jobs='))?.slice(7)??4);
  await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{
    while(queue.length){
      const kind=queue.shift(),index=kinds.indexOf(kind);
      const out=join(outRoot,'power-on',kind);
      const runs={};
      for(const fill of FILLS)runs[fill.name]=await presetRun(startHost,{kind,index,work,fill,out:join(out,fill.name)});
      const base=runs.zero.sig;
      const effects=Object.fromEntries(FILLS.slice(1).map(f=>[f.name,sigDiffs(base,runs[f.name].sig)]).filter(([,d])=>d.length));
      const row={preset:kind,status:base.status,effects};
      if(args.includes('--bisect')){
        row.bytes=[];
        const logs=[];
        for(const [mem,size] of [['wram',0x20000],['sram',0x8000]]){
          const f=FILLS.find(x=>x.mem===mem&&effects[x.name]);   // first fill of this memory that changed the run
          if(f)row.bytes.push({fill:f.name,...await bisect(startHost,{kind,index,work,mem,size,base,pattern:f.pattern,out:join(out,'bisect'),log:l=>logs.push(l)})});
        }
        row.log=logs;
      }
      report.push(row);
      const names=Object.keys(effects);
      console.log(`${kind.padEnd(12)} ${names.length?'SENSITIVE':'stable   '} ${names.map(n=>`${n}: ${effects[n].slice(0,3).join('; ')}`).join(' | ')}`);
      for(const b of row.bytes??[])for(const f of b.found)console.log(`  ${b.mem} ${f.addr!=null?'+'+f.addr.toString(16).toUpperCase():f.range.map(x=>x.toString(16)).join('-')}: ${f.effects.slice(0,2).join('; ')}`);
    }
  }));
  report.sort((a,b)=>kinds.indexOf(a.preset)-kinds.indexOf(b.preset));
  writeFileSync(join(outRoot,'power-on.json'),JSON.stringify({rom:romFile,core:v.name,fills:FILLS,report},null,1));
  console.log(`\npower-on: ${report.filter(r=>Object.keys(r.effects).length).length} of ${report.length} presets change with power-on RAM (details: ${join(outRoot,'power-on.json')})`);
  return true;
}

// DMA timing in Mesen (dma-watch.lua) over the scenario and presets: DMA
// into VRAM/OAM/CGRAM during active display without forced blank, HDMA into
// VRAM/OAM. Hits from module/core code (banks $A0-$AF) fail; native ones are
// reported (C0:25F6, the menu's last upload on the name editor's faded exit,
// is in the original cartridge too).
const NATIVE_DMA_KNOWN={'dma VRAM C0:25F6':'native menu upload on the name editor\'s exit (the original cartridge does the same)'};
async function dmaWatchMain(romFile,rom,xprobe){
  const {m,skipped}=await mesenModule();
  if(!m){console.log(`emulators dma-watch: skipped (${skipped})`);return true;}
  const {kinds,work}=presetSetup(romFile);
  const jobs=listOf(dmaArg,['scenario',...kinds]);
  const watch=readFileSync(join(here,'dma-watch.lua'),'utf8');
  const {privateRom,cleanupRom}=await import('../checkpoints.mjs');
  const report=[];
  let failed=false;
  for(const job of jobs){
    let test;
    if(job==='scenario')test=`PROBE_CODE={${probeCode(xprobe,0).join(',')}}\nTITLE_FRAMES={${TITLE_FRAMES.join(',')}}\n`+readFileSync(join(here,'mesen-ref.lua'),'utf8');
    else if(kinds.includes(job))test=`DBG_WORK=${work}\nPRESET=${kinds.indexOf(job)}\nMAXF=${maxFramesOf(job)}\nSHOTS={60,240}\n`+readFileSync(join(repo,'snes/test/debug/preset.lua'),'utf8');
    else{console.error(`emulators: unknown dma-watch job ${job}`);return false;}
    const copy=privateRom(romFile,`dma-${job}`);
    const r=await m.runMesen({rom:copy,test:test+'\n'+watch,outDir:join(outRoot,'dma-watch',job),timeoutMs:1800000,args:['--snes.ramPowerOnState=AllZeros']});
    cleanupRom(copy);
    const hits=(r.results?.dma_watch??[]).map(h=>{
      const bank=parseInt(h.pc.slice(0,2),16),key=`${h.kind} ${h.pc}`;
      const ours=(bank>=0xA0&&bank<=0xAF)||(bank>=0xE0&&bank<=0xEF);
      return {...h,ours,native:NATIVE_DMA_KNOWN[key]??null};
    });
    const bad=hits.filter(h=>h.ours);
    const error=r.results?.error??(r.code!==0?r.output.slice(-500):null);
    if(bad.length||error)failed=true;
    report.push({job,frames:r.results?.frames,error,hits});
    console.log(`${job.padEnd(12)} ${bad.length||error?'FAIL':'ok  '} ${String(r.results?.frames??'-').padStart(5)} frames  ${hits.length?hits.map(h=>`${h.kind} at ${h.pc} (frame ${h.frame}, line ${h.line}, brightness ${h.brightness}, ${h.extra}, ${h.count}x)${h.ours?' MODULE CODE':h.native?' native':' native, unverified'}`).join('; '):'none'}${error?' error '+error:''}`);
  }
  writeFileSync(join(outRoot,'dma-watch.json'),JSON.stringify({rom:romFile,romSha256:sha(rom),report},null,1));
  console.log(`\nemulators dma-watch: ${failed?'FAIL':'pass'} (details: ${join(outRoot,'dma-watch.json')})`);
  return !failed;
}

async function main(){
  if(dmaArg){
    const romFile=romPath(),rom=new Uint8Array(readFileSync(romFile)),xprobe=findProbe(rom)??0x7D0000;
    mkdirSync(outRoot,{recursive:true});
    process.exit(await dmaWatchMain(romFile,rom,xprobe)?0:1);
  }
  const variants=VARIANTS.filter(v=>!only.length||only.includes(v.name)).map(v=>({...v,corePath:findCore(v.core)}));
  const avail=variants.filter(v=>v.corePath);
  if(!avail.length){
    console.log(`emulators: skipped, no libretro cores (looked for snes9x/bsnes in ${coreDirs().join(', ')}).`);
    console.log('  Build them with: make -C snes/tools/retro-host cores');
    process.exit(0);
  }
  for(const v of variants.filter(v=>!v.corePath))console.log(`emulators: ${v.name} skipped (no ${v.core}_libretro core)`);
  let host;
  try{host=buildHost();}catch(e){console.error(`emulators: ${e.message}`);process.exit(1);}
  for(const v of avail)v.host=host;
  const romFile=romPath(),rom=new Uint8Array(readFileSync(romFile));
  mkdirSync(outRoot,{recursive:true});
  if(powerArg)process.exit(await powerOnMain(avail,romFile)?0:1);
  if(presetArg)process.exit(await presetsMain(avail,romFile,rom)?0:1);
  const xprobe=findProbe(rom);
  if(xprobe==null){console.error('emulators: no xdata probe in the ROM (is it an ExHiROM build?)');process.exit(1);}
  process.exit(await scenarioMain(avail,romFile,rom,xprobe)?0:1);
}
await main();
