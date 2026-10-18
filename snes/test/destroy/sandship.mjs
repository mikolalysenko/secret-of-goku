// Sandship runtime scenarios (snes/src/modules/destroy/sandship.asm), in
// Mesen from the browser mod's own Sandship states. Expectations follow
// tests/browser/sandship.spec.mjs (the browser's behaviour) and, where the
// browser left a state behind, its bytes (e.g. the wreck's monster records
// in sandship-wreck__final__wreck).
//   SNES_ROM=... node snes/test/destroy/sandship.mjs [scenario ...]
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {destroyAbi} from './abi.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

function importDir(){
  if(process.env.SNES_IMPORT)return resolve(process.env.SNES_IMPORT);
  const local=resolve(repo,'.local/snes-import');
  if(existsSync(local))return local;
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  return r.status===0?resolve(r.stdout.trim(),'..','.local/snes-import'):local;
}
const lua=v=>typeof v==='string'?JSON.stringify(v):typeof v==='boolean'?String(v):v===undefined||v===null?'nil':Array.isArray(v)?`{${v.map(lua).join(',')}}`:typeof v==='object'?`{${Object.entries(v).map(([k,y])=>`${k}=${lua(y)}`).join(',')}}`:String(v);

// Shared Lua: state reset (Mesen keeps SRAM between runs), a fresh Sandship
// block, helpers to play until Goku is back in control.
const prelude=`
S = {}
-- Native writes into the core's event request word ($7E:6E8E, inside the
-- WRAM block the core assumes free) start spurious events; report them.
-- S.shield: keep the word as it was (what a core with the word elsewhere
-- would see), for scenarios whose rooms load such graphics.
S.clobbers = {}
S.shield = false
emu.addMemoryCallback(function(a, v)
  local st = emu.getState()
  local k = st['cpu.k']
  if k < 0xA0 or k > 0xAF then
    if #S.clobbers < 8 then S.clobbers[#S.clobbers + 1] = string.format('%06X=%02X by %02X:%04X map %d', a, v, k, st['cpu.pc'], H.r16(0x7E00DC)) end
    H.result(S.shield and 'shielded' or 'clobbers', S.clobbers)
    if S.shield then return H.r8(a) end
  end
end, emu.callbackType.write, 0x7E6E8E, 0x7E6E8F)
function S.reset()
  D.garbage()
  H.w8(ABI.P_DOORS, 0); H.w8(ABI.P_TREE, 0)
  for a = ABI.SS, ABI.ss_end - 1 do H.w8(a, 0) end
  H.w8(ABI.persist_goku_active, 1)          -- Goku has arrived (the states are his)
end
-- Goku in control: idle field, no white-out running.
function S.control() return D.ground() and H.r16(ABI.ss_cut) == 0 and (H.r8(0x7EE000) & 1) == 1 end
-- Play until Goku is back in control (B taps through dialogue; quiet: no
-- taps, for scripts without text, where a late tap would make him dash).
function S.untilControl(limit, quiet)
  for f = 1, limit or 6000 do
    if not quiet and H.r8(0x7E00D0) ~= 0 and f % 20 == 0 then H.tap('b', 2, 0) else H.wait(1) end
    if f > 120 and S.control() then return f end
  end
  return -1
end
function S.species(list)
  local n = 0
  for i = 0, 11 do
    local base = 0x7EE000 + i * 0x200
    if (H.r8(base) & 1) == 1 then
      local sp = H.r8(base + 0x180)
      for _, s in ipairs(list) do if s == sp then n = n + 1 end end
    end
  end
  return n
end
function S.state()
  return {map = H.r16(0x7E00DC), stage = H.r8(0x7ECF28), captives = {H.r8(0x7ECF0D), H.r8(0x7ECF0E)},
    party = {H.r8(0x7EE200) & 1, H.r8(0x7EE400) & 1}, flags = H.r16(ABI.ss_flags), cut = H.r16(ABI.ss_cut),
    flash = H.r16(ABI.ss_flash), breaks = H.r16(ABI.ss_breaks), songs = H.r16(ABI.ssw_songs), song = H.r16(ABI.ssw_lastsong),
    loads = H.r16(ABI.ssw_loads), remark = H.r16(ABI.ssw_remark), control = S.control(),
    guards = S.species({182, 183}), monsters = S.species({28, 36}), d0 = H.r8(0x7E00D0)}
end
-- The browser spec's enter(): door 3 with a one-shot record (map, tile x/y,
-- layer) through the native door loader, story flags first.
function S.enter(map, x, y, layer, flags)
  for k, v in pairs(flags or {}) do H.w8(0x7ECF00 + k, v) end
  H.w16(ABI.ssw_dbgdoor, 3)
  H.w8(ABI.ssw_dbgrec, map & 255); H.w8(ABI.ssw_dbgrec + 1, x * 2 + (map >> 8))
  H.w8(ABI.ssw_dbgrec + 2, y * 2 + (layer or 0)); H.w8(ABI.ssw_dbgrec + 3, 0)
  local ok = D.door(3, map)
  S.untilControl(600, true)
  return ok
end
-- Walk through a real door, then let any scene play out.
function S.walk(dir, frames)
  local from = H.r16(0x7E00DC)
  for f = 1, frames or 120 do
    if H.r16(0x7E00DC) ~= from then break end
    H.hold(dir, 1)
  end
  return S.untilControl(6000)
end
-- The breakout from the hold (the spec's full-power wave): Gi stowed by the
-- capture, Goku at (136, 210), the wave up.
function S.breakout()
  local slots = {H.r8(0x7EE1E0), 0x16, H.r8(0x7EE1E2), H.r8(0x7EE1E3)}
  for i, v in ipairs(slots) do H.w8(ABI.ss_gear + i - 1, v) end
  H.w16(ABI.ss_gbits, 1)
  H.w16(0x7EE002, 136); H.w16(0x7EE004, 210); H.wait(40)
  local hit = D.hit({x = 136, y = 210, dir = 3, length = 96, halfWidth = 19, taper = 0, code = 2, str = 256, id = 21})
  local white = 0
  for f = 1, 60 do H.wait(1); white = math.max(white, H.r16(ABI.ss_flash)) end
  return white, S.untilControl(6000)
end
-- Play until the given map is up with Goku in control (B taps).
function S.reach(map, limit)
  for f = 1, limit or 9000 do
    if H.r16(0x7E00DC) == map and S.control() then return f end
    if H.r8(0x7E00D0) ~= 0 and f % 20 == 0 then H.tap('b', 2, 0) else H.wait(1) end
  end
  return -1
end
function S.cmd(c, arg)
  local n = H.r16(ABI.dbg_n)
  if arg then H.w16(ABI.dbg_arg, arg) end
  H.w16(ABI.dbg_cmd, c)
  H.waitFor(function() return H.r16(ABI.dbg_n) ~= n end, 30)
  return H.r16(ABI.dbg_res)
end
-- Equipped slots of Goku, the girl and the sprite, and the armor ring.
function S.gear()
  local g = {}
  for i = 0, 2 do
    local base = 0x7EE1E0 + i * 0x200
    g[#g + 1] = {H.r8(base), H.r8(base + 1), H.r8(base + 2), H.r8(base + 3)}
  end
  local ring = {}
  for a = 0x7ECC2C, 0x7ECC37 do ring[#ring + 1] = H.r8(a) end
  return {slots = g, ring = ring}
end
-- The object records the loader copied (slots $C808+16i): flag, range, x, y, ?, species.
function S.objects()
  local out = {}
  for i = 0, 11 do
    local a = 0x7EC808 + i * 16
    out[#out + 1] = {H.r8(a), H.r8(a + 1), H.r8(a + 2), H.r8(a + 3), H.r8(a + 4), H.r8(a + 5), H.r8(a + 6), H.r8(a + 7)}
  end
  return out
end
`;

