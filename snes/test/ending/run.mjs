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
import {kaiReference,compare,writeRef,bestPlanetMatch,gokuAtlas,nativeEffects,vistaReference,flightReference} from './reference.mjs';
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

// Good ending in Potos: Goku (and the charge orbs) against the browser's
// own art at the browser's positions, the cloud against the village
// whitened by (age - 114) / 30, the space half against planet-view's depart.
const c8=v=>v<<3|v>>2;
async function departCheck(r,out){
  const atlas=await gokuAtlas(),orbs=(await nativeEffects(baseRom))['charge-orb'];
  // A transparent composition: Goku's cell at (x0, y0), then the orbs.
  const compose=(parts)=>{const s=new Uint16Array(256*224);
    for(const p of parts)for(let py=0;py<p.h;py++)for(let px=0;px<p.w;px++){
      const c=p.get(px,py),x=p.x+px,y=p.y+py;if(c&&x>=0&&x<256&&y>=0&&y<224)s[y*256+x]=c;}
    return s;};
  const goku=(x,y,col,row)=>({x,y,w:32,h:32,get:(px,py)=>atlas.pixels[(32+row*32+py)*atlas.width+col*32+px]});
  const orb=(f,x,y)=>({x:x-8,y:y-8,w:16,h:16,get:(px,py)=>orbs[f%orbs.length][py*16+px]});
  const score=(name,surface,tol=32)=>{
    const img=gfx.readPng(join(out,`${name}.png`));let same=0,total=0;
    for(let i=0;i<256*224;i++){const c=surface[i];if(!c)continue;const v=c-1,d=i*4;total++;
      if(Math.abs(img.data[d]-c8(v&31))<=tol&&Math.abs(img.data[d+1]-c8(v>>5&31))<=tol&&Math.abs(img.data[d+2]-c8(v>>10&31))<=tol)same++;}
    return total?same/total:0;
  };
  const [bx,by]=r.village_boy.split(',').map(Number),[ox,oy]=r.depart_origin.split(',').map(Number);
  expect(r.village_suppress===1,'the goku module keeps the native Randi in the village');
  expect((r.village_status&0x03)===0x03,`village status ${r.village_status}`);
  r.village_match=score('village',compose([goku(bx+10,by-31,0,0)]));
  expect(r.village_match>=0.85,`Goku beside Randi at ${(r.village_match*100).toFixed(1)}%`);
  expect(ox===bx+26&&oy===by,`take-off point ${ox},${oy} (boy ${bx},${by})`);
  const pose=a=>{const t=Math.max(0,a-56);return{x:ox,y:Math.round(oy-t*t*.055),col:a<12?0:a<56?54:38,row:a<56?0:3};};
  for(const a of [6,30,50,70,100]){
    const name=`depart-${a}`;if(r[name]===undefined){problems.push(`no still ${name}`);continue;}
    const p=pose(a),parts=[goku(p.x-16,p.y-31,p.col,p.row)];
    if(a>=12&&a<72)parts.push(orb(a>>3,p.x-13,p.y-14),orb((a>>3)+2,p.x+13,p.y-8));
    const m=score(name,compose(parts));r[`${name}_match`]=m;
    expect(m>=0.85,`${name}: Goku${a>=12&&a<72?' and the orbs':''} at ${(m*100).toFixed(1)}%`);
  }
  // The cloud: the village of 113 (Goku is above the screen by then) mixed
  // towards white.
  const base=gfx.readPng(join(out,'depart-113.png'));
  for(const a of [120,129,138]){
    const name=`depart-${a}`,w=Math.min(1,Math.max(0,(r[name]-114)/30)),ref=new Uint8Array(base.data.length);
    for(let i=0;i<base.data.length;i+=4)for(let k=0;k<3;k++){const v=base.data[i+k]>>3;ref[i+k]=c8(Math.round(v+(31-v)*w));}
    for(let i=3;i<ref.length;i+=4)ref[i]=255;
    writeFileSync(join(out,`${name}-ref.png`),writeRef(null,ref));
    const m=compare(join(out,`${name}.png`),ref);r[`${name}_match`]=m;
    expect(m>=0.85,`${name}: the whitened village at ${(m*100).toFixed(1)}%`);
  }
  for(const a of [146,152,160,174,200,240,280]){
    const name=`depart-${a}`;if(r[name]===undefined){problems.push(`no still ${name}`);continue;}
    const best=await bestPlanetMatch(join(out,`${name}.png`),{rom:baseRom,phase:'depart',night:false},r[name]);
    writeFileSync(join(out,`${name}-ref.png`),writeRef(null,best.ref));
    r[`${name}_match`]=best.score;
    expect(best.score>=0.9,`${name} matches planet-view at ${(best.score*100).toFixed(1)}% (age ${best.age})`);
  }
  expect((r.status_30&0x10)!==0,`charging at 30 (status ${r.status_30})`);
  expect((r.status_70&0x08)!==0&&(r.status_200&0x08)!==0,`airborne at 70 and 200 (${r.status_70}, ${r.status_200})`);
  expect((r.status_end&0x18)===0,`landed after the fade (status ${r.status_end})`);
  expect(r.sfx_70===3,`flight sound cue (${r.sfx_70})`);
  expect(r.done===1,'departure timeline done flag');
  expect(r.lag_frames<=3,`lag ${r.lag_frames} frames`);
  expect(r.overruns===0,`vblank overran ${r.overruns} times (${r.overrun_at})`);
  expect(r.after_phase===0&&r.after_suppress===0,`stop releases the picture and Randi (${r.after_phase}, ${r.after_suppress})`);
}

