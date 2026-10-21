#!/usr/bin/env node
// Orbit module tests (Mesen):
//   node snes/test/orbit/run.mjs [case ...]
// Builds dist/snes/orbit-test.sfc (-DORBIT_TIMING) unless SNES_ROM is set,
// writes outputs under .local/snes-test/orbit/<case>/ and exits non-zero on
// failure. Addresses of core's and other modules' fields come from their
// sources (readDefines). Default: every case. Cases:
//   globe  the Mode 7 globe and starfield at the browser's cameras, compared
//          with reference.mjs (the browser's planet()/sky() formulas), two
//          of them the victory's descent (its generated tables)
//   intro  the orbit intro through the public API (orbit_api_enter): the
//          message schedule against frieza-cinematic.js orbitIntroText and
//          each panel's pixels against the browser's radioPixels; the scene
//          work area is the orbit's while it runs and given back at the stop
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
//   death  from the hand-off, Goku at 1 HP: Frieza's first hit ends him;
//          the frieza module starts the ending's fatal sequence, the orbit
//          freezes and Goku falls (positions against the browser's own
//          bossRushDeathPose), and the orbit gives the picture and the
//          scene work area back before black
//   handoff the frieza module's ground fight in phase two takes a hit across
//          32,000 (its FRIEZA_TEST mailbox): the second surge hands over
//          to the orbit, which takes the scene work area from Frieza's
//          claim; Frieza's fight sleeps in space; his block ($32:7800-
//          7FFF: fight block, hole bitmap) is untouched while the orbit runs
//   return from the hand-off, the clash won at once, the descent and the
//          return to the deck: the door reload with Goku's landing spot,
//          the scene and the pad given back, the landing pose and clock,
//          frieza_orbit_landed and the victory event C7
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

