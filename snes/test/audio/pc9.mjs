// PC-edition reference for round nine. Renders engine/ki-sound.js's actual
// Web Audio chain in headless Chromium: clip → cue gain → .55 master →
// DynamicsCompressor (threshold -10, knee 12, ratio 6, 3 ms / 160 ms) →
// output. The browser's native SNES music bypasses that chain at .4
// (engine/audio-output.js); callers mix it separately.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {cues} from '../../../engine/ki-sound.js';
const repo=resolve(import.meta.dirname,'../../..');
export const PC_RATE=48000,PC_MUSIC_GAIN=.4,PC_MASTER=.55;
const clip=name=>readFileSync(resolve(repo,`assets/audio/dbz/${name}.wav`)).toString('base64');
// events: [{at, cue, variant}] for one-shots; loops: [{cue, start, stop,
// level:(t)=>…, rate:(t)=>…}] sampled per 1/60 s frame as ki-sound does.
export async function renderPc(jobs){
 const names=new Set();
 for(const j of jobs){for(const e of j.events??[])for(const c of cues[e.cue].clips)names.add(c);for(const l of j.loops??[])for(const c of cues[l.cue].clips)names.add(c);}
 const data=Object.fromEntries([...names].map(n=>[n,clip(n)]));
 const plans=jobs.map(j=>({seconds:j.seconds,
  events:(j.events??[]).map(e=>{const c=cues[e.cue],v=e.variant??0;return {at:e.at,clip:c.clips[v%c.clips.length],gain:c.gain,rate:c.rate??(['hit','swing','blast'].includes(e.cue)?[1,1.035,.975][v%3]:1)};}),
  loops:(j.loops??[]).map(l=>{const frames=[];for(let t=l.start;t<l.stop;t+=1/60)frames.push([t,cues[l.cue].gain*l.level(t-l.start),l.rate?l.rate(t-l.start):1]);return {clip:cues[l.cue].clips[0],start:l.start,stop:l.stop,frames};})}));
 // Playwright's pinned build, else the installed Chrome (same Web Audio).
 const browser=await chromium.launch().catch(()=>chromium.launch({channel:'chrome'}));
 try{
  const page=await browser.newPage();
  const out=await page.evaluate(async({data,plans,rate,master})=>{
   const bytes=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0)).buffer;
   const results=[];
   for(const p of plans){
    const ctx=new OfflineAudioContext(2,Math.ceil(p.seconds*rate),rate);
    const buffers={};for(const [n,b] of Object.entries(data))buffers[n]=await ctx.decodeAudioData(bytes(b));
    const m=ctx.createGain();m.gain.value=master;
    const c=ctx.createDynamicsCompressor();
    c.threshold.value=-10;c.knee.value=12;c.ratio.value=6;c.attack.value=.003;c.release.value=.16;
    m.connect(c);c.connect(ctx.destination);
    for(const e of p.events){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers[e.clip];s.playbackRate.value=e.rate;g.gain.value=e.gain;s.connect(g);g.connect(m);s.start(e.at);}
    for(const l of p.loops){
     const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers[l.clip];s.loop=true;g.gain.value=0;s.connect(g);g.connect(m);
     for(const [t,gain,r] of l.frames){g.gain.setTargetAtTime(gain,t,.055);s.playbackRate.setTargetAtTime(r,t,.08);}
     g.gain.setTargetAtTime(0,l.stop,.065/3);s.start(l.start);s.stop(l.stop+.07);
    }
    const r=await ctx.startRendering();
    results.push([Array.from(r.getChannelData(0)),Array.from(r.getChannelData(1))]);
   }
   return results;
  },{data,plans,rate:PC_RATE,master:PC_MASTER});
  return out.map(([l,r])=>[Float32Array.from(l),Float32Array.from(r)]);
 }finally{await browser.close();}
}
// The PC cue set used by the round-nine tables. Charge level/rate follow
// ki-sound.js's update(): charging .48+.52·strength, rate .94+.12·strength,
// strength = charge/90 (base) or /45 (SSJ), one charge unit per frame.
export function pcJobs(){
 const charge=(cap)=>({cue:'charge',start:0,stop:3,level:t=>.48+.52*Math.min(1,t*60/cap),rate:t=>.94+.12*Math.min(1,t*60/cap)});
 return {
  hit:{seconds:1.2,events:[{at:0,cue:'hit',variant:0}]},
  hit2:{seconds:1.2,events:[{at:0,cue:'hit',variant:1}]},
  hit3:{seconds:1.2,events:[{at:0,cue:'hit',variant:2}]},
  kick:{seconds:1.2,events:[{at:0,cue:'kick'}]},
  blast:{seconds:1.2,events:[{at:0,cue:'blast'}]},
  impact:{seconds:1.2,events:[{at:0,cue:'impact'}]},
  chargeStart:{seconds:1.2,loops:[charge(90)]},
  chargeStartSsj:{seconds:1.2,loops:[charge(45),{cue:'aura',start:0,stop:3,level:t=>{const s=Math.min(1,t*60/45);return s>.35?s:0;}}]},
  charged:{seconds:1,events:[{at:0,cue:'charged'}]},
  beam:{seconds:1.6,events:[{at:0,cue:'beam'}]},
 };
}
