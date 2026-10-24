// One resident BRR cycle of rushing ki. All filtering, pulse shaping and
// saturation happen at build time; the S-DSP only plays the finished loop.
export const CHARGE_FRAMES=288,CHARGE_RATE=3000,CHARGE_SCALE=236;

export function chargePulse(){
 const n=CHARGE_FRAMES,rate=CHARGE_RATE;
 let seed=0xDB21993;
 const noise=Float64Array.from({length:n},()=>{
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  return (seed>>>0)/0x80000000-1;
 });
 const out=new Float32Array(n);
 let low=0,x1=0,x2=0,y1=0,y2=0;
 // Warm the circular filters before keeping a cycle. A moving broad
 // resonance gives the breathy "fwoosh" instead of a pitched mains buzz
 // or a separate spring/whistle. The pulse never gates to silence.
 for(let pass=0;pass<12;pass++)for(let i=0;i<n;i++){
  const swell=.5-.5*Math.cos(2*Math.PI*i/n);
  const w=2*Math.PI*(380+500*swell)/rate,alpha=Math.sin(w)/2.4;
  low+=.18*(noise[i]-low);
  const x=noise[i]-low;
  const y=(alpha*(x-x2)+2*Math.cos(w)*y1-(1-alpha)*y2)/(1+alpha);
  x2=x1;x1=x;y2=y1;y1=y;
  out[i]=(.52+.48*swell)*Math.tanh(7*(y+.12*x+.12*low));
 }
 const mean=out.reduce((s,v)=>s+v,0)/n;
 const peak=out.reduce((s,v)=>Math.max(s,Math.abs(v-mean)),0);
 return out.map(v=>(v-mean)*.96/peak);
}
