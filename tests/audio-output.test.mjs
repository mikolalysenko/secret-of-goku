import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioOutput,audioTiming} from '../engine/audio-output.js';

function fixture(){
 const sources=[],updates=[],resets=[];
 const ctx={currentTime:0,sampleRate:48000,destination:{},
  createBuffer:(channels,n,rate)=>({duration:n/rate,getChannelData:()=>new Float32Array(n)}),
  createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),
  createBufferSource(){const s={connect(){},disconnect(){this.disconnected=true;},start(t){this.when=t;},stop(){this.stopped=true;}};sources.push(s);return s;},
 };
 const snes={setSamples(left,right){left[0]=right[0]=.5;}},sound={nativeGain:1,update:(c,on,t)=>updates.push(t),resync:t=>resets.push(t)};
 return{ctx,sources,updates,resets,output:createAudioOutput(snes,sound)};
}
test('repeated stalls and catch-up bursts cannot accumulate seconds of sound latency',()=>{
 const f=fixture();let worst=0;
 for(let i=0;i<600;i++){
  // A slow render followed by several quick catch-up frames used to move
  // nextAudio forwards permanently every time it missed the audio clock.
  f.ctx.currentTime+=i%12===0?.09:.005;
  const when=f.output.frame(f.ctx);worst=Math.max(worst,when-f.ctx.currentTime);
  for(const source of f.sources)if(!source.disconnected&&source.when+1/60<=f.ctx.currentTime)source.onended();
  assert.ok(f.output.queued<=6);
 }
 assert.ok(worst<=audioTiming.maxLead+1e-9);assert.ok(f.resets.length>10);
 assert.deepEqual(f.updates,f.sources.map(s=>s.when),'native PCM and custom effects use the same bounded clock');
 assert.ok(f.sources.some(s=>s.stopped),'old queued audio is cancelled, not played over the new frame');
});
test('pause/mute/restore discard pending PCM and resume at the current clock',()=>{
 const f=fixture();for(let i=0;i<3;i++)f.output.frame(f.ctx);
 f.output.clear();assert.equal(f.output.queued,0);assert.ok(f.sources.every(s=>s.stopped&&s.disconnected));
 f.ctx.currentTime=7;assert.equal(f.output.frame(f.ctx),7+audioTiming.lead);
 const last=f.sources.at(-1);last.onended();assert.equal(f.output.queued,0);assert.ok(last.disconnected);
});
