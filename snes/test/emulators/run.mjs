#!/usr/bin/env node
// Second and third opinions: the cartridge on snes9x and bsnes (their
// libretro cores, driven headless by snes/tools/retro-host) next to Mesen.
//   node snes/test/emulators/run.mjs [snes9x|bsnes|bsnes-accurate ...] [--no-mesen] [--refresh-mesen]
// Each core plays snes/test/emulators/scenario.mjs from power-on with noise
// in battery RAM and WRAM: ExHiROM detection (core log, CPU-bus probe of the
// extended banks and save RAM), title pictures against Mesen's at the same
// frames (best of a +-6 frame window), the name editor, the opening up to map
// 128, a native save, a power cycle with battery RAM kept, and a load.
// Mesen plays the same steps once per ROM (mesen-ref.lua, cached).
// Cores are looked up in $SNES_CORES, .local/tools/emu here and in the main
// checkout; without any the module is skipped (exit 0). Build them with
//   make -C snes/tools/retro-host cores
// Outputs: .local/snes-test/emulators/<variant>/ (PNGs, results.json,
// diff-*.png: Mesen | core | red where SNES colours differ), summary.json.
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RetroHost,buildHost,findCore,coreDirs,mainCheckout} from './retro.mjs';
import {playScenario,probeCode,probeReads,exhiromByte,TITLE_FRAMES,WINDOW,SHOT_WINDOW} from './scenario.mjs';
import {load15,bestMatch,agreement,diffSheet} from './compare.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const outRoot=join(repo,'.local/snes-test/emulators');

// bsnes runs with power-on randomisation off (its seed is the process clock);
// the host fills WRAM with seeded noise instead, as real WRAM powers up.
const VARIANTS=[
  {name:'snes9x',core:'snes9x',kind:'snes9x',options:{}},
  {name:'bsnes',core:'bsnes',kind:'bsnes',options:{bsnes_entropy:'None'}},
  {name:'bsnes-accurate',core:'bsnes',kind:'bsnes',options:{bsnes_entropy:'None',bsnes_ppu_fast:'OFF',bsnes_dsp_fast:'OFF'}},
];
// Minimum share of equal SNES colours against Mesen.
const THRESHOLD={title:0.99,name:0.99,waterfall:0.99,loaded:0.99};

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

// Mesen reference, cached per ROM and script.
async function mesenReference(rom,romFile,xprobe){
  if(args.includes('--no-mesen'))return {skipped:'--no-mesen'};
  let mesen,EXACT_FRAMES;
  try{
    const m=await import('../mesen.mjs');
    EXACT_FRAMES=m.EXACT_FRAMES;
    if(!process.env.MESEN){
      const shared=join(mainCheckout(),'.local/tools/mesen/Mesen.app/Contents/MacOS/Mesen');
      try{m.mesenPath();}catch{if(existsSync(shared))process.env.MESEN=shared;}
    }
    m.mesenPath();
    mesen=m;
  }catch(e){return {skipped:`Mesen not found (${e.message})`};}
  const lua=readFileSync(join(here,'mesen-ref.lua'),'utf8');
  const prelude=`PROBE_CODE={${probeCode(xprobe,0).join(',')}}\nTITLE_FRAMES={${TITLE_FRAMES.join(',')}}\n`;
  // Every frame rendered, so screenshots are of the frame they name.
  const dir=join(outRoot,'mesen'),key=sha(rom)+':'+sha(prelude+lua+EXACT_FRAMES.join(' '));
  const keyFile=join(dir,'key.txt');
  if(!args.includes('--refresh-mesen')&&existsSync(keyFile)&&readFileSync(keyFile,'utf8')===key&&existsSync(join(dir,'results.json')))
    return {dir,results:JSON.parse(readFileSync(join(dir,'results.json'),'utf8')),cached:true};
  const {privateRom,cleanupRom}=await import('../checkpoints.mjs');
  const copy=privateRom(romFile,'emulators-ref');
  console.log('emulators: Mesen reference run (once per ROM)…');
  const r=await mesen.runMesen({rom:copy,test:prelude+lua,outDir:dir,timeoutMs:900000,exactFrames:true});
  cleanupRom(copy);
  if(r.code!==0||!r.results||r.results.error)return {dir,error:r.results?.error??r.output.slice(-1500)};
  writeFileSync(keyFile,key);
  return {dir,results:r.results,cached:false,ms:r.ms};
}