function buildRom(name='orbit-test',extra=[]){
  if(process.env.SNES_ROM&&!extra.length)return process.env.SNES_ROM;
  const rom=resolve(repo,`dist/snes/${name}.sfc`);
  const r=spawnSync('node',[resolve(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${rom}`,'-DORBIT_TIMING',...extra],{encoding:'utf8'});
  if(r.status!==0){console.error(r.stdout+r.stderr);process.exit(1);}
  return rom;
}
// Addresses other modules and core own, from their sources (not fixed in
// the tests): !NAME = expression lines with !defines, $hex, decimals, + and -.
function readDefines(files){
  const raw=new Map();
  for(const f of files)for(const line of readFileSync(resolve(repo,f),'utf8').split('\n')){
    const m=/^\s*!(\w+)\s*#?=\s*([^;]+)/.exec(line);if(m&&!raw.has(m[1]))raw.set(m[1],m[2].trim());
  }
  const val=(name,seen=new Set())=>{
    if(seen.has(name))throw Error('define loop '+name);seen.add(name);
    const e=raw.get(name);if(e===undefined)throw Error('no define '+name);
    let total=0,sign=1;
    for(const tok of e.match(/!\w+|\$[0-9A-Fa-f]+|\d+|[+-]/g)){
      if(tok==='+'){sign=1;continue;}if(tok==='-'){sign=-1;continue;}
      const v=tok[0]==='!'?val(tok.slice(1),new Set(seen)):tok[0]==='$'?parseInt(tok.slice(1),16):Number(tok);
      total+=sign*v;sign=1;
    }
    return total;
  };
  return val;
}
const def=readDefines(['snes/src/core/shared.asm','snes/src/core/core.asm','snes/src/core/ram.asm','snes/src/modules/goku/module.asm']);
// (the return case: the story, world, combat and orbit fields it watches)
const defMore=readDefines(['snes/src/core/shared.asm','snes/src/core/core.asm','snes/src/core/ram.asm','snes/src/modules/goku/module.asm',
  'snes/src/modules/story/module.asm','snes/src/modules/world/module.asm','snes/src/modules/combat/module.asm','snes/src/modules/orbit/module.asm']);
const wramOf=n=>{const v=defMore(n);return v<0x10000?0x7E0000|v:v;};
const GOKU_FORM=0x7E0000|def('goku_form');           // the goku module's form byte (Super Saiyan: 1)
const SCENE_OWNER=def('core_scene_owner'),SCENE_ORBIT=def('SCENE_ORBIT');
const ORBIT_RAM=0x7E0000|(def('RAM_ORBIT')&0xFFFF),SCENE_RAM=def('SRAM_WORK_SCENE');
const ADDR=`GOKU_FORM=${GOKU_FORM}\nSCENE_OWNER=${SCENE_OWNER}\nSCENE_ORBIT=${SCENE_ORBIT}\nORBIT_RAM=${ORBIT_RAM}\nSCENE_RAM=${SCENE_RAM}\n`;
// Mesen runs share the machine with other agents' emulators: a generous
// wall-clock limit (the emulation itself is deterministic).
const TIMEOUT=Number(process.env.ORBIT_TIMEOUT_MS??2400000);
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

// The frieza module's phase-two fight on the browser's 'battle' preset (its
// FRIEZA_TEST build: the mailbox lands hits): a hit across 32,000 starts the
// second surge, which hands over to the orbit. Lua prelude with
// enterOrbit() (true once the orbit is live; checks the area's claim),
// check() and the fails list.
async function friezaHandoff(){
  const rom=process.env.SNES_HANDOFF_ROM??buildRom('orbit-frieza-test',['-DFRIEZA_TEST=1']);
  const {friezaWrites,luaWrites,defs:fz}=await import('../frieza/state.mjs');
  const wram=n=>{if(!(n in fz))throw Error('frieza define '+n);return fz[n]<0x10000?0x7E0000|fz[n]:fz[n];};
  const refRoot=existsSync(resolve(repo,'.local/snes-ref/battle'))?resolve(repo,'.local/snes-ref'):'/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-ref';
  const g=JSON.parse(readFileSync(join(refRoot,'battle','state.json'),'utf8')).goku;
  const prelude=`${ADDR}BUNDLE=${JSON.stringify(bundleDir('preset__battle'))}
WRITES=${luaWrites(friezaWrites(g.frieza,g.challenge))}
fails = {}
function check(c, m) if not c then fails[#fails + 1] = m end return c end
function enterOrbit()
  check(H.importSnesJs(BUNDLE), 'import')
  H.w8(${def('persist_goku_active')}, 1)
  for _, w in ipairs(WRITES) do if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end end
  H.w8(${wram('fz_music')}, ${fz.FZM_BATTLE})
  H.w8(${wram('fzf_tier')}, 1)     -- phase two: its threshold, 32,000, starts the cosmic surge
  H.w16(${wram('fzf_hp_lo')}, 32500)
  H.w16(${wram('fzf_hp_hi')}, 0)
  H.wait(2)
  H.result('owner_before', H.r16(SCENE_OWNER))
  H.w16(${wram('fzs_test')} + 2, 60000)
  H.w16(${wram('fzs_test')}, 2)
  H.waitFor(function() return H.r16(${wram('fzs_test')}) == 0 end, 30)
  H.result('after_hit', string.format('hp %d tier %d surge %d flags %02x enter %d state %d oflags %d', H.r16(${wram('fzf_hp_lo')}), H.r8(${wram('fzf_tier')}), H.r8(${wram('fzs_surge')}), H.r8(${wram('fzf_flags')}), H.r8(ORBIT_RAM + 0x26), H.r8(ORBIT_RAM), H.r8(ORBIT_RAM + 2)))
  local live = H.waitFor(function() return H.r8(ORBIT_RAM) == 2 end, 240)
  H.result('live', live)
  check(live, 'the orbit went live')
  H.result('owner_live', H.r16(SCENE_OWNER))
  check(H.r16(SCENE_OWNER) == SCENE_ORBIT, 'scene work owner ' .. H.r16(SCENE_OWNER) .. ' while live')
  check((H.r8(${wram('fzf_flags')}) & ${fz.FZFF_SPACE}) ~= 0, 'frieza: the fight is in space')
  return live
end
`;
  return {rom,prelude};
}

const cases={
  async globe(rom){
    // The browser's cameras: idle fight (space preset), moving, beam,
    // clash-wide, and an off-centre hero.
    // The victory's descent (clashCamera's 'win' branch at a clash age):
    // the globe from the generated tables in extended data (desc = the age).
    const {clashCamera}=await import(resolve(repo,'engine/frieza-finale.js'));
    const descent=age=>{const c=clashCamera({clash:{phase:'win',age,from:{camera:{x:114,y:164,r:56}}},camera:{x:114,y:164,r:56}});return {x:c.x,y:c.y,r:c.r,desc:age};};
    const cams=[
      {name:'idle',x:95,y:154,r:104,lon:1848,lat:3527,age:0},
      {name:'moving',x:99,y:150,r:84,lon:2300,lat:3300,age:5},
      {name:'beam',x:90,y:158,r:68,lon:600,lat:1200,age:100},
      {name:'wide',x:114,y:164,r:56,lon:3900,lat:2000,age:200},
      {name:'right',x:118,y:146,r:92,lon:100,lat:300,age:7},
      {name:'descent',...descent(1250),lon:1848,lat:3527,age:0},
      {name:'landfall',...descent(1392),lon:760,lat:3400,age:0},
    ];
    const dir=join(out,'globe');
    const pre=`BUNDLE=${JSON.stringify(bundleDir('preset__space'))}\nCAMS=${lua(cams)}\nSPIN=240\n`;
    const r=await runMesen({rom,state,test:ADDR+pre+readFileSync(join(here,'globe.lua'),'utf8'),outDir:dir,timeoutMs:TIMEOUT});
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
    const r=await runMesen({rom,state,test:ADDR+pre+readFileSync(join(here,'intro.lua'),'utf8'),outDir:dir,timeoutMs:TIMEOUT});
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
    // the scene work area is the orbit's while it runs, free of it after
    if(res.owner_live!==SCENE_ORBIT)fails.push(`scene work owner while live: ${res.owner_live} (want ${SCENE_ORBIT})`);
    if(res.owner_after===SCENE_ORBIT||res.state_after!==0)fails.push(`after the stop: owner ${res.owner_after}, state ${res.state_after}`);
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
    const r=await runMesen({rom,state,test:ADDR+pre+readFileSync(join(here,'fight.lua'),'utf8'),outDir:dir,timeoutMs:TIMEOUT});
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
    const r=await runMesen({rom,state,test:ADDR+pre+readFileSync(join(here,'clash.lua'),'utf8'),outDir:dir,timeoutMs:TIMEOUT});
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
  async handoff(){
    const h=await friezaHandoff();
    const dir=join(out,'handoff');
    const test=`${h.prelude}
local FZ_BLOCK = SCENE_RAM + 0x1800    -- the frieza module's fight block and hole bitmap
local function block() local t = {} for i = 0, 0x7FF do t[#t + 1] = H.r8(FZ_BLOCK + i) end return t end
function test()
  if not enterOrbit() then H.result('failures', fails) return end
  local before = block()
  for f = 1, 300 do
    H.wait(1)
    if f == 60 or f == 300 then H.shot(string.format('handoff%04d', f)) end
    if H.r16(SCENE_OWNER) ~= SCENE_ORBIT then check(false, 'owner ' .. H.r16(SCENE_OWNER) .. ' at ' .. f) break end
  end
  local after = block()
  local same = 0
  for i = 1, 0x800 do if before[i] == after[i] then same = same + 1 end end
  H.result('block_same', same)
  check(same == 0x800, 'the frieza block ($32:7800-7FFF) unchanged while the orbit runs (' .. same .. ' of 2048 bytes)')
  H.result('failures', fails)
end
`;
    const r=await runMesen({rom:h.rom,state,test,outDir:dir,timeoutMs:TIMEOUT});
    const res=r.results??{};
    const ok=r.code===0&&res.live===true&&Array.isArray(res.failures)&&res.failures.length===0;
    console.log(`handoff: ${ok?'pass':'FAIL'} owner ${res.owner_before} -> ${res.owner_live}, Frieza's block kept ${res.block_same}/2048 bytes`);
    if(!ok)console.log('  after the hit:',res.after_hit);
    for(const m of (res.failures??[]).slice(0,8))console.log('  '+m);
    if(!res.failures)console.log(r.output?.slice(-1500));
    return ok;
  },
  async death(){
    // From the hand-off: the intro cut short, Goku at 1 HP; Frieza's first
    // hit ends him. The frieza module starts the ending's fatal sequence;
    // the orbit freezes, Goku falls (positions against the browser's own
    // bossRushDeathPose), and the orbit gives the picture and the scene
    // work area back before black.
    const h=await friezaHandoff();
    const {bossRushDeathPose,bossRushDeathTiming:dt}=await import(resolve(repo,'engine/boss-rush-death.js'));
    const dir=join(out,'death');
    const ages=[1,10,30,53,54,60,100,138,150,170,200,230,263,264];
    const test=`${h.prelude}
AGES={${ages.join(',')}}
local FN = SCENE_RAM + 0x1500
local function gokuOam()
  for e = 0, 127 do
    local t = H.r8(0x7E0802 + e * 4)
    local a = H.r8(0x7E0803 + e * 4)
    if t == 0x88 and (a & 1) == 0 and ((a >> 1) & 7) == 1 then
      local x = H.r8(0x7E0800 + e * 4)
      local y = H.r8(0x7E0801 + e * 4)
      local hi = H.r8(0x7E0A00 + (e >> 2))
      if (hi >> ((e & 3) * 2)) & 1 == 1 then x = x - 256 end
      return x, y
    end
  end
  return nil, nil
end
function test()
  if not enterOrbit() then H.result('failures', fails) return end
  H.w16(SCENE_RAM + 0xA80 + 0x02, 1)       -- the intro's last frame
  H.wait(2)
  H.w16(0x7EE182, 1)                       -- Goku at 1 HP
  local fell = H.waitFor(function() return H.r16(FN + 0x7C) ~= 0 end, 900)
  check(fell, 'Goku fell in space')
  H.result('fell', fell)
  H.result('start', string.format('%d,%d,%d,%d,%d,%d,%d,%d', H.r16(FN + 0x80), H.r16(FN + 0x82), H.r16(FN + 0x84), H.r16(FN + 0x86), H.r16(FN + 0x96), H.r16(FN + 0x98), H.r16(FN + 0x9A), H.r16(FN + 0x88)))
  local want = {}
  for _, a in ipairs(AGES) do want[a] = true end
  local log = {}
  local shots = {[10]=true, [100]=true, [230]=true, [330]=true}
  local stopped, ownerAfter, endingStatus = nil, nil, 0
  for f = 1, 420 do
    H.wait(1)
    local state = H.r8(ORBIT_RAM)
    local age = H.r16(FN + 0x7E)
    if state == 2 and want[age] then
      local x, y = gokuOam()
      log[#log + 1] = string.format('%d,%s,%s', age, tostring(x), tostring(y))
      want[age] = nil
    end
    if state == 2 and shots[age] then H.shot(string.format('death%04d', age)); shots[age] = nil end
    endingStatus = endingStatus | H.r8(ORBIT_RAM + 0x88)
    if not stopped and state == 0 then stopped = age; ownerAfter = H.r16(SCENE_OWNER) end
  end
  H.result('poses', log)
  H.result('stopped', stopped)
  H.result('owner_after', ownerAfter)
  H.result('ending_status', endingStatus)
  H.result('ending_age', H.r16(ORBIT_RAM + 0x82))
  H.result('failures', fails)
end
`;
    const r=await runMesen({rom:h.rom,state,test,outDir:dir,timeoutMs:TIMEOUT});
    const res=r.results??{};
    const fails=[...(res.failures??[])];
    if(r.code!==0||!res.fell)fails.push('no death ('+(res.error??r.code)+')');
    let compared=0;
    if(res.start){
      const [fx,fy,dx,dy,cx,cy,cr,gold]=res.start.split(',').map(Number);
      const s16=v=>v>=0x8000?v-0x10000:v;
      for(const line of res.poses??[]){
        const [age,x,y]=line.split(',');const a=Number(age);
        const p=bossRushDeathPose({age:a,gold:!!gold,orbit:{camera:{x:cx,y:cy,r:cr},hero:{x:fx,y:fy}}});
        if(!p.visible){if(x!=='nil')fails.push(`age ${a}: Goku still drawn after the fall`);continue;}
        const half=(a<dt.fall?16:p.size)/2,wx=p.x-half,wy=p.y-half;compared++;
        if(Number(x)!==wx||Number(y)!==wy)fails.push(`age ${a}: Goku at ${x},${y}, browser ${wx},${wy} (size ${p.size})`);
      }
      if(s16(dx)+fx!==Math.round(cx+(fx-cx)*.28))fails.push('the fall target x differs');
    }
    // the orbit stops two frames before black; the area is free for the ending
    if(res.stopped==null||res.stopped<dt.black-3||res.stopped>dt.black)fails.push(`the orbit stopped at age ${res.stopped} (want ${dt.black-2})`);
    if(res.owner_after===SCENE_ORBIT)fails.push('the scene work area is still the orbit\'s after the stop');
    if(!(res.ending_status&0x40))fails.push('the ending\'s fatal sequence did not run');
    const ok=fails.length===0&&compared>=10;
    console.log(`death: ${ok?'pass':'FAIL'} ${compared} poses against bossRushDeathPose, stopped at ${res.stopped}, ending age ${res.ending_age}, area owner after ${res.owner_after}`);
    for(const m of fails.slice(0,8))console.log('  '+m);
    return ok;
  },
  async return(){
    // From the hand-off: no intro, Frieza at 6,000 HP (the clash at once),
    // B every 6 frames (the first struggle is won). Then the 'won' clock,
    // the descent and frieza.js returnToFortress at victoryTiming.return:
    // the deck's door with the entry tile at Goku's landing spot (the
    // browser's nearest landable floor: here where he stood), the scene
    // stopped and given back before the load, Goku's pad and combat back,
    // the world module's landing pose as the deck fades in, the landing
    // clock to victoryTiming.landed (frieza_orbit_landed: landed, out of
    // space) and the frieza module's victory event C7.
    const h=await friezaHandoff();
    const {victoryTiming:vt}=await import(resolve(repo,'engine/frieza-finale.js'));
    const {defs:fz}=await import('../frieza/state.mjs');
    const fzw=n=>{if(!(n in fz))throw Error('frieza define '+n);return fz[n]<0x10000?0x7E0000|fz[n]:fz[n];};
    const dir=join(out,'return');
    const test=`${h.prelude}
local SB = SCENE_RAM
local FB = SB + 0xA80
local FN = SB + 0x1500
local EV_LAST = ${wramOf('core_event_last')}
local QV, QE = ${wramOf('story_q_valid')}, ${wramOf('story_q_event')}
local GMODE, TRANS = ${wramOf('goku_mode')}, ${wramOf('w_trans_kind')}
local INLOCK, OWNER_BIT = ${wramOf('cb_inlock')}, ${defMore('ORBIT_COMBAT_OWNER')}
local FZF, LANDED, SPACE = ${fzw('fzf_flags')}, ${fz.FZFF_LANDED}, ${fz.FZFF_SPACE}
local RETURN, LANDED_AGE = ${vt.return}, ${vt.landed}
function test()
  if not enterOrbit() then H.result('failures', fails) return end
  H.w16(FB + 0x02, 0)                      -- no intro
  H.w16(FB + 0x34, 6000)                   -- Frieza at 6,000: the clash at once
  local won = nil
  for f = 1, 2400 do
    if H.r16(FN) ~= 6 and f % 6 == 0 then H.input = {b = true} else H.input = nil end
    H.wait(1)
    if H.r16(FN) == 6 then won = f break end
  end
  H.input = nil
  check(won, 'the clash was won')
  H.result('won', won)
  if not won then H.result('failures', fails) return end
  local shots = {[1160]=true, [1280]=true, [1391]=true}
  local ret = nil
  for f = 1, 3000 do
    H.wait(1)
    local age = H.r16(FN + 2)
    if shots[age] and H.r8(ORBIT_RAM) == 2 then H.shot(string.format('descent%04d', age)) shots[age] = nil end
    if H.r16(FN + 0x20) ~= 0 then ret = age break end
  end
  H.result('return_age', ret)
  H.result('return_bage', H.r16(FN + 0x1E))
  check(ret == RETURN, 'the return at victoryTiming.return (' .. tostring(ret) .. ')')
  local hx, hy = H.r16(0x7EE002), H.r16(0x7EE004)
  H.result('hero_at_return', hx .. ',' .. hy)
  local log = {}
  local door, stopAt, ownerAfter, lockAfter, loadAt, poseAt, poseDone, landedAt, c7At = false
  local mapAfter, spot, flagsAfter
  for f = 1, 900 do
    H.wait(1)
    local rs, st = H.r8(ORBIT_RAM + 0x27), H.r8(ORBIT_RAM)
    if H.r16(EV_LAST) == 0x082F then door = true end
    if not stopAt and st == 0 then stopAt = f ownerAfter = H.r16(SCENE_OWNER) lockAfter = H.r16(INLOCK) end
    if not loadAt and rs == 5 then
      loadAt = f mapAfter = H.r16(0x7E00DC)
      spot = H.r16(0x7EE002) .. ',' .. H.r16(0x7EE004)
      check(H.r16(TRANS) == 2, 'the landing pose requested (world transition ' .. H.r16(TRANS) .. ')')
    end
    if loadAt and not poseAt and H.r8(GMODE) == 0x27 then poseAt = f end
    if poseAt and not poseDone and H.r8(GMODE) ~= 0x27 then poseDone = f end
    if not landedAt and (H.r8(FZF) & LANDED) ~= 0 then landedAt = f flagsAfter = H.r8(FZF) end
    if landedAt and not c7At and (H.r16(EV_LAST) == 0xC7 or (H.r8(QV) ~= 0 and H.r16(QE) == 0xC7)) then c7At = f end
    if f == 6 or f == 40 or (loadAt and f == loadAt + 2) or (loadAt and f == loadAt + 24) or (landedAt and f == landedAt) then H.shot(string.format('return%04d', f)) end
    log[#log + 1] = string.format('%d rs %d st %d land %d e6 %02x ff %02x d0 %02x dc %d x %d y %d gm %02x tr %d song %02x ev %04x', f, rs, st,
      H.r16(ORBIT_RAM + 0x24), H.r8(0x7E00E6), H.r8(0x7E00FF), H.r8(0x7E00D0), H.r16(0x7E00DC), H.r16(0x7EE002), H.r16(0x7EE004),
      H.r8(GMODE), H.r16(TRANS), H.r8(0x7E1E05), H.r16(EV_LAST))
    if c7At and f >= c7At + 20 then break end
  end
  H.result('lines', log)
  H.result('door', door)
  H.result('stop_at', stopAt)
  H.result('owner_after', ownerAfter)
  H.result('lock_after', lockAfter)
  H.result('load_at', loadAt)
  H.result('map_after', mapAfter)
  H.result('spot', spot)
  H.result('pose_at', poseAt)
  H.result('pose_done', poseDone)
  H.result('landed_at', landedAt)
  H.result('flags_after', flagsAfter)
  H.result('c7_at', c7At)
  check(door, 'the deck door ($82F) ran')
  check(stopAt and stopAt < (loadAt or 0), 'the scene stopped before the load')
  check(ownerAfter ~= SCENE_ORBIT, 'the scene work area given back (owner ' .. tostring(ownerAfter) .. ')')
  check(lockAfter and (lockAfter & OWNER_BIT) == 0, 'the pad and combat given back')
  check(mapAfter == 246, 'the deck reloaded (map ' .. tostring(mapAfter) .. ')')
  check(spot == hx .. ',' .. hy, 'Goku lands where he stood (' .. tostring(spot) .. ', want ' .. hx .. ',' .. hy .. ')')
  check(poseAt and poseDone and poseDone - poseAt >= 24, 'the landing pose played (' .. tostring(poseAt) .. '-' .. tostring(poseDone) .. ')')
  check(landedAt and flagsAfter and (flagsAfter & SPACE) == 0, 'frieza_orbit_landed: landed, out of space')
  check(c7At, 'the victory event C7 requested after the landing')
  H.result('failures', fails)
end
`;
    const r=await runMesen({rom:h.rom,state,test,outDir:dir,timeoutMs:TIMEOUT});
    const res=r.results??{};
    const fails=[...(res.failures??[])];
    if(r.code!==0||!res.won)fails.push('no run ('+(res.error??r.code)+')');
    // the landing clock (1 at the return, + a frame the field can act; the
    // cartridge's reload adds its fade and load in between): seen at most
    // victoryTiming.landed - .return, the frame before it lands
    const lines=(res.lines??[]).map(l=>{const m=/rs (\d+) st (\d+) land (\d+)/.exec(l);return m?{rs:+m[1],land:+m[3]}:null;}).filter(Boolean);
    const peak=Math.max(0,...lines.map(l=>l.land));
    if(peak!==vt.landed-vt.return)fails.push(`the landing clock peaked at ${peak} (want ${vt.landed-vt.return})`);
    writeFileSync(join(dir,'report.json'),JSON.stringify(res,null,1));
    const ok=fails.length===0;
    console.log(`return: ${ok?'pass':'FAIL'} won at ${res.won}, back at ${res.return_age}, stopped +${res.stop_at}, loaded +${res.load_at} (map ${res.map_after}, Goku ${res.spot}), pose +${res.pose_at}-${res.pose_done}, landed +${res.landed_at}, C7 +${res.c7_at}`);
    for(const m of fails.slice(0,10))console.log('  '+m);
    return ok;
  },
};

const rom=buildRom();
mkdirSync(out,{recursive:true});
const names=process.argv.slice(2).filter(a=>!a.startsWith('-'));
let failed=0;
const defaults=['globe','intro','fight','clash','handoff','death','return'];
for(const name of names.length?names:defaults){
  if(!cases[name]){console.log(`unknown case ${name}`);failed++;continue;}
  if(!await cases[name](rom))failed++;
}
process.exit(failed?1:0);
