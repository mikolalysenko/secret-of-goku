// Score metadata only. No cue is an audio file: engine/mana-arrangements.js
// renders the entrance, combat and training cues at runtime from the
// player's cartridge instrument bank (see engine/spc-score.js).
import {mkdirSync,writeFileSync} from 'node:fs';
import {friezaReference} from '../engine/frieza-arrangement.js';
import {vegetaReference} from '../engine/vegeta-arrangement.js';
import {arrangements} from '../engine/mana-arrangements.js';
const root='assets/audio/music';mkdirSync(root,{recursive:true});

const runtime=Object.entries(arrangements).map(([key,build])=>{const s=build();return{key,title:s.title,bpm:s.bpm,bars:s.bars,duration:s.bars*4*60/s.bpm,sections:s.sections,voices:s.voices.map(v=>({role:v.role,notes:v.events.length,patches:[...new Set(v.events.map(e=>e.patch))]}))};});
writeFileSync(`${root}/score.json`,JSON.stringify({
 runtime:{
  renderer:'engine/spc-score.js',instruments:'engine/mana-instruments.js',arrangements:'engine/mana-arrangements.js',sampleRate:32000,
  description:"Rendered in the browser from Secret of Mana's own BRR instrument bank, read from the player's ROM: eight monophonic voices, gaussian interpolation, hardware ADSR and echo. No cartridge audio is stored in the repository.",
  references:{battle:friezaReference,vegeta:vegetaReference},
  rights:'Five Minutes, the entrance cue, is an original project composition (MIT). The combat cues adapt Shunsuke Kikuchi’s composition and the training cues adapt the Faulconer Productions Vegeta theme; both remain with their respective rights holders. The instrument samples belong to Square Enix and come only from the player’s cartridge. The code license relicenses neither.',
  tracks:runtime,
 },
},null,2)+'\n');
console.log(runtime.map(({voices,sections,...t})=>t));
