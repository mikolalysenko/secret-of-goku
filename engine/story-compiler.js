import {dialoguePages,encodeText,commandLength} from './event-codec.js';
import {storyDialogue,soloDialogue} from './story-dialogue.js';
import {partyDialogue} from './scene-dialogue.js';
import {bossReactions,box} from './story-events.js';
import {renameSenzu} from './native-senzu.js';
import {potosCommand} from './potos-story.js';
import {dragonBallGrant} from './dragon-quest.js';

// Speaker identity carries over pauses and page clears. A missing companion
// must not erase an NPC's reply on the same page, or speak under a bare name.
export function partyText(text,mask,silent=false){
 const matches=[...text.matchAll(/(?:^|\n)\s*(\{[012]\}|[A-Z][A-Z ]*):/g)];
 let kept='',offset=0;
 for(let i=0;i<matches.length;i++){
  const match=matches[i];if(!silent)kept+=text.slice(offset,match.index);
  silent=(['{1}','PRIMM'].includes(match[1])&&!(mask&1))||(['{2}','POPOI'].includes(match[1])&&!(mask&2));
  offset=match.index;const end=matches[i+1]?.index??text.length;
  if(!silent)kept+=text.slice(offset,end);offset=end;
 }
 if(!matches.length&&!silent)kept=text;
 if(!(mask&1))kept=kept.replaceAll('{1}','Primm');
 if(!(mask&2))kept=kept.replaceAll('{2}','Popoi');
 return{text:kept,silent};
}
export function storyText(op,mask,silent=false){
 let text=partyDialogue[op.at]?.[mask];
 const spriteScene=op.at===0x9a168||(op.at>=0xa31ec&&op.at<=0xa3423);
 const missing=spriteScene||op.text.includes('{2}:')?!(mask&2):!(mask&1);
 text??=missing?soloDialogue[op.at]:null;
 text??=storyDialogue[op.at];
 const authored=text!==undefined&&text!==null;
 const result=partyText(authored?text:op.text,mask,authored?false:silent);
 return{...result,text:renameSenzu(result.text),authored};
}
export function needsStory(event){
 return !!bossReactions[event.id]||event.ops.some(op=>dragonBallGrant(op.at,op.op)!==null||op.op==='text'&&
  (op.at in storyDialogue||op.at in soloDialogue||op.at in partyDialogue||/\{[12]\}/.test(op.text)||renameSenzu(op.text)!==op.text));
}

// Native scripts often split a sentence around an animation or pause. A
// replacement can be longer than its fragment, so measure the whole window
// instead of independently wrapping each text opcode from column zero.
function layoutText(text,state,format){
 const out=[],width=s=>s.replace(/\{[012]\}/g,'XXXXXX').length;
 const newline=()=>{
  if(state.row>=2){out.push(0x28,0,0x52);state.row=0;}else{out.push(0x7f);state.row++;}
  state.column=0;state.space=false;
 };
 if(!format){
  for(const char of text.replace(/\{[012]\}/g,'XXXXXX')){
   if(char==='\n'){state.row++;state.column=0;}else state.column++;
   state.space=char===' ';
  }
  return encodeText(text);
 }
 if(state.column&&text&&!/^\s|^[.,!?]/.test(text)){
  if(/^(?:\{[012]\}|[A-Z][A-Z ]*):/.test(text))newline();
  else state.space=true;
 }
 for(const token of text.match(/\n|[^\S\n]+|[^\s]+/g)??[]){
  if(token==='\n'){newline();continue;}
  if(/^\s+$/.test(token)){state.space=true;continue;}
  const size=width(token);
  if(state.row>2)newline();
  if(state.column&&state.column+Number(state.space)+size>28)newline();
  if(state.space&&state.column){out.push(0x80);state.column++;}
  out.push(...encodeText(token));state.column+=size;state.space=false;
 }
 return out;
}

