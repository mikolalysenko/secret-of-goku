import {dialoguePages,encodeText,commandLength,textWidth,nameCodes} from './event-codec.js';
import {storyDialogue,soloDialogue} from './story-dialogue.js';
import {partyDialogue} from './scene-dialogue.js';
import {retailDialogue} from './retail-dialogue.js';
import {sandshipDialogue} from './sandship-dialogue.js';
import {bossReactions,box} from './story-events.js';
import {renameSenzu} from './native-senzu.js';
import {potosCommand} from './potos-story.js';
import {dragonBallGrant} from './dragon-quest.js';

// Speaker identity carries over pauses and page clears. A missing companion
// must not erase an NPC's reply on the same page, or speak under a bare name.
export function partyText(text,mask,silent=false){
 const matches=[...text.matchAll(/(?:^|\n)\s*(\{[0-3]\}|[A-Z][A-Z ]*):/g)];
 let kept='',offset=0;
 for(let i=0;i<matches.length;i++){
  const match=matches[i];if(!silent)kept+=text.slice(offset,match.index);
  silent=(['{1}','PRIMM'].includes(match[1])&&!(mask&1))||(['{2}','POPOI'].includes(match[1])&&!(mask&2));
  offset=match.index;const end=matches[i+1]?.index??text.length;
  if(!silent)kept+=text.slice(offset,end);offset=end;
 }
 if(!matches.length&&!silent)kept=text;
 // A name code stays a code even when that companion is absent: the native
 // name slot shows the player's name, or the default if never named.
 return{text:kept,silent};
}
export function storyText(op,mask,silent=false,overrides={}){
 // Scene-specific revisions, then retail adaptations: a string for every
 // party, or [solo, +Primm, +Popoi, both] with null falling through.
 const retail=sandshipDialogue[op.at]??retailDialogue[op.at];
 let text=overrides[op.at]??(Array.isArray(retail)?retail[mask]:retail)??partyDialogue[op.at]?.[mask];
 const spriteScene=op.at===0x9a168||(op.at>=0xa31ec&&op.at<=0xa3423);
 const missing=spriteScene||op.text.includes('{2}:')?!(mask&2):!(mask&1);
 text??=missing?soloDialogue[op.at]:null;
 text??=storyDialogue[op.at];
 const authored=text!==undefined&&text!==null;
 const result=partyText(authored?text:op.text,mask,authored?false:silent);
 return{...result,text:renameSenzu(result.text),authored};
}
// Events that always run from the cartridge: the BOY prologue and title
// legend, plus 103, whose bytes the arrival splice jumps into (its Goku
// lines are same-length patches in dialogue-patches.js). 104/105 follow the
// crash and compile like any other scene.
export const nativeOnlyEvents=Object.freeze([0x100,0x101,0x102,0x103,0x106,0x400]);
export function needsStory(event){
 return !!bossReactions[event.id]||event.ops.some(op=>dragonBallGrant(op.at,op.op)!==null||op.op==='text'&&
  (op.at in storyDialogue||op.at in soloDialogue||op.at in partyDialogue||op.at in retailDialogue||op.at in sandshipDialogue||/\{[12]\}/.test(op.text)||renameSenzu(op.text)!==op.text));
}

// Native scripts often split a sentence around an animation or pause. A
// replacement can be longer than its fragment, so measure the whole window
// instead of independently wrapping each text opcode from column zero.
function layoutText(text,state,format){
 const out=[],width=textWidth;
 const newline=()=>{
  if(state.row>=2){out.push(0x28,0,0x52);state.row=0;}else{out.push(0x7f);state.row++;}
  state.column=0;state.space=false;
 };
 if(!format){
  for(const char of text.replace(nameCodes,'XXXXXX')){
   if(char==='\n'){state.row++;state.column=0;}else state.column++;
   state.space=char===' ';
  }
  return encodeText(text);
 }
 // A speaker's lines start a new page when they would not fit on this one,
 // so no line is separated from its label (4 lines read 2+2, not 3+1).
 const lines=text.split('\n'),label=/^(?:\{[0-3]\}|[A-Z][A-Z ]*):/;
 const speech=i=>{let n=1;while(i+n<lines.length&&!label.test(lines[i+n]))n++;return n;};
 const speakerBreak=i=>{
  const n=speech(i);
  if(state.row<2&&n<=3&&state.row+1+n>3){out.push(0x28,0,0x52);state.row=0;state.column=0;state.space=false;}else newline();
 };
 let line=0;
 if(state.column&&text&&!/^\s|^[.,!?]/.test(text)){
  if(label.test(text))speakerBreak(0);
  else state.space=true;
 }
 for(const token of text.match(/\n|[^\S\n]+|[^\s]+/g)??[]){
  if(token==='\n'){line++;if(label.test(lines[line]??''))speakerBreak(line);else newline();continue;}
  if(/^\s+$/.test(token)){state.space=true;continue;}
  const size=width(token);
  if(state.row>2)newline();
  if(state.column&&state.column+Number(state.space)+size>28)newline();
  if(state.space&&state.column){out.push(0x80);state.column++;}
  out.push(...encodeText(token));state.column+=size;state.space=false;
 }
 return out;
}

export function compileStoryEvent(event,mask,{textOverrides={}}={}){
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
 // A companion this event recruits (ADD_CHARACTER) is on stage for the whole
 // scene: their naming reply and "joined" line precede the native add, and a
 // freed captive speaks before rejoining. Treat them as present throughout.
 for(const op of event.ops)if(op.op===0x2b&&op.bytes[1]>=1&&op.bytes[1]<=2)currentMask|=1<<(op.bytes[1]-1);
 const layout={window:false,changed:false,row:0,column:0,space:false};
 for(const op of event.ops){
  if(op.op==='text'){
   const result=storyText(op,currentMask,silent,textOverrides);silent=result.silent;
   let text=result.text;
   if(!text){lastSilent=true;continue;}
   // After a retained retail fragment, a replacement keeps the line break its
   // original run began with instead of gluing onto that retail sentence.
   // Consecutive authored fragments still flow as one sentence.
   if(result.authored&&layout.window&&layout.column&&layout.retail&&/^\n/.test(op.text)&&!/^\s/.test(text))text='\n'+text;
   layout.retail=!result.authored;
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
