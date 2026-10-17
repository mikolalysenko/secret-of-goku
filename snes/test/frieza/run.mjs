#!/usr/bin/env node
// FRIEZA module tests in Mesen, from browser-mod states imported with
// H.importSnesJs and the mod's own Frieza state written into the module's
// fields (state.mjs):
//   court     preset 'frieza': the Thanatos court (trial-taunt), Frieza's 48 px
//             sprite at the court anchor, compared with the browser frames
//   thanatos  preset 'thanatos': trial-entry with the full party
//   battle    preset 'battle': the ground fight's start position
//   node snes/test/frieza/run.mjs [case ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/frieza/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {comparePictures,snesPixels} from '../debug/compare.mjs';
import {friezaWrites,luaWrites,defs} from './state.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/frieza');
mkdirSync(outRoot,{recursive:true});
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc)){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict'],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('frieza: build failed');process.exit(1);}
}
const main=mainCheckout();
const importRoot=join(main,'.local/snes-import');
const refRoot=join(main,'.local/snes-ref');
const cps=checkpointDir();
const lib=readFileSync(join(here,'lib.lua'),'utf8');

function reference(preset){
  const st=JSON.parse(readFileSync(join(refRoot,preset,'state.json'),'utf8'));
  return st.goku;
}

// Import a preset, write its Frieza state, then shoot at the reference
// frame offsets (a window of frames around each, as the two emulators'
// frame phases differ by a frame or two).
function sceneTest(preset,frames){
  const g=reference(preset);
  const writes=friezaWrites(g.frieza,g.challenge);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__'+preset))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)          -- !persist_goku_active (not part of browser bundles)
  F.apply(${luaWrites(writes)})
  local shots = {}
  local boxes = {}
  local trace = {}
  local frame = 0
  local targets = {${frames.join(',')}}
  local t = 1
  while t <= #targets do
    local target = targets[t]
    H.wait(1)
    frame = frame + 1
    if TRACE then
      trace[#trace + 1] = string.format('%d %d %d %d %d %d %d', frame, H.r16(0x7E0000|0x${defs.fzf_x.toString(16)}), H.r16(0x7E0000|0x${defs.fzf_y.toString(16)}),
        H.r16(0x${(defs.fzs_wkind).toString(16)}) & 0xFF, H.r16(0x7EE182), H.r16(0x7E0000|0x${defs.fzf_hp_lo.toString(16)}) | (H.r8(0x7E0000|0x${defs.fzf_hp_hi.toString(16)}) << 16), H.r16(0x7E0000|0x${defs.fzf_clock.toString(16)}))
    end
    if frame >= target - 2 and frame <= target + 2 then
      local name = string.format('f%05d', frame)
      H.shot(name)
      local b = F.box()
      boxes[name] = b or false
      shots[#shots + 1] = name
    end
    if frame >= target + 2 then t = t + 1 end
  end
  H.result('shots', shots)
  H.result('boxes', boxes)
  H.result('trace', trace)
  H.result('hp', H.r16(0x7EE182))
  H.result('scene', F.ram(0x${defs.fz_scene.toString(16)}|0x7E0000))
  H.result('age', F.ram16(0x${defs.fz_sage.toString(16)}|0x7E0000))
  H.result('stage', F.ram(0x${(defs.fzp_stage).toString(16)}))
  F.done()
end
`;
}

// Test ROM with the FRIEZA_TEST mailbox (combat's virtual hits).
const testRom=resolve(repo,'.local/snes-test/roms/frieza-test.sfc');
function buildTestRom(){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${testRom}`,'-DFRIEZA_TEST=1'],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('frieza: test build failed');process.exit(1);}
}

