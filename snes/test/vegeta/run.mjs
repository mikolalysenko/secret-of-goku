#!/usr/bin/env node
// Vegeta module tests (Joch's trial in the Time Chamber), in Mesen.
//   SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/vegeta/run.mjs [case ...]
// Imports browser-mod states (.local/snes-import, shared by worktrees) and
// compares against the generator's outputs (dist/snes/gen/vegeta/), which are
// computed from the browser modules themselves. Outputs go to
// .local/snes-test/vegeta/<case>/.
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..','..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const gen=resolve(repo,'dist/snes/gen/vegeta');
function sharedLocal(sub){
  const local=resolve(repo,'.local',sub);
  if(existsSync(local))return local;
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  return r.status===0?resolve(r.stdout.trim(),'..','.local',sub):local;
}
const imports=process.env.SNES_IMPORT?resolve(process.env.SNES_IMPORT):sharedLocal('snes-import');
const checkpoints=process.env.SNES_CHECKPOINTS?resolve(process.env.SNES_CHECKPOINTS):sharedLocal('snes-checkpoints');
const outRoot=resolve(repo,'.local/snes-test/vegeta');
const only=process.argv.slice(2);
const lib=readFileSync(join(here,'lib.lua'),'utf8');

// Test ROM (-DVEGETA_TEST: the hit mailbox), built once per run next to the
// main one; SNES_TEST_ROM skips the build.
let testRom=process.env.SNES_TEST_ROM?resolve(process.env.SNES_TEST_ROM):null;
function buildTestRom(){
  if(testRom)return testRom;
  testRom=resolve(repo,'dist/snes/vegeta-test.sfc');
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','-DVEGETA_TEST=1',`--out=${testRom}`],{cwd:repo,stdio:'inherit'});
  if(b.status!==0)throw Error('vegeta test ROM build failed');
  return testRom;
}
// Labels of a built cartridge (WLA symbol file next to the ROM).
const symbolCache=new Map();
function sym(name,romPath=rom){
  if(!symbolCache.has(romPath)){
    const map=new Map();
    for(const line of readFileSync(romPath.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
      const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)$/i);if(m)map.set(m[3],parseInt(m[1]+m[2],16));
    }
    symbolCache.set(romPath,map);
  }
  const map=symbolCache.get(romPath);
  if(!map.has(name))throw Error(`symbol ${name} not found`);
  return map.get(name);
}
const luaValue=v=>Array.isArray(v)?`{${v.map(luaValue).join(',')}}`:typeof v==='string'?JSON.stringify(v):String(v);

async function mesen(name,lua,{state=join(checkpoints,'waterfall.mss'),globals={},romPath=rom}={}){
  const pre=Object.entries(globals).map(([k,v])=>`${k}=${luaValue(v)}`).join('\n');
  const test=`V_IMPORT_DIR=${JSON.stringify(imports)}\n${pre}\n${lib}\n${readFileSync(join(here,lua),'utf8')}`;
  const r=await runMesen({rom:romPath,test,outDir:join(outRoot,name),state});
  if(r.code!==0||!r.results||r.results.error)throw Error(`${name}: Mesen failed (${r.code}) ${r.results?.error??r.output.slice(-2000)}`);
  return r;
}
const word=(b,a)=>b[a]|b[a+1]<<8;
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

