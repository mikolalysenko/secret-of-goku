// Perceived-loudness measurements for round nine. ITU-R BS.1770 K-weighting
// (coefficients derived for any sample rate, as libebur128 does), momentary
// (400 ms) / short-term (3 s) loudness, gated integrated loudness, the
// 0.5–5 kHz band and a small-speaker variant high-passed at 200 Hz.
// Inputs are Float32/Float64 arrays at full scale ±1; stereo is [left,right].
const LOG=x=>10*Math.log10(Math.max(x,1e-20));

function biquad(x,[b0,b1,b2,a1,a2]){
 const y=new Float64Array(x.length);let x1=0,x2=0,y1=0,y2=0;
 for(let i=0;i<x.length;i++){const v=b0*x[i]+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x[i];y2=y1;y1=v;y[i]=v;}
 return y;
}
// BS.1770 stage 1 (high shelf) and stage 2 (RLB high-pass), any rate.
function kStages(rate){
 let f0=1681.974450955533,G=3.999843853973347,Q=.7071752369554196,K=Math.tan(Math.PI*f0/rate);
 const Vh=10**(G/20),Vb=Vh**.4996667741545416,a0=1+K/Q+K*K;
 const shelf=[(Vh+Vb*K/Q+K*K)/a0,2*(K*K-Vh)/a0,(Vh-Vb*K/Q+K*K)/a0,2*(K*K-1)/a0,(1-K/Q+K*K)/a0];
 f0=38.13547087602444;Q=.5003270373238773;K=Math.tan(Math.PI*f0/rate);
 const d=1+K/Q+K*K,rlb=[1,-2,1,2*(K*K-1)/d,(1-K/Q+K*K)/d];
 return [shelf,rlb];
}
export function kWeight(x,rate){let y=x;for(const s of kStages(rate))y=biquad(y,s);return y;}
// Butterworth sections (bilinear transform with prewarping).
function butter(rate,hz,order,type){
 const sections=[],K=Math.tan(Math.PI*hz/rate);
 for(let k=0;k<order/2;k++){
  const q=1/(2*Math.cos(Math.PI*(2*k+1)/(2*order))),d=1+K/q+K*K;
  sections.push(type==='hp'?[1/d,-2/d,1/d,2*(K*K-1)/d,(1-K/q+K*K)/d]:[K*K/d,2*K*K/d,K*K/d,2*(K*K-1)/d,(1-K/q+K*K)/d]);
 }
 return sections;
}
export function highpass(x,rate,hz=200,order=4){let y=x;for(const s of butter(rate,hz,order,'hp'))y=biquad(y,s);return y;}
export function lowpass(x,rate,hz,order=4){let y=x;for(const s of butter(rate,hz,order,'lp'))y=biquad(y,s);return y;}
export function band(x,rate,lo=500,hi=5000){return lowpass(highpass(x,rate,lo),rate,hi);}
const channels=x=>Array.isArray(x)?x:[x,x];
// Mean-square per window for each hop, summed over channels (BS.1770 G=1).
function windows(chs,rate,ms,hopMs){
 const n=Math.round(rate*ms/1000),hop=Math.round(rate*hopMs/1000),len=chs[0].length,out=[];
 const sq=chs.map(c=>{const p=new Float64Array(c.length+1);for(let i=0;i<c.length;i++)p[i+1]=p[i]+c[i]*c[i];return p;});
 for(let s=0;s+n<=Math.max(len,n);s+=hop){
  const e=Math.min(len,s+n);let z=0;for(const p of sq)z+=(p[e]-p[Math.min(s,len)])/n;out.push({start:s/rate,z});
  if(s+n>=len)break;
 }
 return out;
}
const lufs=z=>-.691+LOG(z);
// Weighted channels: K-weighting, optionally after the 200 Hz high-pass.
export function weighted(x,rate,{small=false}={}){return channels(x).map(c=>kWeight(small?highpass(c,rate,200):c,rate));}
export function momentary(x,rate,opts={}){return windows(weighted(x,rate,opts),rate,400,10).map(w=>({start:w.start,lufs:lufs(w.z)}));}
export function shortTerm(x,rate,opts={}){return windows(weighted(x,rate,opts),rate,3000,100).map(w=>({start:w.start,lufs:lufs(w.z)}));}
export function maxMomentary(x,rate,opts={}){return momentary(x,rate,opts).reduce((a,b)=>b.lufs>a.lufs?b:a,{lufs:-Infinity,start:0});}
export function maxShortTerm(x,rate,opts={}){return shortTerm(x,rate,opts).reduce((a,b)=>b.lufs>a.lufs?b:a,{lufs:-Infinity,start:0});}
// Gated integrated loudness: 400 ms blocks, 75% overlap, -70 LUFS absolute
// and -10 LU relative gates.
export function integrated(x,rate,opts={}){
 const blocks=windows(weighted(x,rate,opts),rate,400,100).filter(b=>lufs(b.z)>-70);
 if(!blocks.length)return -Infinity;
 const mean=a=>a.reduce((s,b)=>s+b.z,0)/a.length,gate=lufs(mean(blocks))-10,kept=blocks.filter(b=>lufs(b.z)>gate);
 return lufs(mean(kept));
}
// Band power (dBFS², both channels summed as in loudness) of the loudest
// 400 ms window, and the mean over all windows (for a steady music bed).
export function bandPower(x,rate,{lo=500,hi=5000,small=false}={}){
 const chs=channels(x).map(c=>band(small?highpass(c,rate,200):c,rate,lo,hi)),w=windows(chs,rate,400,10);
 return {maxDb:LOG(Math.max(...w.map(v=>v.z))),meanDb:LOG(w.reduce((s,v)=>s+v.z,0)/w.length)};
}
export function peakDb(x){let p=0;for(const c of channels(x))for(const v of c)p=Math.max(p,Math.abs(v));return 20*Math.log10(Math.max(p,1e-9));}
export function clippedCount(x,limit=32767/32768){let n=0;for(const c of channels(x))for(const v of c)if(Math.abs(v)>=limit)n++;return n;}
// Everything one table row needs for an isolated cue against a music bed.
export function cueMetrics(x,rate){
 const m=maxMomentary(x,rate),ms=maxMomentary(x,rate,{small:true}),b=bandPower(x,rate);
 return {momentaryLufs:m.lufs,momentaryAt:m.start,smallLufs:ms.lufs,bandMaxDb:b.maxDb,shortTermLufs:maxShortTerm(x,rate).lufs,peakDbFS:peakDb(x),clipped:clippedCount(x)};
}
export function musicMetrics(x,rate){
 const b=bandPower(x,rate);
 return {integratedLufs:integrated(x,rate),smallLufs:integrated(x,rate,{small:true}),bandMeanDb:b.meanDb,peakDbFS:peakDb(x)};
}
export function ratios(cue,music){
 return {sfxToMusicLu:cue.momentaryLufs-music.integratedLufs,smallLu:cue.smallLufs-music.smallLufs,bandDb:cue.bandMaxDb-music.bandMeanDb};
}
export function int16Stereo(l,r){return [Float64Array.from(l,v=>v/32768),Float64Array.from(r,v=>v/32768)];}
