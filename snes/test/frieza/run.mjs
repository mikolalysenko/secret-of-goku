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
// The browser switches music cues at once; the cartridge's native loader
// holds the game loop while a song uploads (audio.md, Load time: 37-55
// frames for Frieza's cues after an import). Scene comparisons start with
// the preset's cue marked as already playing so the frames stay aligned
// with the references; the music case checks the cue itself.
const presetCue={frieza:defs.FZM_ARRIVAL,thanatos:defs.FZM_ARRIVAL,battle:defs.FZM_BATTLE};
function holdMusic(preset){
  return `H.w8(0x${(0x7E0000|defs.fz_music).toString(16)}, ${presetCue[preset]??0})`;
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
  ${holdMusic(preset)}
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
  ${holdMusic('battle')}
  H.wait(2)
  local function hit(dmg, melee)
    H.w16(${v(defs.fzs_test)}+2, dmg)
    H.w16(${v(defs.fzs_test)}, melee and 1 or 2)
    H.waitFor(function() return H.r16(${v(defs.fzs_test)}) == 0 end, 30)
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
  ${holdMusic('battle')}
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
  ${holdMusic('battle')}
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

// Floor fractures (frieza-arena.js fractureFortress) at chosen points and
// radii, compared cell for cell with the browser's function (every cell
// landable, as without the flight module).
async function fractureTest(){
  const arena=await import(join(repo,'engine/frieza-arena.js'));
  const g=reference('battle');
  const writes=friezaWrites(g.frieza,g.challenge);
  const v=n=>'0x'+(n<0x10000?(0x7E0000|n):n).toString(16);
  const shots=[[280,400,34],[263,377,20],[301,413,28],[220,444,26],[340,376,19],[350,420,32],[200,360,29]];
  const a=arena.newFriezaArena();
  for(const [x,y,r] of shots)arena.fractureFortress(a,x,y,r,()=>true);
  const want=[...arena.arenaHoles(a)].sort((p,q)=>p-q);
  const lua=`
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__battle'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  ${holdMusic('battle')}
  H.wait(2)
  for _, s in ipairs({${shots.map(([x,y,r])=>`{${x},${y},${r}}`).join(',')}}) do
    H.w16(${v(defs.fzs_test)}+2, s[1])
    H.w16(${v(defs.fzs_test)}+8, s[2])
    H.w16(${v(defs.fzs_test)}+10, s[3])
    H.w16(${v(defs.fzs_test)}, 3)
    F.check(H.waitFor(function() return H.r16(${v(defs.fzs_test)}) == 0 end, 30), 'fracture command taken')
  end
  H.wait(4)
  local cells = {}
  for row = 0, 63 do
    for col = 0, 15 do
      local b = H.r8(${v(defs.FZ_HOLES)} + row * 16 + col)
      for bit = 0, 7 do
        if (b >> bit) & 1 == 1 then cells[#cells + 1] = row * 256 + col * 8 + bit end
      end
    end
  end
  H.result('cells', cells)
  -- the broken floor on the screen: the hole tiles in VRAM before any
  -- BG1 entry points at them, every listed row written
  H.wait(24)
  local tiles = {${holeTiles().join(',')}}
  local same = true
  for i = 1, #tiles do
    if emu.read(0x1C00 * 2 + i - 1, emu.memType.snesVideoRam) ~= tiles[i] then same = false end
  end
  F.check(same, 'hole tiles in VRAM')
  F.check(H.r8(${v(defs.fzh_tiles)}) == 2, 'hole tiles marked resident')
  local rows = H.r16(${v(defs.fzh_wcount)})
  F.check(rows > 0 and H.r16(${v(defs.fzh_wcursor)}) == rows, 'hole rows written')
  local vr = function(a) return emu.read(a * 2, emu.memType.snesVideoRam) | (emu.read(a * 2 + 1, emu.memType.snesVideoRam) << 8) end
  local bad = 0
  for i = 0, rows - 1 do
    local a = H.r16(${v(defs.FZ_HWRITE)} + i * 6)
    if vr(a) ~= H.r16(${v(defs.FZ_HWRITE)} + i * 6 + 2) or vr(a + 1) ~= H.r16(${v(defs.FZ_HWRITE)} + i * 6 + 4) then bad = bad + 1 end
  end
  F.check(bad == 0, 'BG1 entries of the visible holes')
  H.result('holeRows', rows)
  H.shot('fractures')
  F.done()
end
`;
  return {lua,want};
}
// frieza_hole_tiles from the generated data (16 tiles, 512 bytes).
function holeTiles(){
  const asm=readFileSync(join(repo,'dist/snes/gen/frieza/data.asm'),'utf8').split('\n');
  const at=asm.indexOf('frieza_hole_tiles:');
  const out=[];
  for(let i=at+1;i<asm.length&&out.length<512;i++){
    const m=asm[i].match(/^\s*db\s+(.*)$/);if(!m)break;
    for(const b of m[1].split(','))out.push(parseInt(b.trim().replace('$','0x')));
  }
  if(out.length!==512)throw Error('frieza_hole_tiles: '+out.length+' bytes');
  return out;
}

// Music: the battle preset without the held cue. Frieza's battle theme
// must become the current song ($1E05 = $3C, audio's FRIEZA_BATTLE); the
// load holds the game loop (reported, audio.md Load time).
function musicTest(){
  const g=reference('battle');
  const writes=friezaWrites(g.frieza,g.challenge);
  const sym=readFileSync(romSrc.replace(/\.sfc$/,'.sym'),'utf8').split('\n');
  const line=sym.find(l=>l.endsWith(' modules_field_frame'));
  const [bank,off]=line.split(' ')[0].split(':');
  const at=parseInt(bank,16)*65536+parseInt(off,16);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__battle'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  local frames = {}
  emu.addMemoryCallback(function() frames[#frames + 1] = H.frame end, emu.callbackType.exec, ${at}, ${at}, emu.cpuType.snes, emu.memType.snesMemory)
  local start = H.frame
  local playing = H.waitFor(function() return H.r8(0x7E1E05) == 0x3C end, 200)
  F.check(playing, 'Frieza battle theme is the current song')
  H.result('songAt', H.frame - start)
  H.wait(120)
  local stall = 0
  for i = 2, #frames do stall = math.max(stall, frames[i] - frames[i - 1] - 1) end
  H.result('stall', stall)
  H.result('cue', H.r8(0x${(0x7E0000|defs.fz_music).toString(16)}))
  F.check(H.r8(0x${(0x7E0000|defs.fz_music).toString(16)}) == ${defs.FZM_BATTLE}, 'battle cue recorded')
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
if(want('fracture')){
  buildTestRom();
  const {lua,want:cellsWant}=await fractureTest();
  const rom=privateRom(testRom,'frieza-fracture');
  const r=await runMesen({rom,test:lib+'\n'+lua,outDir:join(outRoot,'fracture'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const got=(res.cells??[]).slice().sort((p,q)=>p-q);
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const same=got.length===cellsWant.length&&got.every((c,i)=>c===cellsWant[i]);
  if(!same)failures.push(`cells differ: cartridge ${got.length} [${got.slice(0,12).join(',')}...], browser ${cellsWant.length} [${cellsWant.slice(0,12).join(',')}...]`);
  const ok=r.code===0&&res.pass===true&&same;
  results.push({name:'fracture',ok,failures});
  console.log(`frieza fracture: ${ok?'pass':'FAIL'} (${r.ms} ms) ${got.length} cells (browser ${cellsWant.length})`);
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
if(want('music')){
  const rom=privateRom(romSrc,'frieza-music');
  const r=await runMesen({rom,test:lib+'\n'+musicTest(),outDir:join(outRoot,'music'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const ok=r.code===0&&res.pass===true;
  results.push({name:'music',ok,failures});
  console.log(`frieza music: ${ok?'pass':'FAIL'} (${r.ms} ms) song $3C after ${res.songAt} frames, longest stall ${res.stall} frames`);
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
