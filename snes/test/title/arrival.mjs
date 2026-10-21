// Goku's arrival (title module) in Mesen; run by run.mjs ('arrival'):
//  scene  the browser's probe state just before the sword pull, imported
//         (.local/snes-import/arrival-research__probe__before-pull): phase
//         timing, identity, persistence, and shots at fixed (phase, age)
//         compared with the browser mod's own frames (arrival-ref.mjs:
//         SnesJs + engine/arrival.js + sprite-layer.js from
//         .local/arrival-research/probe/before-pull.json, the same state).
//  e2e    power-on with this build to the waterfall (snes/test/checkpoints.mjs:
//         title, name entry, opening), the walk to the Mana Sword, the pull,
//         the arrival, the original tail until control returns, the scenery
//         and a ring menu round trip. Saves the stable checkpoint
//         after-arrival.mss (field loop, 00:B079) in its output; with
//         SNES_UPDATE_CHECKPOINTS=1 it also replaces the shared one
//         (<main checkout>/.local/snes-checkpoints/), which other suites
//         boot from: publish only from a main build, since a state carries
//         its build's sound driver and module RAM.
//  doors  from after-arrival.mss in a CORE_TEST build: the door to Potos
//         and back (door 12 lands beside the sword): scenery released and
//         restored with the same tiles.
//   const {runArrival}=await import('./arrival.mjs');
//   for(const [ok,msg] of await runArrival({rom,out}))...
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {arrivalReference} from './arrival-ref.mjs';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

// The route from the waterfall checkpoint to the sword: positions after each
// step of a walk found in SnesJs ({x, y, direction held}).
export const WAYPOINTS=[[508,472,'D'],[508,504,'D'],[508,536,'D'],[520,538,'R'],[490,538,'L'],[488,580,'D'],[482,622,'D'],[470,646,'D'],[452,666,'D'],[434,682,'D'],[416,698,'D'],[384,711,'L'],[382,730,'D'],[393,731,'R'],[354,736,'L'],[336,762,'D'],[320,762,'D'],[311,782,'D'],[311,802,'D'],[341,804,'R'],[373,804,'R'],[375,834,'D'],[391,864,'D'],[407,894,'D'],[423,924,'D'],[423,944,'D'],[423,974,'D'],[423,958,'U'],[423,988,'D'],[423,1020,'D'],[423,992,'U'],[445,1016,'R'],[447,1048,'D'],[457,1050,'R'],[457,1080,'D'],[479,1078,'R'],[511,1078,'R'],[543,1078,'R'],[545,1076,'U'],[567,1078,'R'],[569,1058,'U'],[599,1058,'R'],[601,1028,'U'],[601,996,'U'],[601,964,'U'],[601,932,'U'],[631,932,'R'],[649,932,'R'],[619,932,'L'],[617,962,'D'],[617,994,'D'],[617,1026,'D'],[593,1034,'L'],[599,1006,'U'],[599,974,'U'],[599,942,'U'],[629,940,'R'],[649,940,'R'],[649,910,'U'],[647,908,'L'],[647,878,'U'],[647,848,'U'],[617,846,'L'],[585,846,'L'],[567,846,'L'],[567,876,'D'],[569,894,'D'],[569,864,'U'],[595,858,'R'],[597,828,'U'],[599,806,'U'],[598,780,'U'],[552,778,'L'],[537,811,'D'],[529,845,'D'],[529,883,'D'],[529,920,'D'],[499,922,'L'],[497,938,'D'],[505,938,'R']];
const DOOR_OUT=3,DOOR_BACK=12;
// Shots compared with the browser: [phase, age, name, kind]. 'static' frames
// (no animation left) must match closely; 'anim' frames differ where the
// hardware's per-line sprite limits drop a few stamps and where the browser
// layers the scene at the hero's OAM index.
const SCENE_SHOTS=[[2,30,'descent-30','anim'],[2,59,'descent-59','anim'],[3,10,'impact-010','anim'],[3,20,'impact-020','anim'],[3,30,'impact-030','anim'],[3,42,'impact-042','anim'],[3,60,'impact-060','anim'],[3,80,'impact-080','anim'],[3,85,'impact-085','anim'],[3,95,'impact-095','anim'],[3,100,'impact-100','anim'],[3,110,'impact-110','anim'],[3,120,'impact-120','static'],[3,130,'impact-130','static'],[4,5,'ghost-005','static'],[5,30,'dialogue-030','static']];
const E2E_SHOTS=[[2,30,'descent-30'],[3,20,'impact-020'],[3,60,'impact-060'],[3,95,'impact-095'],[4,5,'ghost-005']];
const OFFSETS=[-7,-6,-5,-4,-3,-2,-1,0,1,2];

