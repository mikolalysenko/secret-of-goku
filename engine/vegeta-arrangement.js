// Vegeta's Theme (Faulconer Productions, DBZ English-language score),
// arranged for Secret of Mana's instrument bank. The low G pedal, chromatic
// G/F#/G figure and tolling G/Bb/C/A bell phrases come from the reference;
// the bass doubling (picked bass in octaves, as in the game's fortress
// themes), gallop strings and the section plan are arranged here.
import {createArrangement,drums,gallop} from './mana-score-kit.js';

export const vegetaReference={title:"Vegeta's Theme",credit:'Faulconer Productions Music — Dragon Ball Z English-language score',url:'https://www.youtube.com/watch?v=M954D_jyJbQ&t=3s'};

// Beats, concert pitch, gate — each list spans eight bars.
const bells=[[0,55,3.5],[8,55,3.5],[12.5,58,2.7],[16,55,3.5],[24,60,2.5],[27,58,1],[28,55,1.7],[30.5,58,.8],[31.5,57,.45]];
const answer=[[0,55,3.5],[8,55,3.5],[16,60,2.5],[19,58,1.5],[20,55,2.5],[24,58,1.4],[26,57,1.5],[28,55,3.5]];
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
// The reference's guitar figure: G pedal with a short F# approach.
const riff=[[0,0,.62],[.75,-1,.18],[1,0,.7],[2,0,.62],[2.75,-1,.18],[3,0,.7]];
const chords={
 Gm:{strings:[55,58,62],bass:43},Eb:{strings:[55,58,63],bass:51},F:{strings:[53,57,60],bass:53},
 D:{strings:[54,57,62],bass:50},Cm:{strings:[55,60,63],bass:48},Bb:{strings:[53,58,62],bass:46},
};
const pedal=['Gm','Gm','Gm','Gm','Gm','Eb','Cm','Gm'],bridge=['Eb','F','Gm','D','Eb','F','Cm','D'],closing=['Gm','Gm','Eb','Cm','Gm','Gm','Cm','D'];
const roles=['Kick and snare','Bell / brass / lead melody','Choir / strike / flute layer','Picked bass (upper octave)','Picked bass (lower octave)','Strings (upper) / harp','Strings (lower) / choir','Hi-hats and crash'];

export function vegetaArrangement(gold=false){
 const sections=[{bar:0,name:'Tolling bell theme'},{bar:8,name:'Brass answer over the guitar figure'},{bar:16,name:'Royal march'},{bar:24,name:'Bell and harp breakdown'},{bar:32,name:'Full brass reprise'},{bar:40,name:'Final counterpoint and turnaround'}];
 const a=createArrangement({title:gold?"Vegeta's Theme — Super Saiyan":"Vegeta's Theme — Time Chamber",bpm:gold?152:132,bars:48,sections,roles,
  echo:gold?{delay:5,feedback:40,volume:60}:{delay:6,feedback:56,volume:62}});
 const {note:n,phrase}=a,hats=gold?'sixteenths':'eighths',melody=gold?'lead':'flute';

 function bass(bar,name,style='riff',level=1){
  const r=chords[name].bass,at=bar*4;
  const pattern=style==='riff'?riff:style==='march'?[0,.5,1,1.5,2,2.5,3,3.5].map((t,i)=>[t,i%2?12:0,.35]):[[0,0,1.8],[2,0,1.8]];
  // Marching octaves move only in the lower voice; the upper one holds.
  for(const[t,p,len]of pattern){n(3,at+t,len,r+12+(style==='march'?0:p),'pick',96*level);n(4,at+t,len,r+p,'pickHigh',100*level);}
 }
 function strings(bar,names,mode='gallop',level=1){
  // names covers two bars; the upper pair of chord tones keeps a close voicing.
  for(let b=0;b<2;b++){
   const c=chords[names[b]].strings,at=(bar+b)*4;
   if(mode==='gallop'){for(const[t,len]of gallop)if(t>=b*4&&t<b*4+4)[c[1],c[2]].forEach((p,v)=>n(5+v,bar*4+t,len,p,'strings',96*level));}
   else[c[1],c[2]].forEach((p,v)=>n(5+v,at,3.9,p,'strings',88*level));
  }
 }
 function harp(bar,name){
  const c=chords[name].strings,cell=[c[0],c[1],c[2],c[1],c[0],c[2]-12];
  for(let i=0;i<16;i++)n(5,bar*4+i/4,.24,cell[i%cell.length],'harp',i%4?50:66);
 }

 for(let section=0;section<6;section++){
  const start=section*8,at=start*4;
  for(let b=0;b<8;b++){
   const bar=start+b,last=b===7;
   if(section===0){
    if(b===0)phrase(1,at,bells,'bell',96);
    if(b===0)phrase(2,at,bells,'choir',62);
    if(b%2===0)strings(bar,pedal.slice(b,b+2),'held',.8);
    bass(bar,pedal[b]);drums(a,bar,b<4?'pulse':'halftime',{crash:b===0,fill:last,hats:b<4?'none':'offbeats'});
   }else if(section===1){
    if(b===0){phrase(1,at,answer,'brass',104,12);phrase(2,at,answer,'bell',64);}
    if(b%2===0)strings(bar,pedal.slice(b,b+2),'gallop');
    bass(bar,pedal[b]);drums(a,bar,'drive',{crash:b===0,fill:last,hats});
   }else if(section===2){
    phrase(1,bar*4,march[b],'brass',108);phrase(2,bar*4,march[b],melody,gold?60:72);
    if(b%2===0)strings(bar,bridge.slice(b,b+2),'gallop');
    bass(bar,bridge[b],'march');drums(a,bar,'march',{crash:b===0,fill:last,hats});
   }else if(section===3){
    if(b===0){phrase(1,at,bells,'bell',100);phrase(6,at,bells,'choir',58);}
    harp(bar,pedal[b]);
    bass(bar,pedal[b],'held',.85);drums(a,bar,'pulse',{crash:b===0,hats:b<4?'none':'offbeats',level:.8});
   }else if(section===4){
    if(b===0){phrase(1,at,bells,'brass',110,12);phrase(2,at,bells,'strike',56,12);}
    if(b%2===0)strings(bar,pedal.slice(b,b+2),'gallop',1.05);
    bass(bar,pedal[b]);drums(a,bar,b%4===3?'danger':'drive',{crash:b%4===0,fill:last,hats});
   }else{
    if(b===0){phrase(1,at,answer,melody,96,12);phrase(2,at,answer,'brass',70);}
    if(b%2===0)strings(bar,closing.slice(b,b+2),'gallop');
    bass(bar,closing[b],b>=6?'march':'riff');drums(a,bar,b%2?'danger':'drive',{crash:b===0,fill:last||gold&&b===3,hats});
   }
  }
 }
 // The turnaround climbs chromatically back to the G pedal.
 for(let i=0;i<8;i++)n(2,47*4+2+i/4,.22,62+i-7,'strike',60+i*4);
 return a.score;
}
