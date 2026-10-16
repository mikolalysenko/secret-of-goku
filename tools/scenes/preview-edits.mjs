#!/usr/bin/env node
// Preview proposed dialogue edits through the real story compiler without
// touching the tables. Output is private (it contains cartridge text).
//
//   node tools/scenes/preview-edits.mjs proposals.json [--event 28b]
//
// proposals.json: {"edits":[{"event":"28b","at":"0x9xxxx","table":"storyDialogue"|"partyDialogue",
//   "value":"TEXT" | [mask0,mask1,mask2,mask3]  (null keeps the current line, "" removes it)}]}
import fs from 'node:fs/promises';
import {parseEvent,encodeText,wrapText} from '../../engine/event-codec.js';
import {compileStoryEvent} from '../../engine/story-compiler.js';
import {storyDialogue,soloDialogue} from '../../engine/story-dialogue.js';
import {partyDialogue} from '../../engine/scene-dialogue.js';
import {parseBytes} from '../../engine/scene-graph.js';

const [file]=process.argv.slice(2).filter(a=>!a.startsWith('--')),only=process.argv.includes('--event')?parseInt(process.argv[process.argv.indexOf('--event')+1],16):null;
const rom=await fs.readFile(process.env.SOM_ROM??'.local/rom/secret-of-mana-us.sfc');
const {edits}=JSON.parse(await fs.readFile(file,'utf8'));
const problems=[],events=new Map();
for(const e of edits){
  const at=parseInt(e.at,16),id=parseInt(e.event,16),event=parseEvent(rom,id);
  if(!event.ops.some(op=>op.op==='text'&&op.at===at))problems.push(`${e.event} ${e.at}: not a text-run start in this event`);
  for(const v of[].concat(e.value))if(typeof v==='string'&&v){
    try{encodeText(v);}catch(error){problems.push(`${e.at}: ${error.message}`);}
    for(const line of wrapText(v).split('\n'))if(line.replace(/\{[0-3]\}/g,'XXXXXX').length>28)problems.push(`${e.at}: line over 28 columns: ${line}`);
  }
  if(!events.has(id))events.set(id,[]);events.get(id).push({...e,at});
}
// Pages as the player sees them, for each party mask.
function pages(bytes){
  const out=[];let page='';
  for(const op of parseBytes(bytes)){
    if(op.op==='text')page+=op.text;
    else if([0x50,0x51,0x52].includes(op.op)){if(page.trim())out.push(page);page='';}
    else if(op.op===0x2b||op.op===0x2c){if(page.trim())out.push(page);page='';out.push(`[${op.op===0x2b?'party-add':'party-remove'} ${op.bytes[1]}]`);}
  }
  if(page.trim())out.push(page);
  return out.map(p=>p.replace(/\{0\}/g,'GOKU').replace(/\{1\}/g,'PRIMM').replace(/\{2\}/g,'POPOI'));
}
for(const[id,list]of events){
  if(only!==null&&id!==only)continue;
  console.log(`\n=== event ${id.toString(16)}`);
  for(let mask=0;mask<4;mask++){
    const overrides={};
    for(const e of list){const v=Array.isArray(e.value)?e.value[mask]:e.value;if(v!==null&&v!==undefined)overrides[e.at]=v;}
    const shown=pages(compileStoryEvent(parseEvent(rom,id),mask,{textOverrides:overrides}));
    // Retail pages may rely on the window's own wrap; only judge new ones.
    const baseline=new Set(pages(compileStoryEvent(parseEvent(rom,id),mask)));
    console.log(`--- party ${mask}`);
    for(const p of shown){
      console.log('  ┌ '+p.split('\n').join('\n  │ '));
      if(p.startsWith('[')||baseline.has(p))continue;
      for(const line of p.split('\n'))if(line.length>28)problems.push(`${id.toString(16)} party ${mask}: rendered line over 28: ${line}`);
      if(p.split('\n').length>3)problems.push(`${id.toString(16)} party ${mask}: page over 3 lines`);
    }
  }
}
// Existing table entries the proposal would override.
for(const e of edits){const at=parseInt(e.at,16);if(at in storyDialogue||at in soloDialogue||at in partyDialogue)console.log(`note: ${e.at} already has an authored entry (replacing it)`);}
console.log(problems.length?`\nPROBLEMS:\n${[...new Set(problems)].join('\n')}`:'\nOK: all edits encode, fit 28 columns and 3-line pages.');
process.exitCode=problems.length?1:0;
