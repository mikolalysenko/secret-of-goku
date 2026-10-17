#!/usr/bin/env node
// Development tool: traces demolition plans frame by frame for one full
// Super Saiyan beam, in the browser pipeline (timeline simulation) and in
// the cartridge (exec watch on dst_breach_queue), to compare timing.
//   node snes/test/destroy/plan-trace.mjs <bundle> <dir>
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {destroyAbi} from './abi.mjs';
import {createNativePlants} from '../../../engine/native-plants.js';
import {createNativeLocalFlight} from '../../../engine/native-local-flight.js';
import {loadRom,fakeSnes,beamTimeline,facing} from './reference.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const common=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).stdout.trim();
const imports=process.env.SNES_IMPORT??(existsSync(resolve(repo,'.local/snes-import'))?resolve(repo,'.local/snes-import'):resolve(common,'..','.local/snes-import'));
const [bundle,dirArg]=process.argv.slice(2);
const dir=Number(dirArg);
const wram=new Uint8Array(readFileSync(join(imports,bundle,'wram.bin')));
const x=wram[0xe002]|wram[0xe003]<<8,y=wram[0xe004]|wram[0xe005]<<8;
const steps=beamTimeline({x,y,dir,kind:'mega'}).map(t=>({...t,halfWidth:Math.floor(t.halfWidth)}));

// Browser pipeline with a logging planner.
const r=wram.slice(),snes=fakeSnes(r,loadRom()),flight=createNativeLocalFlight(snes,{});
let frame=0;const jsPlans=[],jsRows=[];
const plants=createNativePlants(snes,{canCut:()=>true,sceneryReplacement:t=>flight.breakScenery(t),
  demolitionPlan:(tiles,attack)=>{const edits=flight.dungeon.demolish(tiles,attack);for(const e of edits)jsPlans.push({frame,off:e.address-0x10000,rep:e.replacement});return edits;},
  onCut:res=>jsRows.push({frame,tiles:res.tiles.map(t=>t.address-0x10000)})});
const boundary=()=>{snes.frames++;r[0x82]=0;r[0x2e]=0;r[0x95]=0;snes.cpu.r[1]=0;snes.cpu.br[4]=0xc7c3;snes.cpu.cyclesLeft=0;snes.cpu.cycle();};
for(const st of steps){const[dx,dy]=facing[st.dir];plants.beam({x:st.x,y:st.y,dx,dy,length:st.length,halfWidth:st.halfWidth,taper:st.taper,policy:'super-beam'});frame++;boundary();}
for(let i=0;i<120;i++){frame++;boundary();}

// Cartridge with exec watches.
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const addr=name=>{const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${name}$`,'mi'));return parseInt(m[1]+m[2],16);};
const abi=destroyAbi(),S=abi.RAM_DESTROY+0x40;
const test=`
function test()
  local plans = {}
  local start = nil
  emu.addMemoryCallback(function()
    plans[#plans + 1] = {f = H.frame - (start or 0), off = H.r16(${S+0x28}), src = H.r16(${S+0x34}), a = H.r16(${S+0x30}), b = H.r16(${S+0x32}), back = H.r16(${S+0x36})}
  end, emu.callbackType.exec, ${addr('dst_breach_queue')}, ${addr('dst_breach_queue')})
  local tries = {}
  emu.addMemoryCallback(function()
    if start and #tries < 400 then tries[#tries + 1] = {f = H.frame - start, off = H.r16(${S+0x28})} end
  end, emu.callbackType.exec, ${addr('dst_breach')}, ${addr('dst_breach')})
  local samples = {}
  emu.addMemoryCallback(function()
    if start and #samples < 200 then samples[#samples + 1] = {f = H.frame - start, off = H.r16(${S+0x28})} end
  end, emu.callbackType.exec, ${addr('dst_fs_begin')}, ${addr('dst_fs_begin')})
  local walks = {}
  emu.addMemoryCallback(function()
    if start and #walks < 400 then walks[#walks + 1] = {f = H.frame - start, st = H.r16(${abi.DQ+0x680}), o = H.r16(${abi.DQ+0x680+0x12}), i = H.r16(${abi.DQ+0x680+0x18})} end
  end, emu.callbackType.exec, ${addr('dst_walls_work')}, ${addr('dst_walls_work')})
  assert(H.importSnesJs(${JSON.stringify(join(imports,bundle))}), 'import failed')
  H.wait(12)
  start = H.frame
  for _, st in ipairs(SCN) do
    H.w16(${abi.arg_x}, st.x); H.w16(${abi.arg_y}, st.y); H.w16(${abi.arg_dir}, st.dir)
    H.w16(${abi.arg_len}, st.length); H.w16(${abi.arg_half}, st.halfWidth); H.w16(${abi.arg_taper}, st.taper)
    H.w16(${abi.arg_kind}, 3); H.w16(${abi.arg_str}, 256); H.w16(${abi.arg_id}, st.id); H.w16(${abi.arg_layer}, 0xFFFF)
    local n = H.r16(${abi.dbg_n})
    H.w16(${abi.dbg_cmd}, 1)
    H.waitFor(function() return H.r16(${abi.dbg_n}) ~= n end, 30)
  end
  H.wait(120)
  H.result('plans', plans)
  H.result('tries', tries)
  H.result('samples', samples)
  H.result('walks', walks)
end
`;
const lua=s=>`{${s.map(t=>`{x=${t.x},y=${t.y},dir=${t.dir},length=${t.length},halfWidth=${t.halfWidth},taper=${t.taper},id=${t.id}}`).join(',')}}`;
const m=await runMesen({rom,test:`SCN=${lua(steps)}\n`+test,outDir:resolve(repo,'.local/snes-test/destroy-trace')});
const cart=m.results?.plans??[];
const cell=o=>`${o>>14?'L1':'L0'}(${o&127},${(o>>7)&127})`;
console.log('browser plans (frame: cell -> replacement):');
for(const p of jsPlans)console.log(`  f${p.frame}: ${cell(p.off)} -> ${p.rep}`);
console.log('cartridge breaches (frame: wall cell, source, shores):');
for(const p of cart)console.log(`  f${p.f}: ${cell(p.off)} src ${cell(p.src)} a ${cell(p.a)} b ${cell(p.b)} back ${p.back===0xffff?'-':cell(p.back)}`);
console.log('breach attempts:',(m.results?.tries??[]).map(t=>`f${t.f}:${cell(t.off)}`).join(' '));
console.log('floor samples:',(m.results?.samples??[]).map(t=>`f${t.f}:${cell(t.off)}`).join(' '));
console.log('walk entries:',(m.results?.walks??[]).slice(0,40).map(t=>`f${t.f}:s${t.st}o${t.o}i${t.i}`).join(' '));
if(m.results?.error)console.log(m.results.error);
