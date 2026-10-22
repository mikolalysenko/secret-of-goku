// Offline sound design. Deterministic BRR textures: no gameplay synthesis,
// streaming, shared DSP-noise retuning or CPU parameter commands.
import {readFileSync} from 'node:fs';
import {readWav,resample} from './audio-brr.mjs';

export const DESIGNS8=[
 {name:'arc',seed:0xA1C017,body:.65,grit:.40,whine:.10,crack:1.0},
 {name:'rupture',seed:0x7A11B3,body:.95,grit:.34,whine:.055,crack:1.2},
 {name:'storm',seed:0x570A43,body:.75,grit:.60,whine:.07,crack:.8},
];
function random(seed){return()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/0x80000000-1;};}
function unit(a,peak=1){const mean=a.reduce((s,x)=>s+x,0)/a.length,m=Math.max(...a.map(x=>Math.abs(x-mean)));return Float32Array.from(a,x=>(x-mean)/m*peak);}
function lowpass(a,rate,hz){
 const k=1-Math.exp(-2*Math.PI*hz/rate),out=new Float32Array(a.length);let v=0;
 // Two warm loops make the filtering circular, avoiding a DC discontinuity.
 for(let p=0;p<3;p++)for(let i=0;i<a.length;i++){v+=k*(a[i]-v);out[i]=v;}
 return unit(out);
}
function noise(n,seed){const r=random(seed);return Float32Array.from({length:n},()=>r());}
function seam(a,n=32){
 // Soften the join with an overlap; BRR loop-entry prediction is handled
 // separately by the encoder. This is not an exact derivative match.
 for(let i=0;i<n;i++){const w=.5-.5*Math.cos(Math.PI*i/n),v=a[i]*w+a[a.length-n+i]*(1-w);a[i]=v;}
 return a;
}
export function rumble8(n=768,rate=6000,design=1){
 const d=DESIGNS8[design],w=noise(n,d.seed),low=lowpass(w,rate,230),mid=lowpass(w,rate,1100);
 return unit(seam(Float32Array.from(w,(v,i)=>Math.tanh(2.6*(d.body*low[i]+.33*mid[i]+.20*v)))),.91);
}
export function hum8(n=512,rate=4000,design=1){
 const d=DESIGNS8[design],w=lowpass(noise(n,d.seed+7),rate,900);
 // 62.5/93.75 Hz with harsh mains harmonics at 4 kHz, independent of the
 // loop length: any multiple of 128 samples holds whole cycles of all three.
 if(n%128)throw Error('hum loop must hold whole 93.75 Hz cycles');
 return unit(Float32Array.from(w,(v,i)=>Math.tanh(1.6*(Math.sin(i*Math.PI/32)+.33*Math.sin(i*Math.PI*3/32)+.25*Math.sin(i*Math.PI*3/64)))+.20*v),.88);
}
export function arc8(n,rate,design=1,{attack=0}={}){
 const d=DESIGNS8[design],r=random(d.seed+11),w=noise(n,d.seed+13),low=lowpass(w,rate,160),roar=lowpass(w,rate,1600);
 const bursts=new Float32Array(n);let i=0;
 while(i<n){
  i+=Math.max(8,Math.round((.003+(r()+1)*.012)*rate));
  const len=Math.round((.001+(r()+1)*.002)*rate),v=.3+.7*(r()+1)/2;
  for(let j=0;j<len&&i+j<n;j++)bursts[i+j]+=v*Math.exp(-5*j/len);
 }
 const a=Float32Array.from(w,(v,i)=>{
  const t=i/rate,phase=2*Math.PI*(430*t+550*t*t);
  const growl=Math.tanh(3.4*(d.body*low[i]+d.grit*roar[i]));
  const arc=v*(.18+d.crack*bursts[i]);
  const whine=d.whine*Math.sin(phase+2.1*Math.sin(phase*.497));
  const onset=attack?Math.min(1,i/(rate*.002)):1;
  return onset*Math.tanh(1.2*(growl+arc+whine));
 });
 return unit(attack?a:seam(a),.87);
}
export function teleport8(rate=10000){
 const w=readWav(readFileSync(new URL('../../assets/audio/dbz/teleport.wav',import.meta.url))),src=resample(w.pcm,w.rate,rate);
 // Preserve the full 830 ms clip. Only the final 8 ms gets an endpoint fade.
 for(let i=0;i<Math.round(rate*.008);i++)src[src.length-1-i]*=i/(rate*.008);
 return src.map(v=>Math.tanh(v*1.65)*.94);
}
