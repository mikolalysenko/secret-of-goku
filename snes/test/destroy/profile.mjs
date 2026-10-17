#!/usr/bin/env node
// Development tool: scanline profile of the destroy module during one full
// Super Saiyan beam (the browser timeline), from Mesen exec watches.
//   node snes/test/destroy/profile.mjs <bundle> <dir>
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {destroyAbi} from './abi.mjs';
import {beamTimeline} from './reference.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const common=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).stdout.trim();
const imports=process.env.SNES_IMPORT??(existsSync(resolve(repo,'.local/snes-import'))?resolve(repo,'.local/snes-import'):resolve(common,'..','.local/snes-import'));
const [bundle,dirArg]=process.argv.slice(2);
const wram=new Uint8Array(readFileSync(join(imports,bundle,'wram.bin')));
const x=wram[0xe002]|wram[0xe003]<<8,y=wram[0xe004]|wram[0xe005]<<8;
const steps=beamTimeline({x,y,dir:Number(dirArg),kind:'mega'}).map(t=>({...t,halfWidth:Math.floor(t.halfWidth)}));
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const addr=name=>{if(/^0x/.test(name))return parseInt(name,16);const m=sym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${name}$`,'mi'));return parseInt(m[1]+m[2],16);};
const abi=destroyAbi();
const marks=['dst_consider_cell','dst_breakable','dst_queue_find','dst_load_cell','destroy_field_frame','dst_walls_work','dst_barrier_tick','destroy_redraw_hook','destroy_redraw_hook_exit','dst_scan_attack','dst_job_update',...(process.env.MARKS?process.env.MARKS.split(','):[])];
const test=`
function test()
  local ev = {}
  local start = nil
  local function mark(name)
    return function()
      if start and #ev < 4000 then
        local s = emu.getState()
        ev[#ev + 1] = {n = name, f = H.frame - start, l = s['ppu.scanline'], c = s['cpu.cycleCount']}
      end
    end
  end
  ${marks.map(n=>`emu.addMemoryCallback(mark('${n}'), emu.callbackType.exec, ${addr(n)}, ${addr(n)})`).join('\n  ')}
  assert(H.importSnesJs(${JSON.stringify(join(imports,bundle))}), 'import failed')
  H.wait(12)
  start = H.frame
  for _, st in ipairs(SCN) do
    if ${process.env.NOHIT?'true':'false'} then H.wait(1) goto continue end
    H.w16(${abi.arg_x}, st.x); H.w16(${abi.arg_y}, st.y); H.w16(${abi.arg_dir}, st.dir)
    H.w16(${abi.arg_len}, st.length); H.w16(${abi.arg_half}, st.halfWidth); H.w16(${abi.arg_taper}, st.taper)
    H.w16(${abi.arg_kind}, 3); H.w16(${abi.arg_str}, 256); H.w16(${abi.arg_id}, st.id); H.w16(${abi.arg_layer}, 0xFFFF)
    local n = H.r16(${abi.dbg_n})
    H.w16(${abi.dbg_cmd}, 1)
    H.waitFor(function() return H.r16(${abi.dbg_n}) ~= n end, 30)
    ::continue::
  end
  H.wait(60)
  H.result('ev', ev)
end
`;
const lua=s=>`{${s.map(t=>`{x=${t.x},y=${t.y},dir=${t.dir},length=${t.length},halfWidth=${t.halfWidth},taper=${t.taper},id=${t.id}}`).join(',')}}`;
const m=await runMesen({rom,test:`SCN=${lua(steps)}\n`+test,outDir:resolve(repo,'.local/snes-test/destroy-profile')});
const ev=m.results?.ev??[];
// Per frame: field frame start line, walls_work start/end (barrier_tick), hook spans.
const byFrame=new Map();
for(const e of ev){if(!byFrame.has(e.f))byFrame.set(e.f,[]);byFrame.get(e.f).push(e);}
let lag=0,prev=null;
for(const[f,list]of[...byFrame].sort((a,b)=>a[0]-b[0])){
  const ff=list.find(e=>e.n==='destroy_field_frame'),ww=list.find(e=>e.n==='dst_walls_work'),bt=list.find(e=>e.n==='dst_barrier_tick');
  const hooks=list.filter(e=>e.n==='destroy_redraw_hook').length;
  const cc=list.filter(e=>e.n==='dst_consider_cell').length,bk=list.filter(e=>e.n==='dst_breakable').length,qf=list.filter(e=>e.n==='dst_queue_find').length,lc=list.filter(e=>e.n==='dst_load_cell').length;
  if(ff&&prev!==null&&f-prev>1)lag+=f-prev-1;
  if(ff)prev=f;
  const sc=list.find(e=>e.n==='dst_scan_attack'),ju=list.find(e=>e.n==='dst_job_update');
  console.log(`f${String(f).padStart(3)} ${ff?`field@${ff.l}`:'          '} ${sc?`scan@${sc.l}`:''} ${ju?`job@${ju.l}`:''} ${ww?`walls@${ww.l}`:''} ${bt?`btick@${bt.l}`:''} hooks ${hooks} cells ${cc} breakable ${bk} qfind ${qf} loads ${lc}`);
  for(const e of list)if(e.n==='dst_scan_attack'){const j=ev.find(x=>x.n==='dst_job_update'&&x.c>e.c);if(j)console.log('    scan cycles',j.c-e.c);}
  for(const e of list)if(e.n==='dst_walls_work'){const j=ev.find(x=>x.n==='dst_barrier_tick'&&x.c>e.c);if(j)console.log('    planner cycles',j.c-e.c);}
}
if(process.env.TRACE){const[a,b]=process.env.TRACE.split('-').map(Number);for(const e of ev)if(e.f>=a&&e.f<=b&&!['dst_consider_cell','dst_breakable','dst_queue_find','dst_load_cell'].includes(e.n))console.log(`  f${e.f} l${e.l} c${e.c} ${e.n}`);}
const fields=ev.filter(e=>e.n==='destroy_field_frame').map(e=>e.f);
const span=Math.max(...fields)-Math.min(...fields)+1;
console.log(`field frames ${fields.length} over ${span} frames: ${span-fields.length} lag frames`,m.results?.error??'');
const first=fields.filter(f=>f<80);console.log(`first 80 frames: ${first.length} field frames`);
