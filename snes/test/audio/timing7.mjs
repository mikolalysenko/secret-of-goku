// Read-only charge trace on a shipping ROM: field/module timing and actual
// native sends. Uses the gameplay suite and its normal shared checkpoint.
// --rom=... --out=.local/snes-test/audio/fix7/trace-r4
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const opt=(k,d)=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const rom=resolve(opt('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const out=resolve(opt('out','.local/snes-test/audio/fix7/trace'));
mkdirSync(out,{recursive:true});
const syms=new Map([...readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gmi)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const modules=readFileSync('snes/src/modules.asm','utf8').split('modules_field_frame:')[1].split('RTL')[0].match(/JSL \w+/g).map(s=>s.slice(4));
const returned=syms.get('modules_field_frame')+4*(modules.indexOf('audio_frame')+1);
const points=[
 ['audio_return',returned],['nmi_return',0xC16F],['nmi_return',0x80C16F],
 ['field',0xB08C],['done',0xB077],['nmi',0xC0A8],['dispatch',0xC30160],
 ...['audio_frame','audio_beds_service','audio_beds_service_send',
  'audio_combat_loops','audio_frame_run8','core_frame_end']
  .filter(n=>syms.has(n)).map(n=>[n,syms.get(n)]),
];
const prelude=`
local trace={}
local function point(name)
 if not H then return end
 local s=emu.getState()
 local r={event=name,frame=H.frame,clock=s.masterClock,line=s['ppu.scanline'],
  phase=H.r8(0x7E0056),ec=H.r8(0x7E00EC),wait=H.r8(0x7EDD5F),
  level=H.r16(0x7EDD0A),rate=H.r16(0x7EDD0E),accepted=H.r16(0x7EDD40),
  wake=H.r8(0x7EDD58),pending=H.r8(0x7EDD5B),age=H.r16(0x7EDD12),
  requests=H.r8(0x7EDD00),charge=H.r16(0x7ED826)}
 if name=='dispatch' then
  r.cmd=H.r8(0x7E1E00);r.id=H.r8(0x7E1E01)
  r.p2=H.r8(0x7E1E02);r.p3=H.r8(0x7E1E03)
 end
 trace[#trace+1]=r;H.result('audioTiming',trace)
end
`+points.map(([n,a])=>`emu.addMemoryCallback(function() point(${JSON.stringify(n)}) end,emu.callbackType.exec,${a},${a})`).join('\n');
const file=join(out,'trace.lua');writeFileSync(file,prelude);
const r=spawnSync(process.execPath,['snes/test/gameplay/run.mjs','charge'],{stdio:'inherit',env:{...process.env,SNES_ROM:rom,GAMEPLAY_OUT:join(out,'gameplay'),SNES_LUA_PRELUDE:file}});
if(r.status!==0)process.exit(r.status??1);
const v=JSON.parse(readFileSync(join(out,'gameplay/charge/results.json'))),start=v.frames-v.videoFrames;
const rows=v.audioTiming.filter(r=>r.frame>=start).map(r=>({...r,offset:r.frame-start}));
const misses=v.misses.map(r=>({...r,offset:r.frame-start}));
writeFileSync(join(out,'timing.json'),JSON.stringify({rom,start,misses,rows},null,2));
console.log('miss offsets:',misses.map(r=>r.offset).join(', '));
console.table(rows.filter(r=>r.event==='dispatch').map(({offset,line,cmd,id,p2,p3})=>({offset,line,cmd,id:id.toString(16),p2,p3})));
