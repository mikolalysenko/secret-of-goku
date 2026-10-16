// Offline eight-voice tracker. Pulse/triangle oscillators, noise percussion,
// and a small, generated PCM instrument bank; no audio from the references.
// This renders SNES-style music, not an SPC file or a hardware emulator.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const sampleRate=32000;
const TAU=Math.PI*2,bankRate=16000,rootPitch=60,rootHz=261.625565;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hz=n=>440*2**((n-69)/12);
function random(seed){return()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2147483648-1;};}
function normalize(data){let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));return Int16Array.from(data,v=>Math.round(v/Math.max(peak,.001)*30000));}
const bank=new Map();
function sample(kind){
 if(bank.has(kind))return bank.get(kind);
 const noise=random(0x51a17),percussion=['kick','snare','tom','timpani','crash','hat','ride'].includes(kind);
 const length=percussion?(kind==='crash'?1.7:kind==='ride'?1.1:.85):1.2;
 const data=new Float64Array(Math.round(length*bankRate));let low=0,high=0;
 for(let i=0;i<data.length;i++){
  const t=i/bankRate,a=TAU*rootHz*t,n=noise();low+=.18*(n-low);high+=.65*(n-high);
  let v=0;
  if(kind==='kick')v=(Math.sin(TAU*(45*t+5.3*(1-Math.exp(-t*35))))+.22*(n-low)*Math.exp(-t*80))*Math.exp(-t*15);
  else if(kind==='snare')v=(.75*(n-low)+.32*Math.sin(TAU*184*t)*Math.exp(-t*12)+.18*Math.sin(TAU*327*t))*Math.exp(-t*19);
  else if(kind==='tom'||kind==='timpani'){
   const f=kind==='tom'?150:rootHz;
   v=(Math.sin(TAU*(f*t+.7*(1-Math.exp(-t*25))))+.42*Math.sin(TAU*f*1.505*t)+.21*Math.sin(TAU*f*1.96*t))*Math.exp(-t*(kind==='tom'?10:4.8))+.06*(n-low)*Math.exp(-t*55);
  }else if(['crash','hat','ride'].includes(kind)){
   const metallic=Math.sin(TAU*3371*t)*Math.sin(TAU*5281*t)+.6*Math.sin(TAU*4073*t)*Math.sin(TAU*2911*t);
   v=(.65*(high-low)+.23*metallic)*Math.exp(-t*(kind==='hat'?62:kind==='ride'?6:3.8));
  }else if(kind==='bell'){
   // Inharmonic upper partials retain the reference's low, tolling bell.
   for(const [ratio,amp,decay]of [[1,.6,1.5],[2,.18,2],[2.5,.12,3],[4,.3,3],[5.85,.45,4.2],[8,.12,6]])v+=amp*Math.sin(a*ratio)*Math.exp(-t*decay);
  }else if(kind==='piano'){
   for(let h=1;h<=9;h++)v+=Math.sin(a*h*(1+.00015*h*h))*(h===1?1:.7/h**1.4)*Math.exp(-t*(1.4+h*.7));
   v+=.055*(n-low)*Math.exp(-t*120);
  }else if(kind==='guitar'){
   const pluck=Math.sin(a)+.5*Math.sin(2*a)+.32*Math.sin(3*a)+.16*Math.sin(5*a);
   v=Math.tanh(pluck*(2.2+2*Math.exp(-t*24)))*(.6+.4*Math.exp(-t*12));
   v+=.07*(n-low)*Math.exp(-t*65);
  }else if(kind==='brass'||kind==='horn'){
   const bright=kind==='brass'?1.05:1.55;
   for(let h=1;h<=14;h++)v+=Math.sin(a*h+.008*Math.sin(TAU*5.1*t)*h)/h**bright*(1+.2*Math.exp(-t*30));
   v*=.8+.2*Math.exp(-t*8);
  }else if(kind==='strings'){
   for(let h=1;h<=10;h++)v+=(Math.sin(a*h)+.38*Math.sin(a*h*1.004)+.38*Math.sin(a*h*.996))/h**1.45;
  }else throw Error(`Unknown PCM instrument: ${kind}`);
  data[i]=v*Math.min(1,t/(percussion?.001:kind==='strings'?.065:kind==='brass'?.014:.003));
 }
 // Sustained instruments loop over 16 periods; crossfade the join in the bank.
 const looping=['brass','horn','strings','guitar'].includes(kind),loopEnd=Math.round(.98*bankRate),loopStart=loopEnd-Math.round(16*bankRate/rootHz);
 if(looping){const fade=96;for(let j=0;j<fade;j++){const f=j/fade;data[loopEnd-fade+j]=data[loopEnd-fade+j]*(1-f)+data[loopStart-fade+j]*f;}}
 const result={data:normalize(data),loopStart,loopEnd,looping,percussion,root:kind==='tom'?50:rootPitch};bank.set(kind,result);return result;
}
// Band-limited pulse edges keep the upper melody clear instead of aliasing.
function blep(t,dt){if(t<dt){t/=dt;return 2*t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+2*t+1;}return 0;}
function oscillator(kind,p,dt){
 if(kind==='triangle')return 2/Math.PI*Math.asin(Math.sin(TAU*p));
 const duty=kind==='pulse'?.25:.5;
 return (p<duty?1:-1)-2*duty+1+blep(p,dt)-blep((p-duty+1)%1,dt);
}