// Equipped slots and the armor ring, as the spec's gear() reads them.
export const scenarios=[
  {name:'ship-wave-hold',bundle:'sandship-wreck__qs-captured',
    note:'a full-power wave fired in the hold while captive wrecks the ship: white-out, the hold reloads with the guards gone and monsters in, the boss alarm plays, Goku gets his Gi back',
    body:`
  S.reset()
  if SCN.debug then
    local log = {}
    for name, addr in pairs(SCN.debug) do
      emu.addMemoryCallback(function()
        if #log < 400 then local st = emu.getState(); log[#log + 1] = string.format('%s a=%04X x=%04X y=%04X t2=%04X', name, st['cpu.a'], st['cpu.x'], st['cpu.y'], H.r16(ABI.SSW + 0x1A + 2)) end
      end, emu.callbackType.exec, addr, addr)
    end
    H.result('debug', log)
  end
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  -- the capture stowed Goku's Heavy Gi (22) in the armor ring
  local slots = {H.r8(0x7EE1E0), 0x16, H.r8(0x7EE1E2), H.r8(0x7EE1E3)}
  for i, v in ipairs(slots) do H.w8(ABI.ss_gear + i - 1, v) end
  H.w16(ABI.ss_gbits, 1)
  H.w16(0x7EE002, 136); H.w16(0x7EE004, 210); H.wait(40)
  H.result('before', S.state())
  -- the player's full-power wave, up the hold (the spec: Up, then L+Y)
  H.result('hit', D.hit({x = 136, y = 210, dir = 3, length = 96, halfWidth = 19, taper = 0, code = 2, str = 256, id = 21}))
  local white = 0
  for f = 1, 60 do H.wait(1); white = math.max(white, H.r16(ABI.ss_flash)) end
  H.result('white', white)
  H.result('frames', S.untilControl(6000))
  H.result('after', S.state())
  H.result('objects', S.objects())
  local list = {}
  for a = ABI.ssw_list, ABI.ssw_list + 8 + 12 * 8 - 1 do list[#list + 1] = H.r8(a) end
  H.result('list', list)
  H.result('gear', {H.r8(0x7EE1E1), H.r8(0x7EE1E0), H.r8(0x7EE1E2), H.r8(0x7EE1E3)})
  local ring = {}
  for a = 0x7ECC2C, 0x7ECC37 do ring[#ring + 1] = H.r8(a) end
  H.result('ring', ring)
  H.shot('wreck')
`,
    check(res,problems){
      const a=res.after??{};
      if(res.white!==256)problems.push(`white-out ${res.white} want 256`);
      if(res.frames<0)problems.push('control never returned');
      const want={map:271,cut:0,flash:0,guards:0,captives:[8,8],party:[0,0]};
      for(const [k,v] of Object.entries(want))if(JSON.stringify(a[k])!==JSON.stringify(v))problems.push(`${k} ${JSON.stringify(a[k])} want ${JSON.stringify(v)}`);
      if(!(a.flags&1))problems.push('not wrecked');
      if(!(a.monsters>0))problems.push('no monsters');
      if(!(a.songs>0)||a.song!==4)problems.push(`alarm song: sent ${a.songs}, last ${a.song}`);
      if(res.gear?.[0]!==0x16||!res.ring?.includes(0x56))problems.push(`Gi not back: ${JSON.stringify(res.gear)} ring ${JSON.stringify(res.ring)}`);
      // the browser's monster records for this stand (sandship-wreck__final__wreck)
      const want3=[[11,20,28],[8,3,36],[14,16,28]],got=(res.objects??[]).filter(o=>o[1]===0x0f&&o[4]===0x40).map(o=>[o[2],o[3],o[5]]);
      if(JSON.stringify(got)!==JSON.stringify(want3))problems.push(`monster records ${JSON.stringify(got)} want ${JSON.stringify(want3)} (browser)`);
    }},
];