export function compileStoryEvent(event,mask){
 // The Earth reward is shared; Popoi's memory scene is not. Keep the native
 // seed grant and its quest marker, then advance the same story flag.
 if(event.id===0x592&&!(mask&2)){
  const text=event.ops.findIndex(op=>op.at===0xa73f5);
  const end=event.ops.findIndex((op,i)=>i>text&&op.op===0x51);
  if(text<0||end<0)throw Error('Unsupported Earth seed event');
  event={...event,ops:[...event.ops.slice(0,end+1),{op:0x29,bytes:[0x29,0x18]},{op:0,bytes:[0]}]};
 }
 const chunks=bossReactions[event.id]?[{bytes:box(bossReactions[event.id])}]:[];
 let silent=false,lastSilent=false,selection=false,currentMask=mask;
 const layout={window:false,changed:false,row:0,column:0,space:false};
 for(const op of event.ops){
  if(op.op==='text'){
   const result=storyText(op,currentMask,silent);silent=result.silent;
   const text=result.text;
   if(!text){lastSilent=true;continue;}
   lastSilent=false;
   if(result.authored)layout.changed=true;
   const bytes=layout.window&&!selection?layoutText(text,layout,layout.changed):result.authored&&!selection?dialoguePages(text):text===op.text?op.bytes:encodeText(text);
   chunks.push({op:'text',visible:!!text.trim(),bytes});
  }else{
   if(op.op===0x50){silent=false;lastSilent=false;Object.assign(layout,{window:true,changed:false,row:0,column:0,space:false});}
   if(op.op===0x51)layout.window=false;
   if(op.op===0x52)Object.assign(layout,{row:0,column:0,space:false});
   if(op.op===0x2b&&op.bytes[1]>=1&&op.bytes[1]<=2)currentMask|=1<<(op.bytes[1]-1);
   if(op.op===0x2c&&op.bytes[1]>=1&&op.bytes[1]<=2)currentMask&=~(1<<(op.bytes[1]-1));
   if(op.op===0x58)selection=true;
   if(op.op===0x5b)selection=false;
   if(lastSilent&&!selection&&(op.op===0x52||(op.op===0x28&&op.bytes[1]===0)))continue;
   // Sandship captivity only marks companions who were actually aboard.
   // Otherwise its later rescue would silently recruit missing characters.
   if(event.id===0x28b&&op.op===0x30&&op.bytes[2]===8&&
    (op.bytes[1]===0x0d&&!(mask&1)||op.bytes[1]===0x0e&&!(mask&2)))continue;
   chunks.push({op:op.op,bytes:potosCommand(op)??op.bytes,grant:dragonBallGrant(op.at,op.op)});
  }
 }
 // Remove only balanced windows that contain no visible text, calls, choices
 // or branches. Preserve non-dialogue commands and rewards inside them.
 for(let i=0;i<chunks.length;i++)if(chunks[i].op===0x50){
  let end=i+1,safe=true;
  for(;end<chunks.length&&chunks[end].op!==0x51;end++){
   const op=chunks[end].op;
   if(op==='text'&&chunks[end].visible||op===0x50||(op>=0x10&&op<=0x27)||(op>=0x40&&op<=0x4e)||(op>=0x57&&op<=0x5b)){safe=false;break;}
  }
  if(safe&&end<chunks.length)for(let j=i;j<=end;j++)if(chunks[j].op==='text'||[0x50,0x51,0x52].includes(chunks[j].op)||chunks[j].op===0x28&&chunks[j].bytes[1]===0)chunks[j].bytes=[];
 }
 const out=[];out.grants=[];
 for(const chunk of chunks){out.push(...chunk.bytes);if(chunk.grant!==null&&chunk.grant!==undefined)out.grants.push([out.length,chunk.grant]);}
 return out;
}

// Private review tooling uses this to inspect exactly what the native engine
// will receive for each party, without executing or publishing ROM dialogue.
export function compiledText(bytes){
 const runs=[];
 for(let i=0;i<bytes.length;){
  if(bytes[i]>=0x7f||bytes[i]===0x57){const start=i;do{i+=bytes[i]===0x57?2:1;}while(i<bytes.length&&(bytes[i]>=0x7f||bytes[i]===0x57));runs.push(bytes.slice(start,i));}
  else i+=commandLength(bytes,i);
 }
 return runs;
}
