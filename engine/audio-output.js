import {streamRate,streamTiming} from './audio-worklet.js';
// Native SNES audio output on the same clock as ki effects.
// Preferred path: each emulated frame's raw DSP samples stream into an
// AudioWorklet ring buffer (engine/audio-worklet.js) that resamples on the
// audio thread and adapts its buffering to main-thread jitter. Browsers
// without AudioWorklet fall back to one short buffer node per frame; there a
// missed video frame must not permanently add latency to that clock.
export const audioTiming=Object.freeze({lead:.025,maxLead:.075});
const workletUrl=new URL('./audio-worklet.js',import.meta.url);
export function createAudioOutput(snes,sound){
 let context=null,next=0,worklet=null,loading=null,epoch=0,sent=0,report=null,trims=0;
 const pending=new Set(),stats={frames:0,resyncs:0,lead:0,underruns:0,peak:0,target:streamTiming.target,mode:'idle'};
 function clearBuffers(){
  for(const item of pending){try{item.source.stop();}catch{}item.source.disconnect();item.gain.disconnect();}
  pending.clear();next=0;
 }
 function clear(){
  clearBuffers();stats.lead=0;
  if(worklet&&(sent||report?.fill)){epoch++;sent=0;report=null;worklet.node.port.postMessage({clear:true,epoch});}
 }
 function dispose(){
  clear();
  if(worklet){worklet.node.port.onmessage=null;worklet.node.disconnect();worklet.gain.disconnect();worklet=null;}
 }
 // Resolves once the worklet is running (or the fallback is chosen).
 function prepare(ctx){
  if(context!==ctx){dispose();context=ctx;loading=null;stats.mode='idle';}
  if(loading)return loading;
  if(!ctx.audioWorklet||typeof AudioWorkletNode!=='function'){stats.mode='buffers';return loading=Promise.resolve(stats.mode);}
  stats.mode='loading';
  return loading=ctx.audioWorklet.addModule(workletUrl.href).then(()=>{
   if(context!==ctx)return stats.mode;
   const node=new AudioWorkletNode(ctx,'snes-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]}),gain=ctx.createGain();
   gain.gain.value=0;node.connect(gain);gain.connect(ctx.destination);
   node.port.onmessage=({data})=>{
    if(data.epoch!==epoch)return;
    report={...data,at:ctx.currentTime};stats.underruns=data.underruns;stats.peak=Math.max(stats.peak,data.peak);stats.target=data.target/streamRate;
    // The worklet skipped stale audio after a stall: cancel ki effects that
    // were scheduled for the discarded stretch.
    if(data.trims>trims){trims=data.trims;stats.resyncs++;sound.resync?.(ctx.currentTime);}
   };
   worklet={node,gain,level:0};epoch=0;sent=0;report=null;trims=0;stats.mode='worklet';return stats.mode;
  }).catch(()=>{if(context===ctx)stats.mode='buffers';return stats.mode;});
 }
 // Queued source samples ahead of the audio clock, estimated from the last
 // worklet report plus everything posted since.
 function queuedSamples(now){
  if(!report)return sent;
  const played=report.primed?Math.max(0,now-report.time)*streamRate:0;
  return Math.max(0,report.fill+sent-report.written-played);
 }
 function streamFrame(ctx){
  const now=ctx.currentTime,dsp=snes.apu.dsp,n=Math.min(dsp.sampleOffset,dsp.samplesL.length);
  const queued=queuedSamples(now),primed=report?.primed,target=report?.target??streamTiming.target*streamRate;
  const when=now+(primed?queued:Math.max(queued,target))/streamRate;
  const left=Float32Array.from(dsp.samplesL.subarray(0,n)),right=Float32Array.from(dsp.samplesR.subarray(0,n));
  dsp.sampleOffset=0;
  sound.update(ctx,true,when);
  const level=.4*sound.nativeGain;
  if(level!==worklet.level){worklet.gain.gain.setValueAtTime(level,when);worklet.level=level;}
  worklet.node.port.postMessage({left,right,epoch},[left.buffer,right.buffer]);
  sent+=n;stats.frames++;stats.lead=when-now;
  return when;
 }
 function bufferFrame(ctx){
  const now=ctx.currentTime;
  // onended is delivered on the main thread and can itself be delayed by
  // the same stalled render. Release already-finished blocks immediately.
  for(const item of pending)if(item.until<=now){pending.delete(item);item.source.disconnect();item.gain.disconnect();}
  if(next-now>audioTiming.maxLead){
   clearBuffers();sound.resync?.(now);stats.resyncs++;
  }
  const when=Math.max(next,now+audioTiming.lead);
  const samples=Math.round(ctx.sampleRate/60),buffer=ctx.createBuffer(2,samples,ctx.sampleRate);
  snes.setSamples(buffer.getChannelData(0),buffer.getChannelData(1),samples);
  sound.update(ctx,true,when);
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  source.buffer=buffer;gain.gain.value=.4*sound.nativeGain;source.connect(gain);gain.connect(ctx.destination);
  const item={source,gain,until:when+buffer.duration};pending.add(item);
  source.onended=()=>{pending.delete(item);source.disconnect();gain.disconnect();};
  source.start(when);next=when+buffer.duration;stats.frames++;stats.lead=when-now;
  return when;
 }
 function frame(ctx){
  prepare(ctx);
  if(worklet)return streamFrame(ctx);
  if(stats.mode==='buffers')return bufferFrame(ctx);
  // The worklet module is still loading (first few frames after unlock).
  snes.apu.dsp.sampleOffset=0;const when=ctx.currentTime+audioTiming.lead;sound.update(ctx,true,when);return when;
 }
 return{frame,clear,prepare,dispose,stats,
  get queued(){return worklet?Math.round(queuedSamples(context.currentTime)/(streamRate/60)):pending.size;}};
}