scenarios.push(
  {name:'ship-rescues',bundle:'sandship-wreck__qs-captured',
    note:'in the wreck each captive is fetched by walking into the kitchen and the cabin; the deck then starts Geshtar and the Mech Rider (spec wreckAndEscape, party 3). The cabin\'s graphics load writes the core\'s event request word (core WRAM overlap): the word is shielded here and the writes are reported',
    body:`
  S.shield = true
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  local white, frames = S.breakout()
  H.result('wreck', S.state())
  -- the kitchen: walk up from the corridor (318)
  S.enter(318, 28, 46, 0)
  H.result('corridor', S.state())
  S.walk('up')
  H.result('kitchen', S.state())
  -- the cabin: arrive at its own door from the stairs (324); entering is
  -- enough for the rescue
  S.enter(339, 16, 19, 0)
  S.untilControl(6000)                       -- the rescue scene's dialogue
  H.result('cabin', S.state())
  S.enter(99, 24, 27, 0)
  for f = 1, 8000 do
    if H.r16(0x7E00DC) == 340 and S.control() then break end
    if H.r8(0x7E00D0) ~= 0 and f % 20 == 0 then H.tap('b', 2, 0) else H.wait(1) end
  end
  H.result('rider', S.state())
  H.shot('rider')
`,
    check(res,problems){
      const st=(k,want)=>{const a=res[k]??{};for(const [f,v] of Object.entries(want))if(JSON.stringify(a[f])!==JSON.stringify(v))problems.push(`${k}.${f} ${JSON.stringify(a[f])} want ${JSON.stringify(v)}`);};
      st('wreck',{map:271,control:true,captives:[8,8]});
      st('kitchen',{map:319,control:true,captives:[8,1]});
      st('cabin',{map:339,control:true,captives:[1,1]});
      st('rider',{map:340,control:true,stage:11,party:[1,1]});
    }},
);

