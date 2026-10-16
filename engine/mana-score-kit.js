// Shared arranging kit for the Mana-instrument scores. Patch numbers index
// Secret of Mana's own bank (mana-instruments.js). Ranges and drum pitches
// follow what the game's sequences use, logged from the native sound driver:
// e.g. the boss theme "Danger" doubles synth brass (3) with a struck layer
// (10), voices strings (18) in close three-part chords, pumps the bass (9)
// in octaves and shares kick (23) and snare (24) on one voice.
// Notes use the driver's scale (pitch 0x1000·f/256 at note 57, f being the
// tuning byte), in which the game's instruments all share one semitone grid.
// range: the notes the game's own sequences give that sample (driver logs
// from Danger, the flight, fortress, Mana Beast, title and crisis themes).
export const patches={
 brass:{sample:3,range:[45,84],vibrato:{delay:.22,depth:.22,rate:5.4}},
 strike:{sample:10,range:[48,72]},
 strings:{sample:18,range:[43,74]},
 bass:{sample:9,range:[33,48]},
 stab:{sample:19,range:[50,62]},
 flute:{sample:11,range:[38,72],vibrato:{delay:.2,depth:.18,rate:5.2}},
 harp:{sample:8,range:[45,60]},
 chime:{sample:15,range:[57,72]},
 organ:{sample:17,range:[41,53]},
 lead:{sample:28,range:[55,72],vibrato:{delay:.16,depth:.25,rate:5.8}},
 pick:{sample:1,range:[50,73]},
 pickHigh:{sample:7,range:[43,73]},
 choir:{sample:4,range:[26,67]},
 bell:{sample:16},
 gong:{sample:6,range:[15,22]},
 kick:{sample:23,pitch:0x1050},
 snare:{sample:24,pitch:0x11d0},
 hat:{sample:20,pitch:0x1c7e},
 openHat:{sample:21,pitch:0x1c82},
 crash:{sample:27,pitch:0x1c7a},
};

export function createArrangement({title,bpm,bars,echo,sections,roles}){
 if(roles.length!==8)throw Error('A Mana score has exactly eight voices');
 const voices=roles.map(role=>({role,events:[]})),total=bars*4;
 function note(voice,at,len,pitch,patch,vol=100,options={}){
  if(!patches[patch])throw Error(`Unknown patch: ${patch}`);
  if(!(voice>=0&&voice<8)||!(at>=0&&at<total)||!(len>0))throw Error(`Invalid note at beat ${at}`);
  // A voice keys one note at a time: a later note on the same beat (a fill
  // snare over a kick, a climbing bass over the figure) replaces the first.
  const events=voices[voice].events,same=events.findIndex(e=>e.at===at);if(same>=0)events.splice(same,1);
  events.push({at,len,patch,note:pitch,vol,...options});
 }
 // [beat, pitch, length, velocity scale]; null pitches are rests.
 function phrase(voice,at,notes,patch,vol=100,transpose=0,options={}){
  for(const[t,p,len,scale=1]of notes)if(p!==null)note(voice,at+t,len,p+transpose,patch,vol*scale,options);
 }
 const score={title,bpm,bars,echo,sections,patches,voices};
 return{score,note,phrase};
}

// Drum voice (kick+snare share one voice, as in the game) and cymbal voice.
export function drums({note},bar,style,{drum=0,cymbal=7,crash=false,fill=false,level=1,hats='eighths'}={}){
 const at=bar*4,k=(t,v=100)=>note(drum,at+t,.2,60,'kick',v*level),s=(t,v=110,p=60)=>note(drum,at+t,.25,p,'snare',v*level);
 if(style==='danger'){
  // The boss theme's gallop: 16th kick bursts against dotted-quarter snares.
  for(const t of[0,.25,.5,.75])k(t);s(1);for(const t of[1.5,1.75,2,2.25])k(t);s(2.5);
  if(fill){s(3,96);s(3.25,104);s(3.5,112);s(3.75,120);}else{k(3);k(3.25);s(3.5);}
 }else if(style==='march'){
  k(0);k(1.5,96);k(2);s(1);s(3);
  if(fill){for(let i=0;i<6;i++)s(2.5+i*.25,80+i*8,60+(i>2?1:0));}else{s(3.75,62);}
 }else if(style==='drive'){
  for(const t of[0,.75,1.5,2,2.75,3.5])k(t,t%1?96:116);s(1);s(3);
  if(fill){s(3.25,90);s(3.5,104);s(3.75,118);}
 }else if(style==='halftime'){
  k(0);k(1.75,92);s(2);if(fill){s(3.5,90);s(3.75,108);}
 }else if(style==='pulse'){
  k(0,96);k(2,84);
 }
 const c=(t,patch,v)=>note(cymbal,at+t,patch==='crash'?3:.2,60,patch,v*level);
 if(crash)c(0,'crash',84);
 if(hats==='sixteenths'){for(let i=crash?4:0;i<16;i++)c(i/4,i%4===2?'openHat':'hat',i%2?30:46);}
 else if(hats==='eighths'){for(let i=crash?2:0;i<8;i++)c(i/2,i%2?'openHat':'hat',i%2?36:50);}
 else if(hats==='offbeats'){for(let i=crash?1:0;i<4;i++)c(i+.5,'openHat',42);}
}

// Kikuta's 3+3+2 string rhythm: dotted quarters over each pair of bars.
export const gallop=[[0,1.4],[1.5,1.4],[3,1.4],[4.5,1.4],[6,.9],[7,.9]];
