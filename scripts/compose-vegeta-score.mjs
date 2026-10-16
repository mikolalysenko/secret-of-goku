// Royal Rivalry: an original retro anime battle theme for the Time Chamber.
// A shared brass hook gets a faster, guitar-backed Super Saiyan arrangement.
// Eight instrument lanes, small looped waveforms and a short stereo echo;
// no recordings or melodies sampled from the television soundtrack.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const rate=22050,TAU=Math.PI*2,root='assets/audio/music';
mkdirSync(root,{recursive:true});
const tables=Object.fromEntries(['brass','guitar','bass','strings'].map(kind=>{
 const wave=Float64Array.from({length:256},(_,i)=>{
  const a=i/256*TAU;let v=0;
  for(let h=1;h<=12;h++){
   const amp=kind==='brass'?1/h**1.05:kind==='guitar'?(h%2?1:.36)/h**1.1:kind==='bass'?(h<5?1/h**1.5:0):1/h**1.4;
   v+=Math.sin(a*h+(kind==='guitar'?h*.13:0))*amp;
  }return v;
 });
 const max=Math.max(...wave.map(Math.abs));return[kind,wave.map(v=>Math.round(v/max*511)/511)];
}));
const phrases=[
 [[0,74,.5],[.75,77,.25],[1,81,.75],[2,79,.5],[2.5,77,.25],[3,76,.5],[3.5,74,.25]],
 [[0,70,1],[1.5,74,.5],[2,77,.75],[3,76,.5],[3.5,74,.25]],
 [[0,72,.5],[.5,76,.5],[1,79,.5],[2,81,.5],[2.75,79,.25],[3,76,.75]],
 [[0,73,.75],[1,76,.75],[2,81,.5],[2.5,79,.25],[3,77,.25],[3.5,76,.25]],
 [[0,77,.75],[1,81,.5],[1.75,84,.25],[2,86,.75],[3,84,.5],[3.5,81,.25]],
 [[0,79,.75],[1,76,.75],[2,72,.5],[2.75,74,.25],[3,76,.75]],
 [[0,79,.5],[.75,82,.25],[1,86,.75],[2,84,.5],[2.5,82,.25],[3,81,.5],[3.5,79,.25]],
 [[0,81,1],[1.25,79,.25],[1.75,77,.25],[2,76,.5],[2.75,73,.25],[3.25,76,.25],[3.75,73,.2]],
];
const chords=[
 [38,53,57],[34,53,58],[36,52,55],[33,52,61],
 [41,57,60],[36,55,60],[43,58,62],[33,55,61],
];
function compose(gold){
 const bpm=gold?168:152,beat=60/bpm,bars=32,total=Math.round(bars*4*beat*rate);
 const lanes=Array.from({length:8},()=>new Float64Array(total)),pans=[0,-.12,.22,-.5,.5,0,.08,-.3];let seed=0x71cafe;
 const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2147483648-1;};
 function note(lane,at,duration,pitch,kind,volume){
  const start=Math.round(at*beat*rate),hold=duration*beat,release=kind==='strings'?.11:.045,count=Math.round((hold+release)*rate);
  const freq=440*2**((pitch-69)/12),wave=tables[kind];let phase=0,low=0;
  for(let i=0;i<count&&start+i<total;i++){
   const t=i/rate,tail=Math.min(1,Math.max(0,1-(t-hold)/release));if(!tail)break;
   let v,env=tail;
   if(wave){
    phase+=freq/rate*(1+(kind==='brass'&&t>.11?.004*Math.sin(TAU*5.4*t):0));
    const sample=wave[Math.floor(phase*256)&255];
    const filter=kind==='bass'?.20:kind==='strings'?.30:.54;low+=filter*(sample-low);v=low;
    env*=Math.min(1,t/(kind==='strings'?.025:.005));
    env*=kind==='guitar'?Math.exp(-t*3.4):kind==='bass'?Math.exp(-t*2.1):.68+.32*Math.exp(-t*12);
   }else if(kind==='kick')v=(Math.sin(TAU*(44*t+5.8*(1-Math.exp(-t*34))))+.08*noise()*Math.exp(-t*60))*Math.exp(-t*17);
   else if(kind==='snare'){const n=noise();low+=.24*(n-low);v=((n-low)*.8+Math.sin(TAU*183*t)*.4)*Math.exp(-t*23);}
   else if(kind==='tom')v=(Math.sin(TAU*(pitch*t+2*(1-Math.exp(-t*25))))+.08*noise())*Math.exp(-t*15);
   else{const n=noise();low+=.18*(n-low);v=(n-low)*Math.exp(-t*(kind==='crash'?5.5:65));}
   const index=start+i,blend=Math.min(1,i/44);
   lanes[lane][index]=lanes[lane][index]*(1-blend)+v*env*volume*blend;
  }
 }
 for(let bar=0;bar<bars;bar++){
  const bridge=bar%16>=8,c=chords[(bridge?4:0)+(bar%4)],at=bar*4;
  // The opening motif returns after a contrasting major-key lift.
  const phrase=phrases[(bridge?4:0)+(bar%4)];
  for(const[t,n,d]of phrase)note(1,at+t,d*.92,n,'brass',.26);
  if(bar%2===1)for(const[t,n]of[[2.5,c[2]+12],[3,c[1]+12],[3.5,c[2]+12]])note(2,at+t,.3,n,gold?'guitar':'brass',gold?.15:.11);
  if(gold&&bar%2===0)for(let i=0;i<8;i++)note(2,at+i*.5,.19,c[0]+24+(i%4===3?7:0),'guitar',.13);
  for(let i=0;i<8;i++)note(0,at+i*.5,.39,c[0]+(i===3||i===6?7:i===7&&bar%4===3?-1:0),'bass',.31);
  const stabs=gold?[0,.75,1.5,2,2.75,3.5]:[0,1.5,2.75];
  for(const t of stabs){note(3,at+t,.33,c[1],gold?'guitar':'strings',.15);note(4,at+t,.33,c[2],'strings',.15);}
  for(const t of gold?[0,.75,1.5,2,2.75,3.5]:[0,1.5,2.5])note(5,at+t,.35,36,'kick',.68);
  for(const t of[1,3])note(6,at+t,.23,38,'snare',.53);
  for(let i=0;i<(gold?16:8);i++)note(7,at+i/(gold?4:2),.065,0,'hat',i%2?.085:.14);
  if(bar%8===0)note(7,at,.65,0,'crash',.24);
  if(bar%4===3)for(let i=0;i<4;i++)note(6,at+3+i*.25,.15,160-i*22,i===0?'snare':'tom',.28+i*.025);
 }
 const left=new Float64Array(total),right=new Float64Array(total);
 for(let v=0;v<8;v++)for(let i=0;i<total;i++){left[i]+=lanes[v][i]*Math.sqrt((1-pans[v])/2);right[i]+=lanes[v][i]*Math.sqrt((1+pans[v])/2);}
 const dryL=left.slice(),dryR=right.slice();
 for(const[beats,gain]of[[.375,.13],[.75,.065],[1.125,.025]]){
  const delay=Math.round(beats*beat*rate);
  for(let i=0;i<total;i++){const from=(i-delay+total)%total;left[i]+=dryR[from]*gain;right[i]+=dryL[from]*gain;}
 }
 // A short circular blend keeps sample boundaries quiet without a gap.
 const seam=96;
 for(const channel of[left,right]){const target=(channel[0]+channel[total-1])/2;for(let i=0;i<seam;i++){const t=i/seam;channel[i]=target*(1-t)+channel[i]*t;channel[total-1-i]=target*(1-t)+channel[total-1-i]*t;}}
 const out=Buffer.alloc(44+total*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(total*4,40);
 for(let i=0;i<total;i++)for(const[channel,data]of[[0,left],[1,right]])out.writeInt16LE(Math.round(Math.tanh(data[i]*1.5)*.79*2047)*16,44+i*4+channel*2);
 const file=gold?'vegeta-full-power.wav':'vegeta.wav';writeFileSync(`${root}/${file}`,out);
 return{file,title:gold?'Royal Rivalry — Full Power':'Royal Rivalry',bpm,bars,duration:total/rate,voices:8,sha256:createHash('sha256').update(out).digest('hex')};
}
const tracks=[compose(false),compose(true)];
writeFileSync(`${root}/vegeta-score.json`,JSON.stringify({author:'Original compositions for Secret of Goku',license:'MIT',source:'scripts/compose-vegeta-score.mjs',description:'Original brass-led retro anime sparring theme, with a faster Super Saiyan arrangement. No TV recording or melody is sampled.',sampleRate:rate,quantizationBits:12,tracks},null,2)+'\n');
console.log(tracks);
