// Vegeta's Theme: eight-voice game arrangement of the user-supplied reference.
// The low G pedal, chromatic guitar pickup and tolling G/Bb/C/A bell phrases
// come from the reference; the bridge, fills and phase-two counterline are
// arranged here. No source recording is mixed into these renders.
import {writeFileSync} from 'node:fs';
import {createScore,drums,sampleRate} from './tracker-score.mjs';

const reference={title:"Vegeta's Theme",credit:'Faulconer Productions Music — Dragon Ball Z English-language score',url:'https://www.youtube.com/watch?v=M954D_jyJbQ&t=3s'};
const lanes=[
 {role:'PCM tolling bells / piano theme',pan:-.22,echo:.35},
 {role:'PCM distorted guitar / square lead',pan:.32,echo:.12},
 {role:'Triangle bass',pan:0,echo:0},
 {role:'PCM strings / low horn harmony',pan:-.65,echo:.25},
 {role:'Pulse countermelody / upper harmony',pan:.65,echo:.28},
 {role:'PCM kick / timpani',pan:0,echo:.025},
 {role:'PCM snare / tom fills',pan:-.12,echo:.12},
 {role:'Noise hats / PCM cymbals',pan:.32,echo:.12},
];
// Beats, concert MIDI pitch, gate. Bell pitches are deliberately kept low:
// their inharmonic partials provide the high chime, not a shrill lead octave.
const bells=[
 [0,55,3.5],[8,55,3.5],[12.5,58,2.7],[16,55,3.5],
 [24,60,2.5],[27,58,1],[28,55,1.7],[30.5,58,.8],[31.5,57,.45],
];
const answer=[
 [0,55,3.5],[8,55,3.5],[16,60,2.5],[19,58,1.5],
 [20,55,2.5],[24,58,1.4],[26,57,1.5],[28,55,3.5],
];
const march=[
 [[0,67,1.35],[1.5,67,.35],[2,66,.4],[2.5,67,1.2]],
 [[0,70,1.4],[1.5,69,.4],[2,67,1],[3.5,65,.4]],
 [[0,72,1.2],[1.5,70,.4],[2,67,.7],[3,70,.8]],
 [[0,69,1.4],[1.5,66,.4],[2,67,1.5]],
 [[0,67,.7],[1,70,.7],[2,74,1.5]],
 [[0,72,1.5],[2,70,.65],[3,69,.65]],
 [[0,70,1.4],[1.5,69,.4],[2,67,.8],[3,65,.7]],
 [[0,66,1.3],[1.5,69,.4],[2,66,.4],[2.5,62,.4],[3,66,.6]],
];
const sections=[
 {bar:0,name:'Tolling theme'}, {bar:8,name:'Guitar answer'},
 {bar:16,name:'Royal march'}, {bar:24,name:'Bell and piano breakdown'},
 {bar:32,name:'Full ensemble reprise'}, {bar:40,name:'Final counterpoint and turnaround'},
];
export function vegetaArrangement(gold=false){
 const score=createScore({bpm:gold?150:130,bars:48,title:gold?"Vegeta's Theme — Super Saiyan":"Vegeta's Theme — Time Chamber",lanes,sections});
 const n=score.note;
 for(let section=0;section<6;section++){
  const offset=section*32,quiet=section===3;
  if(section!==2)score.phrase(0,offset,section===1||section===5?answer:bells,quiet?'piano':'bell',quiet?.62:.58);
  else score.phrase(0,offset,[[0,55,3],[8,58,3],[16,60,3],[24,57,3]],'bell',.45);
  for(let b=0;b<8;b++){
   const bar=section*8+b,at=bar*4;
   const root=section===2?[39,41,43,38,39,41,36,38][b]:section===5?[31,31,39,36,31,31,36,38][b]:[31,31,31,31,31,39,36,31][b];
   const dominant=root===38,third=dominant?4:3;
   // The original's G/F#/G guitar figure, with the short approach note
   // kept separate from its low pedal rather than a constant block chord.
   const riff=quiet?[[0,0,1.3],[2,0,1.3]]:[[0,0,.62],[.75,-1,.18],[1,0,.7],[2,0,.62],[2.75,-1,.18],[3,0,.7]];
   for(const[t,p,d]of riff){
    n(2,at+t,d,root+p,'triangle',quiet?.27:.34);
    if(section!==2)n(1,at+t,d*.85,root+12+p,gold&&!quiet?'square':'guitar',quiet?.15:gold?.19:.3);
   }
   if(section===2)score.phrase(1,at,march[b],gold?'square':'brass',gold?.25:.34);
   const harmony=quiet?[0,2]:gold?[0,1.5,2.5]:[0,2.5];
   for(const t of harmony)n(3,at+t,quiet?1.7:1.15,root+24+third,quiet?'horn':'strings',quiet?.13:.20);
   if(gold||section===4||section===5){
    const line=[root+36,root+36+7,root+36+third,root+36+7];
    for(let i=0;i<4;i++)n(4,at+i+.5,.32,line[(i+b)%4],quiet?'piano':'pulse',quiet?.10:.115,{vibrato:.002});
   }else{
    for(const t of[.5,2.5])n(4,at+t,1.2,root+31,'strings',.16);
    if(b%4===3)score.phrase(4,at,[[2.5,74,.4],[3,72,.4],[3.5,70,.35]],'pulse',.13);
   }
   const intensity=quiet?.57:gold?1.2:section>=4?1.04:.92;
   drums(score,bar,{intensity,fill:b===7||gold&&b===3});
  }
 }
 return score;
}
const stems=process.env.SCORE_STEMS||null;
const tracks=[vegetaArrangement(false).render('vegeta.wav',{stems}),vegetaArrangement(true).render('vegeta-full-power.wav',{stems})];
writeFileSync('assets/audio/music/vegeta-score.json',JSON.stringify({
 arrangement:'Secret of Goku eight-voice training arrangement',reference,
 rights:'Underlying composition belongs to its respective rights holders; the project code license does not relicense the composition.',
 source:'scripts/compose-vegeta-score.mjs',renderer:'scripts/tracker-score.mjs',sampleRate,quantizationBits:16,
 description:'Reference bell motif and chromatic guitar riff, with square/pulse counterlines, triangle bass, generated PCM instruments, noise percussion and stereo echo. A quieter breakdown, harmonic bridge and full reprise precede the loop. No reference audio is embedded.',tracks,
},null,2)+'\n');
console.log(tracks.map(({channels,sections,...t})=>t));