// The capture stowed these (seeded: the browser kept them in its own JS
// state, which an import cannot carry).
const seedGear=`
  local stowed = {{H.r8(0x7EE1E0), 0x16, H.r8(0x7EE1E2), H.r8(0x7EE1E3)}, {0x05, 0x19, 0x31, 0x3C}, {0x06, 0x1A, 0x32, 0x40}}
  for i = 0, 2 do for j = 0, 3 do H.w8(ABI.ss_gear + i * 4 + j, stowed[i + 1][j + 1]) end end
  H.w16(ABI.ss_gbits, 7)
  H.result('stowed', stowed)
`;
scenarios.push(
  {name:'ship-crash-breaks',bundle:'sandship-wreck__qs-captured',
    note:'still sneaking: a real punch opens a hold bulkhead (one strike), four more strikes blow the ship up into Geshtar\'s Mech Rider with nobody freed; after the fight (2A1) everyone reunites on the dunes with their own gear (spec, party 3)',
    body:`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
`+seedGear+`
  -- a real punch at the hold's west bulkhead
  H.w16(0x7EE002, 72); H.w16(0x7EE004, 152); H.wait(30)
  for k = 1, 4 do D.hit({x = 72, y = 152, dir = 1, length = 28, halfWidth = 9, taper = 0, code = 0, str = 256}); H.wait(14) end
  H.wait(60)
  H.result('first', H.r16(ABI.ss_breaks))
  local said = {}
  for i = 1, 4 do
    S.cmd(6)
    for f = 1, 50 do H.wait(1); said[H.r16(ABI.ssw_remark)] = true end
  end
  local white = 0
  for f = 1, 400 do H.wait(1); white = math.max(white, H.r16(ABI.ss_flash)) end
  H.result('white', white)
  local list = {}
  for k, _ in pairs(said) do list[#list + 1] = k end
  H.result('said', list)
  H.result('frames', S.reach(340, 9000))
  H.result('fight', S.state())
  -- stand in for the fight's end: 2A1, on to the dunes
  local n = 0
  for f = 1, 60 do
    if S.control() then
      H.w16(ABI.dbg_arg, 0x2A1)
      if S.cmd(2, 0x2A1) == 1 then break end
    end
    H.wait(1)
  end
  H.result('reunion', S.reach(91, 9000))
  H.result('dunes', S.state())
  H.result('gear', S.gear())
  H.shot('dunes')
`,
    check(res,problems){
      if(!(res.first>=1))problems.push(`the punch counted ${res.first} strikes, want 1`);
      if(res.white!==256)problems.push(`white-out ${res.white}`);
      if(!(res.said??[]).includes(5))problems.push(`King Kai's STOP not said (${JSON.stringify(res.said)})`);
      const f=res.fight??{};
      for(const [k,v] of Object.entries({map:340,control:true,party:[0,0],stage:11}))if(JSON.stringify(f[k])!==JSON.stringify(v))problems.push(`fight.${k} ${JSON.stringify(f[k])} want ${JSON.stringify(v)}`);
      if(!((f.flags??0)&4))problems.push('crash ending not set');
      const d=res.dunes??{};
      for(const [k,v] of Object.entries({map:91,control:true,party:[1,1],captives:[1,1],stage:12}))if(JSON.stringify(d[k])!==JSON.stringify(v))problems.push(`dunes.${k} ${JSON.stringify(d[k])} want ${JSON.stringify(v)}`);
      if((d.flags??0)&(1|4))problems.push(`wreck/ending not closed: flags ${d.flags}`);
      const g=res.gear?.slots??[],w=res.stowed??[];
      if(JSON.stringify(g)!==JSON.stringify(w))problems.push(`gear ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
    }},
);

scenarios.push(
  {name:'ship-leave',bundle:'sandship-wreck__qs-captured',
    note:'leaving the ship some way the story did not plan (here: a door straight to the desert) blows it up behind Goku: Uh oh, the crash, Geshtar\'s Mech Rider',
    body:`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  H.w16(ABI.ssw_dbgdoor, 3)
  H.w8(ABI.ssw_dbgrec, 67); H.w8(ABI.ssw_dbgrec + 1, 40); H.w8(ABI.ssw_dbgrec + 2, 40); H.w8(ABI.ssw_dbgrec + 3, 0)
  H.result('door', D.door(3, 67))
  local white, said = 0, {}
  for f = 1, 400 do H.wait(1); white = math.max(white, H.r16(ABI.ss_flash)); said[H.r16(ABI.ssw_remark)] = true end
  H.result('white', white)
  local list = {}
  for k, _ in pairs(said) do list[#list + 1] = k end
  H.result('said', list)
  H.result('frames', S.reach(340, 9000))
  H.result('fight', S.state())
`,
    check(res,problems){
      if(res.white!==256)problems.push(`white-out ${res.white}`);
      if(!(res.said??[]).includes(4))problems.push(`'broke the whole ship' not said (${JSON.stringify(res.said)})`);
      const f=res.fight??{};
      for(const [k,v] of Object.entries({map:340,control:true,stage:11}))if(JSON.stringify(f[k])!==JSON.stringify(v))problems.push(`fight.${k} ${JSON.stringify(f[k])} want ${JSON.stringify(v)}`);
      if(((f.flags??0)&5)!==5)problems.push(`flags ${f.flags}: want wreck and crash`);
    }},
  {name:'dunes-exit',bundle:'sandship-wreck__dunes',
    note:'the dunes after the Mech Rider are a closed basin: leaving them any other way than 2A8 sets stage 14 and King Kai repeats the hint',
    body:`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  H.result('before', S.state())
  S.enter(89, 20, 20, 0)
  H.wait(30)
  H.result('after', S.state())
`,
    check(res,problems){
      if(res.before?.stage!==12)problems.push(`start stage ${res.before?.stage}`);
      if(res.after?.stage!==14)problems.push(`stage ${res.after?.stage} want 14`);
      if(res.after?.remark!==6)problems.push(`remark ${res.after?.remark} want the Fire Palace hint (6)`);
      if(res.after?.map!==89)problems.push(`map ${res.after?.map}`);
    }},
);

scenarios.push(
  {name:'ship-plan',bundle:'sandship-wreck__qs-captured',
    note:'Sergo\'s plan answered KAMEHAMEHA (event 75): the wave is armed and Goku hints at L+Y when it is quiet; the full-power wave then wrecks the ship as the planned breakout (Sergo\'s scripted reaction 78)',
    body:`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  H.w16(ABI.ssw_dbgactor, 0)
  H.result('request', S.cmd(7, 0x75))
  S.untilControl(600)
  H.wait(30)
  H.result('armed', S.state())
  local seen = {}
  for f = 1, 2 do end
  local white, frames = S.breakout()
  H.result('wreck', S.state())
`,
    check(res,problems){
      if(res.request!==1)problems.push('request 75 refused');
      const a=res.armed??{},w=res.wreck??{};
      if(!(a.flags&0x40))problems.push(`not armed (flags ${a.flags})`);
      if(a.remark!==2)problems.push(`hint remark ${a.remark} want 2`);
      if(!(w.flags&1)||!(w.flags&2))problems.push(`planned wreck flags ${w.flags}`);
      if(w.flags&0x40)problems.push('still armed after the wave');
    }},
);

// The wreck's look on the PPU (wreck.asm): CGRAM against the game's own
// palette buffer at full white, during the fade and in the wreck (alarm
// tint on BG palettes 1-7 only), and the breach's HDMA (channels 2/3, the
// window span around the breach centre, sand in CGRAM 0 on its lines).
const lookLua=`
-- CGRAM colour i and the game's buffer colour i
function S.cg(i) return H.cgram(i * 2) | (H.cgram(i * 2 + 1) << 8) end
function S.buf(i) local base = (H.r8(0x7E002A) ~= 0) and 0x7EBE00 or 0x7E0600; return H.r16(base + i * 2) & 0x7FFF end
-- summary of CGRAM vs the buffer: how many colours are white / equal, per range
function S.palette()
  local out = {white = 0, bgEqual = 0, bgDiff = 0, lowEqual = 0, objEqual = 0}
  for i = 0, 255 do
    local c, b = S.cg(i) & 0x7FFF, S.buf(i)
    if c == 0x7FFF then out.white = out.white + 1 end
    if i >= 16 and i < 128 then if c == b then out.bgEqual = out.bgEqual + 1 else out.bgDiff = out.bgDiff + 1 end
    elseif i < 16 then if c == b then out.lowEqual = out.lowEqual + 1 end
    else if c == b then out.objEqual = out.objEqual + 1 end end
  end
  return out
end
-- Colours 0-15 as the vblank upload wrote them (the game's own HDMA on
-- channels 0/1 rewrites some of them during the frame for its window, so
-- CGRAM itself cannot be compared): {written, equal} against the buffer.
function S.vblankLow(frames)
  local addr, latch, low = 0, nil, {}
  local function cb(a, v)
    if emu.getState()['ppu.scanline'] < 225 then return end
    if (a & 0xFFFF) == 0x2121 then addr = v; latch = nil
    elseif latch == nil then latch = v
    else
      if addr < 16 then low[addr] = latch | (v << 8) end
      addr = (addr + 1) & 255; latch = nil
    end
  end
  -- the CPU writes through the bank of its DB ($00 or the $80 mirror)
  local id1 = emu.addMemoryCallback(cb, emu.callbackType.write, 0x002121, 0x002122)
  local id2 = emu.addMemoryCallback(cb, emu.callbackType.write, 0x802121, 0x802122)
  for f = 1, frames or 10 do H.wait(1); if low[15] then break end end
  emu.removeMemoryCallback(id1, emu.callbackType.write, 0x002121, 0x002122)
  emu.removeMemoryCallback(id2, emu.callbackType.write, 0x802121, 0x802122)
  local out = {written = 0, equal = 0, diff = {}}
  for i = 0, 15 do
    if low[i] then
      out.written = out.written + 1
      if (low[i] & 0x7FFF) == S.buf(i) then out.equal = out.equal + 1 else out.diff[#out.diff + 1] = string.format('%d:%04X/%04X', i, low[i], S.buf(i)) end
    end
  end
  return out
end
-- fx sprites: OBJ palettes fx owns this frame and missing-cell garbage
-- ($FFFF words: tile $1FF, attribute $FF)
function S.sprites()
  local out = {garbage = 0, fire = 0, pals = {}}
  for i = 0, 127 do
    local y, t, a = H.oam(i * 4 + 1), H.oam(i * 4 + 2), H.oam(i * 4 + 3)
    if y < 224 or y >= 240 then
      if t == 0xFF and a == 0xFF then out.garbage = out.garbage + 1 end
      out.pals[((a >> 1) & 7) + 1] = true
    end
  end
  return out
end
-- tinted colour check: red never lower, blue never higher than the buffer's
function S.tintShape()
  local bad = 0
  for i = 16, 127 do
    local c, b = S.cg(i) & 0x7FFF, S.buf(i)
    if (c & 31) < (b & 31) or ((c >> 10) & 31) > ((b >> 10) & 31) then bad = bad + 1 end
  end
  return bad
end
`;
scenarios.push(
  {name:'ship-look',bundle:'sandship-wreck__qs-captured',
    note:'the breakout white-out whitens all of CGRAM (rides through the escape door), fades into the wreck: BG palettes 1-7 tinted (red up, blue down), text/HUD and sprite colours untouched; the breach shows through HDMA channels 2/3',
    body:lookLua+`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  local slots = {H.r8(0x7EE1E0), 0x16, H.r8(0x7EE1E2), H.r8(0x7EE1E3)}
  for i, v in ipairs(slots) do H.w8(ABI.ss_gear + i - 1, v) end
  H.w16(ABI.ss_gbits, 1)
  H.w16(0x7EE002, 136); H.w16(0x7EE004, 210); H.wait(40)
  H.result('before', S.palette())
  H.shot('look-0-before')
  D.hit({x = 136, y = 210, dir = 3, length = 96, halfWidth = 19, taper = 0, code = 2, str = 256, id = 21})
  local full, mid = nil, nil
  local shots = {}
  for f = 1, 400 do
    H.wait(1)
    local fl = H.r16(ABI.ss_flash)
    if not mid and fl >= 100 and fl <= 160 and H.r16(ABI.ss_cafter) == 0 then mid = S.palette(); H.shot('look-1-ramp') end
    if not full and fl == 256 and H.r16(ABI.ss_cage) >= 40 then full = S.palette(); H.shot('look-2-white') end
    if H.r16(ABI.ss_cafter) == 30 and not shots.fade then shots.fade = true; H.result('fadePal', S.palette()); H.shot('look-3-fade') end
    if H.r16(ABI.ss_cut) == 0 and f > 100 then break end
  end
  H.result('ramp', mid); H.result('white', full)
  S.untilControl(6000)
  H.wait(20)
  H.result('wreckPal', S.palette()); H.result('tintBad', S.tintShape())
  H.result('wreckLow', S.vblankLow(10))
  H.result('own', H.r16(ABI.ss_own)); H.result('hdma', H.r8(0x7E002C)); H.result('vis', H.r16(ABI.ss_vis))
  H.result('breach', {sx = H.r16(ABI.ssw_br_sx), sy = H.r16(ABI.ssw_br_sy), lines = H.r16(ABI.ssw_br_lines), map = H.r16(ABI.ss_bmap), x = H.r16(ABI.ss_bx), y = H.r16(ABI.ss_by)})
  H.result('cg0', S.cg(0))
  H.shot('look-4-wreck')
  local garbage, fires = 0, 0
  for k = 1, 3 do
    for f = 1, 40 do
      H.wait(1)
      local sp = S.sprites()
      garbage = garbage + sp.garbage
    end
    H.shot('look-' .. (4 + k) .. '-wreck')
  end
  H.result('garbage', garbage)
  H.result('sites', H.r16(ABI.SSW + 0x980))
  -- leaving the breach's room gives the channels back
  S.enter(318, 28, 46, 0)
  H.wait(10)
  H.result('away', {own = H.r16(ABI.ss_own), hdma = H.r8(0x7E002C), vis = H.r16(ABI.ss_vis), pal = S.palette()})
  H.shot('look-8-corridor')
`,
    check(res,problems){
      const b=res.before??{};
      if(b.bgDiff)problems.push(`before the wreck CGRAM differs from the game's buffer (${b.bgDiff} BG colours)`);
      if(!(res.white?.white>=250))problems.push(`full white: ${res.white?.white} white colours`);
      if(!(res.ramp?.white<200&&res.ramp?.bgDiff>100))problems.push(`ramp: ${JSON.stringify(res.ramp)}`);
      const w=res.wreckPal??{};
      if(!(w.bgDiff>=90))problems.push(`wreck tint: only ${w.bgDiff} BG colours tinted`);
      const lo=res.wreckLow??{};
      if(lo.written!==16||lo.equal!==16)problems.push(`text/HUD colours changed in the upload (${lo.equal}/${lo.written} equal)`);
      // (the effects library writes its own OBJ palettes: at most two)
      if(!(w.objEqual>=96))problems.push(`sprite colours changed (${w.objEqual}/128 equal)`);
      if(res.garbage)problems.push(`${res.garbage} garbage sprite frames (fx missing cells)`);
      if(!(res.sites>0&&res.sites<16))problems.push(`fire sites ${res.sites}`);
      if(res.tintBad)problems.push(`${res.tintBad} BG colours not warmer than the game's`);
      if(res.own!==1||(res.hdma&0x0C)!==0x0C)problems.push(`breach HDMA: own ${res.own} $2C ${res.hdma}`);
      if(!(res.breach?.lines>0))problems.push('breach never programmed');
      const a=res.away??{};
      if(a.own!==0||(a.hdma&0x0C))problems.push(`channels not given back after leaving: ${JSON.stringify(a)}`);
    }},
);

// Flight's bindings (flight/bind.asm), through the debug mailbox: the wreck's
// floor hole (FLIGHT_MISSING_FLOOR: floorHole() under supported()'s nine
// footprint points) and the roof takeoff (SANDSHIP_TAKEOFF).
// The browser's breachDepth() (sandship-wreck.js), for the agreement check.
const breachDepth=(b,x,y)=>{const dx=x-b.x,dy=(y-b.y)*1.25,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
  return b.radius*(1+.18*Math.sin(a*5+b.x)+.1*Math.sin(a*11+b.y)+.06*Math.sin(a*23))-d;};
const FOOT=[-4,0,4].flatMap(dy=>[-6,0,6].map(dx=>[dx,dy]));
scenarios.push(
  {name:'ship-hole',bundle:'sandship-wreck__qs-captured',syms:['ss_breach_spans','ss_breach_trim','ss_breach_bias'],
    note:'the wreck\'s breach is a floor hole for flight (FLIGHT_MISSING_FLOOR): the footprint test follows the drawn outline\'s spans exactly and the browser\'s breachDepth() away from the jagged edge; none once the room is left or the ship is whole',
    body:`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  local slots = {H.r8(0x7EE1E0), 0x16, H.r8(0x7EE1E2), H.r8(0x7EE1E3)}
  for i, v in ipairs(slots) do H.w8(ABI.ss_gear + i - 1, v) end
  H.w16(ABI.ss_gbits, 1)
  H.w16(0x7EE002, 136); H.w16(0x7EE004, 210); H.wait(40)
  D.hit({x = 136, y = 210, dir = 3, length = 96, halfWidth = 19, taper = 0, code = 2, str = 256, id = 21})
  for f = 1, 400 do H.wait(1); if H.r16(ABI.ss_cut) == 0 and f > 100 then break end end
  S.untilControl(6000)
  H.wait(10)
  local bx, by = H.r16(ABI.ss_bx), H.r16(ABI.ss_by)
  local function ph(c) return ((c >> 8) * 163 + (((c & 255) * 163) >> 8)) & 3 end
  local v = ph(bx) | (ph(by) << 2)
  local spans = {}
  for i = 0, 153 do spans[#spans + 1] = H.r8(SCN.sym.ss_breach_spans + v * 154 + i) end
  H.result('trim', {H.r8(SCN.sym.ss_breach_trim + v * 2), H.r8(SCN.sym.ss_breach_trim + v * 2 + 1)})
  H.result('bias', H.r8(SCN.sym.ss_breach_bias))
  local q = {}
  for y = by - 56, by + 56, 8 do
    for x = bx - 64, bx + 64, 8 do
      H.w16(ABI.arg_x, x); H.w16(ABI.arg_y, y)
      q[#q + 1] = S.cmd(8)
    end
  end
  H.result('breach', {x = bx, y = by, map = H.r16(ABI.ss_bmap), dc = H.r16(0x7E00DC), v = v})
  H.result('spans', spans); H.result('holes', q)
  H.w16(ABI.arg_x, bx); H.w16(ABI.arg_y, by)
  H.result('centre', S.cmd(8))
  -- another room of the ship: no hole there
  S.enter(318, 28, 46, 0)
  H.wait(10)
  H.w16(ABI.arg_x, bx); H.w16(ABI.arg_y, by)
  H.result('away', S.cmd(8))
  -- back in the breach's room, the ship whole again (the flag only)
  S.enter(H.r16(ABI.ss_bmap), 8, 13, 0)
  H.wait(10)
  local fl = H.r16(ABI.ss_flags)
  H.w16(ABI.arg_x, bx); H.w16(ABI.arg_y, by)
  H.result('back', S.cmd(8))
  H.w16(ABI.ss_flags, fl & 0xFFFE)
  H.result('whole', S.cmd(8))
  H.w16(ABI.ss_flags, fl)
`,
    check(res,problems){
      const b=res.breach??{},spans=res.spans??[],holes=res.holes??[],H=(spans.length/2-1)/2;
      const [top,cnt]=res.trim??[0,0],bias=res.bias??0;
      if(b.map!==b.dc)problems.push(`breach map ${b.map}, Goku on ${b.dc}`);
      // the outline's rows top..top+cnt-1, spans biased by the generator's bias
      const model=(x,y)=>FOOT.some(([dx,dy])=>{const k=y+dy-b.y+H;if(k<top||k>=top+cnt)return false;const d=x+dx-b.x;return d>=spans[2*k]-bias&&d<=spans[2*k+1]-bias;});
      let i=0,exact=0,browser=0,edge=0,inside=0;
      for(let y=b.y-56;y<=b.y+56;y+=8)for(let x=b.x-64;x<=b.x+64;x+=8,i++){
        const got=holes[i]===1;if(got)inside++;
        if(got!==model(x,y))exact++;
        const depths=FOOT.map(([dx,dy])=>breachDepth({x:b.x,y:b.y,radius:34},x+dx,y+dy));
        const want=depths.some(d=>d>=0);
        if(got!==want){if(depths.every(d=>Math.abs(d)>8))browser++;else edge++;}
      }
      if(holes.length!==i)problems.push(`${holes.length} answers for ${i} queries`);
      if(exact)problems.push(`${exact} footprints differ from the outline's spans`);
      if(browser)problems.push(`${browser} footprints differ from breachDepth() away from the edge`);
      if(!(inside>=20))problems.push(`only ${inside} footprints over the hole`);
      res.edgeDiffs=edge;
      if(res.centre!==1)problems.push(`no hole at the breach centre (${res.centre})`);
      if(res.away!==0)problems.push(`a hole in another room (${res.away})`);
      if(res.back!==1)problems.push(`no hole back in the breach's room (${res.back})`);
      if(res.whole!==0)problems.push(`a hole with the ship whole (${res.whole})`);
    }},
  {name:'ship-takeoff',bundle:'sandship-wreck__qs-captured',
    note:'the roof takeoff (flight\'s L+R through SANDSHIP_TAKEOFF) off the unfinished ship is taken as an unplanned departure: it blows up (Uh oh, the crash, Geshtar\'s Mech Rider); with the ship gone the chord is left to flight',
    body:`
  S.reset()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(12)
  H.result('stage', H.r8(0x7ECF28))
  H.result('take', S.cmd(9))
  local white, said = 0, {}
  for f = 1, 400 do H.wait(1); white = math.max(white, H.r16(ABI.ss_flash)); said[H.r16(ABI.ssw_remark)] = true end
  H.result('white', white)
  local list = {}
  for k, _ in pairs(said) do list[#list + 1] = k end
  H.result('said', list)
  H.result('frames', S.reach(340, 9000))
  H.result('fight', S.state())
  H.result('again', S.cmd(9))
`,
    check(res,problems){
      if(!(res.stage>=1&&res.stage<10))problems.push(`start stage ${res.stage}`);
      if(res.take!==1)problems.push(`takeoff not taken (${res.take})`);
      if(res.white!==256)problems.push(`white-out ${res.white}`);
      if(!(res.said??[]).includes(4))problems.push(`'broke the whole ship' not said (${JSON.stringify(res.said)})`);
      const f=res.fight??{};
      for(const [k,v] of Object.entries({map:340,control:true,stage:11}))if(JSON.stringify(f[k])!==JSON.stringify(v))problems.push(`fight.${k} ${JSON.stringify(f[k])} want ${JSON.stringify(v)}`);
      if(((f.flags??0)&4)!==4)problems.push(`flags ${f.flags}: want the crash`);
      if(res.again!==0)problems.push(`takeoff taken again at the fight (${res.again})`);
    }},
);

export async function runSandship({rom,only=[],log=console.log}){
  const abi=destroyAbi(),imports=importDir(),outRoot=resolve(repo,'.local/snes-test/destroy/sandship');
  mkdirSync(outRoot,{recursive:true});
  const results=[];
  for(const s of scenarios.filter(s=>!only.length||only.includes(s.name))){
    const bundlePath=join(imports,s.bundle);
    if(!existsSync(bundlePath)){results.push({name:s.name,ok:false,skipped:true,reason:'missing bundle '+s.bundle});log(`skip  ${s.name.padEnd(16)} missing bundle`);continue;}
    const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8'),addr=n=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${n}$`,'m'));return m?parseInt(m[1]+m[2],16):null;};
    const debug=process.env.SS_DEBUG?Object.fromEntries(process.env.SS_DEBUG.split(',').map(n=>[n,addr(n)]).filter(([,a])=>a!==null)):null;
    const syms=s.syms?Object.fromEntries(s.syms.map(n=>[n,addr(n)])):null;
    const test=`ABI=${lua(abi)}\nSCN=${lua({name:s.name,bundlePath,debug,sym:syms})}\n`+readFileSync(join(here,'destroy.lua'),'utf8')+prelude+`\nfunction test()\n${s.body}\nend\n`;
    const outDir=join(outRoot,s.name);
    // its own copy of the ROM: fresh battery RAM ($31-$33) for every case
    const copy=privateRom(rom,`sandship-${s.name}`);
    let m;
    try{m=await runMesen({rom:copy,test,outDir});}finally{cleanupRom(copy);}
    const res=m.results??{};
    const problems=[];
    if(m.code!==0||res.error)problems.push('mesen: '+(res.error??m.code)+(res.error?'':' '+m.output.slice(-400)));
    else s.check(res,problems);
    if(res.clobbers?.length)problems.push(`the game wrote the core's event request word (core WRAM overlap, see destroy.md core requests): ${res.clobbers.join(', ')}`);
    const r={name:s.name,ok:!problems.length,problems,ms:m.ms,note:s.note};
    if(res.shielded?.length)r.coreNote=`the game wrote the core's event request word (shielded): ${res.shielded.join(', ')}`;
    writeFileSync(join(outDir,'summary.json'),JSON.stringify({...r,results:res},null,1));
    results.push(r);
    log(`${r.ok?'pass':'FAIL'}  ${s.name.padEnd(16)} ${problems.join('; ')}${r.coreNote?(problems.length?'; ':'')+r.coreNote:''}`);
  }
  return results;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
  const results=await runSandship({rom,only:process.argv.slice(2)});
  process.exit(results.every(r=>r.ok||r.skipped)?0:1);
}
