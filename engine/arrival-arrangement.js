// Five Minutes, the project's own Frieza entrance cue (MIT), arranged for
// Secret of Mana's instrument bank. The D-minor root cycle, minor triads,
// tolling A–F–Eb–D chime figure and sparse kick/snare come from the
// original 72 bpm sketch; Kikuta's suspense writing supplies the rest:
// held close strings over a choir pedal, a rippling harp, a melody passed
// from flute to brass, and gong strokes at the section joins.
import {createArrangement,drums,gallop} from './mana-score-kit.js';

// Root of each bar, one minor triad per root, as in the original cycle.
const roots=[38,39,34,33,38,41,39,33];
const triad=r=>[r+12,r+15,r+19];
const toll=[[0,69,.7],[.75,65,.7],[1.5,63,.7],[2.25,62,1.6]];
const melody=[
 [[0,62,1.4],[1.5,65,.45],[2,69,1.9]],
 [[0,70,1.4],[1.5,69,.45],[2,66,1.9]],
 [[0,65,.9],[1,66,.9],[2,61,1.9]],
 [[0,64,2.8],[3,63,.45],[3.5,64,.45]],
 [[0,62,.7],[.75,65,.7],[1.5,69,.45],[2,74,1.9]],
 [[0,72,1.4],[1.5,68,.45],[2,65,1.9]],
 [[0,70,.7],[.75,66,.7],[1.5,63,.45],[2,66,.9],[3,63,.9]],
 [[0,64,1.9],[2,63,.45],[2.5,62,.45],[3,61,.9]],
];
const roles=['Kick and snare','Chime / flute / brass melody','Choir / strike layer','Bass','Strings (upper)','Strings (middle)','Strings (lower) / harp','Gong, cymbals'];

export function arrivalArrangement(){
 const sections=[{bar:0,name:'Tolling chimes over the choir'},{bar:4,name:'Harp ripple'},{bar:8,name:'Flute melody'},{bar:12,name:'Brass takes the melody'},{bar:16,name:'Full statement'},{bar:20,name:'Chimes return'}];
 const a=createArrangement({title:'Five Minutes',bpm:72,bars:24,sections,roles,echo:{delay:7,feedback:60,volume:70}});
 const {note:n,phrase}=a;

 function held(bar,level=1,voices=3){triad(roots[bar%8]).slice(0,voices).forEach((p,v)=>{n(4+v,bar*4,1.9,p,'strings',88*level);n(4+v,bar*4+2,1.9,p,'strings',76*level);});}
 function galloping(bar,level=1){
  // The 3+3+2 figure spans two bars and their two harmonies.
  for(const[t,len]of gallop){const b=bar+(t>=4?1:0);triad(roots[b%8]).forEach((p,v)=>n(4+v,bar*4+t,len,p,'strings',100*level));}
 }
 function harp(bar,level=1){
  const [x,y,z]=triad(roots[bar%8]),cell=[x,y,z,y];
  for(let i=0;i<16;i++)n(6,bar*4+i/4,.24,cell[i%4],'harp',(i%4?48:64)*level);
 }
 function bass(bar,style){
  const r=roots[bar%8];
  if(style==='held'){n(3,bar*4,3.8,r,'bass',96);return;}
  if(style==='pulse'){n(3,bar*4,1.8,r,'bass',100);n(3,bar*4+2,1.4,r,'bass',86);n(3,bar*4+3.5,.4,r+12,'bass',76);return;}
  for(let i=0;i<8;i++)n(3,bar*4+i/2,.4,i%2?r+12:r,'bass',i%2?82:100);
 }
 const gong=bar=>n(7,bar*4,3.9,19,'gong',100);

 for(let bar=0;bar<24;bar++){
  const b=bar%8,section=Math.floor(bar/4),r=roots[b];
  if(section===0){
   // The original sketch: chimes on alternate bars over the minor triads.
   if(bar%2===0)phrase(1,bar*4,toll,'chime',92);
   n(2,bar*4,3.9,r+24,'choir',70);held(bar,.85);bass(bar,'held');
   if(bar===0)gong(bar);
   n(0,bar*4,.3,60,'kick',90);if(bar%2)n(0,bar*4+2,.3,60,'snare',62);
  }else if(section===1){
   if(bar%2===0)phrase(1,bar*4,toll,'chime',80);
   n(2,bar*4,3.9,r+24,'choir',64);held(bar,.7,2);harp(bar);bass(bar,'pulse');
   drums(a,bar,'pulse',{hats:'offbeats',crash:bar===4,level:.8});
  }else if(section===2){
   phrase(1,bar*4,melody[b],'flute',96);
   n(2,bar*4,3.9,r+24,'choir',58);held(bar,.85);harp(bar,.75);bass(bar,'pulse');
   drums(a,bar,'halftime',{hats:'offbeats',crash:bar===8,fill:bar===11,level:.85});
  }else if(section===3){
   if(bar===12)gong(bar);
   phrase(1,bar*4,melody[b],'brass',100);phrase(2,bar*4,melody[b],'strike',44);
   if(bar%2===0)galloping(bar,.9);harp(bar,.6);bass(bar,'march');
   drums(a,bar,'march',{hats:bar===12?'none':'offbeats',fill:bar===15});
  }else if(section===4){
   phrase(1,bar*4,melody[b],'brass',108,12);phrase(2,bar*4,melody[b],'flute',70);
   if(bar%2===0)galloping(bar,1.05);harp(bar,.7);bass(bar,'march');
   drums(a,bar,bar%4===3?'danger':'drive',{hats:'eighths',crash:bar===16,fill:bar===19});
  }else{
   if(bar===20)gong(bar);
   if(bar%2===0)phrase(1,bar*4,toll,'chime',88);else phrase(1,bar*4,melody[b],'flute',60);
   n(2,bar*4,3.9,r+24,'choir',66);held(bar,.8);harp(bar,.5);bass(bar,bar===23?'pulse':'held');
   drums(a,bar,'pulse',{hats:bar===21?'offbeats':'none',level:.7});
   if(bar===23)n(7,bar*4+2,1.9,60,'crash',40);
  }
 }
 return a.score;
}
