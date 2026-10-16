#!/usr/bin/env node
// Apply reviewed proposals that target addresses which ALREADY have an
// authored entry, editing that entry in place (one source of truth per
// address). Respects the compiler's precedence: partyDialogue[mask] beats
// soloDialogue beats storyDialogue (sceneDialogue is spread into it last).
//   storyDialogue proposal  → set the string where the address lives; drop
//                              party/solo entries that would shadow it.
//   partyDialogue proposal  → set the [4] array in partyDialogue (null falls
//                              through to the current solo/story/retail line).
//   crisisDialogue proposal → set the crisis override.
//   node tools/scenes/rewrite-tables.mjs [--dry-run]
import fs from 'node:fs/promises';
import {storyDialogue,soloDialogue} from '../../engine/story-dialogue.js';
import {partyDialogue,sceneDialogue} from '../../engine/scene-dialogue.js';
import {crisisDialogue} from '../../engine/frieza-crisis.js';

const dry=process.argv.includes('--dry-run'),dir=process.argv.includes('--dir')?process.argv[process.argv.indexOf('--dir')+1]:'.local/scene-graph/fixes';
const files={story:'engine/story-dialogue.js',scene:'engine/scene-dialogue.js',crisis:'engine/frieza-crisis.js'};
const text=Object.fromEntries(await Promise.all(Object.entries(files).map(async([k,f])=>[k,(await fs.readFile(f,'utf8')).split('\n')])));
// Line ranges of each exported object literal.
function ranges(lines){
  const out={};let name=null,start=0;
  lines.forEach((line,i)=>{const m=line.match(/^export const (\w+)=\{/);if(m){name=m[1];start=i;}else if(name&&/^\};?\s*$/.test(line)){out[name]=[start,i];name=null;}});
  return out;
}
const where=(file,table)=>ranges(text[file])[table];
const key=at=>new RegExp(`^\\s*0x0*${at.toString(16)}\\s*:`,'i');
function find(file,table,at){const[a,b]=where(file,table);for(let i=a+1;i<b;i++)if(key(at).test(text[file][i]))return i;return -1;}
// An entry runs from its key line to the next key (or the object's end),
// excluding comment/blank lines that head the next group.
function span(file,table,i){
  const[,b]=where(file,table),lines=text[file];let end=i+1;
  while(end<b&&!/^\s*0x[0-9a-f]+\s*:/i.test(lines[end]))end++;
  while(end>i+1&&/^\s*(\/\/.*)?$/.test(lines[end-1]))end--;
  return end-i;
}
function set(file,table,at,value){
  const i=find(file,table,at),line=` 0x${at.toString(16)}:${JSON.stringify(value)},`;
  if(i>=0)text[file].splice(i,span(file,table,i),text[file][i].match(/^\s*/)[0]+line.trim());
  else{const[,b]=where(file,table);text[file].splice(b,0,line);}
}
function drop(file,table,at){const i=find(file,table,at);if(i>=0)text[file].splice(i,span(file,table,i));return i>=0;}
const log=[];
for(const f of(await fs.readdir(dir)).filter(f=>f.endsWith('.json'))){
  const {chunk,edits=[]}=JSON.parse(await fs.readFile(`${dir}/${f}`,'utf8'));
  for(const e of edits){
    const at=parseInt(e.at,16),existing=at in storyDialogue||at in soloDialogue||at in partyDialogue||at in crisisDialogue;
    if(e.table==='crisisDialogue'){set('crisis','crisisDialogue',at,e.value);log.push(`${chunk} ${e.at} crisis`);continue;}
    if(!existing)continue; // new addresses go to retail-dialogue.js
    if(e.table==='partyDialogue'){
      // null keeps the current line: for a mask that already had party text,
      // that is the existing party value, not a fall-through.
      const prior=partyDialogue[at]??[null,null,null,null],value=e.value.map((v,m)=>v??prior[m]);
      set('scene','partyDialogue',at,value);log.push(`${chunk} ${e.at} party`);continue;
    }
    // storyDialogue: one string for every party.
    const notes=[];
    if(at in partyDialogue&&drop('scene','partyDialogue',at))notes.push('dropped party entry');
    if(at in soloDialogue&&drop('story','soloDialogue',at))notes.push('dropped solo entry');
    if(at in sceneDialogue)set('scene','sceneDialogue',at,e.value);
    else set('story','storyDialogue',at,e.value);
    log.push(`${chunk} ${e.at} story${notes.length?' ('+notes.join(', ')+')':''}`);
  }
}
if(!dry)for(const[k,f]of Object.entries(files))await fs.writeFile(f,text[k].join('\n'));
console.log(`${log.length} in-place edits${dry?' (dry run)':''}:\n${log.join('\n')}`);
