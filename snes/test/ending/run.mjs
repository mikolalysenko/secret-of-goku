#!/usr/bin/env node
// Ending module tests: each scene is cued from a browser-mod field state
// through the module's WRAM request byte (the story module calls the same
// API), screenshots are compared with references composed by the browser
// engine's own formulas, and timing/lag is checked.
// Outputs under .local/snes-test/ending/<test>/.
//   node snes/test/ending/run.mjs [test ...]
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
const gfx=await import(new URL('../../tools/gfx.mjs',import.meta.url).href);
import {kaiReference,compare,writeRef,bestPlanetMatch} from './reference.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const baseRom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
const lib=readFileSync(resolve(here,'lib.lua'),'utf8');
const only=process.argv.slice(2);
const problems=[];
const expect=(ok,msg)=>{if(!ok)problems.push(msg);return ok;};

async function kaiCheck(r,out){
  expect(r.bad_loaded&&r.good_loaded,'scene loaded');
  expect(r.bad_load_frames<=40,`load took ${r.bad_load_frames} frames`);
  expect(r.kai_done===1,'kai timeline done flag');
  expect((r.complete_status&0x20)!==0,'complete status bit');
  expect(r.lag_frames<=2&&r.fade_lag_frames<=2,`lag ${r.lag_frames}/${r.fade_lag_frames}`);
  expect(r.overruns===0,`vblank overran ${r.overruns} times (to line ${r.overrun_max})`);
  // Bubbles walks: positions change and stay on the lawn ellipse.
  const pts=r.bubbles_path.split(' ').map(p=>p.split(',').map(Number));
  expect(new Set(pts.map(p=>p[0]+','+p[1])).size>=4,'Bubbles wanders');
  for(const [x,y] of pts)expect(((x-128)/56)**2+((y-145)/35)**2<1.05,`Bubbles off the lawn at ${x},${y}`);
  for(const [shot,goku,card] of [['bad-complete','ssj','         BAD ENDING\n      THE WORLD IS GONE.'],['good-complete','goku','        SECRET OF GOKU\n          THE END']]){
    const [x,y,dir]=r[shot].split(',').map(Number);
    const frame=[4,8,12,12][dir]+1;
    const ref=await kaiReference({rom:baseRom,kaiFrame:3,bubbles:{x,y,frame,flip:dir===2},goku,card});
    writeFileSync(join(out,`${shot}-ref.png`),writeRef(null,ref));
    const score=compare(join(out,`${shot}.png`),ref);
    r[`${shot}_match`]=score;
    expect(score>=0.9,`${shot} matches the reference at ${(score*100).toFixed(1)}%`);
  }
}

// Bad ending in space: stills against planet-view.js at the recorded ages.
async function spaceCheck(r,out){
  expect(r.doomed_loaded,'doomed globe loaded');
  expect(r.doomed_load_frames<=12,`doomed load took ${r.doomed_load_frames} frames`);
  expect(!r.explode_reloaded,'explosion continues on the live globe');
  expect(!r.escape_reloaded,'escape continues without a reload');
  expect(r.explode_done===1,'explosion timeline done flag');
  expect(r.explode_lag<=2,`explosion lag ${r.explode_lag} frames`);
  expect(r.escape_lag<=1,`escape lag ${r.escape_lag} frames`);
  expect(r.overruns===0,`vblank overran ${r.overruns} times (to line ${r.overrun_max})`);
  // The globe and seams are tile-exact; drifting fragments are the SNES
  // brick fracture (39 sprite pieces, no rotation) against the browser's 64
  // rotating Voronoi shards, so those stills share position, colour and
  // timing rather than shapes.
  const shots=[['doomed','doomed',.97],['doomed-day','doomed',.97,{night:false}],
    ...[9,20,32,41].map(a=>[`explode-${a}`,'explode',.88]),...[52,60,70,90,120].map(a=>[`explode-${a}`,'explode',.6]),['explode-150','explode',.95],
    ['escape-4','escape',.85],['escape-10','escape',.85],['escape-24','escape',.95]];
  for(const [name,phase,min,opts={}] of shots){
    if(r[name]===undefined){problems.push(`no still ${name}`);continue;}
    const best=await bestPlanetMatch(join(out,`${name}.png`),{rom:baseRom,phase,...opts},r[name]);
    writeFileSync(join(out,`${name}-ref.png`),writeRef(null,best.ref));
    r[`${name}_match`]=best.score;r[`${name}_lagged`]=r[name]-best.age;
    expect(best.score>=min,`${name} matches planet-view at ${(best.score*100).toFixed(1)}% (age ${best.age})`);
  }
}

