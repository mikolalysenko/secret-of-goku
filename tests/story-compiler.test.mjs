import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseEvent,decodeText,encodeText,wrapText} from '../engine/event-codec.js';
import {compileStoryEvent,compiledText,partyText} from '../engine/story-compiler.js';
import {buildStoryEvents} from '../engine/story-events.js';
import {storyDialogue,soloDialogue} from '../engine/story-dialogue.js';
import {partyDialogue} from '../engine/scene-dialogue.js';
const local={skip:!existsSync('.local/rom/secret-of-mana-us.sfc')};
const line=(text,at=0)=>({op:'text',at,text,bytes:encodeText(text)}),cmd=(...bytes)=>({op:bytes[0],bytes});
test('missing named speakers and their continuations disappear without dropping the NPC reply',()=>{
 assert.deepEqual(partyText('POPOI:Grandpa!\nGRANDPA:Who is there?\nPRIMM:Hello.',0),{text:'\nGRANDPA:Who is there?',silent:true});
 assert.deepEqual(partyText('...and come back soon.',0,true),{text:'',silent:true});
});
test('silent windows lose only dialogue plumbing, preserving rewards and opaque subevents',()=>{
 const event={id:0,ops:[cmd(0x50),line('{1}:Wait!'),cmd(0x28,0),cmd(0x52),line('Do not go.'),cmd(0x30,0x33,1),cmd(0x51),cmd(0)]};
 assert.deepEqual([...compileStoryEvent(event,0)],[0x30,0x33,1,0]);
 assert.ok(compileStoryEvent({...event,ops:[cmd(0x50),cmd(0x20,0x99),cmd(0x28,0),cmd(0x51),cmd(0)]},0).includes(0x50));
 assert.equal(compiledText(compileStoryEvent(event,1)).map(decodeText).join(''),'{1}:Wait!Do not go.');
});
test('rewritten fragments wrap across native pauses and animations without joining words',()=>{
 const event={id:0,ops:[cmd(0x50),line(' ...mother?',0xa833e),cmd(0x28,32),line('\n Why?',0xa834b),cmd(0x32,1,8),line('\n Mother!!',0xa8368),cmd(0x28,0),cmd(0x51),cmd(0)]};
 const bytes=compileStoryEvent(event,0),text=compiledText(bytes).map(decodeText).join('');
 assert.match(text,/Is she gone\? I promised I/);assert.match(text,/would fix it\./);assert.match(text,/keep\s+that promise\./);
 assert.ok(text.split('\n').every(line=>line.length<=28));
 assert.ok(bytes.some((v,i)=>v===0x32&&bytes[i+1]===1&&bytes[i+2]===8),'native motion stays between the fragments');
});
test('all authored text addresses, native glyphs, four party variants and pages are valid',local,()=>{
 const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),ops=new Map();
 for(let id=0;id<0x800;id++)for(const op of parseEvent(rom,id).ops)ops.set(op.at,op);
 for(const table of[storyDialogue,soloDialogue,partyDialogue])for(const [at,value]of Object.entries(table)){
  assert.equal(ops.get(+at)?.op,'text',Number(at).toString(16));
  if(Array.isArray(value))assert.equal(value.length,4);
  for(const text of Array.isArray(value)?value:[value])if(text!==null){encodeText(text);assert.ok(wrapText(text).split('\n').every(s=>s.replace(/\{[012]\}/g,'XXXXXX').length<=28),at);}
 }
 for(let mask=0;mask<4;mask++){
  const custom=buildStoryEvents(rom,mask);
  for(let id=0;id<0x800;id++)assert.ok((custom.get(id)??compileStoryEvent(parseEvent(rom,id),mask)).length<0x8000,id.toString(16));
 }
});
test('goblin performance, future spell grants, and the final wish work without invented companions',local,()=>{
 const rom=readFileSync('.local/rom/secret-of-mana-us.sfc');
 const text=(id,mask)=>compiledText(buildStoryEvents(rom,mask).get(id)??compileStoryEvent(parseEvent(rom,id),mask)).map(decodeText).join('\n');
 const goblins=text(0x4e8,0);assert.match(goblins,/play along/);assert.match(goblins,/good pot/);assert.match(goblins,/Try to look/);assert.doesNotMatch(goblins,/Heeelp|Haaaalp|owe you my life/);
 assert.match(text(0x581,0),/if she joins/);assert.match(text(0x581,0),/if the sprite/);
 for(const mask of[0,1,2,3]){
  assert.match(text(0x42f,mask),/radioactive fallout/);assert.match(text(0x42f,mask),/RANDI:I had/);
  assert.equal(text(0x42f,mask).includes('PRIMM:'),!!(mask&1));assert.equal(text(0x42f,mask).includes('POPOI:'),!!(mask&2));
  assert.equal(text(0x4e1,mask).includes('Please find Primm'),!(mask&1));
 }
 const seed=compileStoryEvent(parseEvent(rom,0x592),0);assert.equal(seed.grants.length,1);assert.equal(seed.grants[0][1],1);
 assert.doesNotMatch(compiledText(seed).map(decodeText).join('\n'),/my head|Popoi|your memory/i);
});
