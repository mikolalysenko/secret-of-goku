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
function S.reset()
  D.garbage()
  H.w8(ABI.P_DOORS, 0); H.w8(ABI.P_TREE, 0)
  for a = ABI.SS, ABI.ss_end - 1 do H.w8(a, 0) end
  H.w8(ABI.persist_goku_active, 1)          -- Goku has arrived (the states are his)
end
-- Goku in control: idle field, no white-out running.
function S.control() return D.ground() and H.r16(ABI.ss_cut) == 0 and (H.r8(0x7EE000) & 1) == 1 end
-- Play until Goku is back in control (B taps through dialogue).
function S.untilControl(limit)
  for f = 1, limit or 6000 do
    if H.r8(0x7E00D0) ~= 0 and f % 20 == 0 then H.tap('b', 2, 0) else H.wait(1) end
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

export async function runSandship({rom,only=[],log=console.log}){
  const abi=destroyAbi(),imports=importDir(),outRoot=resolve(repo,'.local/snes-test/destroy/sandship');
  mkdirSync(outRoot,{recursive:true});
  const results=[];
  for(const s of scenarios.filter(s=>!only.length||only.includes(s.name))){
    const bundlePath=join(imports,s.bundle);
    if(!existsSync(bundlePath)){results.push({name:s.name,ok:false,skipped:true,reason:'missing bundle '+s.bundle});log(`skip  ${s.name.padEnd(16)} missing bundle`);continue;}
    const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8'),addr=n=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${n}$`,'m'));return m?parseInt(m[1]+m[2],16):null;};
    const debug=process.env.SS_DEBUG?Object.fromEntries(process.env.SS_DEBUG.split(',').map(n=>[n,addr(n)]).filter(([,a])=>a!==null)):null;
    const test=`ABI=${lua(abi)}\nSCN=${lua({name:s.name,bundlePath,debug})}\n`+readFileSync(join(here,'destroy.lua'),'utf8')+prelude+`\nfunction test()\n${s.body}\nend\n`;
    const outDir=join(outRoot,s.name);
    const m=await runMesen({rom,test,outDir});
    const res=m.results??{};
    const problems=[];
    if(m.code!==0||res.error)problems.push('mesen: '+(res.error??m.code));
    else s.check(res,problems);
    const r={name:s.name,ok:!problems.length,problems,ms:m.ms,note:s.note};
    writeFileSync(join(outDir,'summary.json'),JSON.stringify({...r,results:res},null,1));
    results.push(r);
    log(`${r.ok?'pass':'FAIL'}  ${s.name.padEnd(16)} ${problems.join('; ')}`);
  }
  return results;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
  const results=await runSandship({rom,only:process.argv.slice(2)});
  process.exit(results.every(r=>r.ok||r.skipped)?0:1);
}
