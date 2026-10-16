// Kikuchi's "Kaibutsu Freeza vs Densetsu no Super Saiyajin", arranged for
// Secret of Mana's instrument bank in the manner of Kikuta's boss theme:
// unison brass/strike figures, galloping three-part strings, octave bass and
// a shared kick/snare voice. The F pedal, G–F answer, rising C–F–G–Ab call
// and Eb–D–Db–C descent come from the reference transcription.
import {createArrangement,drums,gallop} from './mana-score-kit.js';

export const friezaReference={title:'Kaibutsu Freeza vs Densetsu no Super Saiyajin',composer:'Shunsuke Kikuchi',url:'https://www.youtube.com/watch?v=5CpQ-uBRa78',material:'F-minor battle march and brass answers in the opening movement, especially 0:10–0:42 and 0:44–1:22'};

// Concert pitches from the reference transcription, one array per bar.
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
const answer=[
 [[0,60,.7],[1,64,1.3],[2.5,67,.5],[3.25,70,.6]],
 [[0,70,.7],[.75,67,.2],[1,64,1.6],[3,60,.7]],
 [[0,65,.7],[1,65,.4],[1.5,68,.4],[2,72,1.5]],
 [[0,72,1.2],[1.5,68,.4],[2,67,.4],[2.5,65,.4],[3,63,.7]],
 [[0,63,1],[1.5,62,.4],[2,61,.4],[2.5,60,1.2]],
 [[0,60,.5],[.75,60,.25],[1.5,60,.5],[2.25,60,.25],[3,60,.75]],
 [[0,64,1.5],[2,64,.5],[2.75,67,.75]],
 [[0,70,1.1],[1.5,67,.35],[2,64,.35],[2.5,60,.35],[3,64,.6]],
];
// Close string voicings, bass roots and the stab note for each harmony.
const chords={
 Fm:{strings:[53,56,60],bass:29,stab:60},C:{strings:[52,55,58],bass:36,stab:55},
 Bbm:{strings:[53,58,61],bass:34,stab:58},Db:{strings:[53,56,61],bass:37,stab:56},
 Eb:{strings:[51,55,58],bass:39,stab:58},Gb:{strings:[54,58,61],bass:30,stab:61},
 G:{strings:[55,59,62],bass:31,stab:59},Ab:{strings:[51,56,60],bass:32,stab:56},
};
const marchHarmony=['Fm','Fm','Fm','C','Fm','Fm','Bbm','C'],answerHarmony=['C','C','Fm','Fm','Fm','C','C','C'];
const breakHarmony=['Fm','Db','Bbm','C','Fm','Db','Eb','C'],climb=['Fm','Gb','G','Ab'];
const roles=['Kick and snare','Lead brass / flute','Strike layer / counter brass','Octave bass','Strings (upper)','Strings (middle)','Strings (lower) / brass stabs / harp','Hi-hats and crash'];

