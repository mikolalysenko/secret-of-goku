// Cartridge effect-command diagnosis for the maintainer's round-seven notes.
// Uses real inputs and the same retail checkpoints/imports as gameplay/world.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {isResident7} from './cartridge.mjs';
const root=resolve(import.meta.dirname,'../../..');
const rom=resolve(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const tag=process.argv[2]??'r7',out=join(root,'.local/snes-test/audio/compare7/trace-'+tag);
const trace=`
local commands,states,weapon={}, {}, {}
emu.addMemoryCallback(function()
 local s=emu.getState();weapon[#weapon+1]={frame=H.frame,actor=s['cpu.x'],effect=s['cpu.a']&127}
end,emu.callbackType.exec,0x80BB27,0x80BB27)
local phase='setup'
local writer=''
emu.addMemoryCallback(function(a,v)
 local s=emu.getState();writer=string.format('%02X:%04X',s['cpu.k'],s['cpu.pc'])
end,emu.callbackType.write,0x7E1E01,0x7E1E01)
emu.addMemoryCallback(function()
 local c=H.r8(0x7E1E00)
 if c==2 or c==0x81 then
  local s=emu.getState();local sp=s['cpu.sp'] or s['cpu.s']
  commands[#commands+1]={phase=phase,frame=H.frame,cmd=c,id=H.r8(0x7E1E01),p2=H.r8(0x7E1E02),p3=H.r8(0x7E1E03),writer=writer,caller=sp and H.r16(sp+1) or 0}
 end
end,emu.callbackType.exec,0xC30160,0xC30160)
local function mark(p) phase=p;states[#states+1]={phase=p,frame=H.frame,action=H.r8(0x7ED814),charge=H.r16(0x7ED826),form=H.r8(0x7ED811)} end
local function field(form)
 phase='setup';H.load(CHECKPOINT);H.wait(5)
 assert(H.importSnesJs(IMPORT..'animation-audit__native__rabite-field-a'))
 H.w8(0x316001,1);H.wait(45);W.form(form or 0);H.wait(4)
end
function test()
 field();mark('hold-B');H.hold('b',180);mark('release-B');H.wait(90)
 field();H.w8(0x316001,0);H.wait(5);mark('native-hold-B');H.hold('b',180);H.wait(90)
 field();mark('partial-charge');H.hold('l y',35);mark('partial-release');H.wait(100)
 field(1);mark('full-charge');H.hold('l y',180);mark('full-release');H.wait(140)
 field();mark('focus');H.hold('l',240);mark('transform');H.hold('l a',4);H.wait(180);mark('revert');H.hold('l a',4);H.wait(180)
 field();mark('local-takeoff-flight');H.hold('a right',8);H.hold('a',164);H.hold('a left',8);mark('local-land');H.wait(100)
 field();mark('teleport');H.hold('l b',2);H.wait(100)
 field();mark('ki-volley');H.hold('right',4);H.hold('y',180);H.wait(100)
 phase='setup';H.load(CHECKPOINT);H.wait(5);W.fresh();W.on(0);H.wait(10)
 mark('world-takeoff');H.hold('l r',4);assert(H.waitFor(W.inWorld,900));H.wait(60)
 mark('world-flight');H.wait(180);mark('world-land');H.hold('b',350);H.wait(300)
 mark('end');H.result('commands',commands);H.result('states',states);H.result('weapon',weapon)
end
`;
const pre=`IMPORT=${JSON.stringify(join(root,'.local/snes-import/'))}\nCHECKPOINT=${JSON.stringify(join(checkpointDir(),'waterfall.mss'))}\n`;
const copy=privateRom(rom,'trace7-'+tag);
try{
 const r=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),test:pre+readFileSync(join(root,'snes/test/world/lib.lua'),'utf8')+trace,outDir:out});
 if(r.code!==0||!r.results?.commands||r.results.error)throw Error(JSON.stringify(r.results??r.output));
 const byPhase={};for(const c of r.results.commands){const ids=byPhase[c.phase]??={};const k=c.cmd.toString(16)+':'+c.id.toString(16);ids[k]=(ids[k]??0)+1;}
 if(isResident7(readFileSync(rom))){
  if(byPhase['hold-B']?.['2:27'])throw Error('native weapon charge leaked into Goku');
  if(!byPhase['native-hold-B']?.['2:27'])throw Error('native hero weapon charge was suppressed');
  if(!byPhase['world-takeoff']?.['2:ec'])throw Error('world takeoff was discarded');
 }
 writeFileSync(join(out,'summary.json'),JSON.stringify(byPhase,null,2));console.log(tag,byPhase);
}finally{cleanupRom(copy);}