export function createScore({bpm,bars,title,lanes,sections}){
 if(lanes.length!==8)throw Error('A score must assign exactly eight monophonic voices');
 const events=Array.from({length:8},()=>[]),beat=60/bpm,totalBeats=bars*4;
 function note(lane,at,duration,pitch,instrument,volume=.3,options={}){
  if(!Number.isInteger(lane)||lane<0||lane>7||at<0||at>=totalBeats||duration<=0)throw Error('Invalid tracker event');
  events[lane].push({at,duration,pitch,instrument,volume,...options});
 }
 function phrase(lane,at,notes,instrument,volume=.3,transpose=0){for(const[t,n,d,v=1]of notes)if(n!==null)note(lane,at+t,d,n+transpose,instrument,volume*v);}
 function render(file,{out='assets/audio/music',stems=null}={}){
  const count=Math.round(totalBeats*beat*sampleRate),left=new Float64Array(count),right=new Float64Array(count),sendL=new Float64Array(count),sendR=new Float64Array(count),voiceStats=[];
  for(let lane=0;lane<8;lane++){
   const notes=events[lane].sort((a,b)=>a.at-b.at),mono=new Float32Array(count);let stolen=0;
   for(let j=0;j<notes.length;j++){
    const e=notes[j],start=Math.round(e.at*beat*sampleRate),hold=e.duration*beat,pcm=['square','pulse','triangle','noise'].includes(e.instrument)?null:sample(e.instrument);
    const release=e.instrument==='strings'?.15:e.instrument==='bell'?.35:e.instrument==='piano'?.12:pcm?.percussion?.025:.045;
    const next=notes[j+1]?.at??totalBeats+(notes[0]?.at??0),available=(next-e.at)*beat;
    if(available<hold-.0001)stolen++;
    const duration=Math.min(hold+release,available),n=Math.ceil(duration*sampleRate),freq=hz(e.pitch),rng=random(0x51f00d+j*31+lane*797),pan=clamp(e.pan??lanes[lane].pan??0,-1,1),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2),echo=e.echo??lanes[lane].echo??.15;
    let phase=0,position=0,filter=0,hp=0,previous=0;
    for(let k=0;k<n;k++){
     const t=k/sampleRate,vibrato=t>.16?(e.vibrato??.0035)*Math.sin(TAU*5.2*(t-.16)):0,delta=freq/sampleRate*(1+vibrato);
     let v;
     if(pcm){
      const speed=pcm.percussion&&!['timpani','tom'].includes(e.instrument)?1:2**((e.pitch-pcm.root)/12)*(1+vibrato);
      const index=Math.floor(position),f=position-index;
      if(index>=pcm.data.length)break;
      v=((pcm.data[index]??0)*(1-f)+(pcm.data[index+1]??0)*f)/32768;
      position+=bankRate/sampleRate*speed;if(pcm.looping&&position>=pcm.loopEnd)position=pcm.loopStart+(position-pcm.loopEnd)%(pcm.loopEnd-pcm.loopStart);
     }else if(e.instrument==='noise'){const q=rng();filter+=.22*(q-filter);v=(q-filter)*Math.exp(-t*36);}
     else{phase=(phase+delta)%1;v=oscillator(e.instrument,phase,delta);filter+=.52*(v-filter);v=filter;}
     let env=Math.min(1,t/(e.instrument==='strings'?.04:.004));
     if(t>hold)env*=Math.max(0,1-(t-hold)/release);
     // A short release before retrigger avoids clicks without overlapping voices.
     env*=clamp((duration-t)/.004,0,1);
     if(e.instrument==='triangle')env*=.65+.35*Math.exp(-t*7);
     if(e.instrument==='guitar')env*=Math.exp(-t*2.2);
     v*=env*e.volume;
     hp=v-previous+.995*hp;previous=v;v=hp;
     const ix=(start+k)%count;
     mono[ix]+=v;left[ix]+=v*l;right[ix]+=v*r;sendL[ix]+=v*l*echo;sendR[ix]+=v*r*echo;
    }
   }
   let energy=0;for(const v of mono)energy+=v*v;
   voiceStats.push({voice:lane+1,role:lanes[lane].role,notes:notes.length,instruments:[...new Set(notes.map(e=>e.instrument))],rms:Math.sqrt(energy/count),truncatedNotes:stolen});
   if(stems){mkdirSync(stems,{recursive:true});writeWav(`${stems}/${file.replace('.wav','')}-${lane+1}.wav`,mono,mono,1);}
  }
  // FIR-style stereo echo. Wrap the tail through the loop, so neither drums
  // nor sustained chords fall into a silent seam between repeats.
  for(const [delay,gain]of [[.375,.7],[.75,.35],[1.125,.16]]){
   const samples=Math.round(delay*beat*sampleRate);for(let i=0;i<count;i++){const ix=(i-samples+count)%count;left[i]+=sendR[ix]*gain;right[i]+=sendL[ix]*gain;}
  }
  let sum=0;for(let i=0;i<count;i++){sum+=left[i]**2+right[i]**2;}
  const drive=.17/Math.sqrt(sum/(count*2));let peak=0;
  for(const channel of[left,right]){let prev=0,hp=0,low=0;for(let i=0;i<count;i++){const v=channel[i]*drive;hp=v-prev+.998*hp;prev=v;low+=.68*(hp-low);channel[i]=Math.tanh(low*1.25)/1.25;peak=Math.max(peak,Math.abs(channel[i]));}}
  const gain=Math.min(1,.79/peak);
  // Only 1 ms at the wrap: retain downbeat transients, match the endpoints.
  for(const c of[left,right]){const edge=(c[0]+c[count-1])/2;for(let k=0;k<32;k++){const f=k/32;c[k]=edge*(1-f)+c[k]*f;c[count-1-k]=edge*(1-f)+c[count-1-k]*f;}}
  mkdirSync(out,{recursive:true});const bytes=writeWav(`${out}/${file}`,left,right,gain);
  const digest=createHash('sha256').update(bytes).digest('hex');
  const audit={file,title,bpm,bars,duration:count/sampleRate,voices:8,sections,channels:voiceStats,sha256:digest};
  if(stems)writeFileSync(`${stems}/${file.replace('.wav','')}-notes.json`,JSON.stringify(events));
  return audit;
 }
 return {note,phrase,render,events,bpm,bars};
}
function writeWav(path,left,right,gain){
 const count=left.length,b=Buffer.alloc(44+count*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*4,40);
 for(let i=0;i<count;i++){b.writeInt16LE(Math.round(clamp(left[i]*gain,-1,1)*32767),44+i*4);b.writeInt16LE(Math.round(clamp(right[i]*gain,-1,1)*32767),46+i*4);}
 writeFileSync(path,b);return b;
}

