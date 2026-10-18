#!/usr/bin/env node
// Orbit module tests (Mesen):
//   node snes/test/orbit/run.mjs [case ...]
// Builds dist/snes/orbit-test.sfc (-DORBIT_TIMING) unless SNES_ROM is set,
// writes outputs under .local/snes-test/orbit/<case>/ and exits non-zero on
// failure. Cases:
//   globe  the Mode 7 globe and starfield at the browser's cameras, compared
//          with reference.mjs (the browser's planet()/sky() formulas)
//   intro  the orbit intro through the public API (orbit_api_enter): the
//          message schedule against frieza-cinematic.js orbitIntroText and
//          each panel's pixels against the browser's radioPixels
//   fight  the space fight frame by frame against the browser's own
//          frieza.js orbital battle (fight-ref.mjs) under a scripted pad:
//          movement, ki, the charged wave, Instant Transmission and the
//          exchange, Frieza's patrol, warnings and shots, damage both ways
//          (ORBIT_FIGHT_EXTRA=n: start n frames later, another phase of the
//          game's own frame cycle)
//   clash  the beam struggle from 6,000 HP and the victory, frame by frame
//          against the same reference: gather, charge, launch, a lost
//          struggle (recoil, 420 damage), a won one under steady B taps,
//          the 'won' clock with the native victory commands, the return
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