// Shenron's vista against shenron-ending.js's own composition. The test
// state (the finale's map 180) has a dialogue box open at the top, which
// stays above the picture (BG3) as in the browser: lines 48+ are compared.
async function vistaCheck(r,out){
  expect(r.summon_loaded,'vista loaded');
  expect(r.summon_load_frames<=40,`vista load took ${r.summon_load_frames} frames`);
  expect(!r.dragon_reloaded,'the dragon continues on the live vista');
  expect(r.summon_done===1&&r.dragon_done===1&&r.wish_done===1,`done flags ${r.summon_done}/${r.dragon_done}/${r.wish_done}`);
  // Shenron's rise moves every frame; elsewhere a late frame (a heavy
  // native frame during a palette fade, the wish's flash) holds a still
  // picture one more frame.
  expect(r.dragon_lag<=1,`dragon lag ${r.dragon_lag} frames`);
  expect(r.lag_frames<=12,`lag ${r.lag_frames} frames`);
  expect(r.overruns===0,`vblank overran ${r.overruns} times (${r.overrun_at})`);
  const shots=[...[24,60].map(a=>['summon',a]),...[10,40,70,100].map(a=>['dragon',a]),...[4,30,50,80].map(a=>['wish',a]),...[6,20].map(a=>['scatter',a])];
  for(const [phase,a] of shots){
    const name=`${phase}-${a}`;if(r[name]===undefined){problems.push(`no still ${name}`);continue;}
    const ref=phase==='scatter'?await vistaReference({rom:baseRom,phase:'wish',age:96,eighth:true,dimmed:a/30})
      :await vistaReference({rom:baseRom,phase,age:a,eighth:true});
    writeFileSync(join(out,`${name}-ref.png`),writeRef(null,ref));
    const m=compare(join(out,`${name}.png`),ref,{rect:{x0:0,y0:48,x1:256,y1:224}});r[`${name}_match`]=m;
    expect(m>=0.9,`${name} matches the browser at ${(m*100).toFixed(1)}%`);
  }
}