async function runVariant(v,romFile,rom,xprobe){
  const out=join(outRoot,v.name);
  rmSync(out,{recursive:true,force:true});
  mkdirSync(out,{recursive:true});
  const lines=[];
  const t0=Date.now();
  let h=null,res=null,error=null,results=null;
  try{
    h=await RetroHost.start({host:v.host,core:v.corePath,rom:romFile,out,options:v.options,sram:'noise:1993',wramInit:'noise:2026'});
    res=await playScenario(h,{rom,xprobe,log:l=>lines.push(l)});
  }catch(e){error=e.message;}
  if(h){results=await h.close().catch(()=>null);if(error)h.kill();}
  return {variant:v,out,res,error,results,lines,seconds:(Date.now()-t0)/1000};
}

function detection(results){
  const text=[...(results?.log??[]),...(results?.stdout??[])].join('\n');
  const m=text.match(/(ExHiROM|HiROM|LoROM)[^\n]*/);
  return {logged:m?m[0].trim():null,exhirom:/ExHiROM|Map_ExtendedHiROMMap/.test(text)};
}

function pictures(run,ref){
  const rows=[];
  const kind=run.variant.kind,out=run.out;
  const img=p=>existsSync(p)?load15(p,kind):null;
  const refImg=name=>ref?.dir&&existsSync(join(ref.dir,name))?load15(join(ref.dir,name),'mesen'):null;
  const compare=(name,kindName,r,cands)=>{
    if(!r){rows.push({name,skipped:true});return;}
    if(!cands.length){rows.push({name,missing:true});return;}
    const m=bestMatch(r,cands);
    const best=cands.find(c=>c.label===m.best.label);
    diffSheet(r,best.img,m.best.dy,join(out,`diff-${name}.png`));
    rows.push({name,kind:kindName,agreement:m.best.agreement,near:agreement(r,best.img,m.best.dy,1),shot:best.file,offset:m.best.offset,dy:m.best.dy,
      atSameFrame:m.rows.find(x=>x.offset===0)?.agreement,size:`${best.img.w}x${best.img.h} vs Mesen ${r.w}x${r.h}`});
  };
  const window=(base,offsets)=>offsets.map(k=>({file:base(k),offset:k})).filter(c=>existsSync(join(out,c.file)))
    .map(c=>({...c,label:c.file,img:img(join(out,c.file))}));
  const span=n=>[...Array(2*n+1)].map((_,i)=>i-n);
  for(const F of TITLE_FRAMES)compare(`title-${F}`,'title',refImg(`title-${F}.png`),window(k=>`title-${F}-${F+k}.png`,span(WINDOW)));
  for(const name of ['name','waterfall','loaded'])
    compare(name,name,refImg(`${name}.png`),window(k=>`${name}${k<0?'':'+'}${k}.png`,span(SHOT_WINDOW)));
  return rows;
}

