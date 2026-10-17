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
import {kaiReference,compare,writeRef} from './reference.mjs';
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

const tests=[
  {name:'kai',check:kaiCheck},
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