// Finale death: native collapse and fade, black, then planet-view's own
// fatal view (globe, explosion, GAME OVER); Start returns to the title.
const meanLight=png=>{const img=gfx.readPng(png);let s=0;for(let i=0;i<img.data.length;i+=4)s+=img.data[i]+img.data[i+1]+img.data[i+2];return s/(img.data.length/4);};
async function fatalCheck(r,out){
  expect((r.status_200&0x44)===0x44,`defeated and muted while the native collapse plays (status ${r.status_200})`);
  const l200=meanLight(join(out,'fatal-200.png')),l330=meanLight(join(out,'fatal-330.png')),l390=meanLight(join(out,'fatal-390.png'));
  r.light=`${l200.toFixed(0)}/${l330.toFixed(0)}/${l390.toFixed(0)}`;
  expect(l200>20,`the native picture shows during the collapse (${l200.toFixed(1)})`);
  expect(l330<l200*.75,`the picture fades from 300 (${l330.toFixed(1)} vs ${l200.toFixed(1)})`);
  expect(l390<3,`black before the planet (${l390.toFixed(1)})`);
  expect((r.status_905&0x20)!==0,'GAME OVER reached (complete status)');
  expect(r.done===1,'fatal timeline done flag');
  expect(r.lag_frames<=3,`lag ${r.lag_frames} frames`);
  expect(r.overruns===0,`vblank overran ${r.overruns} times (${r.overrun_at})`);
  expect(r.after_phase===0,`Start leaves for the title (phase ${r.after_phase})`);
  for(const [name,min] of [['fatal-500',.95],['fatal-560',.9],['fatal-600',.85],['fatal-650',.6],['fatal-700',.6],['fatal-810',.8],['fatal-905',.95]]){
    if(r[name]===undefined){problems.push(`no still ${name}`);continue;}
    const best=await bestPlanetMatch(join(out,`${name}.png`),{rom:baseRom,phase:'fatal',fatal:true},r[name]);
    writeFileSync(join(out,`${name}-ref.png`),writeRef(null,best.ref));
    r[`${name}_match`]=best.score;
    expect(best.score>=min,`${name} matches planet-view at ${(best.score*100).toFixed(1)}% (age ${best.age})`);
  }
}

const tests=[
  {name:'kai',check:kaiCheck},
  {name:'space',check:spaceCheck},
  {name:'fatal',check:fatalCheck},
];
let ok=true;
for(const t of tests){
  if(only.length&&!only.includes(t.name))continue;
  problems.length=0;
  const out=resolve(repo,'.local/snes-test/ending',t.name);
  const r=await runMesen({rom,test:lib+readFileSync(resolve(here,`${t.name}.lua`),'utf8'),outDir:out});
  if(r.code!==0||!r.results||r.results.error)problems.push(`mesen: ${r.results?.error??r.code}`);
  else await t.check(r.results,out);
  const pass=!problems.length;
  if(!pass)ok=false;
  const scores=Object.entries(r.results??{}).filter(([k])=>k.endsWith('_match')).map(([k,v])=>`${k.replace('_match','')} ${(v*100).toFixed(1)}%`).join(', ');
  console.log(`ending/${t.name}: ${pass?'pass':'FAIL'} (${r.ms} ms)${scores?' '+scores:''}`);
  for(const p of problems)console.log('  - '+p);
}
process.exit(ok?0:1);