// The first power surge: Goku's hits (through the virtual-hit API combat
// will call) take Frieza to 64,000; the surge holds the fight 380 frames,
// he turns muscular at 270, then phase two begins (tier 1).
function surgeTest(){
  const g=reference('battle');
  const writes=friezaWrites(g.frieza,g.challenge);
  const v=n=>'0x'+(n<0x10000?(0x7E0000|n):n).toString(16);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__battle'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  H.wait(2)
  local function hit(dmg, melee)
    H.w16(${v(defs.fzs_test)}+2, dmg)
    H.w16(${v(defs.fzs_test)}, melee and 1 or 2)
    H.wait(1)
    return H.r16(${v(defs.fzs_test)}+4)
  end
  local function hp() return H.r16(${v(defs.fzf_hp_lo)}) | (H.r8(${v(defs.fzf_hp_hi)}) << 16) end
  -- a punch of 4095 (base damageScale) takes 15%: 614
  local taken = hit(4095, true)
  H.result('punch', taken)
  F.check(taken == 614, 'a 4095 punch takes 614 (15%), got ' .. tostring(taken))
  -- ki/beam hits until the threshold: one more cannot cross 64,000
  for i = 1, 40 do hit(60000, false) if hp() <= 64000 then break end end
  H.result('hpAtSurge', hp())
  F.check(hp() == 64000, 'HP stops at the 64,000 threshold, got ' .. hp())
  H.wait(2)
  local surge = H.r8(${v(defs.fzs_surge)})
  F.check(surge == 1, 'the first surge started, got ' .. surge)
  H.shot('surge-0')
  H.wait(268)
  F.check((H.r8(${v(defs.fzf_flags)}) & ${defs.FZFF_MUSCULAR}) ~= 0, 'muscular at 270')
  H.shot('surge-270')
  H.wait(120)
  F.check(H.r8(${v(defs.fzs_surge)}) == 0, 'the surge ended after 380 frames')
  F.check(H.r8(${v(defs.fzf_tier)}) == 1, 'phase two (tier 1)')
  H.result('holes', H.r16(${v(defs.fzs_holes_n)}))
  F.check(H.r16(${v(defs.fzs_holes_n)}) > 0, 'the floor fractured')
  H.shot('phase2')
  F.done()
end
`;
}

// A finale death: Goku at 1 HP takes the first Death Orb. The native death
// plays (no all-party-dead warp, event 7FF is gated), the screen fades out
// from 300 to 360 frames and holds black; Start returns to the title.
function deathTest(){
  const g=reference('battle');
  const writes=friezaWrites(g.frieza,g.challenge);
  const v=n=>'0x'+(n<0x10000?(0x7E0000|n):n).toString(16);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__battle'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  H.w16(0x7EE182, 1)
  local died = H.waitFor(function() return H.r8(${v(defs.fzd_on)}) ~= 0 end, 400)
  F.check(died, 'the death sequence started')
  H.result('diedAt', H.frame)
  H.wait(60)
  H.shot('death-60')
  F.check(H.r16(0x7E00DC) == 246, 'still in the arena (no wake-up warp)')
  H.wait(240)
  H.shot('death-300')
  H.wait(70)
  local bright = H.r8(0x7E00E6) & 0x0F
  H.result('brightness', bright)
  F.check(bright == 0, 'black after 360 frames, brightness ' .. bright)
  F.check(H.r16(0x7E00DC) == 246, 'still in the arena at black')
  H.hold('start', 4)
  H.wait(90)
  local pc = emu.getState()['cpu.k']
  H.result('bankAfterStart', pc)
  F.done()
end
`;
}