// Expected screen of BG2 at a camera from the generator's preview (the
// cartridge's own quantised picture) and from the browser picture (shifted
// one row, see snes/gen/vegeta.mjs).
let previews=null;
function loadPreviews(){
  previews??={native:readPng(join(gen,'preview-chamber.png')),browser:readPng(join(gen,'preview-chamber-browser.png'))};
  return previews;
}
function compareView(shotPath,cam,hero,diffPath){
  const shot=readPng(shotPath),{native,browser}=loadPreviews();
  const sx=shot.width/256,sy=shot.height/224;
  let n=0,exact=0,bn=0,bexact=0,floor=0,floorExact=0;
  const out=blank(256,224);
  const floorColors=new Set();
  for(const c of[[30,30,31],[28,29,30],[23,25,28]])floorColors.add(c.join());
  const hx=hero[0]-cam[0],hy=hero[1]-cam[1];
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
    if(y>=186)continue;                                   // HUD
    if(x>=hx-24&&x<hx+24&&y>=hy-48&&y<hy+12)continue;     // Goku and his shadow
    const s=((Math.floor(y*sy))*shot.width+Math.floor(x*sx))*4;
    const p=[shot.data[s]>>3,shot.data[s+1]>>3,shot.data[s+2]>>3];
    const wx=cam[0]+x,wy=cam[1]+y+1;                     // native BG row (VOFS + 1)
    const r=(wy*native.width+wx)*4,q=[native.data[r]>>3,native.data[r+1]>>3,native.data[r+2]>>3];
    const br=((wy-1)*browser.width+wx)*4,bq=[browser.data[br]>>3,browser.data[br+1]>>3,browser.data[br+2]>>3];
    n++;const ok=eq(p,q);if(ok)exact++;
    bn++;if(eq(p,bq))bexact++;
    if(floorColors.has(bq.join())){floor++;if(eq(p,bq))floorExact++;}
    const o=(y*256+x)*4;out.data[o]=ok?0:255;out.data[o+1]=ok?shot.data[s+1]>>1:0;out.data[o+3]=255;
  }
  if(diffPath)writeFileSync(diffPath,writePng(out));
  return {pixels:n,native:+(exact/n).toFixed(4),browser:+(bexact/bn).toFixed(4),floor:+(floorExact/Math.max(1,floor)).toFixed(4)};
}

// A whole match recorded in Mesen and replayed through engine/joch-trial.js:
// the trial state after every tick must equal the browser's.
async function fightCase(name,{script,hits,bundle,beam,pilotBeam,shots,fxLog,profile,check}){
  const {parseRecording,replay}=await import('./replay.mjs');
  const romPath=buildTestRom();
  const extra=beam?{V_BEAM_AGE:beam.age,V_BEAM_LEN:beam.len??200,V_BEAM_HALF:beam.half??12,...(beam.mash?{V_MASH:beam.mash}:{}),...(beam.super?{V_BEAM_SUPER:'true'}:{})}:{};
  if(pilotBeam)extra.V_PILOT_BEAM='true';
  if(pilotBeam?.holdHp)extra.V_PILOT_HOLD_HP=pilotBeam.holdHp;
  if(shots)extra.V_SHOTS='true';
  if(fxLog)extra.V_FX_LOG='true';
  if(profile)extra.V_PROFILE=profile(romPath);
  const r=await mesen(name,'fight.lua',{romPath,globals:{V_TICK:sym('vg_tick',romPath),V_HOOK:sym('vegeta_story_trial_start',romPath),V_SCRIPT:script,V_HITS:hits,...(bundle?{V_BUNDLE:bundle}:{}),...extra}});
  const recs=parseRecording(readFileSync(join(r.outDir,'fight.txt'),'utf8'));
  const hookAt=r.results.hook??[];
  const {results,events}=await replay(recs,{hookAt});
  const bad=results.filter(x=>x.diff.length);
  const fails=[];
  if(!hookAt.length)fails.push('the TRIAL_START hook never ran');
  if(bad.length)fails.push(`${bad.length} of ${results.length} ticks differ from joch-trial.js; first at tick ${bad[0].i} (frame ${bad[0].frame}): ${bad[0].diff.slice(0,4).join('; ')}`);
  const phases=[...new Set(results.map((x,i)=>recs[i+1]).map(rec=>rec.vg[0]===0x5a?['intro','battle','transform','draw'][rec.vg[1]]:'off'))];
  for(const e of events)if(e.kind==='error')fails.push(e.text);
  const landed=events.filter(e=>e.kind==='hit');
  if(check)fails.push(...check({events,landed,recs,results}));
  writeFileSync(join(r.outDir,'replay.json'),JSON.stringify({bad:bad.slice(0,50),events},null,1));
  return {fails,info:{ticks:results.length,differing:bad.length,phases,events:events.length,hits:landed.length,
    taken:landed.filter(e=>e.after<e.before).length,melee:landed.filter(e=>e.melee).length,beamHits:landed.filter(e=>e.beam).length}};
}