const luaShots=list=>`{${list.map(([p,t,n])=>`{${p},${t},${JSON.stringify(n)}}`).join(',')}}`;
const symbols=rom=>{
  const sym={},path=rom.replace(/\.sfc$/,'.sym');
  if(existsSync(path))for(const line of readFileSync(path,'utf8').split('\n')){const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\w+)$/i);if(m)sym[m[3]]=parseInt(m[1]+m[2],16);}
  return sym;
};
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
// 5-bit pictures (SnesJs scales a channel by 8.2, Mesen expands c as c<<3|c>>2).
const mesen5=path=>{const png=readPng(path),img=new Uint8Array(256*224*3);for(let i=0;i<256*224;i++){img[i*3]=png.data[i*4]>>3;img[i*3+1]=png.data[i*4+1]>>3;img[i*3+2]=png.data[i*4+2]>>3;}return img;};
const js5=rgb=>Uint8Array.from(rgb,v=>Math.round(v/8.2));

export async function runArrival({rom,out}){
  const results=[],check=(ok,msg)=>results.push([!!ok,msg]);
  const dir=resolve(out,'arrival');mkdirSync(dir,{recursive:true});
  const main=mainCheckout(),importDir=join(main,'.local/snes-import/arrival-research__probe__before-pull');
  const probe=join(main,'.local/arrival-research/probe/before-pull.json');
  const sym=symbols(rom);
  const fastBuild=(readFileSync(rom)[0xFFD5]&0x10)!==0; // HiROM / ExHiROM FastROM bit
  check(sym.title_event_script,'symbols for the arrival script');
  const titleJson=resolve(repo,'dist/snes/gen/title/title.json');
  const labels=existsSync(titleJson)?JSON.parse(readFileSync(titleJson,'utf8')).event.labels:{};
  const lua=readFileSync(join(here,'arrival.lua'),'utf8');

  // ---- scene: imported probe state vs the browser's own frames
  if(existsSync(importDir)&&existsSync(probe)){
    const prelude=`IMPORT=${JSON.stringify(importDir)}\nSHOTS=${luaShots(SCENE_SHOTS)}\nFRAMES=1000\n`;
    const srom=privateRom(rom,'title-scene');   // fresh battery RAM: repeatable runs
    const r=await runMesen({rom:srom,test:prelude+readFileSync(join(here,'scene.lua'),'utf8'),outDir:join(dir,'scene'),exactFrames:true});
    cleanupRom(srom);
    const res=r.results??{};
    check(r.code===0&&!res.error,`scene run finished (${res.error??'ok'})`);
    const shots=new Map();
    for(const [p,t,n] of SCENE_SHOTS)for(const d of OFFSETS)if(t+d>=0)shots.set(`${p}:${t+d}`,`${n}@${d}`);
    const ref=await arrivalReference({state:probe,shots,frames:1000});
    const phase=k=>(res.phases??[]).find(p=>p.phase===k)?.frame,jsPhase=k=>ref.log.find(p=>p.phase===k)?.frame;
    for(const k of [1,2,3,4,5])check(phase(k)!=null&&jsPhase(k)!=null&&Math.abs(phase(k)-jsPhase(k))<=3,`phase ${k} at frame ${phase(k)} (browser ${jsPhase(k)})`);
    check(phase(3)-phase(2)===60||Math.abs(phase(3)-phase(2)-(jsPhase(3)-jsPhase(2)))<=1,`descent lasts ${phase(3)-phase(2)} frames (browser ${jsPhase(3)-jsPhase(2)})`);
    check(same(res.hero_slot,ref.name),`hero slot after the impact ${JSON.stringify(res.hero_slot)} (browser ${JSON.stringify(ref.name)})`);
    check(res.goku_active===1&&res.arrival_bits===3,`impact sets goku_active (${res.goku_active}) and the arrival/crater bits (${res.arrival_bits})`);
    // pictures: best browser frame within a few ages (the native flash and
    // water steps run on their own cadence), whole frame plus the crater and
    // pod boxes around the sword (the hero's box excluded)
    const cmpDir=join(dir,'compare');mkdirSync(cmpDir,{recursive:true});
    for(const [p,t,n,kind] of SCENE_SHOTS){
      const path=join(dir,'scene',`${n}.png`);
      if(!existsSync(path)){check(false,`${n}: no Mesen shot`);continue;}
      const m=mesen5(path);
      // Each measure takes its best browser age in the window: the native
      // flash steps (every fifth frame) and the quake's 2 px BG1 shake
      // (every other frame, which moves the crater and resting pod with the
      // ground) run on the game's own counters, not on the scene's age.
      const cx=124,cy=139,hero=[95,98,143,130];
      let best=null,region=null;
      for(const d of OFFSETS){
        const raw=ref.frames.get(`${n}@${d}`);if(!raw)continue;
        const j=js5(raw);let full=0,crater=0,cn=0,pod=0,pn=0;
        for(let y=0;y<224;y++)for(let x=0;x<256;x++){
          const i=(y*256+x)*3,dif=j[i]!==m[i]||j[i+1]!==m[i+1]||j[i+2]!==m[i+2];
          if(dif)full++;
          if(x>=hero[0]&&x<hero[2]&&y>=hero[1]&&y<hero[3])continue;
          if(x>=cx-48&&x<cx+48&&y>=cy-33&&y<cy+31){cn++;if(dif)crater++;}
          else if(x>=cx-24&&x<cx+24&&y>=cy-59&&y<cy-11){pn++;if(dif)pod++;}
        }
        if(!best||full<best.full)best={d,full,raw};
        const r=crater/cn+pod/pn;
        if(!region||r<region.r)region={d,r,cp:100*crater/cn,pp:100*pod/pn};
      }
      if(!best){check(false,`${n}: no browser frame`);continue;}
      const pct=100*best.full/(256*224),cp=region.cp,pp=region.pp;
      const msg=`${n} vs browser: ${pct.toFixed(2)}% of the frame (age offset ${best.d}), crater ${cp.toFixed(2)}% and pod ${pp.toFixed(2)}% (offset ${region.d})`;
      check(kind==='static'?pct<=1.5&&cp<=1&&pp<=1:pct<=6,msg);
      // side by side: browser | cartridge
      const img=blank(512,224),mm=readPng(path);
      for(let y=0;y<224;y++)for(let x=0;x<256;x++){
        const s=(y*256+x)*3,a=(y*512+x)*4,b=(y*512+256+x)*4,q=(y*256+x)*4;
        for(let c=0;c<3;c++){img.data[a+c]=Math.min(255,Math.round(best.raw[s+c]*255/254));img.data[b+c]=mm.data[q+c];}
        img.data[a+3]=img.data[b+3]=255;
      }
      writeFileSync(join(cmpDir,`${n}.png`),writePng(img));
    }
  }else check(true,`scene skipped (no ${existsSync(importDir)?probe:importDir})`);

  // ---- e2e: power-on (checkpoints.mjs) to the waterfall, then the arrival
  const cpOut=join(dir,'checkpoints');
  const cp=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs'),`--rom=${rom}`,`--out=${cpOut}`,'--stop=waterfall'],{cwd:repo,encoding:'utf8'});
  const waterfall=join(cpOut,'waterfall.mss');
  check(cp.status===0&&existsSync(waterfall),`power-on to the waterfall with this build (${cp.status===0?'ok':(cp.stderr||cp.stdout).slice(-300)})`);
  if(!existsSync(waterfall))return results;
  const pages=[1,2,3,4,5].map(i=>labels[`page${i}Wait`]);
  const prelude=[
    `MODE='arrival'`,
    `WAYPOINTS={${WAYPOINTS.map(([x,y,d])=>`{${x},${y},'${d}'}`).join(',')}}`,
    `SCRIPT=${sym.title_event_script??0}`,
    `PAGE_WAITS={${pages.map(v=>v??-1).join(',')}}`,
    `SHOTS=${luaShots(E2E_SHOTS)}`,
  ].join('\n')+'\n';
  const prom=privateRom(rom,'title-arrival');
  const r=await runMesen({rom:prom,test:prelude+lua,outDir:join(dir,'e2e'),state:waterfall,timeoutMs:900000});
  cleanupRom(prom);
  const e=r.results??{};
  check(r.code===0&&!e.error,`e2e run finished (${e.error??'ok'})`);
  const [x,y]=e.at_sword??[0,0];
  check(Math.abs(x-505)<=3&&Math.abs(y-937)<=3&&!(e.walk_misses??[1]).length,`walked to the sword: ${x},${y} (${(e.walk_misses??[]).length} waypoints missed)`);
  const order=(e.phases??[]).map(p=>p.phase).join(',');
  check(order==='0,1,2,3,4,5,6',`phases in order: ${order}`);
  check(e.control===true,`control returns after the original tail (${e.control})`);
  check(same(e.flags,[1,1,0,1]),`original progression CF00/CF10/CF0A/CFC1 = ${JSON.stringify(e.flags)} (want 1,1,0,1)`);
  check(same(e.hero_slot,[0xA1,0xA9,0xA5,0xAF,0,0,0x9C,0xA9,0xB3,0,0,0]),`hero slot GOKU with the boy's name BOY in the tail: ${JSON.stringify(e.hero_slot)}`);
  check(e.goku_active===1&&e.arrival_bits===3,`goku_active ${e.goku_active}, arrival bits ${e.arrival_bits}`);
  check(e.inventory_cc48===0x27,`starting Drum/Fly item kept (${e.inventory_cc48})`);
  // The impact's every fifth frame (the game's party refresh and flash
  // rebuild) leaves the modules about 45 lines: with combat, fx and audio
  // that needs FastROM (header map mode $31, MEMSEL kept on). SlowROM builds
  // report their late frames without failing.
  const lateMsg=`${e.impact_late} of ${e.impact_frames} impact frames made late by the modules${(e.impact_late_rows??[]).length?' ('+e.impact_late_rows.join(', ')+')':''}; ${e.impact_late_native} late before the hook`;
  if(fastBuild){
    check(e.impact_frames>0&&e.impact_fastrom===e.impact_frames,`FastROM build: MEMSEL on in ${e.impact_fastrom} of ${e.impact_frames} impact frames`);
    check(e.impact_late===0,`FastROM: ${lateMsg}`);
  }else check(true,`SlowROM build: ${lateMsg} (informational)`);
  check(['page-1','page-2','page-3','page-4','page-5'].every(p=>(e.shots??[]).includes(p)),`five dialogue pages shown (${(e.shots??[]).filter(s=>s.startsWith('page')).join(' ')})`);
  check(e.claims===0&&e.hero_mode===0&&e.cell_req===0,`scene resources released (claims ${e.claims}, hero mode ${e.hero_mode}, cell request ${e.cell_req})`);
  check(same(e.scenery,[20,9]),`crater and open pod drawn after the scene: ${JSON.stringify(e.scenery)} sprites (want 20, 9)`);
  check(e.ring_open===true&&same(e.scenery_after_ring,[20,9])&&e.crater_vram_after_ring===e.crater_vram,`ring menu round trip keeps the scenery (${JSON.stringify(e.scenery_after_ring)}, tiles ${e.crater_vram_after_ring===e.crater_vram?'same':'changed'})`);
  const saved=join(dir,'e2e','after-arrival.mss');
  check(e.saved===true&&existsSync(saved),'stable checkpoint after the arrival (00:B079)');
  if(existsSync(saved)&&process.env.SNES_UPDATE_CHECKPOINTS==='1'){
    const shared=checkpointDir();mkdirSync(shared,{recursive:true});
    copyFileSync(saved,join(shared,'after-arrival.mss'));
    if(existsSync(join(dir,'e2e','control.png')))copyFileSync(join(dir,'e2e','control.png'),join(shared,'after-arrival.png'));
    writeFileSync(join(shared,'after-arrival.json'),JSON.stringify({name:'after-arrival',map:128,pos:e.pos,flags:e.flags,hero_slot:e.hero_slot,goku_active:e.goku_active,arrival_bits:e.arrival_bits,rom:rom,romSha256:createHash('sha256').update(readFileSync(rom)).digest('hex'),created:new Date().toISOString(),by:'snes/test/title/arrival.mjs'},null,1));
  }

  // ---- doors: Potos and back in a CORE_TEST build
  if(existsSync(saved)){
    const ctRom=resolve(repo,'.local/snes-test/roms/title-core-test.sfc');
    const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${ctRom}`,'-DCORE_TEST=1'],{cwd:repo,encoding:'utf8'});
    check(b.status===0,'CORE_TEST build for the door round trip');
    if(b.status===0){
      const prom2=privateRom(ctRom,'title-doors');
      const d=await runMesen({rom:prom2,test:`MODE='doors'\nDOOR_OUT=${DOOR_OUT}\nDOOR_BACK=${DOOR_BACK}\n`+lua,outDir:join(dir,'doors'),state:saved});
      cleanupRom(prom2);
      const q=d.results??{};
      check(d.code===0&&!q.error,`door run finished (${q.error??'ok'})`);
      check(same(q.scenery_start,[20,9]),`scenery after loading the checkpoint: ${JSON.stringify(q.scenery_start)}`);
      check(q.door_out===true&&same(q.scenery_potos,[0,0])&&q.claims_potos===0,`Potos: no scenery, no VRAM claims (${JSON.stringify(q.scenery_potos)}, claims ${q.claims_potos})`);
      check(q.door_back===true&&same(q.scenery_back,[20,9])&&q.crater_vram_back===q.crater_vram_start,`back at the sword: crater and pod redrawn (${JSON.stringify(q.scenery_back)}, tiles ${q.crater_vram_back===q.crater_vram_start?'same':'changed'})`);
    }
  }
  return results;
}

// CLI: node snes/test/title/arrival.mjs [rom]
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const rom=resolve(process.argv[2]??process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
  const res=await runArrival({rom,out:resolve(repo,'.local/snes-test/title')});
  for(const [ok,msg] of res)console.log(`${ok?'ok  ':'FAIL'} ${msg}`);
  process.exit(res.every(([ok])=>ok)?0:1);
}
