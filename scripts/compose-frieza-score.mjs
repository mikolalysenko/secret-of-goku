// Five Minutes remains the original entrance cue. The two combat cues below
// arrange the user-supplied Kikuchi battle suite using eight tracker voices.
// No audio from the reference recording is included in the rendered tracks.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createScore,drums,sampleRate} from './tracker-score.mjs';
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

const reference={title:'Kaibutsu Freeza vs Densetsu no Super Saiyajin',composer:'Shunsuke Kikuchi',url:'https://www.youtube.com/watch?v=5CpQ-uBRa78',material:'F-minor battle march and brass answers in the opening movement, especially 0:10–0:42 and 0:44–1:22'};
const lanes=[
 {role:'PCM brass / square lead',pan:-.22,echo:.28},
 {role:'PCM strings / pulse ostinato',pan:.55,echo:.18},
 {role:'Triangle / low horn bass',pan:0,echo:.02},
 {role:'PCM horn inner harmony',pan:-.65,echo:.24},
 {role:'PCM strings / answering pulse',pan:.65,echo:.3},
 {role:'PCM timpani / kick',pan:0,echo:.10},
 {role:'PCM military snare / tom rolls',pan:-.18,echo:.15},
 {role:'Noise percussion / PCM crash and ride',pan:.32,echo:.2},
];
// The reference's F pedal, G–F answer and rising C–F–G–Ab brass call.
// The C7 answer uses C–E–G–Bb; the descending Eb–D–Db–C line turns home.
// Gates leave room for the military percussion and the string ostinato.
const march=[
 [[0,65,.65],[.75,65,.2],[1.5,65,.55],[2.25,63,.2],[2.5,65,1.1]],
 [[0,65,1.4],[1.5,67,.8],[2.5,65,.45],[3,72,.7]],
 [[0,65,.7],[1,65,.3],[1.5,65,.7],[2.5,65,.35],[3,63,.7]],
 [[0,65,1.5],[2,63,.35],[2.5,62,.35],[3,61,.35],[3.5,60,.4]],
 [[0,60,.45],[.5,65,1.4],[2,67,.65],[2.75,68,.85]],
 [[0,65,.2],[.25,60,2.5],[3,60,.35],[3.5,60,.35]],
 [[0,58,2.8],[3,60,.35],[3.5,62,.35]],
 [[0,63,.6],[.75,62,.35],[1.25,61,.35],[1.75,60,.65],[2.5,55,1.1]],
];
const dominant=[
 [[0,60,.7],[1,64,1.3],[2.5,67,.5],[3.25,70,.6]],
 [[0,70,.7],[.75,67,.2],[1,64,1.6],[3,60,.7]],
 [[0,65,.7],[1,65,.4],[1.5,68,.4],[2,72,1.5]],
 [[0,72,1.2],[1.5,68,.4],[2,67,.4],[2.5,65,.4],[3,63,.7]],
 [[0,63,1],[1.5,62,.4],[2,61,.4],[2.5,60,1.2]],
 [[0,60,.5],[.75,60,.25],[1.5,60,.5],[2.25,60,.25],[3,60,.75]],
 [[0,64,1.5],[2,64,.5],[2.75,67,.75]],
 [[0,70,1.1],[1.5,67,.35],[2,64,.35],[2.5,60,.35],[3,64,.6]],
];
const progression=[41,41,41,36,41,41,46,36];
const counterProgression=[36,36,41,41,41,36,36,36];
export function friezaArrangement(orbit=false){
 const sections=[{bar:0,name:'F-minor battle march'},{bar:8,name:'Dominant brass answer'},{bar:16,name:'String pursuit'},{bar:24,name:'Tense low-register interlude'},{bar:32,name:'Brass and pulse reprise'},{bar:40,name:'Full ensemble climax'}];
 if(orbit)sections.push({bar:48,name:'Orbital counterpoint'},{bar:56,name:'Final brass charge and turnaround'});
 const score=createScore({bpm:orbit?160:144,bars:orbit?64:48,title:orbit?'Freeza vs the Legendary Super Saiyan — Orbit':'Freeza vs the Legendary Super Saiyan — Battle',lanes,sections});
 const n=score.note;
 for(let section=0;section<sections.length;section++)for(let b=0;b<8;b++){
  const bar=section*8+b,at=bar*4,quiet=section===3,answer=section===1||section===5||section===7;
  const root=(answer?counterProgression:progression)[b],isC=root===36,third=isC?4:3,fifth=root+7;
  const phrase=(answer?dominant:march)[b];
  score.phrase(0,at,phrase,quiet?'horn':orbit&&section>=4?'square':'brass',quiet?.25:orbit&&section>=4?.23:.40,quiet?-12:0);
  // Strings hold the high C pedal in articulated eighths; phase two replaces
  // selected phrases with a narrow pulse, without doubling the lead octave.
  const upper=isC?72:root+31;
  if(!quiet){
   for(let i=0;i<8;i++)n(1,at+i*.5,.32,upper+(i===7&&b%4===3?-1:0),orbit&&section%2?'pulse':'strings',orbit&&section%2?.10:.18,{vibrato:.001});
  }else for(const t of[0,2])n(1,at+t,1.65,root+24,'strings',.18);
  const bass=quiet?[[0,1.4],[2,1.4]]:[[0,.60],[.75,.42],[1.5,.58],[2.25,.42],[3,.72]];
  for(const[t,d]of bass)n(2,at+t,d,root,'triangle',quiet?.28:.35);
  for(const t of quiet?[0,2]:[0,1.5,3])n(3,at+t,quiet?1.75:.7,root+12+third,'horn',quiet?.16:.24);
  if(section===2||section>=4){
   // Contrary motion between the high pedal and the lower chromatic answer.
   const line=b%2?[fifth+12,root+15,root+14,root+12]:[root+19,root+24,root+22,root+19];
   for(let i=0;i<4;i++)n(4,at+i+.25,.60,line[i],orbit||section>=4?'pulse':'strings',orbit||section>=4?.12:.2);
  }else for(const t of[.5,2.5])n(4,at+t,1.1,fifth+12,'strings',quiet?.12:.19);
  drums(score,bar,{intensity:quiet?.58:orbit?1.18:section>=4?1.05:.94,fill:b===7||orbit&&b===3,orchestral:true});
 }
 return score;
}
const stems=process.env.SCORE_STEMS||null;
const entrance={...compose('arrival',72,8),title:'Five Minutes',sampleRate:rate,quantizationBits:12,rights:'Original project composition, MIT'};
const tracks=[entrance,friezaArrangement(false).render('battle.wav',{stems}),friezaArrangement(true).render('orbit.wav',{stems})];
writeFileSync(`${root}/score.json`,JSON.stringify({
 arrangement:'Secret of Goku eight-voice Frieza battle arrangement',reference,
 rights:'The combat cues adapt Shunsuke Kikuchi’s composition, which remains with its respective rights holders. The code license does not relicense that composition. Five Minutes remains an original project cue.',
 source:'scripts/compose-frieza-score.mjs',renderer:'scripts/tracker-score.mjs',sampleRate,quantizationBits:16,
 description:'PCM brass, strings, horns and timpani, pulse/square lead voices, triangle bass, military snare and noise percussion. The orbital arrangement increases the pace and develops the same motifs; the entrance cue is unchanged. No reference recording is embedded.',tracks,
},null,2)+'\n');
console.log(tracks.map(({channels,sections,...t})=>t));