export function friezaArrangement(orbit=false){
 const T=orbit?2:0,bars=orbit?64:48;
 const sections=orbit
  ?[{bar:0,name:'Danger-style unison figure'},{bar:4,name:'Battle march'},{bar:12,name:'Flute and brass answer'},{bar:20,name:'Orbital counterpoint'},{bar:28,name:'Chromatic climb and march reprise'},{bar:36,name:'Full answer'},{bar:44,name:'Lead and brass march'},{bar:52,name:'Final charge'},{bar:60,name:'Turnaround'}]
  :[{bar:0,name:'Danger-style unison figure'},{bar:4,name:'Battle march'},{bar:12,name:'Flute and brass answer'},{bar:20,name:'Harp breakdown'},{bar:28,name:'Chromatic climb and march reprise'},{bar:36,name:'Full answer'},{bar:44,name:'Descent and turnaround'}];
 const a=createArrangement({title:orbit?'Freeza vs the Legendary Super Saiyan — Orbit':'Freeza vs the Legendary Super Saiyan — Battle',
  bpm:orbit?166:152,bars,sections,roles,echo:orbit?{delay:6,feedback:52,volume:58}:{delay:4,feedback:30,volume:64}});
 const {note:n,phrase}=a,hats=orbit?'sixteenths':'eighths';

 // Kikuta's boss intro: a descending chromatic cell in brass/strike unison.
 function figure(bar,end=60){
  const at=bar*4,cell=[[0,68,.2],[.25,67,.2],[.5,66,.2],[.75,65,.2],[1,60,.4]];
  for(const off of[0,1.5]){phrase(1,at+off,cell,'brass',104,T);phrase(2,at+off,cell,'strike',64,T);}
  phrase(1,at+3,[[0,end,.7]],'brass',100,T);phrase(2,at+3,[[0,end,.5]],'strike',60,T);
  n(3,at,.4,41+T,'bass',100);n(3,at+1.5,.4,41+T,'bass',96);n(3,at+3,.6,end-19+T,'bass',96);
 }
 function rise(bar){
  // Strings and bass climb in chromatic 16ths into the next downbeat.
  const at=bar*4+2;
  for(let i=0;i<8;i++){[45,48,52].forEach((p,v)=>n(4+v,at+i/4,.22,p+i+T,'strings',72+i*3));n(3,at+i/4,.2,33+i+T,'bass',90);}
 }
 function stringsGallop(bar,harmony,level=1){
  // One harmony per bar; the 3+3+2 rhythm spans each pair of bars.
  for(let b=0;b<2;b++)for(const[t,len]of gallop){if(t<b*4||t>=b*4+4)continue;
   const c=chords[harmony[b]];c.strings.forEach((p,v)=>n(4+v,bar*4+t,len,p+T,'strings',104*level));}
 }
 function stringsHeld(bar,name,voices=3,level=1){chords[name].strings.slice(0,voices).forEach((p,v)=>{n(4+v,bar*4,1.9,p+T,'strings',96*level);n(4+v,bar*4+2,1.9,p+T,'strings',86*level);});}
 function bassGallop(bar,name){
  const r=chords[name].bass+T;
  for(const step of[0,2,3,4,6,8,9,10,12,14,15])n(3,bar*4+step/4,step===0||step===12?.4:.2,step===0||step===12?r:r+12,'bass',step%4===0?104:84);
 }
 function bassMarch(bar,name){const r=chords[name].bass+T;for(let i=0;i<8;i++)n(3,bar*4+i/2,.35,i%2?r+12:r,'bass',i%2?84:100);}
 function stabs(bar,name){const p=chords[name].stab+T;for(const at of[.5,2])phrase(6,bar*4+at,[[0,p,.18],[.25,p,.18],[.5,p-1,.3]],'stab',78);}
 function harp(bar,name){
  const c=chords[name].strings.map(p=>p+T),cell=[c[0],c[1],c[2],c[1],c[0],c[2]-12];
  for(let i=0;i<16;i++)n(6,bar*4+i/4,.24,cell[i%cell.length],'harp',i%4?54:70);
 }

 let bar=0;
 // Intro: the unison figure twice, then strings and bass climb into the march.
 figure(0);figure(1,63);figure(2);figure(3,65);rise(3);
 for(let b=0;b<4;b++)drums(a,b,'danger',{crash:b===0,fill:b===3,hats:'none'});
 bar=4;
 // A: march melody in brass with the struck layer, galloping strings.
 for(let b=0;b<8;b++){
  phrase(1,(bar+b)*4,march[b],'brass',104,T);phrase(2,(bar+b)*4,march[b],'strike',46,T);
  if(b%2===0)stringsGallop(bar+b,marchHarmony.slice(b,b+2));
  bassGallop(bar+b,marchHarmony[b]);drums(a,bar+b,'danger',{crash:b===0,fill:b===7,hats:orbit?'offbeats':'none'});
 }
 bar=12;
 // B: the answer moves to flute; brass holds a counter line beneath it.
 for(let b=0;b<8;b++){
  const name=answerHarmony[b],c=chords[name].strings;
  phrase(1,(bar+b)*4,answer[b],'flute',96,T);
  n(2,(bar+b)*4,1.8,c[2]+T,'brass',62);n(2,(bar+b)*4+2,1.8,c[1]+T,'brass',58);
  stringsHeld(bar+b,name,3,.85);bassMarch(bar+b,name);drums(a,bar+b,'march',{crash:b===0,fill:b===7,hats});
 }
 bar=20;
 if(!orbit){
  // C: breakdown — harp arpeggios and held strings under a soft flute march.
  for(let b=0;b<8;b++){
   const name=breakHarmony[b];phrase(1,(bar+b)*4,march[b],'flute',70,T);
   stringsHeld(bar+b,name,2,.7);harp(bar+b,name);
   n(3,(bar+b)*4,3.5,chords[name].bass+T,'bass',80);n(3,(bar+b)*4+3.5,.4,chords[name].bass+T+12,'bass',70);
   drums(a,bar+b,'pulse',{crash:b===0,hats:b<4?'none':'offbeats',level:.8});
  }
 }else{
  // C (orbit): synth lead takes the answer an octave up over harp and choir.
  for(let b=0;b<8;b++){
   const name=answerHarmony[b];phrase(1,(bar+b)*4,answer[b],'lead',90,T);
   phrase(2,(bar+b)*4,march[b],'brass',56,T);
   harp(bar+b,name);chords[name].strings.slice(0,2).forEach((p,v)=>n(4+v,(bar+b)*4,3.8,p+T,'strings',60));
   bassGallop(bar+b,name);drums(a,bar+b,'drive',{crash:b%4===0,fill:b===7,hats});
  }
 }
 bar=28;
 // D: the rising call climbs by semitones, then the march returns with stabs.
 for(let b=0;b<4;b++){
  const name=climb[b];phrase(1,(bar+b)*4,march[4],'brass',100,T+b);phrase(2,(bar+b)*4,march[4],'strike',52,T+b);
  chords[name].strings.slice(0,2).forEach((p,v)=>{for(const[t,len]of gallop)if(t<4)n(4+v,(bar+b)*4+t,len,p+T,'strings',78+b*6);});
  stabs(bar+b,name);bassGallop(bar+b,name);drums(a,bar+b,'danger',{crash:b===0,fill:b===3,hats:'offbeats'});
 }
 for(let b=0;b<4;b++){
  const name=marchHarmony[b];phrase(1,(bar+4+b)*4,march[b],'brass',108,T);phrase(2,(bar+4+b)*4,march[b],'flute',70,T);
  chords[name].strings.slice(0,2).forEach((p,v)=>n(4+v,(bar+4+b)*4,3.8,p+T,'strings',72));
  stabs(bar+4+b,name);bassGallop(bar+4+b,name);drums(a,bar+4+b,'drive',{crash:b===0,fill:b===3,hats});
 }
 bar=36;
 // E: full answer — brass and strike lead, flute an octave up, gallop strings.
 for(let b=0;b<8;b++){
  const name=answerHarmony[b];
  phrase(1,(bar+b)*4,answer[b],'brass',108,T);phrase(2,(bar+b)*4,answer[b],'flute',74,T);
  if(b%2===0)stringsGallop(bar+b,answerHarmony.slice(b,b+2),1.05);
  bassGallop(bar+b,name);drums(a,bar+b,b%4===3?'danger':'drive',{crash:b%4===0,fill:b===7,hats});
 }
 bar=44;
 if(orbit){
  // F/G (orbit): march with the synth lead doubling, then a final charge.
  for(let b=0;b<8;b++){
   const name=marchHarmony[b];phrase(1,(bar+b)*4,march[b],'brass',108,T);phrase(2,(bar+b)*4,march[b],'lead',62,T);
   if(b%2===0)stringsGallop(bar+b,marchHarmony.slice(b,b+2),1.05);
   bassGallop(bar+b,name);drums(a,bar+b,'danger',{crash:b%2===0,fill:b===7,hats});
  }
  bar=52;
  for(let b=0;b<8;b++){
   const name=answerHarmony[b];phrase(1,(bar+b)*4,answer[b],'lead',96,T);phrase(2,(bar+b)*4,answer[b],'strike',52,T);
   chords[name].strings.slice(0,2).forEach((p,v)=>{for(const[t,len]of gallop)if(t<4)n(4+v,(bar+b)*4+t,len,p+T,'strings',84);});
   stabs(bar+b,name);bassGallop(bar+b,name);drums(a,bar+b,'drive',{crash:b%2===0,fill:b===7,hats});
  }
  bar=60;
 }
 // Turnaround: the Eb–D–Db–C descent, strings swelling back to the figure.
 for(let b=0;b<4;b++){
  const src=march[4+b],name=marchHarmony[4+b];
  phrase(1,(bar+b)*4,src,'brass',104,T);phrase(2,(bar+b)*4,src,'strike',50,T);
  stringsHeld(bar+b,name,3,b===3?.8:1);bassMarch(bar+b,name);drums(a,bar+b,'march',{crash:b===0,fill:b===3,hats});
 }
 return a.score;
}
