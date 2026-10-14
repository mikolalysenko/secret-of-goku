// Original compositions for this mod, not transcriptions of the TV score.
// Eight sample-style instruments, short looped timbres, 12-bit output
// and stereo feedback echo evoke a cartridge soundtrack. No source audio.
import {mkdirSync,writeFileSync} from 'node:fs';
const rate=22050,TAU=2*Math.PI,root='assets/audio/music';mkdirSync(root,{recursive:true});
function compose(name,bpm,bars){
 const beat=60/bpm,length=Math.round(bars*4*beat*rate),left=new Float64Array(length),right=new Float64Array(length);
 let seed=0x71ace;
 const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2147483648-1;};
 function note(at,duration,midi,kind,level=.15,pan=0){
  const start=Math.round(at*beat*rate),count=Math.round((duration*beat+.18)*rate),freq=440*2**((midi-69)/12),hold=duration*beat;
  let low=0,phase=0;
  for(let i=0;i<count;i++){
   const t=i/rate,release=Math.max(0,Math.min(1,1-(t-hold)/.18));if(!release)break;
   let env=Math.min(1,t/(kind==='pad'?.10:.006))*release,value;
   phase+=freq/rate*(1+.003*Math.sin(TAU*5*t));const a=TAU*phase;
   if(kind==='pad')value=.7*Math.sin(a)+.18*Math.sin(2*a)+.09*Math.sin(3*a);
   else if(kind==='bell'){value=(Math.sin(a)+.4*Math.sin(a*2)+.15*Math.sin(a*3))*Math.exp(-t*3);}
   else if(kind==='bass')value=(Math.sin(a)+.35*Math.sin(2*a)+.12*Math.sin(3*a))*Math.exp(-t*2);
   else if(kind==='lead'){value=Math.tanh((Math.sin(a)+.35*Math.sin(a*2)+.3*Math.sin(a*3))*1.8)*(.65+.35*Math.exp(-t*10));}
   else if(kind==='pluck')value=(Math.sin(a)+.55*Math.sin(2*a)+.25*Math.sin(4*a))*Math.exp(-t*8);
   else if(kind==='kick'){value=Math.sin(TAU*(48*t+7*(1-Math.exp(-t*28))))*Math.exp(-t*16)+noise()*.13*Math.exp(-t*60);env=release;}
   else if(kind==='snare'){const n=noise();low+=.2*(n-low);value=(n-low)*Math.exp(-t*22)+Math.sin(TAU*172*t)*.35*Math.exp(-t*28);env=release;}
   else{const n=noise();low+=.12*(n-low);value=(n-low)*Math.exp(-t*55);env=release;}
   const v=value*env*level,ix=(start+i)%length;left[ix]+=v*Math.sqrt((1-pan)/2);right[ix]+=v*Math.sqrt((1+pan)/2);
  }
 }
 const arrival=name==='arrival',orbit=name==='orbit';
 const roots=arrival?[38,39,34,33,38,41,39,33]:orbit?[40,41,36,35,40,43,36,35,40,38,36,35,40,43,41,35]:[40,36,43,38,40,36,43,35,45,41,48,43,40,36,38,35];
 const phrases=[[76,71,74,76,79,78,74,71],[72,76,79,76,74,72,71,67],[79,78,74,71,74,78,79,83],[78,74,71,69,71,74,78,74]];
 for(let bar=0;bar<bars;bar++){
  const r=roots[bar%roots.length],at=bar*4;
  for(const[n,k]of[[r+12,0],[r+15,1],[r+19,2]])note(at,3.75,n,'pad',arrival?.13:.08,(k-1)*.6);
  if(arrival){
   note(at,3.6,r-12,'bass',.26);note(at,3.5,r,'pad',.08);
   if(bar%2===0)for(let i=0;i<3;i++)note(at+i*.75,.7,[69,65,63,62][(i+bar)%4],'bell',.13,i%2?.55:-.55);
   note(at,.4,24,'kick',.36);if(bar%2)note(at+3,.25,24,'snare',.15);
  }else{
   for(let i=0;i<8;i++){note(at+i*.5,.38,r+(i===3||i===7?7:0),'bass',.23);note(at+i*.5,.07,40,'hat',i%2?.09:.14,i%2?.3:-.3);}
   for(const b of orbit?[0,1.5,2,2.75,3.5]:[0,1.5,2.5])note(at+b,.3,24,'kick',.4);
   for(const b of[1,3])note(at+b,.23,24,'snare',.32);
   if(bar%4===3)for(const b of[3.5,3.75])note(at+b,.14,24,'snare',.16);
   const melody=phrases[bar%4];
   for(let i=0;i<8;i++)note(at+i*.5,.42,melody[i]+(bar>=8?5:0)+(orbit?12:0),orbit?'pluck':'lead',orbit?.15:.12,(bar%2?-.15:.15));
  }
 }
 // Echo taps wrap at the musical boundary, avoiding an audible loop seam.
 const dryL=left.slice(),dryR=right.slice();
 for(const[seconds,level]of[[.14,.18],[.28,.10],[.42,.045]]){
  const delay=Math.round(seconds*rate);
  for(let i=0;i<length;i++){const src=(i-delay+length)%length;left[i]+=dryR[src]*level;right[i]+=dryL[src]*level;}
 }
 const out=Buffer.alloc(44+length*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(length*4,40);
 for(let i=0;i<length;i++)for(const[ch,data]of[[0,left],[1,right]]){const v=Math.round(Math.tanh(data[i]*1.5)*.82*2047)/2047;out.writeInt16LE(Math.round(v*32767),44+i*4+ch*2);}
 writeFileSync(`${root}/${name}.wav`,out);return{file:`${name}.wav`,bpm,bars,duration:length/rate,instruments:8};
}
const tracks=[compose('arrival',72,8),compose('battle',128,16),compose('orbit',152,16)];
writeFileSync(`${root}/score.json`,JSON.stringify({author:'Original compositions for Secret of Goku',license:'MIT',source:'scripts/compose-frieza-score.mjs',titles:['Five Minutes','Fury Above Mana','Orbit Breaker'],sampleRate:rate,tracks},null,2)+'\n');
console.log(tracks);
