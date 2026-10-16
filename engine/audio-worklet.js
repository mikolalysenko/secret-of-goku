// Continuous SNES PCM stream for the audio rendering thread.
// The main thread pushes each emulated frame's raw 32 kHz DSP output; this
// side resamples it on the audio clock. Buffering adapts to the device: a
// starved queue fades out, re-primes, and raises its target slightly, so
// mobile browsers with jittery main threads (iOS Safari) play smoothly
// instead of stitching hundreds of tiny, slightly misaligned buffer nodes.
// The SPC700/DSP runs at 32040 Hz per 60.0988 Hz frame; the player steps
// frames at exactly 60 Hz, so the stream is consumed at that frame rate.
export const streamRate=32040*60/60.0988;
export const streamTiming=Object.freeze({target:.05,maxTarget:.16,grow:.012,shrink:.002,overflow:.12,trim:.6});
export class PcmStream{
 constructor(outRate,{inRate=streamRate,capacity=1<<15}={}){
  this.ratio=inRate/outRate;this.inRate=inRate;this.mask=capacity-1;
  this.left=new Float32Array(capacity);this.right=new Float32Array(capacity);
  this.base=streamTiming.target*inRate;this.target=this.base;
  this.read=0;this.written=0;this.primed=false;this.level=0;this.holdL=0;this.holdR=0;
  this.underruns=0;this.trims=0;this.clean=0;
 }
 get fill(){return this.written-this.read;}
 clear(){this.read=this.written=0;this.primed=false;this.level=0;this.holdL=this.holdR=0;}
 push(left,right){
  const n=Math.min(left.length,this.mask);
  for(let i=0;i<n;i++){const at=(this.written+i)&this.mask;this.left[at]=left[i];this.right[at]=right[i];}
  this.written+=n;
  // A long main-thread stall followed by a catch-up burst must not add
  // permanent latency: skip ahead to the target, keeping the newest audio.
  if(this.fill>this.target+streamTiming.overflow*this.inRate){this.read=this.written-this.target;this.trims++;}
 }
 render(outL,outR){
  const frames=outL.length,mask=this.mask,fade=1/96;
  if(!this.primed&&this.fill>=this.target)this.primed=true;
  // ±0.5% rate control keeps the queue near its target without audible pitch change.
  const error=Math.max(-1,Math.min(1,(this.fill-this.target)/this.target));
  const step=this.ratio*(1+.005*error);
  let i=0;
  if(this.primed){
   for(;i<frames;i++){
    const at=Math.floor(this.read),f=this.read-at;
    if(at+1>=this.written){this.primed=false;this.underruns++;this.clean=0;this.target=Math.min(streamTiming.maxTarget*this.inRate,this.target+streamTiming.grow*this.inRate);break;}
    const a=at&mask,b=(at+1)&mask;
    this.level=Math.min(1,this.level+fade);
    this.holdL=this.left[a]+(this.left[b]-this.left[a])*f;this.holdR=this.right[a]+(this.right[b]-this.right[a])*f;
    outL[i]=this.holdL*this.level;outR[i]=this.holdR*this.level;
    this.read+=step;
   }
   // After ~5 s without starving, ease the target back toward the base.
   if(i===frames&&(this.clean+=frames)>5*this.inRate/this.ratio){this.clean=0;this.target=Math.max(this.base,this.target-streamTiming.shrink*this.inRate);}
  }
  // Starved or priming: fade the last sample out instead of clicking to zero.
  for(;i<frames;i++){this.level=Math.max(0,this.level-fade);outL[i]=this.holdL*this.level;outR[i]=this.holdR*this.level;}
 }
}
if(typeof registerProcessor==='function'){
 registerProcessor('snes-pcm',class extends AudioWorkletProcessor{
  constructor(){
   super();this.stream=new PcmStream(sampleRate);this.blocks=0;this.epoch=0;this.peak=0;
   this.port.onmessage=({data})=>{
    if(data.left){this.stream.push(data.left,data.right);return;}
    if(data.clear){this.stream.clear();this.epoch=data.epoch;}
   };
  }
  process(inputs,outputs){
   const out=outputs[0],left=out[0],right=out[1]||out[0];
   this.stream.render(left,right);
   for(let i=0;i<left.length;i++)this.peak=Math.max(this.peak,Math.abs(left[i]),Math.abs(right[i]));
   // Report the queue about every 20 ms so the main thread can place ki
   // effects on the same clock as the native music and sound effects.
   if((++this.blocks&7)===0){const s=this.stream;this.port.postMessage({epoch:this.epoch,time:currentTime,written:s.written,fill:s.fill,primed:s.primed,target:s.target,underruns:s.underruns,trims:s.trims,peak:this.peak});this.peak=0;}
   return true;
  }
 });
}
