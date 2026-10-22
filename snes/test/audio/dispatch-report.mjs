#!/usr/bin/env node
// Summarize gameplay offset runs made with dispatch-profile.lua installed:
//   node snes/test/audio/dispatch-report.mjs summary.json [before-summary.json]
// Audio cost = audio_frame + core's sound pump (which includes C3:0004 for a
// queued command), NMI time excluded. Per missed update: 'withinAudio' when
// that cost is at least the overrun (arithmetic headroom, not a replay: the
// frame could have fit had audio been free). Waits are SPC polling loops.
// With a second summary, the port-0 command streams of matching runs are
// compared (the same commands in the same order, frame offsets allowed).
import {readFileSync} from 'node:fs';
const hex=n=>n.toString(16).toUpperCase().padStart(2,'0');
function measured(run){
 const t=run.audio_dispatch_trace??[];
 const first=(run.frames??t.at(-1)?.frame??0)-run.videoFrames-30;
 return t.filter(r=>r.frame>=first);
}
const waitLines=r=>Object.values(r.waits??{}).reduce((a,b)=>a+b,0);
const cost=r=>(r.lines.audio??0)+(r.lines.queue??0);
export function commandStream(run){
 // Effect and bed commands as the SPC latches them (port 0 = 02 / 81).
 return measured(run).flatMap(r=>(r.ports??[]).filter(p=>p.value===2||p.value===0x81)
  .map(p=>`${hex(p.value)} ${hex(p.p1)} ${hex(p.p2)} ${hex(p.p3)}`));
}
export function dispatchReport(path){
 const all=JSON.parse(readFileSync(path,'utf8')),byCase={};
 const global={maxAudio:0,maxQueue:0,maxNative:0,maxCost:0,maxWait:0,waitFrames:0,waitPcs:{},commandFrames:0,commandCost:0,maxCommandCost:0,
  calls:{module:0,native:0},drops:{module:0,native:0},cueFrames:0,cueCost:0,maxCueCost:0};
 for(const run of all){
  const c=byCase[run.name]??={misses:0,missAudio:0,missLogic:0,maxMissAudio:0,withinAudio:0,waitMisses:0,offsets:[]};
  c.misses+=run.missedVblanks;c.offsets.push(run.missedVblanks);
  const trace=run.audio_dispatch_trace??[];
  for(const miss of run.misses){
   const row=trace.find(r=>r.missFrame===miss.frame);
   if(!row)throw Error(`missing trace for ${run.name}+${run.offset} frame ${miss.frame}`);
   const a=cost(row);
   c.missAudio+=a;c.missLogic+=miss.logic??0;c.maxMissAudio=Math.max(c.maxMissAudio,a);
   if(a>=miss.over)c.withinAudio++;
   if(waitLines(row)>0)c.waitMisses++;
  }
  for(const r of measured(run)){
   const w=waitLines(r);
   global.maxAudio=Math.max(global.maxAudio,r.lines.audio??0);
   global.maxQueue=Math.max(global.maxQueue,r.lines.queue??0);
   global.maxNative=Math.max(global.maxNative,r.lines.native??0);
   global.maxCost=Math.max(global.maxCost,cost(r));
   global.maxWait=Math.max(global.maxWait,w);
   if(w>0)global.waitFrames++;
   for(const [pc,l] of Object.entries(r.waits??{}))global.waitPcs[pc]=(global.waitPcs[pc]??0)+l;
   // Module cues: sent inside audio_frame, or by core's pump (the queue
   // round trip before the direct send). Everything else is a native caller.
   const effects=(r.commands??[]).filter(x=>x.cmd===2||x.cmd===0x81);
   if(effects.length){
    global.commandFrames++;global.commandCost+=cost(r);global.maxCommandCost=Math.max(global.maxCommandCost,cost(r));
    // An attempt was sent when a port-0 write of its command and id follows.
    const sent=(r.ports??[]).filter(p=>p.value===2||p.value===0x81);let si=0,module=false;
    for(const c of effects){
     const kind=c.insideAudio||c.fromQueue?'module':'native';global.calls[kind]++;
     if(kind==='module')module=true;
     const k=sent.findIndex((p,i)=>i>=si&&p.value===c.cmd&&p.p1===c.id);
     if(k<0)global.drops[kind]++;else si=k+1;
    }
    if(module){global.cueFrames++;global.cueCost+=cost(r);global.maxCueCost=Math.max(global.maxCueCost,cost(r));}
   }
  }
 }
 global.meanCommandCost=global.commandCost/Math.max(1,global.commandFrames);delete global.commandCost;
 global.meanCueCost=global.cueCost/Math.max(1,global.cueFrames);delete global.cueCost;
 const totals={misses:0,missAudio:0,missLogic:0,withinAudio:0,waitMisses:0};
 for(const c of Object.values(byCase))for(const k in totals)totals[k]+=c[k];
 return {cases:byCase,totals,global};
}
if(process.argv[2]){
 const r=dispatchReport(process.argv[2]);
 for(const [name,c] of Object.entries(r.cases))if(c.misses)console.log(`${name.padEnd(16)} misses ${String(c.misses).padStart(3)}  audio ${c.missAudio.toFixed(1).padStart(6)} of ${c.missLogic.toFixed(0).padStart(6)} lines (${(100*c.missAudio/Math.max(1,c.missLogic)).toFixed(2)}%)  max ${c.maxMissAudio.toFixed(2)}  within audio ${c.withinAudio}  with waits ${c.waitMisses}`);
 const t=r.totals;
 console.log(`${'total'.padEnd(16)} misses ${String(t.misses).padStart(3)}  audio ${t.missAudio.toFixed(1).padStart(6)} of ${t.missLogic.toFixed(0).padStart(6)} lines (${(100*t.missAudio/Math.max(1,t.missLogic)).toFixed(2)}%)  within audio ${t.withinAudio}  with waits ${t.waitMisses}`);
 console.log(JSON.stringify(r.global,(k,v)=>typeof v==='number'?Math.round(v*1000)/1000:v));
 if(process.argv[3]){
  const before=JSON.parse(readFileSync(process.argv[3],'utf8')),after=JSON.parse(readFileSync(process.argv[2],'utf8'));
  let same=0,diff=0;
  for(const run of after){
   const old=before.find(b=>b.name===run.name&&b.offset===run.offset);
   if(!old)continue;
   const a=commandStream(run).join('\n'),b=commandStream(old).join('\n');
   if(a===b)same++;else{diff++;console.log(`command stream differs: ${run.name}+${run.offset} (${commandStream(old).length} -> ${commandStream(run).length} commands)`);}
  }
  console.log(`command streams: ${same} identical, ${diff} different`);
 }
}
