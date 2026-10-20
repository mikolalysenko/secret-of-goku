#!/usr/bin/env node
// Measure the real-input clash pilot: FX dispatch time, vblank time left,
// field completion and lag, grouped by clash phase. A VEGETA_TEST ROM is
// produced by snes/test/vegeta/run.mjs. --rom and --out allow A/B runs;
// --final runs the longer SSJ pilot and measures its gold-wave clashes.
// Each pilot saves release.mss at the original B079 wait loop; --state=...
// replays that identical release state without running the preceding fight.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(key,def)=>args.find(a=>a.startsWith('--'+key+'='))?.split('=').slice(1).join('=')??def;
const src=resolve(opt('rom','dist/snes/vegeta-test.sfc')),out=resolve(opt('out','.local/snes-test/fx-clash-profile'));
const final=args.includes('--final');
const state=opt('state',null);
const bytes=readFileSync(src),labels={};
for(const l of readFileSync(src.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){const m=l.match(/^([\da-f]{2}):([\da-f]{4}) (\S+)$/i);if(m)labels[m[3]]=parseInt(m[1]+m[2],16);}
const at=a=>bytes[(a&0x3fffff)];
function site(table,target){
  for(let p=labels[table];at(p)===0x22;p+=4)if((at(p+1)|at(p+2)<<8|at(p+3)<<16)===labels[target])return p;
  throw Error('dispatch not found: '+target);
}
const f=site('modules_field_frame','fx_frame'),n=site('modules_field_nmi','fx_nmi');
const lua=`
V_IMPORT_DIR=${JSON.stringify(join(repo,'.local/snes-import'))}
V_TICK=${labels.vg_tick}
V_HOOK=${labels.vegeta_story_trial_start}
V_SCRIPT={{${final?5400:3600},'pilot'}}
V_HITS={}
V_PILOT_BEAM=true
V_PILOT_HOLD_HP=12000
V_PILOT_SSJ=${final?'true':'false'}
V_SHOTS=true
local samples, frames={},{}
local start, phase, nstart, nphase, ended=nil,nil,nil,nil,false
local function on() return H.r8(0x7EDBC0)==0x5A and H.r8(0x7EDBEF)~=0${final?' and H.r8(0x7EDBC4)==1':''} end
local saved=false
emu.addMemoryCallback(function()
  if not saved and on() and H.r8(0x326100)==3 then
    saved=true
    local file=io.open(H_OUT .. '/release.mss','wb');file:write(emu.createSavestate());file:close()
  end
end,emu.callbackType.exec,0x00B079,0x00B079)
emu.addMemoryCallback(function()
  if on() then start=emu.getState().masterClock;phase=H.r8(0x326100) else start=nil end
end,emu.callbackType.exec,${f},${f})
emu.addMemoryCallback(function()
  if start then samples[#samples+1]={kind='frame',phase=phase,lines=(emu.getState().masterClock-start)/1364};start=nil end
end,emu.callbackType.exec,${f+4},${f+4})
emu.addMemoryCallback(function()
  if on() then nstart=emu.getState().masterClock;nphase=H.r8(0x326100) else nstart=nil end
end,emu.callbackType.exec,${n},${n})
emu.addMemoryCallback(function()
  if nstart then samples[#samples+1]={kind='nmi',phase=nphase,lines=(emu.getState().masterClock-nstart)/1364,left=H.r16(0x317A20)};nstart=nil end
end,emu.callbackType.exec,${n+4},${n+4})
emu.addMemoryCallback(function() ended=true end,emu.callbackType.exec,0x00B077,0x00B077)
emu.addEventCallback(function()
  if on() then frames[#frames+1]={phase=H.r8(0x326100),ended=ended} end
  ended=false
end,emu.eventType.endFrame)
`;
const pilot=readFileSync(join(repo,'snes/test/vegeta/fight.lua'),'utf8').replace('function test()','function pilot()');
const test=lua+readFileSync(join(repo,'snes/test/vegeta/lib.lua'),'utf8')+'\n'+pilot+`
local normalShots=V.shots
local goldShots={}
function V.shots()
  normalShots()
  if H.r8(0x7EDBC4)==1 and H.r8(0x7EDBEF)~=0 then
    local phase=H.r8(0x326100)
    if (phase==0 or phase==2) and H.r16(0x326102)==20 and not goldShots[phase] then
      goldShots[phase]=true
      local name=phase==0 and 'clash-gold-lock' or 'clash-gold-struggle'
      H.shot(name);H.result('shot_' .. name,H.frame)
    end
  end
end
function test()
  ${state?"for i=1,500 do H.wait(1);if not on() then break end end":"pilot()"}
  H.result('fx_samples',samples);H.result('fx_frames',frames)
end`;
const rom=privateRom(src,'fx-clash-profile');
try{
  const r=await runMesen({rom,test,outDir:out,state:state?resolve(state):join(process.env.SNES_CHECKPOINTS??join(repo,'.local/snes-checkpoints'),'waterfall.mss'),exactFrames:true});
  if(r.code||r.results?.error)throw Error(r.results?.error??r.output);
  const stats=v=>{v=v.slice().sort((a,b)=>a-b);return {n:v.length,min:v[0],median:v[v.length>>1],p90:v[Math.floor(v.length*.9)],max:v.at(-1)};};
  const phases=['lock','focus','struggle','release'],report={};
  for(let phase=0;phase<4;phase++){
    const a=r.results.fx_samples.filter(s=>s.phase===phase),frames=r.results.fx_frames.filter(s=>s.phase===phase);
    report[phases[phase]]={frames:frames.length,lag:frames.filter(s=>!s.ended).length,frame:stats(a.filter(s=>s.kind==='frame').map(s=>s.lines)),nmi:stats(a.filter(s=>s.kind==='nmi').map(s=>s.lines)),vblankLeft:stats(a.filter(s=>s.kind==='nmi').map(s=>s.left))};
  }
  writeFileSync(join(out,'profile.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{cleanupRom(rom);}