const cases={
  // A Kamehameha stand-in meets the Galick Gun (base form): lock, focus,
  // struggle with B taps every 6 frames, release, detonation, win.
  async 'clash-win'(){
    return fightCase('clash-win',{
      script:[[2400,'']],hits:[],
      beam:{age:100,len:200,half:12,mash:6},
    });
  },
  // The same without mashing: Vegeta's surges win, Goku takes the hit.
  async 'clash-lose'(){
    return fightCase('clash-lose',{
      script:[[2000,'']],hits:[],
      beam:{age:100,len:200,half:12,mash:0},
    });
  },
  async fight(){
    return fightCase('fight',{
      script:[[120,''],[40,'left'],[30,'down'],[60,'right'],[200,''],[60,'up'],[1600,'']],
      hits:[[60,400,1],[70,400,1],[520,65535,0],[1100,65535,0]],
    });
  },
  // Goku with the real combat module (fight.lua's pilot): punches reach
  // Vegeta through combat's damage hook (slot 3 shown to combat's step);
  // every logged hit replays through joch-trial.js hit() with the beam it saw.
  async combat(){
    return fightCase('combat',{
      script:[[3600,'pilot']],hits:[],shots:true,
      check:({landed})=>{
        const f=[];
        if(landed.filter(e=>e.melee&&e.after<e.before).length<4)f.push(`only ${landed.filter(e=>e.melee&&e.after<e.before).length} punches took HP`);
        return f;
      },
    });
  },
  // The same with a Kamehameha against each of his waves: combat's live
  // beam record (vb_combat_beam) locks the Galick Gun; B mashing wins.
  async 'combat-clash'(){
    return fightCase('combat-clash',{
      script:[[3600,'pilot']],hits:[],pilotBeam:{holdHp:12000},shots:true,
      check:({events})=>{
        const f=[];
        if(!events.some(e=>e.kind==='say'&&/Push back/.test(e.text)))f.push('no clash started from a real Kamehameha');
        return f;
      },
    });
  },
  // Pictures of his waves (Galick Gun in base form, Final Flash after an
  // overwhelming blow) and the moments around them, for review against the
  // browser (no pass/fail beyond the replay).
  async waves(){
    return fightCase('waves',{
      script:[[1500,'']],hits:[[700,65535,0]],shots:true,fxLog:true,
    });
  },
  // CPU budget of the trial: scanlines of vegeta_field_frame and fx_frame
  // and where the frame's logic ends (00:B077), per frame of the waves run
  // (profile.txt); lag = frames whose logic did not finish.
  async budget(){
    // segments: consecutive points, each reached once per frame
    const points=process.env.VEGETA_PROFILE?.split(',')??['vegeta_field_frame','vegeta_field_frame_trial','vegeta_field_frame_room','vg_tick','vg_locks','vg_music'];
    const r=await fightCase('budget',{
      script:[[1500,'']],hits:[[700,65535,0]],
      profile:rom=>[...points.map(p=>/^[0-9a-f]+$/i.test(p)?parseInt(p,16):sym(p,rom)),0x00B077],
    });
    const rows=readFileSync(join(outRoot,'budget','profile.txt'),'utf8').trim().split('\n').map(l=>l.split(' ').map(Number));
    const span=(a,b)=>a<0||b<0?null:(b-a+262)%262;
    const stats=list=>{const v=list.filter(x=>x!=null).sort((a,b)=>a-b);return v.length?`${v[v.length>>1]}/${v[Math.floor(v.length*.9)]}/${v[v.length-1]}`:'-';};
    const by={};
    for(const [frame,act,...l] of rows){
      const k=act===3?'beam':act?'attack':'other',end=l[l.length-1];
      (by[k]??={seg:points.slice(0,-1).map(()=>[]),end:[],lag:0,frames:0});
      const b=by[k];b.frames++;
      if(end<0){b.lag++;continue;}
      for(let i=0;i+1<points.length;i++)b.seg[i].push(span(l[i],l[i+1]));
      b.end.push(end);
    }
    const info={};
    for(const [k,b] of Object.entries(by)){
      info[k]={frames:b.frames,lag:b.lag,end:stats(b.end)};
      for(let i=0;i+1<points.length;i++)info[k][points[i]+'>'+points[i+1]]=stats(b.seg[i]);
    }
    return {fails:r.fails,info:{...r.info,budget:info}};
  },
  async chamber(){
    const r=await mesen('chamber','chamber.lua');
    const res=r.results,dir=r.outDir,fails=[];
    if(!res.loaded)fails.push('map 72 did not load at 64x64');
    const vram=readFileSync(join(dir,'vram.bin')),cgram=readFileSync(join(dir,'cgram.bin')),wram=readFileSync(join(dir,'wram.bin'));
    const tiles=readFileSync(join(gen,'chamber_tiles.bin')),pal=readFileSync(join(gen,'chamber_pal.bin'));
    const meta=readFileSync(join(gen,'chamber_meta.bin')),grid=readFileSync(join(gen,'chamber_grid.bin'));
    if(!vram.subarray(0,tiles.length).equals(tiles))fails.push('BG tiles in VRAM differ from chamber_tiles.bin');
    if(!cgram.subarray(64,64+pal.length).equals(pal))fails.push('CGRAM 32-127 differ from chamber_pal.bin');
    for(const id of[70,11])if(!wram.subarray(0x1c000+id*8,0x1c000+id*8+8).every(b=>b===0))fails.push(`BG1 metatile ${id} is not transparent`);
    if(!wram.subarray(0x1c808,0x1c808+meta.length).equals(meta))fails.push('BG2 metatiles differ from chamber_meta.bin');
    let gridOk=true;for(let y=0;y<64;y++)if(!wram.subarray(0x14000+y*128,0x14000+y*128+64).equals(grid.subarray(y*64,y*64+64)))gridOk=false;
    if(!gridOk)fails.push('BG2 grid differs from chamber_grid.bin');
    // The browser layout on BG1 (collision): 70 floor, 11 walls.
    const layout=(await import(join(repo,'engine/time-chamber.js'))).chamberLayout();
    let bg1=true;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(wram[0x10000+y*128+x]!==layout[y*64+x])bg1=false;
    if(!bg1)fails.push('BG1 grid differs from chamberLayout()');
    const views={};
    for(const v of['view0','view1','view2','view3']){
      const info=res[v];if(!info){fails.push(`${v} missing`);continue;}
      views[v]={...info,...compareView(join(dir,v+'.png'),info.camera,info.hero,join(dir,v+'-diff.png'))};
      if(views[v].native<0.995)fails.push(`${v}: BG matches the cartridge picture on only ${views[v].native}`);
      if(views[v].floor<0.999)fails.push(`${v}: floor/seam/border match the browser on only ${views[v].floor}`);
    }
    // Collision: the steps end at the pavilion's front wall (row 20 is solid
    // for columns 28-35); the border stops Goku before x = 992.
    const [,,nx,ny]=res.north??[];
    if(!(ny>=21*16))fails.push(`walked into the pavilion: y ${ny}`);
    const [ex]=res.east??[];
    if(!(ex<62*16&&ex>800))fails.push(`east border: x ${ex}`);
    return {fails,info:{views,north:res.north,east:res.east}};
  },
};

// Development: run one Lua file with the helpers and print its results.
const raw=process.argv.find(a=>a.startsWith('--lua='));
if(raw){
  const lua=raw.slice(6),name=lua.replace(/\.lua$/,'');
  const r=await mesen(name,lua);
  console.log(JSON.stringify(r.results,null,1).slice(0,20000));
  process.exit(0);
}

let failed=0;
for(const [name,fn] of Object.entries(cases)){
  if(only.length&&!only.includes(name))continue;
  const t0=Date.now();
  try{
    const {fails,info}=await fn();
    mkdirSync(join(outRoot,name),{recursive:true});
    writeFileSync(join(outRoot,name,'summary.json'),JSON.stringify({fails,info},null,1));
    console.log(`${fails.length?'FAIL':'pass'} ${name} (${((Date.now()-t0)/1000).toFixed(1)} s) ${JSON.stringify(info)}`);
    for(const f of fails)console.log('   - '+f);
    if(fails.length)failed++;
  }catch(e){failed++;console.log(`FAIL ${name}: ${e.message}`);}
}
process.exit(failed?1:0);
