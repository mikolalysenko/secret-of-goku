#!/usr/bin/env node
// Orbit module tests (Mesen):
//   node snes/test/orbit/run.mjs [case ...]
// Builds dist/snes/orbit-test.sfc (-DORBIT_TIMING) unless SNES_ROM is set,
// writes outputs under .local/snes-test/orbit/<case>/ and exits non-zero on
// failure. Cases:
//   globe  the Mode 7 globe and starfield at the browser's cameras, compared
//          with reference.mjs (the browser's planet()/sky() formulas)
//   fight  the space fight frame by frame against the browser's own
//          frieza.js orbital battle (fight-ref.mjs) under a scripted pad:
//          movement, ki, the charged wave, Instant Transmission and the
//          exchange, Frieza's patrol, warnings and shots, damage both ways
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {readPng} from '../../tools/gfx.mjs';
import {renderSpace,compareShots} from './reference.mjs';
import {runFightReference} from './fight-ref.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const out=resolve(repo,'.local/snes-test/orbit');
const imports=process.env.SNES_IMPORT??resolve(repo,'.local/snes-import');
const checkpoint=process.env.SNES_CHECKPOINT??resolve(repo,'.local/snes-checkpoints/waterfall.mss');
const mainImports='/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-import';
const bundleDir=name=>existsSync(join(imports,name))?join(imports,name):join(mainImports,name);
const mainCheckpoint='/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-checkpoints/waterfall.mss';
const state=existsSync(checkpoint)?checkpoint:mainCheckpoint;