// Clash script: no taps through the first struggle (it is lost), then a
// fresh B every 6 frames from the second launch on.
export function clashPads(n){
  const pads=[];
  for(let f=0;f<n;f++)pads.push(f>=840&&f<1800&&f%6===0?P.B:0);
  return pads;
}
const PHASES=['','gather','charge','launch','struggle','recoil','win'];
// clash.lua state() -> fields
function parseClash(line){
  const v=line.split(',').map(Number);
  const [bage,wage,phase,age,p,sv,taps,hx,hy,bx,by,hp,charge,cx,cy,cr,lon,ghp,pad,ret,fage,grace,text]=v;
  return {key:phase===6?`w${wage}`:`b${bage}`,phase:PHASES[phase]??'',age,pressure:p/2**31,shown:sv/2**31,taps,hero:{x:hx,y:hy},
    boss:{x:bx,y:by,hp},charge,view:{x:cx,y:cy,r:cr},lon,gokuHp:ghp,pad,returned:!!ret,text,bage,wage};
}
// frieza-finale-view.js: the message the clash shows (orbit-text.mjs ids).
async function clashText(c){
  const {clashSurge,victoryTiming}=await import(resolve(repo,'engine/frieza-finale.js'));
  if(!c)return 0;
  const id={gather:7,charge:8,launch:9,struggle:10,recoil:11};
  if(c.phase==='struggle'&&c.age>100){const s=clashSurge(c);return s?13+s.index:0;}
  if(c.phase==='win')return c.age>=victoryTiming.quiet&&c.age<victoryTiming.descent?12:0;
  return id[c.phase]??0;
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
  async intro(rom){
    const {orbitIntroFrames,orbitIntroLines,orbitIntroText}=await import(resolve(repo,'engine/frieza-cinematic.js'));
    const {radioPixels}=await import(resolve(repo,'engine/native-radio.js'));
    const marks=[20,59,61,135,209,211,285,360,435,510,585,660,735,809,811,860];
    const dir=join(out,'intro');
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nMARKS={${marks.join(',')}}\n`;
    const r=await runMesen({rom,state,test:pre+readFileSync(join(here,'intro.lua'),'utf8'),outDir:dir});
    const res=r.results??{};
    let ok=r.code===0&&res.live===true&&Array.isArray(res.states);
    if(!ok){console.log('intro: FAIL (no run)',r.code,res.error??'');return false;}
    const romBytes=readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc'));
    const fails=[];let panels=0;
    for(const line of res.states){
      const [f,intro,want,have]=line.split(',').map(Number);
      // the cartridge's intro counter is the browser's o.intro after this frame
      const text=orbitIntroText(intro),id=text?orbitIntroLines.indexOf(text)+1:0;
      if(want!==id)fails.push(`frame ${f} (intro ${intro}): message ${want}, browser ${id}`);
      // the screenshot trails the frame by up to two frames: check panels
      // well inside a line only
      const age=orbitIntroFrames-intro,inLine=age>=64&&age<orbitIntroFrames-49&&(age-60)%150>=4&&(age-60)%150<=146;
      if(!text||!inLine)continue;
      const shot=readPng(join(dir,`intro${String(f).padStart(4,'0')}.png`)),px=radioPixels(romBytes,text);
      let bad=0,n=0;
      for(let y=0;y<64;y++)for(let x=0;x<240;x++){
        const v=px[y*240+x];if(!v)continue;n++;
        const c=v-1,want=[c&31,(c>>5)&31,(c>>10)&31].map(k=>(k<<3)|(k>>2)),at=((y+8)*shot.width+x+8)*4;
        if(want.some((k,i)=>Math.abs(shot.data[at+i]-k)>8))bad++;
      }
      panels++;
      if(bad)fails.push(`frame ${f}: ${bad} of ${n} panel pixels differ from radioPixels`);
    }
    ok=ok&&fails.length===0&&panels>=5;
    writeFileSync(join(dir,'report.json'),JSON.stringify({states:res.states,fails,panels},null,1));
    console.log(`intro: ${ok?'pass':'FAIL'} ${panels} panels checked`);
    for(const m of fails.slice(0,8))console.log('  '+m);
    return ok;
  },
  async fight(rom){
    const frames=Number(process.env.ORBIT_FIGHT_FRAMES??660),pads=fightPads(frames);
    const dir=join(out,'fight');
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nPADS=${lua(pads)}\nSHOTS={0,60,150,200,240,320,600}\nEXTRA=${Number(process.env.ORBIT_FIGHT_EXTRA??0)}\n`;
    const r=await runMesen({rom,state,test:pre+readFileSync(join(here,'fight.lua'),'utf8'),outDir:dir});
    const res=r.results??{};
    let ok=r.code===0&&res.live===true&&Array.isArray(res.states);
    if(!ok){console.log('fight: FAIL (no run)',r.code,res.error??'',r.output?.slice(-2000));return false;}
    // The reference is fed exactly the pad word the cartridge's fight read
    // at each of its frames (logged with the state), so lag frames do not
    // shift the input; lag is checked on its own below. Goku's HP passes
    // through the game's damage queue, which the native code applies 1-5
    // frames later than the browser's stub does, depending on where the
    // fight's frames fall in the game's own cycle (ORBIT_FIGHT_EXTRA=n
    // starts the fight n frames later: n = 0-7 cover every phase): it may
    // trail by 8 frames, as in the clash case.
    const cart=res.states.map(parseState);
    // (a frame that ran two steps, after a lagging game frame, gave both
    // the same pad: an age without its own log takes the next one's)
    const padAt=new Map();for(const c of cart)padAt.set(c.boss.age,c.pad);
    for(let a=Math.max(...padAt.keys());a>0;a--)if(!padAt.has(a)&&padAt.has(a+1))padAt.set(a,padAt.get(a+1));
    const wram=readFileSync(join(bundleDir('preset__space'),'wram.bin'));
    const ref=await runFightReference({frames:frames+4,pad:f=>padAt.get(f+1)??0,wram});
    const mismatches=[];let compared=0,trail=0;const seen=new Set();
    for(const c of cart){
      if(seen.has(c.boss.age))continue;seen.add(c.boss.age);  // a lag frame logs the same state twice
      const b=ref[c.boss.age-1];if(!b)continue;compared++;
      const want=refState(b);delete c.pad;
      if(c.gokuHp!==want.gokuHp){
        const k=[1,2,3,4,5,6,7,8].find(k=>ref[c.boss.age-1-k]?.gokuHp===c.gokuHp);
        if(k){trail=Math.max(trail,k);want.gokuHp=c.gokuHp;}
      }
      const d=diff(c,want);
      if(d.length)mismatches.push(`age ${c.boss.age}: ${d.slice(0,4).join('; ')}`);
    }
    const report={compared,mismatchFrames:mismatches.length,first:mismatches.slice(0,12),lagged:res.lagged,hpTrail:trail,
      end:{cart:cart.at(-1),browser:ref[cart.at(-1).boss.age-1]?refState(ref[cart.at(-1).boss.age-1]):null}};
    writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,1));
    // The fight steps once per field vblank (catching up after a slow game
    // frame, as the browser's clock does); a few pictures may still repeat
    // when the game's own frame runs long (its damage reaction).
    ok=ok&&compared>=frames-80&&mismatches.length===0&&res.lagged<=3;
    console.log(`fight: ${ok?'pass':'FAIL'} compared ${compared} frames, ${mismatches.length} differ, ${res.lagged} lagged, HP trail ${trail}`);
    for(const m of mismatches.slice(0,8))console.log('  '+m);
    return ok;
  },
  async clash(rom){
    const frames=Number(process.env.ORBIT_CLASH_FRAMES??3000),pads=clashPads(frames);
    const dir=join(out,'clash');
    const shots=[0,100,200,300,320,360,400,560,900,1300,1560,1700,1900,2500,2700,2880];
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nPADS=${lua(pads)}\nSHOTS={${shots.join(',')}}\nHP=6000\n`;
    const r=await runMesen({rom,state,test:pre+readFileSync(join(here,'clash.lua'),'utf8'),outDir:dir,timeoutMs:900000});
    const res=r.results??{};
    let ok=r.code===0&&res.live===true&&Array.isArray(res.states);
    if(!ok){console.log('clash: FAIL (no run)',r.code,res.error??'',r.output?.slice(-2000));return false;}
    const cart=res.states.map(parseClash);
    // the reference steps with the pad the cartridge's fight read at the
    // same step (battle steps are keyed by b.age; the won stage ignores it)
    const padAt=new Map();for(const c of cart)if(c.key[0]==='b')padAt.set(Number(c.key.slice(1)),c.pad);
    // (a frame that ran two steps gave both its pad: a step without its own
    // log takes the next one's)
    for(let a=Math.max(...padAt.keys());a>0;a--)if(!padAt.has(a)&&padAt.has(a+1))padAt.set(a,padAt.get(a+1));
    const wram=readFileSync(join(bundleDir('preset__space'),'wram.bin'));
    const ref=await runFightReference({frames:frames+8,pad:f=>padAt.get(f+1)??0,wram,start:{boss:{hp:6000}}});
    const byKey=new Map();
    for(const b of ref){const k=b.returned?null:b.stage==='won'?`w${b.boss.age}`:`b${b.boss.age}`;if(k&&!byKey.has(k))byKey.set(k,b);}
    const mismatches=[];let compared=0;const seen=new Set();
    for(const c of cart){
      if(seen.has(c.key)||c.returned)continue;seen.add(c.key);
      const b=byKey.get(c.key);if(!b)continue;compared++;
      const d=[];
      const cl=b.clash;
      if((cl?.phase??'')!==c.phase)d.push(`phase ${c.phase} / ${cl?.phase}`);
      if(cl&&cl.age!==c.age)d.push(`age ${c.age} / ${cl.age}`);
      if(cl&&Math.abs(cl.pressure-c.pressure)>1e-6)d.push(`pressure ${c.pressure} / ${cl.pressure}`);
      if(cl&&Math.abs(cl.shown-c.shown)>1e-6)d.push(`shown ${c.shown} / ${cl.shown}`);
      if(cl&&cl.phase!=='win'&&cl.taps!==c.taps)d.push(`taps ${c.taps} / ${cl.taps}`);
      for(const k of['x','y'])if(c.hero[k]!==b.hero[k])d.push(`hero.${k} ${c.hero[k]} / ${b.hero[k]}`);
      for(const k of['x','y','hp'])if(c.boss[k]!==b.boss[k])d.push(`boss.${k} ${c.boss[k]} / ${b.boss[k]}`);
      if(cl&&cl.phase!=='win'&&c.charge!==b.charge)d.push(`charge ${c.charge} / ${b.charge}`);
      for(const k of['x','y','r'])if(c.view[k]!==b.view[k])d.push(`camera.${k} ${c.view[k]} / ${b.view[k]}`);
      if(c.lon!==b.camera.lon)d.push(`lon ${c.lon} / ${b.camera.lon}`);
      // (the game applies the damage queue itself: a few frames later, more
      // when its own frame runs long)
      const ghp=[0,1,2,3,4,5,6,7,8].some(k=>ref[ref.indexOf(b)-k]?.gokuHp===c.gokuHp);
      if(!ghp)d.push(`gokuHp ${c.gokuHp} / ${b.gokuHp}`);
      const text=await clashText(cl);
      if(text!==c.text)d.push(`text ${c.text} / ${text}`);
      if(d.length)mismatches.push(`${c.key}: ${d.slice(0,5).join('; ')}`);
    }
    // the native victory commands, in order (each is sent once by both)
    const want=ref.filter(b=>b.native).map(b=>b.native.map(v=>v.toString(16)).join(' '));
    const returned=cart.find(c=>c.returned),refReturn=ref.find(b=>b.returned);
    const report={compared,mismatchFrames:mismatches.length,first:mismatches.slice(0,16),lagged:res.lagged,nativeWant:want,
      returnedAt:returned?.wage,refReturnedAt:refReturn?refReturn.boss.age:null,end:cart.at(-1)};
    writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,1));
    ok=ok&&compared>=frames-200&&mismatches.length===0&&!!returned&&returned.wage===refReturn?.boss.age;
    console.log(`clash: ${ok?'pass':'FAIL'} compared ${compared} frames, ${mismatches.length} differ, ${res.lagged} lagged, back at ${returned?.wage} / ${refReturn?.boss.age}`);
    for(const m of mismatches.slice(0,10))console.log('  '+m);
    return ok;
  },
};

const rom=buildRom();
mkdirSync(out,{recursive:true});
const names=process.argv.slice(2).filter(a=>!a.startsWith('-'));
let failed=0;
const defaults=['globe','intro','fight'];
for(const name of names.length?names:defaults){
  if(!cases[name]){console.log(`unknown case ${name}`);failed++;continue;}
  if(!await cases[name](rom))failed++;
}
process.exit(failed?1:0);
