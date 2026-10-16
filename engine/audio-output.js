// One short PCM block per emulated frame, on the same clock as ki effects.
// A missed video frame must not permanently add latency to that clock.
export const audioTiming=Object.freeze({lead:.025,maxLead:.075});
export function createAudioOutput(snes,sound){
 let context=null,next=0;
 const pending=new Set(),stats={frames:0,resyncs:0,lead:0};
 function clear(){
  for(const item of pending){try{item.source.stop();}catch{}item.source.disconnect();item.gain.disconnect();}
  pending.clear();next=0;stats.lead=0;
 }
 function frame(ctx){
  if(context!==ctx){clear();context=ctx;}
  const now=ctx.currentTime;
  // onended is delivered on the main thread and can itself be delayed by
  // the same stalled render. Release already-finished blocks immediately.
  for(const item of pending)if(item.until<=now){pending.delete(item);item.source.disconnect();item.gain.disconnect();}
  if(next-now>audioTiming.maxLead){
   clear();sound.resync?.(now);stats.resyncs++;
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
 return{frame,clear,stats,get queued(){return pending.size;}};
}