// The wish flight against createWishFlight's own picture. The cartridge's
// floor is the world map in a 128x128-tile Mode 7 window (repeated beyond
// it near the horizon) and Shenron keeps his full size as he rises away.
async function flightCheck(r,out){
  expect(r.vista_loaded,'the vista before the flight');
  expect(r.flight_load_frames<=30,`flight stage load took ${r.flight_load_frames} frames`);
  expect((r.status_100&0x0D)===0x0D,`muted and airborne at 100 (status ${r.status_100})`);
  expect((r.status_end&0x0C)===0x04,`muted, landed after 420 (status ${r.status_end})`);
  expect(r.sfx_310===2,`charged sound at the scatter (${r.sfx_310})`);
  expect(r.done===1,'flight timeline done flag');
  // On the finale's own map (180); the scatter's 28 sprites (300-340) are
  // the heaviest frames.
  expect(r.lag_frames<=20,`lag ${r.lag_frames} frames`);
  expect(r.overruns===0,`vblank overran ${r.overruns} times (${r.overrun_at})`);
  for(const a of [40,60,120,180,230,280,301,320,360,400,450]){
    const name=`flight-${a}`;if(r[name]===undefined){problems.push(`no still ${name}`);continue;}
    const ref=await flightReference({rom:baseRom,age:a});
    writeFileSync(join(out,`${name}-ref.png`),writeRef(null,ref));
    const m=compare(join(out,`${name}.png`),ref);r[`${name}_match`]=m;
    expect(m>=0.85,`${name} matches the browser at ${(m*100).toFixed(1)}%`);
  }
}

// Native map loads under the scenes, as the finale's scripts make them:
// door 2F under the doomed globe (the stage loads again, the clock goes on)
// and the reunion's door 3FF after the flight (black until the load, then
// the field's own cliff with Dyluck), against a control load of the cliff.
async function loadsCheck(r,out){
  expect(r.control_map===180,`control door 3FF loaded map ${r.control_map}`);
  expect(r.doomed_loaded,'doomed globe loaded');
  expect(r.door_map===246,`door 2F loaded map ${r.door_map}`);
  expect(r.doomed_reloaded,'the globe loads again after the native load');
  expect(r.doomed_phase===11,`still doomed after the load (phase ${r.doomed_phase})`);
  expect(r.doomed_age_after>r.doomed_age_before,`the clock goes on (${r.doomed_age_before} -> ${r.doomed_age_after})`);
  if(r['doomed-load']!==undefined){
    const best=await bestPlanetMatch(join(out,'doomed-load.png'),{rom:baseRom,phase:'doomed'},r['doomed-load']);
    writeFileSync(join(out,'doomed-load-ref.png'),writeRef(null,best.ref));
    r['doomed-load_match']=best.score;
    expect(best.score>=.97,`globe after the load matches planet-view at ${(best.score*100).toFixed(1)}%`);
  }else problems.push('no still doomed-load');
  expect(r.hold_phase===6&&r.hold_bright===0,`reunion holds black over the flight's VRAM (phase ${r.hold_phase}, brightness ${r.hold_bright})`);
  expect(r.reunion_released,'the reunion load gives the field the screen');
  expect(r.reunion_map===180,`reunion door loaded map ${r.reunion_map}`);
  expect(r.reunion_actors===r.control_actors+1,`Dyluck joins the cliff (${r.reunion_actors} actors, control ${r.control_actors})`);
  expect((r.reunion_status&0x81)===0,`scene released (status ${r.reunion_status})`);
  // The cliff as the native game loads it: the field's VRAM, palette and
  // registers are back (Dyluck is the difference).
  const native=gfx.readPng(join(out,'cliff-native.png'));
  const m=compare(join(out,'reunion-cliff.png'),native.data);r['reunion-cliff_match']=m;
  expect(m>=.95,`reunion cliff matches the native load at ${(m*100).toFixed(1)}%`);
}

const tests=[
  {name:'kai',check:kaiCheck},
  {name:'space',check:spaceCheck},
  {name:'fatal',check:fatalCheck},
  {name:'depart',check:departCheck},
  {name:'vista',check:vistaCheck},
  {name:'flight',check:flightCheck},
  {name:'loads',check:loadsCheck},
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
