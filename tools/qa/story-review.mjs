// Emits cartridge dialogue only into ignored .local/ research output.
import fs from 'node:fs/promises';
import {parseEvent,decodeText,encodeText,wrapText} from '../../engine/event-codec.js';
import {compileStoryEvent,compiledText,needsStory} from '../../engine/story-compiler.js';
import {buildStoryEvents} from '../../engine/story-events.js';
import {storyDialogue,soloDialogue} from '../../engine/story-dialogue.js';
import {partyDialogue} from '../../engine/scene-dialogue.js';

const rom=await fs.readFile('.local/rom/secret-of-mana-us.sfc'),out='.local/story-research';
const events=Array.from({length:0x800},(_,id)=>parseEvent(rom,id)),ops=new Map(events.flatMap(e=>e.ops.map(op=>[op.at,op])));
for(const table of[storyDialogue,soloDialogue,partyDialogue])for(const [at,value]of Object.entries(table)){
 if(ops.get(Number(at))?.op!=='text')throw Error('Unknown text address '+Number(at).toString(16));
 for(const text of Array.isArray(value)?value:[value])if(text!==null){encodeText(text);if(wrapText(text).split('\n').some(s=>s.replace(/\{[012]\}/g,'XXXXXX').length>28))throw Error('Line overflow '+at);}
}
const custom=[0,1,2,3].map(mask=>buildStoryEvents(rom,mask));
const originalTextEvents=events.filter(e=>e.ops.some(o=>o.op==='text')).length;
const records=events.filter(e=>e.ops.some(o=>o.op==='text')||custom.some(m=>m.has(e.id))).map(event=>{
 const prologue=event.id>=0x100&&event.id<=0x106||event.id===0x400;
 return{id:event.id,hex:event.id.toString(16),policy:prologue?'original BOY prologue':custom.some(m=>m.has(event.id))?'authored native event':needsStory(event)?'adapted dialogue':'original NPC/lore/UI',
  variants:[0,1,2,3].map(mask=>{
   const bytes=prologue?Array.from(rom.slice(event.start,event.end)):custom[mask].get(event.id)??compileStoryEvent(event,mask);
   return{mask,text:compiledText(bytes).map(decodeText).join('\n'),bytes:bytes.length,grants:bytes.grants??[]};
  })};
});
await fs.mkdir(out,{recursive:true});
await fs.writeFile(out+'/review.json',JSON.stringify({originalTextEvents,records},null,2));
for(let mask=0;mask<4;mask++)await fs.writeFile(out+`/review-party-${mask}.txt`,records.map(r=>`EVENT ${r.hex} (${r.policy})\n${r.variants[mask].text}`).join('\n\n'));
const counts={};for(const r of records)counts[r.policy]=(counts[r.policy]??0)+1;
console.log(JSON.stringify({originalTextEvents,reviewed:records.length,partyVariants:records.length*4,policies:counts,output:out},null,2));
