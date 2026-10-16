import test from 'node:test';
import assert from 'node:assert/strict';
import {PcmStream,streamRate,streamTiming} from '../engine/audio-worklet.js';
import {createAudioOutput} from '../engine/audio-output.js';

const outRate=48000,block=128,perFrame=streamRate/60;
// Emulator frames of a continuous sine, as the DSP produces ~533 samples each.
function source(freq=440){
 let t=0,carry=0;
 return()=>{carry+=perFrame;const n=Math.floor(carry);carry-=n;const l=new Float32Array(n);for(let i=0;i<n;i++)l[i]=Math.sin(2*Math.PI*freq*(t++)/streamRate)*.5;return[l,l.slice()];};
}
// Plays `seconds` of audio, delivering frames on a jittery main thread whose
// callbacks arrive in bursts (e.g. a 30 Hz rAF, or iOS throttling).
function play(stream,{seconds=4,burst=2,stall=0,stallEvery=0}={}){
 const next=source(),out=[];let clock=0,due=0,frames=0;
 const L=new Float32Array(block),R=new Float32Array(block);
 for(let b=0;b<seconds*outRate/block;b++){
  clock+=block/outRate;
  const late=stallEvery&&Math.floor(clock/stallEvery)!==Math.floor((clock-block/outRate)/stallEvery)?stall:0;
  due+=late;
  while(frames/60+burst/60<=clock-due+1e-9)for(let k=0;k<burst;k++){stream.push(...next());frames++;}
  stream.render(L,R);out.push(...L);
 }
 return out;
}
const maxJump=samples=>{let worst=0;for(let i=1;i<samples.length;i++)worst=Math.max(worst,Math.abs(samples[i]-samples[i-1]));return worst;};

test('bursty 30 Hz frame delivery plays as one continuous, click-free stream',()=>{
 const stream=new PcmStream(outRate),out=play(stream,{burst:2});
 const settled=out.slice(outRate*.5);
 assert.equal(stream.underruns,0);
 // A 440 Hz sine at amplitude .5 moves at most ~.029 per 48 kHz sample.
 assert.ok(maxJump(settled)<.035,`discontinuity ${maxJump(settled)}`);
 assert.ok(stream.fill/streamRate<streamTiming.target+.04,'queue stays near its target');
});
test('a starved queue fades out, re-primes with more headroom, then stays smooth',()=>{
 const stream=new PcmStream(outRate),out=play(stream,{seconds:6,burst:2,stall:.08,stallEvery:1.5});
 assert.ok(stream.underruns>=1);
 assert.ok(stream.target>streamTiming.target*streamRate,'target grows after starving');
 assert.ok(stream.target<=streamTiming.maxTarget*streamRate);
 assert.ok(maxJump(out)<.05,'underruns fade instead of clicking');
});
test('catch-up bursts after a long stall skip stale audio instead of adding latency',()=>{
 const stream=new PcmStream(outRate),next=source();
 for(let i=0;i<40;i++)stream.push(...next());
 assert.equal(stream.trims>0,true);
 assert.ok(stream.fill<=stream.target+streamTiming.overflow*streamRate+perFrame);
 stream.clear();assert.equal(stream.fill,0);assert.equal(stream.primed,false);
});
test('rate control drains or refills toward the target without audible pitch change',()=>{
 const stream=new PcmStream(outRate),next=source(),L=new Float32Array(block),R=new Float32Array(block);
 for(let i=0;i<9;i++)stream.push(...next());
 const before=stream.fill;let read=stream.read;stream.render(L,R);
 const step=(stream.read-read)/block,nominal=streamRate/outRate;
 assert.ok(before>stream.target&&step>nominal&&step<=nominal*1.005+1e-12);
});

function workletFixture(){
 const posts=[],gains=[];let onmessage=null;
 globalThis.AudioWorkletNode=class{constructor(){this.port={postMessage:(m)=>posts.push(m),set onmessage(f){onmessage=f;},get onmessage(){return onmessage;}};}connect(){}disconnect(){}};
 const ctx={currentTime:1,sampleRate:48000,destination:{},audioWorklet:{addModule:async()=>{}},
  createGain:()=>({gain:{value:0,setValueAtTime(v,t){gains.push([v,t]);}},connect(){},disconnect(){}})};
 const dsp={samplesL:new Float64Array(534),samplesR:new Float64Array(534),sampleOffset:0};
 const updates=[],resyncs=[];
 const output=createAudioOutput({apu:{dsp}},{nativeGain:1,update:(c,on,t)=>updates.push(t),resync:t=>resyncs.push(t)});
 return{ctx,dsp,posts,gains,updates,resyncs,output,report:data=>onmessage({data})};
}
test('the worklet path streams raw DSP frames and keeps ki effects on the stream clock',async()=>{
 const f=workletFixture();
 assert.equal(await f.output.prepare(f.ctx),'worklet');
 f.dsp.sampleOffset=533;f.dsp.samplesL[0]=.25;
 const first=f.output.frame(f.ctx);
 assert.equal(f.dsp.sampleOffset,0);
 assert.equal(f.posts[0].left.length,533);assert.equal(f.posts[0].left[0],.25);
 assert.ok(Math.abs(first-(1+streamTiming.target))<1e-9,'unprimed stream starts after its target');
 assert.deepEqual(f.gains[0],[.4,first]);
 f.ctx.currentTime=1.1;f.report({epoch:0,time:1.1,written:533,fill:3200,primed:true,target:2400,underruns:0,trims:0});
 f.dsp.sampleOffset=533;const second=f.output.frame(f.ctx);
 assert.ok(Math.abs(second-(1.1+3200/streamRate))<1e-9);
 assert.deepEqual(f.updates,[first,second]);
 f.report({epoch:0,time:1.1,written:1066,fill:2400,primed:true,target:2400,underruns:1,trims:1});
 assert.equal(f.resyncs.length,1,'a trimmed stall cancels effects scheduled in the skipped audio');
 f.output.clear();assert.deepEqual(f.posts.at(-1),{clear:true,epoch:1});
 const count=f.posts.length;f.output.clear();assert.equal(f.posts.length,count,'repeated clears do not flood the port');
 f.report({epoch:0,time:1.2,written:1066,fill:9000,primed:true,target:2400,underruns:1,trims:1});
 assert.equal(f.output.queued,0,'reports from before a clear are ignored');
 delete globalThis.AudioWorkletNode;
});