async function main(){
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
  const romFile=romPath(),rom=new Uint8Array(readFileSync(romFile));
  const xprobe=findProbe(rom);
  if(xprobe==null){console.error('emulators: no xdata probe in the ROM (is it an ExHiROM build?)');process.exit(1);}
  mkdirSync(outRoot,{recursive:true});

  const [ref,...runs]=await Promise.all([mesenReference(rom,romFile,xprobe),...avail.map(v=>runVariant({...v,host},romFile,rom,xprobe))]);
  if(ref.skipped)console.log(`emulators: Mesen comparison skipped: ${ref.skipped}`);
  if(ref.error)console.log(`emulators: Mesen reference failed: ${ref.error}`);
  const mr=ref.results;
  let mesenProbe=null;
  if(mr?.probe){
    const sram=new Uint8Array(0x8000);
    [sram[0],sram[0x203E],sram[0x7FFF]]=mr.probe_sram;
    const reads=probeReads(xprobe);
    mesenProbe={xdata:String.fromCharCode(...mr.probe.slice(0,26)),
      reads:reads.map((r,i)=>({addr:r.addr.toString(16),got:mr.probe[0x20+i],want:exhiromByte(rom,sram,r.addr)}))};
  }

  const summary={rom:romFile,romSha256:sha(rom),xprobe:xprobe.toString(16),mesen:mr?{cached:ref.cached,events:mr.events,
    loaded_hero:mr.loaded_hero,saved_hero:mr.saved_hero,probe:mesenProbe}:ref,variants:[]};
  let failed=false;
  for(const run of runs){
    const v=run.variant,det=detection(run.results);
    const checks=[...(run.res?.checks??[])];
    if(run.error)checks.push({name:'scenario_error',pass:false,detail:run.error});
    if(v.core==='snes9x')checks.push({name:'core_logged_exhirom',pass:det.exhirom,detail:det.logged??'no map in the core log'});
    const pics=pictures(run,ref);
    for(const p of pics){
      if(p.agreement==null)continue;
      const need=THRESHOLD[p.kind];
      checks.push({name:`picture_${p.name}`,pass:p.near>=need,detail:`${(p.agreement*100).toFixed(2)}% of pixels equal to Mesen`+
        (p.near>p.agreement?`, ${(p.near*100).toFixed(2)}% within one colour level`:'')+
        ` (frame ${p.offset>=0?'+':''}${p.offset}; same frame ${p.atSameFrame==null?'-':(p.atSameFrame*100).toFixed(2)+'%'})`+(p.dy?`, shifted ${p.dy} lines`:'')});
    }
    const ev=run.res?.events??{};
    if(mr?.events)for(const k of ['editor','control','loaded'])
      if(ev[k]!=null&&mr.events[k]!=null)checks.push({name:`timing_${k}`,pass:true,info:true,detail:`frame ${ev[k]} (Mesen ${mr.events[k]}, ${ev[k]-mr.events[k]>=0?'+':''}${ev[k]-mr.events[k]})`});
    const lh=run.res?.values?.loaded_hero;
    if(lh&&mr?.loaded_hero)checks.push({name:'loaded_position_matches_mesen',pass:lh[0]===mr.loaded_hero[0]&&lh[1]===mr.loaded_hero[1],detail:`${lh} (Mesen ${mr.loaded_hero})`});
    const bad=checks.filter(c=>!c.pass);
    if(bad.length)failed=true;
    const entry={variant:v.name,core:run.results?.core,options:v.options,seconds:run.seconds,frames:run.results?.frames,
      pixelFormat:run.results?.pixel_format,memory:run.results?.memory,state:run.results?.state,detection:det,
      events:ev,values:run.res?.values,pictures:pics,checks,error:run.error};
    summary.variants.push(entry);
    console.log(`\nemulators ${v.name.padEnd(15)} ${bad.length?'FAIL':'pass'}  (${run.results?.core?.library_name??'?'} ${run.results?.core?.library_version??''}, ${run.seconds.toFixed(1)} s, ${run.results?.frames??'?'} frames)`);
    for(const c of checks)console.log(`  ${c.info?'info':c.pass?'ok  ':'FAIL'} ${c.name.padEnd(30)} ${c.detail??''}`);
  }
  writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
  console.log(`\nemulators: ${failed?'FAIL':'pass'} (details: ${join(outRoot,'summary.json')})`);
  process.exit(failed?1:0);
}
await main();
