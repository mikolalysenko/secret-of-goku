#!/usr/bin/env node
// Private review transcripts: the dialogue each scene actually shows, per
// party mask (0 solo, 1 +Primm, 2 +Popoi, 3 both) and crisis state, compiled
// exactly as engine/native-story.js would feed the interpreter. Cartridge text
// is written only under ignored .local/scene-graph/transcripts/.
//
//   node tools/scenes/transcript.mjs [--out .local/scene-graph/transcripts]
import fs from 'node:fs/promises';
import {loadGraph} from './load-graph.mjs';
import {parseBytes,describeOp,enumerate,hex} from '../../engine/scene-graph.js';
import {parseEvent} from '../../engine/event-codec.js';
import {compileStoryEvent,needsStory,nativeOnlyEvents} from '../../engine/story-compiler.js';
import {buildStoryEvents} from '../../engine/story-events.js';
import {buildFriezaEvents,buildFriezaEnding,friezaEvents} from '../../engine/frieza-events.js';
import {buildBadEnding} from '../../engine/ending-events.js';
import {crisisDialogue,crisisGreetings,crisisFlightMessages} from '../../engine/frieza-crisis.js';
import * as radio from '../../engine/native-radio.js';
import {powerIntroMessages} from '../../engine/power-intro.js';

const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'.local/scene-graph/transcripts';
const {graph:g,rom}=await loadGraph();
const custom=[0,1,2,3].map(mask=>new Map([...buildStoryEvents(rom,mask),...buildFriezaEvents(rom,mask)]));
const crisis=[0,1,2,3].map(mask=>buildStoryEvents(rom,mask,{crisis:true}));
const prologue=id=>nativeOnlyEvents.includes(id);

// Every variant the runtime can select for one event, as compiled bytes.
function variants(id){
  const event=parseEvent(rom,id),list=[];
  for(let mask=0;mask<4;mask++){
    const bytes=prologue(id)?Array.from(rom.slice(event.start,event.end)):custom[mask].get(id)??(needsStory(event)?compileStoryEvent(event,mask):Array.from(rom.slice(event.start,event.end)));
    if(id!==0x42f)list.push({name:`party ${mask}`,bytes}); // routed to the Frieza/bad endings below
    if(crisis[mask].has(id))list.push({name:`party ${mask}, crisis`,bytes:crisis[mask].get(id)});
    if([0x4e0,0x5f8].includes(id))list.push({name:`party ${mask}, crisis`,bytes:compileStoryEvent(event,mask,{textOverrides:crisisDialogue})});
    if(id===friezaEvents.theft)for(const collected of[0,1])list.push({name:`party ${mask}, ${collected?'some':'no'} balls`,bytes:buildFriezaEvents(rom,mask,{collected}).get(id)});
    if(id===0x42f)for(const member of[false,true])list.push({name:`party ${mask}, good ending${member?', Popoi recruited':''}`,bytes:buildFriezaEnding(mask,member)});
  }
  if(id===0x42f)for(const reason of['fortress','balls','frieza','beast'])list.push({name:`bad ending: ${reason}`,bytes:buildBadEnding(reason)});
  // Collapse identical variants.
  const seen=new Map();
  for(const v of list){const k=v.bytes.join(',');if(seen.has(k))seen.get(k).names.push(v.name);else seen.set(k,{names:[v.name],bytes:v.bytes});}
  return[...seen.values()];
}
const name=t=>t.replace(/\{0\}/g,'GOKU').replace(/\{1\}/g,'PRIMM').replace(/\{2\}/g,'POPOI');
// Text, choices, party changes and flow, in order: enough to judge coherence.
function render(bytes){
  const lines=[];let options=null;
  for(const op of parseBytes(bytes)){
    const d=describeOp(op);
    if(d.kind==='text'){const t=name(d.text).replace(/\n/g,' / ').trim();if(t)(options??lines).push(options?`  [option] ${t}`:t);continue;}
    if(d.kind==='choice'){options=lines;lines.push('[choice]');continue;}
    if(d.kind==='choice-end'){options=null;continue;}
    if(d.kind==='clear-window')continue;
    if(d.kind==='call'||d.kind==='jump')lines.push(`[${d.kind} ${hex(d.target)}]`);
    else if(d.kind==='door')lines.push(`[door ${hex(d.target)} → map ${g.get('door:'+hex(d.target))?.map}]`);
    else if(d.kind.startsWith('party'))lines.push(`[${d.kind} ${['GOKU','PRIMM','POPOI'][d.member]??d.member}]`);
    else if(d.kind==='branch'&&d.then)lines.push(`[if flag ${hex(d.condition.flag??0)} in ${d.condition.min}..${d.condition.max} → ${d.then.kind} ${hex(d.then.target)}]`);
  }
  // Drop flow-only noise when an event shows no text at all.
  return lines.some(l=>!l.startsWith('['))?lines:[];
}
function eventBlock(id){
  const n=g.get('event:'+hex(id)),blocks=[];
  for(const v of variants(id)){const lines=render(v.bytes);if(lines.length)blocks.push(`  -- ${v.names.join(' | ')}\n${lines.map(l=>'    '+l).join('\n')}`);}
  if(!blocks.length)return null;
  const authored=n.authored?' authored':'',retext=n.links.some(l=>l.rel==='says'&&g.get(l.to)?.authored)?' retext':'';
  return`### event ${hex(id)} [${n.kind}${authored}${retext}] maps ${(n.maps??[]).join(',')||'-'}\n${blocks.join('\n')}`;
}
await fs.mkdir(out,{recursive:true});
const scenes=enumerate(g,'scene'),files=new Map();
for(const s of scenes){
  if(s.kind==='chapter')continue;
  const file=s.curated?s.chapter:'areas';
  const events=s.links.filter(l=>l.rel==='contains').map(l=>g.get(l.to).num).sort((a,b)=>a-b);
  const body=events.map(eventBlock).filter(Boolean);
  const head=`## scene:${s.slug} — ${s.title} (${s.kind})\n${s.notes?`notes: ${s.notes}\n`:''}${s.dialogue?`dialogue notes: ${s.dialogue}\n`:''}`;
  if(!files.has(file))files.set(file,[]);
  files.get(file).push(head+(body.length?body.join('\n'):'(no dialogue)')+'\n');
}
// JS-surface dialogue (radio, crisis greetings, tutorials) has no event.
const tables={crisisGreetings,crisisFlightMessages,powerIntroMessages,...Object.fromEntries(Object.entries(radio).filter(([,v])=>typeof v==='object'&&!(v instanceof Function)))};
files.set('js-surfaces',Object.entries(tables).map(([k,v])=>`## ${k}\n${JSON.stringify(v,null,1)}\n`));
for(const[file,parts]of files)await fs.writeFile(`${out}/${file}.md`,parts.join('\n'));
console.log([...files].map(([f,p])=>`${f}: ${p.length} sections`).join('\n'));