export function drums(score,bar,{intensity=1,fill=false,orchestral=false}={}){
 const at=bar*4,n=score.note;
 const kicks=intensity<.7?[0,2.5]:intensity>1.1?[0,.75,1.5,2,2.75,3.5]:[0,1.5,2.5];
 for(const t of kicks)n(5,at+t,orchestral&&t===0?.7:.4,orchestral&&t===0?41:36,orchestral&&t===0?'timpani':'kick',.52*intensity);
 for(const t of fill?[1]:[1,3])n(6,at+t,.32,38,'snare',.48*intensity);
 if(fill){for(let i=0;i<6;i++)n(6,at+2.5+i*.25,.2,55-i*2,i<2?'snare':'tom',(.3+i*.018)*intensity,{pan:-.4+i*.14});}
 else if(intensity>1)n(6,at+2.75,.12,38,'snare',.13);
 const steps=intensity>1.15?16:8;
 const crash=bar%8===0,ride=!crash&&orchestral&&bar%4===0;
 for(let i=0;i<steps;i++){const t=i*4/steps;if(crash&&t<1.5||ride&&t<1)continue;n(7,at+t,.12,0,i%2?'noise':'hat',(i%2?.065:.12)*Math.min(intensity,1.2));}
 if(crash)n(7,at,1.45,0,'crash',.28);
 else if(ride)n(7,at,.95,0,'ride',.18);
}