function buildRom(){
  if(process.env.SNES_ROM)return process.env.SNES_ROM;
  const rom=resolve(repo,'dist/snes/orbit-test.sfc');
  const r=spawnSync('node',[resolve(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${rom}`,'-DORBIT_TIMING'],{encoding:'utf8'});
  if(r.status!==0){console.error(r.stdout+r.stderr);process.exit(1);}
  return rom;
}
const lua=(v)=>Array.isArray(v)?'{'+v.map(lua).join(',')+'}':typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>`${k}=${lua(x)}`).join(',')+'}':typeof v==='string'?JSON.stringify(v):String(v);

// Scripted pad for the fight case (core $4218 bits), frame 0 first.
const P={B:0x8000,Y:0x4000,UP:0x0800,DOWN:0x0400,LEFT:0x0200,RIGHT:0x0100,A:0x0080,X:0x0040,L:0x0020,R:0x0010};
export function fightPads(n){
  const pads=[];
  for(let f=0;f<n;f++){
    let p=0;
    // (aims stay clear of the distant moon and planets: their scenery
    // strikes are not ported yet)
    if(f>=40&&f<70)p=P.LEFT;                       // steer
    else if(f>=70&&f<90)p=P.UP|P.RIGHT|P.A;        // sprint
    else if(f>=90&&f<92)p=P.RIGHT;                 // face right
    else if(f>=100&&f<130)p=f%8<4?P.Y:0;           // ki blasts
    else if(f>=134&&f<136)p=P.DOWN;                // face down (clear of the bodies)
    else if(f>=140&&f<190)p=P.L|P.Y;               // charge the wave; release fires it
    else if(f>=300&&f<302)p=P.L|P.B;               // Instant Transmission
    else if(f>=302&&f<306)p=P.L;
    else if(f>=306&&f<310)p=P.B;                   // the punch opens the exchange
    else if(f>=420&&f<460)p=P.DOWN|P.LEFT;
    else if(f>=470&&f<520)p=P.L;                   // focus
    else if(f>=560&&f<600)p=f%10<5?P.Y|P.DOWN:P.DOWN;  // ki downward while steering
    pads.push(p);
  }
  return pads;
}
const KINDS=['','beam','laser','disc','orb'];
// SNES log line (fight.lua state()) -> the reference's fields.
function parseState(line){
  const [h,b,w,c,v,shots,kis,hits]=line.split('|');
  const n=t=>t.split(',').map(Number);
  const [hx,hy,heading,charge,teleport,punch]=n(h),[bx,by,hp,clock,cycle,node,dash,stun,age]=n(b),[wk,wa,ghp]=n(w),[cx,cy,cr,lon,lat]=n(c),[von,vage,pad]=n(v);
  const list=t=>t?t.split(' ').map(e=>e.split(':').map(Number)):[];
  return {hero:{x:hx,y:hy},heading,charge,teleport,punch,boss:{x:bx,y:by,hp,clock,cycle,node,dash,stun,age},
    warning:wk?{kind:KINDS[wk],age:wa}:null,gokuHp:ghp,camera:{x:cx,y:cy,r:cr,lon,lat},beam:von?{age:vage}:null,
    pad,shots:list(shots).map(([k,x,y,a])=>`${KINDS[k]}:${x}:${y}:${a}`).sort(),
    kis:list(kis).map(([x,y,a])=>`${x}:${y}:${a}`).sort(),hits:list(hits).map(([x,y,a])=>`${x}:${y}:${a}`).sort()};
}
function refState(r){
  return {hero:r.hero,heading:r.heading,charge:r.charge,teleport:r.teleport,punch:r.punch,
    boss:{x:r.boss.x,y:r.boss.y,hp:r.boss.hp,clock:r.boss.clock,cycle:r.boss.cycle,node:r.boss.node,dash:r.boss.dash,stun:r.boss.stun,age:r.boss.age},
    warning:r.warning?{kind:r.warning.kind,age:r.warning.age}:null,gokuHp:r.gokuHp,camera:r.camera,beam:r.beam?{age:r.beam.age}:null,
    shots:r.shots.map(p=>`${p.kind}:${p.x}:${p.y}:${p.age}`).sort(),kis:r.kis.map(p=>`${p.x}:${p.y}:${p.age}`).sort(),
    hits:r.hits.map(p=>`${p.x}:${p.y}:${p.age}`).sort()};
}
function diff(a,b,path='',out=[]){
  if(typeof a!=='object'||a===null||typeof b!=='object'||b===null){if(JSON.stringify(a)!==JSON.stringify(b))out.push(`${path}: cart ${JSON.stringify(a)} browser ${JSON.stringify(b)}`);return out;}
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path?path+'.'+k:k,out);
  return out;
}

const cases={
  async globe(rom){
    // The browser's cameras: idle fight (space preset), moving, beam,
    // clash-wide, and an off-centre hero.
    const cams=[
      {name:'idle',x:95,y:154,r:104,lon:1848,lat:3527,age:0},
      {name:'moving',x:99,y:150,r:84,lon:2300,lat:3300,age:5},
      {name:'beam',x:90,y:158,r:68,lon:600,lat:1200,age:100},
      {name:'wide',x:114,y:164,r:56,lon:3900,lat:2000,age:200},
      {name:'right',x:118,y:146,r:92,lon:100,lat:300,age:7},
    ];
    const dir=join(out,'globe');
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nCAMS=${lua(cams)}\nSPIN=240\n`;
    const r=await runMesen({rom,state,test:pre+readFileSync(join(here,'globe.lua'),'utf8'),outDir:dir});
    const res=r.results??{};
    const report={live:res.live,imported:res.imported,shots:{}};
    let ok=r.code===0&&res.live===true;
    for(const c of cams){
      const shot=join(dir,c.name+'.png');
      if(!existsSync(shot)){ok=false;continue;}
      const ref=renderSpace(c);
      writeFileSync(join(dir,c.name+'-ref.png'),ref.png);
      const cmp=compareShots(readPng(shot),ref,{maxLine:196});
      report.shots[c.name]={...cmp,lines:res['lines_'+c.name]};
      // The approximations (linear longitude, decimated texture, flat light)
      // keep most pixels close; the disc and rim edges must match exactly.
      if(cmp.edgeMismatch>0.02||cmp.meanError>0.12)ok=false;
    }
    report.lonAfterSpin=res.lon_after_spin;report.spinFrames=res.spin_frames;report.spinWorstLine=res.spin_worst_line;
    // Every spin frame completes (no lag) and advances the longitude by 2.
    if(res.spin_frames!==240||res.lon_after_spin!==((cams[0].lon+2*240)&4095))ok=false;
    writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,1));
    console.log(`globe: ${ok?'pass':'FAIL'}`,JSON.stringify(report.shots));
    if(res.error)console.log(res.error);
    return ok;
  },
  async fight(rom){
    const frames=Number(process.env.ORBIT_FIGHT_FRAMES??660),pads=fightPads(frames);
    const dir=join(out,'fight');
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nPADS=${lua(pads)}\nSHOTS={0,60,150,200,240,320,600}\n`;
    const r=await runMesen({rom,state,test:pre+readFileSync(join(here,'fight.lua'),'utf8'),outDir:dir});
    const res=r.results??{};
    let ok=r.code===0&&res.live===true&&Array.isArray(res.states);
    if(!ok){console.log('fight: FAIL (no run)',r.code,res.error??'',r.output?.slice(-2000));return false;}
    // The reference is fed exactly the pad word the cartridge's fight read
    // at each of its frames (logged with the state), so lag frames do not
    // shift the input; lag is checked on its own below. Goku's HP passes
    // through the game's damage queue, which the native code applies a few
    // frames later than the browser's stub does: it may trail by 4 frames.
    const cart=res.states.map(parseState);
    // (a frame that ran two steps, after a lagging game frame, gave both
    // the same pad: an age without its own log takes the next one's)
    const padAt=new Map();for(const c of cart)padAt.set(c.boss.age,c.pad);
    for(let a=Math.max(...padAt.keys());a>0;a--)if(!padAt.has(a)&&padAt.has(a+1))padAt.set(a,padAt.get(a+1));
    const wram=readFileSync(join(bundleDir('preset__space'),'wram.bin'));
    const ref=await runFightReference({frames:frames+4,pad:f=>padAt.get(f+1)??0,wram});
    const mismatches=[];let compared=0;const seen=new Set();
    for(const c of cart){
      if(seen.has(c.boss.age))continue;seen.add(c.boss.age);  // a lag frame logs the same state twice
      const b=ref[c.boss.age-1];if(!b)continue;compared++;
      const want=refState(b);delete c.pad;
      if(c.gokuHp!==want.gokuHp&&[1,2,3,4].some(k=>ref[c.boss.age-1-k]?.gokuHp===c.gokuHp))want.gokuHp=c.gokuHp;
      const d=diff(c,want);
      if(d.length)mismatches.push(`age ${c.boss.age}: ${d.slice(0,4).join('; ')}`);
    }
    const report={compared,mismatchFrames:mismatches.length,first:mismatches.slice(0,12),lagged:res.lagged,
      end:{cart:cart.at(-1),browser:ref[cart.at(-1).boss.age-1]?refState(ref[cart.at(-1).boss.age-1]):null}};
    writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,1));
    // The fight steps once per field vblank (catching up after a slow game
    // frame, as the browser's clock does); a few pictures may still repeat
    // when the game's own frame runs long (its damage reaction).
    ok=ok&&compared>=frames-80&&mismatches.length===0&&res.lagged<=3;
    console.log(`fight: ${ok?'pass':'FAIL'} compared ${compared} frames, ${mismatches.length} differ, ${res.lagged} lagged`);
    for(const m of mismatches.slice(0,8))console.log('  '+m);
    return ok;
  },
};

const rom=buildRom();
mkdirSync(out,{recursive:true});
const names=process.argv.slice(2).filter(a=>!a.startsWith('-'));
let failed=0;
const defaults=['globe','fight'];
for(const name of names.length?names:defaults){
  if(!cases[name]){console.log(`unknown case ${name}`);failed++;continue;}
  if(!await cases[name](rom))failed++;
}
process.exit(failed?1:0);
