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
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
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

// Scenario scenes (scenarios.mjs, browser references from capture.mjs):
// the preset bundle, the edited Frieza state, shots around each frame.
function scenarioTest(sc){
  const writes=friezaWrites(sc.frieza,sc.challenge);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__'+sc.preset))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  F.apply(${luaWrites(sc.writes??[])})
  H.w8(0x${(0x7E0000|defs.fz_music).toString(16)}, ${sc.music??0})
  local shots = {}
  local boxes = {}
  local frame = 0
  local targets = {${sc.frames.join(',')}}
  local t = 1
  while t <= #targets do
    local target = targets[t]
    H.wait(1)
    frame = frame + 1
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
  H.result('scene', F.ram(0x${defs.fz_scene.toString(16)}|0x7E0000))
  H.result('age', F.ram16(0x${defs.fz_sage.toString(16)}|0x7E0000))
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
  -- the surge counts the game's frames (a heavy frame lags the picture,
  -- not the clock): wait on its age, report the lag
  local f0 = H.frame
  local function age() return H.r16(${v(defs.fzs_sage)}) end
  H.waitFor(function() return age() >= 269 end, 600)
  F.check((H.r8(${v(defs.fzf_flags)}) & ${defs.FZFF_MUSCULAR}) == 0, 'not muscular before 270')
  H.waitFor(function() return age() >= 270 end, 10)
  H.result('lag270', (H.frame - f0) - age())
  F.check((H.r8(${v(defs.fzf_flags)}) & ${defs.FZFF_MUSCULAR}) ~= 0, 'muscular at 270')
  H.shot('surge-270')
  H.waitFor(function() return H.r8(${v(defs.fzs_surge)}) == 0 or age() > 380 end, 400)
  F.check(H.r8(${v(defs.fzs_surge)}) == 0 and age() == 380, 'the surge ended at 380, age ' .. age())
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
// With the ending module in the build its fatal sequence takes over at the
// death (ending_lose: the doomed planet and GAME OVER, its own test); the
// module's checks are the hand-off and the gated warp.
function deathTest(){
  const g=reference('battle');
  const writes=friezaWrites(g.frieza,g.challenge);
  const v=n=>'0x'+(n<0x10000?(0x7E0000|n):n).toString(16);
  const sym=readFileSync(romSrc.replace(/\.sfc$/,'.sym'),'utf8');
  const ending=/ ending_lose\n/.test(sym);
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
  if ${ending} then
    F.check(H.r8(${v(defs.fzd_on)}) == 2, 'the ending module runs the finale death')
    F.check(H.r8(${v(defs.fzd_key)}) == ${defs.FZE_FRIEZA}, 'the encounter handed over: Frieza')
    F.check((H.r8(0x7EDC88) & 0x40) ~= 0, 'ending status: fatal sequence (ES_DEFEATED)')
    H.wait(240)
    H.shot('death-300')
    F.check(H.r16(0x7E00DC) == 246, 'no warp while it runs')
    H.result('brightness', -1)
    H.result('bankAfterStart', -1)
    F.done()
    return
  end
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

// The Mana Tree pursuit end to end (tests/browser/frieza-tree.spec.mjs):
// preset 'tree' has event 5F8 requested; B is tapped every 12 frames
// through the dialogue (the save prompt answers Yes). Shots at each Tree
// scene's start and at chosen ages; the trace logs map, scene, age, the
// vista's state and the brightness every 8 frames.
const treeShots={[defs.FZS_TREE_ARRIVAL]:[2,48,96,110],[defs.FZS_TREE_CHARGE]:[20,60,120],[defs.FZS_TREE_SHOT]:[8,24,38],
  [defs.FZS_TREE_IMPACT]:[2,10,19,30,47,80],[defs.FZS_TREE_LEAVE]:[30,90,119],[defs.FZS_TREE_RETURN]:[10,30,47],[defs.FZS_TREE_WAKE]:[1,20,39]};
function treeTest(maxFrames=20000){
  const g=reference('tree');
  const writes=friezaWrites(g.frieza,g.challenge);
  const v=n=>'0x'+(n<0x10000?(0x7E0000|n):n).toString(16);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__tree'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  local want = {}
  ${Object.entries(treeShots).map(([k,ages])=>`want[${k}] = {${ages.map(a=>`[${a}]=true`).join(',')}}`).join('\n  ')}
  local seen, trace, shots, maps, boxes = {}, {}, {}, {}, {}
  local last = -1
  for i = 1, ${maxFrames} do
    if i % 12 == 0 then H.hold('b', 2) else H.wait(1) end
    local kind = H.r8(${v(defs.fz_scene)})
    local age = H.r16(${v(defs.fz_sage)})
    local map = H.r16(0x7E00DC)
    maps[map] = true
    if kind ~= last then
      seen[#seen + 1] = string.format('%d:%d@%d', kind, map, i)
      last = kind
    end
    if want[kind] and want[kind][age] then
      local name = string.format('k%02d-a%03d', kind, age)
      if not shots[name] then
        H.shot(name); shots[name] = true
        local b = F.box()
        boxes[#boxes + 1] = string.format('%s %s px %d py %d id %d cnt %d pal %d', name,
          b and string.format('%d OBJ %d,%d-%d,%d', b.n, b.x0, b.y0, b.x1, b.y1) or 'no-frieza',
          H.r16(${v(defs.fz_px)}), H.r16(${v(defs.fz_py)}), H.r16(${v(defs.fz_spr_id)}), H.r8(${v(defs.fz_spr_cnt)}), H.r8(${v(defs.fz_spr_pal)}))
      end
    end
    if i % 8 == 0 then
      trace[#trace + 1] = string.format('%d %d %d %d %d %d %d %d %d', i, map, kind, age, H.r8(0x7E00D0),
        H.r8(${v(defs.fzt_up)}), H.r8(${v(defs.fz_vista)}), H.r8(0x7E00E6) & 0x0F, H.r8(${v(defs.fzp_tree)}))
    end
    if H.r8(${v(defs.fzp_tree)}) == ${defs.FZTR_COMPLETE} and kind == 0 and H.r8(0x7E00D0) == 0 and i > 200 then
      H.wait(30)
      H.shot('complete')
      break
    end
  end
  local mapList = {}
  for m in pairs(maps) do mapList[#mapList + 1] = m end
  table.sort(mapList)
  H.result('seen', seen)
  H.result('boxes', boxes)
  H.result('trace', trace)
  H.result('maps', mapList)
  H.result('tree', H.r8(${v(defs.fzp_tree)}))
  F.check(H.r8(${v(defs.fzp_tree)}) == ${defs.FZTR_COMPLETE}, 'the Tree is complete')
  F.done()
end
`;
}

// Door 3FC (the altar room's entry, record C8:3FF0 = AF 1D 3C 8B: map 431
// at tile (14, 30)): while the Emperor is present the party enters beside
// him (byte 2 = 36: tile y 18); after his death the native record stands.
// The door event is requested through the story module's request block.
function storyRequestBlock(rom){
  const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
  const m=sym.match(/^([0-9A-F]{2}):([0-9A-F]{4}) story_addresses$/mi);
  if(!m)throw Error('frieza door: no story_addresses symbol');
  const bytes=readFileSync(rom),a=parseInt(m[1]+m[2],16)+6;
  const at=x=>bytes[((x>>16)&0x3f)<<16|(x&0xffff)];
  return at(a)|at(a+1)<<8|at(a+2)<<16;
}
function doorTest(killed){
  const g=reference('intro');
  const writes=friezaWrites({...g.frieza,stage:'theft',emperorKilled:killed},g.challenge);
  const ram=storyRequestBlock(romSrc);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__intro'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  H.wait(4)
  H.w16(${ram+8}, 0x0BFC)
  H.w16(${ram+10}, 0)
  H.w8(${ram+6}, 1)
  H.wait(240)
  H.result('map', H.r16(0x7E00DC))
  H.result('y', H.r16(0x7EE004))
  H.result('x', H.r16(0x7EE002))
  H.shot('arrived')
  F.check(H.r16(0x7E00DC) == 431, 'door 3FC loads map 431')
  F.done()
end
`;
}

// Core's scene-scoped VRAM pool: Frieza draws only while !VRAM_SCENE_OBJ
// is free or his (owner !FZ_VRAM_OWNER), claims it on the frames he is
// drawn and gives it back when his scene ends.
function coreDefine(name){
  const dir=join(repo,'snes/src/core'),src=readdirSync(dir).filter(f=>f.endsWith('.asm')).map(f=>readFileSync(join(dir,f),'utf8')).join('\n');
  const val=n=>{const m=src.match(new RegExp(`^!${n}\\s*=\\s*([^;\\n]+)`,'m'));if(!m)throw Error(`frieza: core define ${n} missing`);
    return Function(`return (${m[1].trim().replace(/!(\w+)/g,(_,k)=>val(k)).replace(/\$([0-9A-Fa-f]+)/g,'0x$1')})`)();};
  return val(name);
}
function vramTest(){
  const g=reference('frieza');
  const writes=friezaWrites(g.frieza,g.challenge);
  const owner=coreDefine('core_vram_owner')+2*coreDefine('VRAM_SCENE_OBJ'),sceneOwner=coreDefine('core_scene_owner');
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__frieza'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  F.apply(${luaWrites(writes)})
  ${holdMusic('frieza')}
  H.w16(${owner}, 9)                -- another scene holds the region
  H.wait(60)
  F.check(F.box() == nil, 'not drawn while another owner holds the region')
  F.check(H.r16(${owner}) == 9, 'the other claim stands')
  H.w16(${owner}, 0)
  H.wait(6)
  F.check(F.box() ~= nil, 'drawn once the region is free')
  F.check(H.r16(${owner}) == ${defs.FZ_VRAM_OWNER}, 'claimed by Frieza while drawn, owner ' .. H.r16(${owner}))
  -- core's scene SRAM: another set piece holds it, Frieza draws nothing and
  -- leaves it alone; once free he claims it again
  H.w16(${sceneOwner}, ${coreDefine('SCENE_VEGETA')})
  H.wait(4)
  F.check(F.box() == nil, 'not drawn while another set piece holds the scene SRAM')
  F.check(H.r16(${sceneOwner}) == ${coreDefine('SCENE_VEGETA')}, 'the other scene claim stands')
  H.w16(${sceneOwner}, 0)
  H.wait(6)
  F.check(F.box() ~= nil, 'drawn once the scene SRAM is free')
  F.check(H.r16(${sceneOwner}) == ${coreDefine('SCENE_FRIEZA')}, 'scene SRAM claimed by Frieza, owner ' .. H.r16(${sceneOwner}))
  H.w8(${0x7E0000|defs.fz_scene}, 0)  -- the scene ends
  H.wait(3)
  F.check(H.r16(${owner}) == 0, 'VRAM given back when the scene ends, owner ' .. H.r16(${owner}))
  F.done()
end
`;
}

// Quiet cost: with nothing of Frieza's running (Potos, Goku present), the
// field frame takes the quiet path and the vblank its early-out. Measured
// from the dispatcher's JSL to the instruction after it, in master clocks
// (1364 a scanline), over 600 frames.
function jslSite(rom,dispatch,target){
  const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8'),bytes=readFileSync(rom);
  const addr=n=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${n}$`,'mi'));if(!m)throw Error(`frieza cost: no ${n}`);return parseInt(m[1]+m[2],16);};
  const at=a=>bytes[((a>>16)&0x3f)<<16|(a&0xffff)];
  const t=addr(target)&0x3fffff;
  for(let a=addr(dispatch),i=0;i<256;i++,a++)if(at(a)===0x22&&((at(a+1)|at(a+2)<<8|at(a+3)<<16)&0x3fffff)===t)return a;
  throw Error(`frieza cost: no JSL ${target} in ${dispatch}`);
}
function costTest(rom,frames=600){
  const fJ=jslSite(rom,'modules_field_frame','frieza_field_frame'),nJ=jslSite(rom,'modules_field_nmi','frieza_field_nmi');
  const cb=(at,body)=>`emu.addMemoryCallback(function() ${body} end, emu.callbackType.exec, ${at}, ${at}, emu.cpuType.snes, emu.memType.snesMemory)`;
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'emulator-probe__potos-state'))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)
  H.wait(30)
  local fs, ns, f0, n0 = {}, {}, nil, nil
  local function clock() return emu.getState()['masterClock'] end
  ${cb(fJ,'f0 = clock()')}
  ${cb(fJ+4,'if f0 then fs[#fs + 1] = clock() - f0 f0 = nil end')}
  ${cb(nJ,'n0 = clock()')}
  ${cb(nJ+4,'if n0 then ns[#ns + 1] = clock() - n0 n0 = nil end')}
  H.wait(${frames})
  local function stats(t)
    local sum, mx = 0, 0
    for _, v in ipairs(t) do sum = sum + v; if v > mx then mx = v end end
    return {n = #t, avg = (#t > 0) and (sum / #t / 1364) or 0, max = mx / 1364}
  end
  H.result('frame', stats(fs))
  H.result('nmi', stats(ns))
  H.result('quiet', (H.r8(${0x7E0000|defs.fz_wasidle}) & ${defs.FZI_IDLE}) ~= 0)
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
  console.log(`frieza surge: ${ok?'pass':'FAIL'} (${r.ms} ms) punch ${res.punch} hp at surge ${res.hpAtSurge} holes ${res.holes}, ${res.lag270} lag frames by surge age 270`);
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
if(want('cost')){
  const rom=privateRom(romSrc,'frieza-cost');
  const r=await runMesen({rom,test:lib+'\n'+costTest(romSrc),outDir:join(outRoot,'cost'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const fr=res.frame??{},nm=res.nmi??{};
  if(!res.quiet)failures.push('the module did not settle on the quiet path');
  if(!(fr.avg<=0.36))failures.push(`quiet field frame ${fr.avg?.toFixed(3)} lines on average (budget 0.36)`);
  if(!(fr.max<=2.5))failures.push(`quiet field frame peaks at ${fr.max?.toFixed(2)} lines (budget 2.5)`);
  if(!(nm.avg<=0.13))failures.push(`quiet vblank ${nm.avg?.toFixed(3)} lines (budget 0.13)`);
  const ok=r.code===0&&res.pass===true&&failures.length===0;
  results.push({name:'cost',ok,failures});
  console.log(`frieza cost: ${ok?'pass':'FAIL'} (${r.ms} ms) frame ${fr.avg?.toFixed(3)} lines (max ${fr.max?.toFixed(2)}), vblank ${nm.avg?.toFixed(3)} lines, ${fr.n} frames`);
  if(!ok)for(const f of failures)console.log('    !',f);
}
if(want('vram')){
  const rom=privateRom(romSrc,'frieza-vram');
  const r=await runMesen({rom,test:lib+'\n'+vramTest(),outDir:join(outRoot,'vram'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  const ok=r.code===0&&res.pass===true;
  results.push({name:'vram',ok,failures});
  console.log(`frieza vram: ${ok?'pass':'FAIL'} (${r.ms} ms)`);
  if(!ok)for(const f of failures)console.log('    !',f);
}
if(want('door')){
  // tile y 18 beside the living Emperor, 30 (native) after his death
  for(const [killed,tile] of [[false,18],[true,30]]){
    const rom=privateRom(romSrc,`frieza-door-${killed?'native':'emperor'}`);
    const r=await runMesen({rom,test:lib+'\n'+doorTest(killed),outDir:join(outRoot,'door-'+(killed?'native':'emperor')),state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const res=r.results??{};
    const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
    const got=(res.y+14)>>4;                    // the door puts the leader at y = tile * 16 - 14
    if(got!==tile)failures.push(`Goku at tile y ${got} (${res.x},${res.y}), want ${tile}`);
    const ok=r.code===0&&res.pass===true&&failures.length===0;
    const name=`door-${killed?'native':'emperor'}`;
    results.push({name,ok,failures});
    console.log(`frieza ${name}: ${ok?'pass':'FAIL'} (${r.ms} ms) map ${res.map} at (${res.x},${res.y}) tile y ${got}`);
    if(!ok)for(const f of failures)console.log('    !',f);
  }
}
if(want('tree')){
  const rom=privateRom(romSrc,'frieza-tree');
  const out=join(outRoot,'tree');
  const r=await runMesen({rom,test:lib+'\n'+treeTest(),outDir:out,state:join(cps,'waterfall.mss'),timeoutMs:1500000});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  if(res.trace)writeFileSync(join(out,'trace.txt'),'frame map scene age D0 up vista bright tree\n'+res.trace.join('\n')+'\n');
  if(res.boxes)writeFileSync(join(out,'boxes.txt'),res.boxes.join('\n')+'\n');
  const ok=r.code===0&&res.pass===true;
  results.push({name:'tree',ok,failures});
  console.log(`frieza tree: ${ok?'pass':'FAIL'} (${r.ms} ms) maps ${(res.maps??[]).join(',')} scenes ${(res.seen??[]).join(' ')} tree ${res.tree}`);
  if(!ok)for(const f of failures)console.log('    !',f);
}
// Scene effects against the browser (run capture.mjs first).
const scenarioRoot=resolve(process.env.FRIEZA_REFS??join(repo,'.local/snes-ref-frieza'));
if(want('effects')&&existsSync(scenarioRoot)){
  const {scenarios}=await import('./scenarios.mjs');
  for(const name of Object.keys(scenarios)){
    const file=join(scenarioRoot,name,'scenario.json');
    if(!existsSync(file))continue;
    const sc={...JSON.parse(readFileSync(file,'utf8')),music:scenarios[name].music,writes:scenarios[name].writes};
    const rom=privateRom(romSrc,`frieza-fx-${name}`);
    const out=join(outRoot,'effects',name);
    const r=await runMesen({rom,test:lib+'\n'+scenarioTest(sc),outDir:out,state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const res=r.results??{};
    const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
    const notes=[];
    for(const f of sc.frames){
      const ref=join(scenarioRoot,name,`frame-${String(f).padStart(5,'0')}.png`);
      let best=null;
      for(let d=-2;d<=2;d++){
        const shot=join(out,`f${String(f+d).padStart(5,'0')}.png`);
        if(!existsSync(shot))continue;
        const score=comparePictures(ref,shot,join(out,`compare-${f}${d>=0?'+':''}${d}.png`));
        if(score!==null&&(!best||score>best.score))best={score,d};
      }
      if(best)notes.push(`frame ${f}: ${(best.score*100).toFixed(1)}% (shift ${best.d})`);
    }
    const ok=r.code===0&&res.pass===true&&failures.length===0;
    results.push({name:'effects:'+name,ok,failures,notes});
    console.log(`frieza effects ${name}: ${ok?'pass':'FAIL'} (${r.ms} ms) scene ${res.scene} age ${res.age}`);
    for(const n of notes)console.log('   ',n);
    if(!ok)for(const f of failures)console.log('    !',f);
  }
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