// The ground stand-in for the last phase (no orbit stream in the build):
// at tier 2 Frieza has no HP floor; his fall plays Mantis Ant's beat
// (flashes, bursts, whiteout, fanfare, chime) and then the victory event
// C7, whose hooks recover the pouch (stage defeated).
function victoryTest(){
  const g=reference('battle');
  const writes=friezaWrites(g.frieza,g.challenge);
  const v=n=>'0x'+(n<0x10000?(0x7E0000|n):n).toString(16);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__battle'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  H.w8(${v(defs.fzf_tier)}, 2)
  H.w16(${v(defs.fzf_hp_lo)}, 500)
  H.w16(${v(defs.fzf_hp_hi)}, 0)
  H.wait(2)
  H.w16(${v(defs.fzs_test)}+2, 60000)
  H.w16(${v(defs.fzs_test)}, 2)
  H.wait(2)
  F.check(H.r8(${v(defs.fzp_stage)}) == ${defs.FZST_WON}, 'stage won after the fatal hit')
  F.check(H.r8(${v(defs.fzv_on)}) == 1, 'the victory beat runs')
  H.wait(100)
  H.shot('victory-100')
  H.wait(300)
  H.result('white400', H.r8(${v(defs.fzv_white)}))
  F.check(H.r8(${v(defs.fzv_white)}) == 31, 'white at 400')
  H.shot('victory-400')
  local done = H.waitFor(function() return H.r8(${v(defs.fzp_stage)}) == ${defs.FZST_DEFEATED} end, 1500)
  F.check(done, 'event C7 ran: stage defeated')
  H.result('defeatedAt', H.frame)
  H.result('pouch', H.r8(0x316041))
  H.shot('victory-after')
  F.done()
end
`;
}

const cases={
  court:{preset:'frieza',frames:[60,240,600]},
  thanatos:{preset:'thanatos',frames:[60,240]},
  battle:{preset:'battle',frames:[60,240,600],trace:true,
    // browser: the first Death Orb hits Goku by frame 240 (999 -> 844, 310
    // halved), the disc by 600 (729)
    hp:{240:844,600:729}},
};

const results=[];
if(want('surge')){
  buildTestRom();
  const rom=privateRom(testRom,'frieza-surge');
  const r=await runMesen({rom,test:lib+'\n'+surgeTest(),outDir:join(outRoot,'surge'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const ok=r.code===0&&res.pass===true;
  results.push({name:'surge',ok,failures});
  console.log(`frieza surge: ${ok?'pass':'FAIL'} (${r.ms} ms) punch ${res.punch} hp at surge ${res.hpAtSurge} holes ${res.holes}`);
  if(!ok)for(const f of failures)console.log('    !',f);
}
if(want('victory')){
  buildTestRom();
  const rom=privateRom(testRom,'frieza-victory');
  const r=await runMesen({rom,test:lib+'\n'+victoryTest(),outDir:join(outRoot,'victory'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const ok=r.code===0&&res.pass===true;
  results.push({name:'victory',ok,failures});
  console.log(`frieza victory: ${ok?'pass':'FAIL'} (${r.ms} ms) white ${res.white400} defeated at ${res.defeatedAt} ledger ${res.pouch}`);
  if(!ok)for(const f of failures)console.log('    !',f);
}
if(want('death')){
  const rom=privateRom(romSrc,'frieza-death');
  const r=await runMesen({rom,test:lib+'\n'+deathTest(),outDir:join(outRoot,'death'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const ok=r.code===0&&res.pass===true;
  results.push({name:'death',ok,failures});
  console.log(`frieza death: ${ok?'pass':'FAIL'} (${r.ms} ms) died at frame ${res.diedAt}, brightness ${res.brightness}, bank after Start ${res.bankAfterStart}`);
  if(!ok)for(const f of failures)console.log('    !',f);
}
for(const [name,c] of Object.entries(cases)){
  if(!want(name))continue;
  const rom=privateRom(romSrc,`frieza-${name}`);
  const out=join(outRoot,name);
  const r=await runMesen({rom,test:lib+'\n'+(c.trace?'TRACE=true\n':'')+sceneTest(c.preset,c.frames),outDir:out,state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  // Compare each reference frame with the best of its window.
  const notes=[];
  for(const f of c.frames){
    const ref=join(refRoot,c.preset,`frame-${String(f).padStart(5,'0')}.png`);
    if(!existsSync(ref))continue;
    let best=null;
    for(let d=-2;d<=2;d++){
      const shot=join(out,`f${String(f+d).padStart(5,'0')}.png`);
      if(!existsSync(shot))continue;
      const score=comparePictures(ref,shot,join(out,`compare-${f}${d>=0?'+':''}${d}.png`));
      if(score!==null&&(!best||score>best.score))best={score,d,box:res.boxes?.[`f${String(f+d).padStart(5,'0')}`]};
    }
    if(best){
      notes.push(`frame ${f}: ${(best.score*100).toFixed(1)}% (shift ${best.d})`+(best.box?` frieza ${best.box.n} OBJ at ${best.box.x0},${best.box.y0}-${best.box.x1},${best.box.y1} pal ${best.box.pal}`:' no frieza OBJ'));
      if(!best.box&&c.expectFrieza!==false)failures.push(`frame ${f}: Frieza not drawn`);
    }
  }
  if(res.trace)writeFileSync(join(out,'trace.txt'),'frame x y warning gokuHP friezaHP clock\n'+res.trace.join('\n')+'\n');
  if(c.hp&&res.trace){
    for(const [f,want] of Object.entries(c.hp)){
      const row=res.trace.find(l=>l.startsWith(f+' '));
      const got=row?Number(row.split(' ')[4]):null;
      notes.push(`Goku HP at ${f}: ${got} (browser ${want})`);
      if(got!==want)failures.push(`Goku HP at frame ${f}: ${got}, browser ${want}`);
    }
  }
  const ok=r.code===0&&res.pass===true&&failures.length===0;
  results.push({name,ok,failures,notes});
  console.log(`frieza ${name}: ${ok?'pass':'FAIL'} (${r.ms} ms) scene ${res.scene} age ${res.age} stage ${res.stage}`);
  for(const n of notes)console.log('   ',n);
  if(!ok)for(const f of failures)console.log('    !',f);
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
