// Linked scene graph, crawled from the user's ROM, the mod's authored tables
// and the engine source. Nothing here is a copy: every node is derived when
// the graph is built, and the curated catalog only supplies names, notes and
// launch recipes. Cartridge text is resolved in memory and never written by
// this module; callers choose where (if anywhere) to emit it.
//
// IRIs: event:4e1 · text:a73f5 · map:246 · door:3fc · flag:4e · scene:<id>
//       code:engine/story-events.js:120 · start:<quick-start kind>
import {parseEvent,decodeText,commandLength} from './event-codec.js';
import {buildStoryEvents} from './story-events.js';
import {buildFriezaEvents,buildFriezaEnding,friezaEvents} from './frieza-events.js';
import {buildSandshipEvents} from './sandship.js';
import {buildFriezaTree} from './frieza-tree.js';
import {buildBadEnding} from './ending-events.js';
import {endingEvents} from './ending-rules.js';
import {storyDialogue,soloDialogue} from './story-dialogue.js';
import {partyDialogue} from './scene-dialogue.js';
import {retailDialogue} from './retail-dialogue.js';
import {crisisDialogue} from './frieza-crisis.js';
import {flightDialogue} from './flight-dialogue.js';
import {breakableDoors} from './breakable-doors.js';
import {kiBarriers} from './native-barriers.js';
import {quickStartLabels} from './quick-start.js';

export const hex=n=>n.toString(16);
export const iri={event:id=>`event:${hex(id)}`,text:at=>`text:${hex(at)}`,map:id=>`map:${id}`,door:id=>`door:${hex(id)}`,
  flag:id=>`flag:${hex(id)}`,scene:id=>`scene:${id}`,start:kind=>`start:${kind}`,code:(file,line)=>`code:${file}:${line}`};
export function parseIri(value){
  const [type,...rest]=String(value).split(':'),key=rest.join(':');
  const number=['event','text','door','flag'].includes(type)?parseInt(key,16):type==='map'?Number(key):null;
  return{type,key,number};
}
// Accept "4e1", "0x4e1", "event:4e1" and scene slugs from humans and URLs.
export function normalizeIri(value){
  const text=String(value).trim();
  if(/^(event|text|map|door|flag|scene|start|code):/.test(text))return text;
  if(/^(0x)?[0-9a-f]{1,3}$/i.test(text))return iri.event(parseInt(text.replace(/^0x/i,''),16));
  if(/^(0x)?[0-9a-f]{5}$/i.test(text))return iri.text(parseInt(text.replace(/^0x/i,''),16));
  return iri.scene(text);
}

// ---------------------------------------------------------------- opcodes
// Semantics from the US interpreter, cross-checked with Moppu's
// SecretOfManaRandomizer EventCommandEnum and every opcode used in the ROM.
const simple={0x00:'end',0x02:'return',0x03:'gather-party',0x04:'hide-a',0x05:'hide-b',0x06:'cutscene-lock',0x07:'cutscene-unlock',
  0x08:'wait-animation',0x09:'refresh-objects',0x0a:'refresh-map',0x0e:'sell-menu',0x0f:'upgrade-menu',0x1c:'flammie-launch',0x1d:'cannon-launch',
  0x35:'unknown-35',0x50:'open-window',0x51:'close-window',0x52:'clear-window',0x58:'choice',0x5b:'choice-end',0x5d:'show-gold',0x5e:'hide-gold',0x5f:'gold-view'};
const flow=b=>{
  const op=b[0],target=(op&7)<<8|b[1];
  if(op>=0x10&&op<=0x17)return{kind:'jump',target};
  if(op>=0x18&&op<=0x1b)return{kind:'door',target:(op-0x18)<<8|b[1]};
  if(op>=0x20&&op<=0x27)return{kind:'call',target};
  return null;
};
export function describeOp(op){
  if(op.op==='text')return{kind:'text',at:op.at,text:op.text};
  const b=op.bytes,code=b[0],base=flow(b);
  if(base)return base;
  if(code===0x0b)return{kind:'skip',bytes:b[1]};
  if(code===0x1e)return{kind:'item',item:b[1]};
  if(code===0x1f)return{kind:'system',selector:b[1],note:b[1]<=2?'name character':b[1]===6?'save menu':'misc'};
  if(code===0x28)return{kind:'sleep',frames:b[1],note:b[1]?null:'wait for button'};
  if(code===0x29)return{kind:'flag-inc',flag:b[1]};
  if(code===0x2a)return{kind:'flag-dec',flag:b[1]};
  if(code===0x2b)return{kind:'party-add',member:b[1]};
  if(code===0x2c)return{kind:'party-remove',member:b[1]};
  if(code===0x2d)return{kind:'effect',effect:b[1],args:b.slice(2)};
  if(code===0x2e)return{kind:'buy-menu',menu:b[1]};
  if(code===0x2f)return{kind:'heal',mask:b[1]};
  if(code===0x30)return{kind:'flag-set',flag:b[1],value:b[2]};
  if(code===0x31)return{kind:'player-animation',actor:b[1],animation:b[2]};
  if(code===0x32)return{kind:'move',actor:b[1],arg:b[2]};
  if(code===0x33)return{kind:'background-color',arg:b.slice(1)};
  if(code===0x34)return{kind:'actor-animation',actor:b[1],animation:b[2]};
  if(code===0x36||code===0x37)return{kind:code===0x36?'gold-add':'gold-remove',amount:b[1]|b[2]<<8};
  if(code===0x38)return{kind:'actor-38',args:b.slice(1)};
  if(code===0x39)return{kind:'attribute',actor:b[1],attribute:b[2],value:b[3]};
  if(code===0x40)return{kind:b[1]===1?'music':b[1]===2?'sound':b[1]&0x80?'music-fade':'audio',args:b.slice(1)};
  // EVENT_LOGIC: run the embedded jump/call/door when flag is within range.
  if(code===0x42)return{kind:'branch',condition:{flag:b[1],min:b[2]>>4,max:b[2]&15},then:flow(b.slice(3))};
  // 6-byte conditionals keep their consequence in the final two bytes.
  if(code>=0x41&&code<=0x4e)return{kind:'branch',condition:{opcode:code,args:b.slice(1,-2)},then:flow(b.slice(-2))};
  if(code===0x57)return{kind:'name',who:b[1]};
  if(code===0x59)return{kind:'spaces',count:b[1]};
  if(code===0x5a)return{kind:'option',x:b[1]};
  if(code===0x7d)return{kind:'credits'};
  return{kind:simple[code]??`op-${hex(code)}`};
}
// Authored scripts are plain byte arrays. Decode them exactly as the ROM's.
export function parseBytes(bytes,{at=null}={}){
  const ops=[];
  for(let i=0;i<bytes.length;){
    const begin=i,op=bytes[i];
    if(op>=0x7f||op===0x57){
      do{i+=bytes[i]===0x57?2:1;}while(i<bytes.length&&(bytes[i]>=0x7f||bytes[i]===0x57));
      ops.push({at:at===null?null:at+begin,offset:begin,op:'text',text:decodeText(bytes.slice(begin,i))});
    }else{i+=commandLength(bytes,i);ops.push({at:at===null?null:at+begin,offset:begin,op,bytes:Array.from(bytes.slice(begin,i))});}
  }
  return ops;
}
// Every outgoing link and side effect of a decoded script.
export function scriptFacts(ops){
  const facts={jumps:[],calls:[],doors:[],branches:[],flagsWritten:[],flagsRead:[],party:[],music:[],items:[],choices:0,windows:0,text:[],textRuns:0,moves:0,menus:[]};
  for(const op of ops){
    const d=describeOp(op);
    if(d.kind==='text'){facts.textRuns++;if(op.at!==null&&op.at!==undefined)facts.text.push(op.at);continue;}
    if(d.kind==='jump')facts.jumps.push(d.target);
    if(d.kind==='call')facts.calls.push(d.target);
    if(d.kind==='door')facts.doors.push(d.target);
    if(d.kind==='branch'){
      facts.branches.push(d);if(d.condition.flag!==undefined)facts.flagsRead.push(d.condition.flag);
      if(d.then?.kind==='jump')facts.jumps.push(d.then.target);
      if(d.then?.kind==='call')facts.calls.push(d.then.target);
      if(d.then?.kind==='door')facts.doors.push(d.then.target);
    }
    if(d.kind==='flag-set')facts.flagsWritten.push({flag:d.flag,value:d.value,op:'set'});
    if(d.kind==='flag-inc'||d.kind==='flag-dec')facts.flagsWritten.push({flag:d.flag,op:d.kind.slice(5)});
    if(d.kind==='party-add'||d.kind==='party-remove')facts.party.push({member:d.member,op:d.kind.slice(6)});
    if(d.kind==='music')facts.music.push(d.args[1]);
    if(d.kind==='item')facts.items.push(d.item);
    if(d.kind==='choice')facts.choices++;
    if(d.kind==='open-window')facts.windows++;
    if(['move','player-animation','actor-animation','wait-animation'].includes(d.kind))facts.moves++;
    if(['buy-menu','sell-menu','upgrade-menu'].includes(d.kind)||d.kind==='system'&&d.selector===6)facts.menus.push(d.kind);
  }
  return facts;
}
// END-only slots (empty), plain NPC talk, services (inn/shop/cannon/save),
// shared rewards, choreographed cutscenes and non-text scripts.
// $CF0F/$CFF9/$CFFA/$CFFD/$CFFE are the native service selectors.
const serviceFlags=new Set([0x0f,0xf9,0xfa,0xfd,0xfe]);
export function classifyEvent(event,facts,{callers=0}={}){
  if(event.end-event.start<=1)return'empty';
  const story=facts.flagsWritten.filter(w=>!serviceFlags.has(w.flag)&&w.flag<0xf7);
  const progress=story.length||facts.party.length||facts.doors.length;
  if(facts.textRuns){
    if(facts.menus.length||facts.flagsWritten.some(w=>serviceFlags.has(w.flag))&&!facts.party.length&&story.length<=1&&facts.moves<3)return'service';
    if(callers>=3&&facts.textRuns<=2&&!facts.moves&&story.length<=1&&!facts.party.length)return'reward';
    return progress||facts.moves>2||facts.calls.length>=2||facts.music.length?'cutscene':'dialogue';
  }
  return progress||facts.moves?'script':'utility';
}

// ---------------------------------------------------------------- maps
// Minimal, browser-safe readers. tools/rom/rom.mjs documents the formats
// (Moppu's randomizer); it imports node:crypto, so it cannot load here.
const word=(rom,a)=>rom[a]|rom[a+1]<<8;
function tableRange(rom,table,id){const base=table&0xff0000;return{start:base+word(rom,table+id*2),end:base+word(rom,table+(id+1)*2)};}
export function readDoor(rom,id){
  const a=0x83000+id*4;
  return{id,map:rom[a]|(rom[a+1]&1)<<8,x:rom[a+1]>>1,y:rom[a+2]>>1,layer:rom[a+2]&1,transition:rom[a+3]};
}
export function readMapEvents(rom,id){
  const objects=[],triggers=[],o=tableRange(rom,0x87000,id),t=tableRange(rom,0x84000,id);
  if(o.end<o.start||o.end-o.start>0x800)return null;
  const header=Array.from(rom.slice(o.start,o.start+8)),walkOn=!!(header[3]&4);
  for(let a=o.start+8;a+8<=o.end;a+=8)objects.push({index:objects.length,
    visibility:{flag:rom[a],min:rom[a+1]>>4,max:rom[a+1]&15},x:rom[a+2]&127,y:rom[a+3]&127,species:rom[a+5],event:rom[a+6]|(rom[a+7]&7)<<8});
  for(let a=t.start;a+2<=t.end&&t.end-t.start<0x400;a+=2){
    const value=word(rom,a);if(value===0xffff)break;
    const index=triggers.length,role=index===0&&walkOn?'walk-on':'tile';
    triggers.push(value<0x800?{index,role,event:value}:{index,role,door:value-0x800});
  }
  return{id,header,walkOn,objects,triggers};
}

// ---------------------------------------------------------------- source
// Code references come from the engine source itself, not from a list.
// Hex literals only count in event-shaped contexts; text addresses
// (5-digit ROM offsets in the event banks) are unambiguous.
const eventShaped=/(?:events\.set|request|route|call|jump|eventRange\([^,]+,|parseEvent\([^,]+,|lastEvent===|event:|prepareEvent:|for\(const id of\s*\[)\s*\(?\s*(0x[0-9a-f]{1,3})\b/gi;
const idList=/\[((?:\s*0x[0-9a-f]{1,3}\s*,)+\s*0x[0-9a-f]{1,3}\s*)\]/gi;
const keyed=/^\s*(0x[0-9a-f]{1,3})\s*:/i,textAddress=/\b0x([9a][0-9a-f]{4})\b/gi,symbol=/\b(?:F|f|friezaEvents)\.([a-zA-Z]+)\b|\bendingEvents\.([a-zA-Z]+)\b/g;
export function indexSource(file,source){
  const refs=[];
  source.split('\n').forEach((line,i)=>{
    const add=(to,rel='mentions')=>refs.push({from:iri.code(file,i+1),to,rel,file,line:i+1});
    for(const m of line.matchAll(eventShaped))add(iri.event(parseInt(m[1],16)));
    if(/(?:events\.set|includes|for\(const id of|route|\.has)\b/.test(line))for(const m of line.matchAll(idList))for(const n of m[1].split(','))add(iri.event(parseInt(n,16)));
    const k=line.match(keyed);if(k&&/0x[0-9a-f]{1,3}\s*:\s*['"`]/i.test(line))add(iri.event(parseInt(k[1],16)));
    for(const m of line.matchAll(textAddress))add(iri.text(parseInt(m[1],16)));
    for(const m of line.matchAll(symbol)){
      const id=m[1]?friezaEvents[m[1]]:endingEvents[m[2]];if(id!==undefined)add(iri.event(id));
    }
  });
  // Deduplicate per line and target.
  const seen=new Set();return refs.filter(r=>{const k=r.from+'>'+r.to;if(seen.has(k))return false;seen.add(k);return true;});
}
// Follow relative ES imports from an entry point. `read(path)` returns text.
// HTML entries contribute their <script src> files (classic and module).
export const sourceEntries=['index.html','scenes.html'];
export async function crawlSources(read,entries=sourceEntries){
  const files=new Map(),queue=[...entries];
  while(queue.length){
    const file=queue.shift();if(files.has(file))continue;
    let text;try{text=await read(file);}catch{continue;}
    if(file.endsWith('.html')){
      for(const m of text.matchAll(/<script[^>]*\bsrc=["']([^"'?#]+\.m?js)/g))if(!/^[a-z]+:/.test(m[1]))queue.push(m[1].replace(/^\.?\//,''));
      continue;
    }
    files.set(file,text);
    for(const m of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.{1,2}\/[^'"]+\.m?js)['"]/g)){
      const parts=file.split('/').slice(0,-1);
      for(const p of m[1].split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}
      queue.push(parts.join('/'));
    }
  }
  return files;
}

// ---------------------------------------------------------------- overlay
// The mod's authored scripts and text substitutions, per party mask.
export function modOverlay(rom){
  const authored=new Map(),add=(id,variant,bytes)=>{
    if(!authored.has(id))authored.set(id,new Map());
    const variants=authored.get(id),key=Array.from(bytes).join(',');
    for(const[name,existing]of variants)if(existing.key===key){existing.names.push(variant);return;}
    variants.set(variant,{key,names:[variant],bytes:Array.from(bytes)});
  };
  for(let mask=0;mask<4;mask++){
    // 42F's default script is never selected: native-story routes the ending
    // to buildFriezaEnding or buildBadEnding, which are added below.
    for(const[id,bytes]of buildStoryEvents(rom,mask))if(id!==0x42f)add(id,`party ${mask}`,bytes);
    for(const[id,bytes]of buildStoryEvents(rom,mask,{crisis:true}))add(id,`party ${mask}, crisis`,bytes);
    for(const[id,bytes]of buildFriezaEvents(rom,mask))add(id,`party ${mask}`,bytes);
    if(!mask)for(const[id,variant,bytes]of buildSandshipEvents())add(id,variant,bytes);
    add(0x5f8,`party ${mask}, Frieza pursuit`,buildFriezaTree(parseEvent(rom,0x5f8),mask));
    for(const collected of[0,1])add(friezaEvents.theft,`party ${mask}, ${collected?'some':'no'} balls`,buildFriezaEvents(rom,mask,{collected}).get(friezaEvents.theft));
    for(const member of[false,true])add(0x42f,`party ${mask}, good ending${member?', Popoi recruited':''}`,buildFriezaEnding(mask,member));
  }
  for(const reason of['fortress','balls','frieza','beast'])add(0x42f,`bad ending: ${reason}`,buildBadEnding(reason));
  for(const door of breakableDoors)for(const[id,bytes]of door.events)add(id,`door ${door.id} broken`,bytes);
  const text=new Map(),put=(at,table,value,variant)=>{if(!text.has(at))text.set(at,[]);text.get(at).push({table,variant,value});};
  for(const[at,value]of Object.entries(storyDialogue))put(Number(at),'storyDialogue',value);
  for(const[at,value]of Object.entries(soloDialogue))put(Number(at),'soloDialogue',value,'missing companion');
  for(const[at,values]of Object.entries(partyDialogue))values.forEach((value,mask)=>put(Number(at),'partyDialogue',value,`party ${mask}`));
  for(const[at,value]of Object.entries(crisisDialogue))put(Number(at),'crisisDialogue',value,'crisis');
  for(const[at,value]of Object.entries(retailDialogue)){
    if(Array.isArray(value))value.forEach((v,mask)=>{if(v!==null)put(Number(at),'retailDialogue',v,`party ${mask}`);});
    else put(Number(at),'retailDialogue',value);
  }
  for(const patch of flightDialogue)put(patch.at,'flightDialogue',patch.after);
  return{authored,text};
}

// ---------------------------------------------------------------- graph
export function createGraph(){
  const nodes=new Map();
  const node=(id,props={})=>{let n=nodes.get(id);if(!n){n={id,type:parseIri(id).type,links:[],backlinks:[]};nodes.set(id,n);}Object.assign(n,props);return n;};
  const link=(from,rel,to,extra)=>{
    const a=node(from),b=node(to),edge={rel,to,...extra};
    if(a.links.some(l=>l.rel===rel&&l.to===to&&JSON.stringify(l)===JSON.stringify(edge)))return;
    a.links.push(edge);b.backlinks.push({rel,from,...extra});
  };
  return{nodes,node,link,get:id=>nodes.get(normalizeIri(id))};
}

// Build the whole graph. `sources` is a Map(file→text); `catalog` is the
// curated JSON; `mapNames` is an id→name object. All are optional.
export function buildSceneGraph(rom,{catalog={scenes:[]},sources=new Map(),mapNames={}}={}){
  const g=createGraph(),events=[],textOwner=new Map(),runs=[];
  for(let id=0;id<0x800;id++){
    const event=parseEvent(rom,id),facts=scriptFacts(event.ops),kind=null;
    events.push(event);
    for(const at of facts.text)textOwner.set(at,id);
    for(const op of event.ops)if(op.op==='text')runs.push({at:op.at,end:op.at+op.bytes.length,id});
    g.node(iri.event(id),{num:id,start:event.start,end:event.end,size:event.end-event.start,kind,facts,
      summary:{text:facts.textRuns,choices:facts.choices,flags:facts.flagsWritten.length,doors:facts.doors.length,party:facts.party.length}});
    for(const at of facts.text)g.link(iri.event(id),'says',iri.text(at));
  }
  const ev=id=>iri.event(id&0x7ff);
  for(const event of events){
    const from=iri.event(event.id),f=g.get(from).facts;
    for(const t of f.jumps)g.link(from,'jumps',ev(t));
    for(const t of f.calls)g.link(from,'calls',ev(t));
    for(const d of f.doors)g.link(from,'opens-door',iri.door(d));
    for(const b of f.branches)if(b.condition.flag!==undefined&&b.then)g.link(from,'branches',b.then.kind==='door'?iri.door(b.then.target):ev(b.then.target),{when:b.condition});
    for(const w of f.flagsWritten)g.link(from,'writes',iri.flag(w.flag),w.value===undefined?{op:w.op}:{op:w.op,value:w.value});
    for(const r of f.flagsRead)g.link(from,'reads',iri.flag(r));
  }
  for(const event of events){
    const n=g.get(iri.event(event.id)),callers=new Set(n.backlinks.filter(b=>['jumps','calls','branches'].includes(b.rel)).map(b=>b.from)).size;
    n.kind=classifyEvent(event,n.facts,{callers});
  }
  for(const node of g.nodes.values())if(node.type==='text'){
    const at=parseIri(node.id).number,owner=textOwner.get(at);
    node.at=at;if(owner!==undefined)node.event=owner;
  }
  // Doors and maps.
  for(let id=0;id<0x400;id++){
    const d=readDoor(rom,id),n=g.node(iri.door(id),{num:id,...d});
    if(n.backlinks.length||true)g.link(iri.door(id),'enters',iri.map(d.map),{x:d.x,y:d.y});
  }
  for(let id=0;id<511;id++){
    const m=readMapEvents(rom,id);if(!m)continue;
    g.node(iri.map(id),{num:id,name:mapNames[id]??null,objects:m.objects.length,triggers:m.triggers.length});
    for(const o of m.objects)if(o.event)g.link(iri.map(id),'object',iri.event(o.event),{index:o.index,species:o.species,x:o.x,y:o.y,visible:o.visibility});
    for(const t of m.triggers){
      if(t.event!==undefined&&t.event)g.link(iri.map(id),t.role==='walk-on'?'on-enter':'trigger',iri.event(t.event),{index:t.index});
      if(t.door!==undefined)g.link(iri.map(id),'exit',iri.door(t.door),{index:t.index});
    }
  }
  // The mod overlay: authored scripts and replacement text.
  const overlay=modOverlay(rom);
  for(const[id,variants]of overlay.authored){
    const n=g.node(iri.event(id)),list=[...variants.values()];
    n.authored=list.map(v=>{const ops=parseBytes(v.bytes),facts=scriptFacts(ops);return{variants:v.names,size:v.bytes.length,facts,bytes:v.bytes};});
    // END-only retail slots take their kind and summary from the authored script.
    if(n.kind==='empty'){
      const main=n.authored.reduce((a,b)=>b.size>a.size?b:a),f=main.facts;
      n.kind=classifyEvent({start:0,end:main.size},f);n.slot=true;
      n.summary={text:f.textRuns,choices:f.choices,flags:f.flagsWritten.length,doors:f.doors.length,party:f.party.length};
    }
    for(const variant of n.authored){
      const f=variant.facts,from=n.id,tag={authored:true};
      for(const t of f.jumps)g.link(from,'jumps',ev(t),tag);
      for(const t of f.calls)g.link(from,'calls',ev(t),tag);
      for(const d of f.doors)g.link(from,'opens-door',iri.door(d),tag);
      for(const w of f.flagsWritten)g.link(from,'writes',iri.flag(w.flag),{...tag,op:w.op,...(w.value===undefined?{}:{value:w.value})});
    }
  }
  // Same-length patches (flight dialogue) can start inside a run, after a
  // speaker token; resolve those by containment. Item names are not events.
  for(const[at,entries]of overlay.text){
    const n=g.node(iri.text(at));n.at=at;n.authored=entries;
    const run=textOwner.has(at)?null:runs.find(r=>at>=r.at&&at<r.end);
    n.event??=textOwner.get(at)??run?.id;
    if(run)g.link(n.id,'within',iri.text(run.at));
    if(n.event!==undefined)g.link(iri.event(n.event),'says',n.id);
  }
  for(const barrier of kiBarriers){
    if(barrier.map!==undefined&&barrier.event)g.link(iri.map(barrier.map),'ki-barrier',iri.event(barrier.event),{barrier:barrier.id,flag:barrier.flag,min:barrier.min});
  }
  for(const kind of Object.keys(quickStartLabels))g.node(iri.start(kind),{label:quickStartLabels[kind]});
  // Source references.
  for(const[file,text]of sources)for(const ref of indexSource(file,text)){
    g.node(ref.from,{file:ref.file,line:ref.line});g.link(ref.from,'references',ref.to);
  }
  // Each map owns the scripts reachable from its own objects and triggers,
  // without walking into shared utility routines.
  const utility=utilityEvents(g);
  for(const map of enumerate(g,'map')){
    const seen=new Set(),queue=map.links.filter(l=>['object','trigger','on-enter','ki-barrier'].includes(l.rel)).map(l=>l.to);
    while(queue.length){
      const e=queue.shift();if(seen.has(e))continue;seen.add(e);
      for(const l of g.nodes.get(e)?.links??[])if(['jumps','calls','branches'].includes(l.rel)&&parseIri(l.to).type==='event'&&parseIri(l.to).number!==0&&!utility.has(l.to))queue.push(l.to);
    }
    for(const e of seen){const n=g.nodes.get(e);(n.maps??=[]).push(map.num);}
  }
  for(const id of utility)g.nodes.get(id).utility=true;
  // Curated scenes.
  g.sources=sources;
  for(const scene of catalog.scenes??[])addScene(g,scene);
  derivedMembership(g,catalog);
  derivedAreas(g);
  return g;
}

function addScene(g,scene){
  const id=iri.scene(scene.id),{id:slug,...props}=scene;
  g.node(id,{...props,slug,curated:true});
  for(const e of scene.events??[])g.link(id,'root',normalizeIri(typeof e==='number'?hex(e):e));
  for(const m of scene.maps??[])g.link(id,'in',iri.map(m));
  for(const n of scene.next??[])g.link(id,'next',iri.scene(n));
  for(const r of scene.requires??[])g.link(id,'requires',iri.scene(r));
  for(const s of scene.see??[])g.link(id,'see',normalizeIri(s));
  if(scene.chapter)g.link(id,'chapter',iri.scene(scene.chapter));
  if(scene.launch?.start)g.link(id,'launches-from',iri.start(scene.launch.start));
  for(const ref of scene.code??[]){
    const at=resolveCode(g.sources,ref);
    if(at){g.node(at.iri,{file:at.file,line:at.line,symbol:at.symbol});g.link(id,'implemented-by',at.iri);}
  }
  for(const test of scene.tests??[])g.link(id,'tested-by',`test:${test}`);
}
// "engine/file.js#symbol" → the declaring line, looked up in the live source.
export function resolveCode(sources,ref){
  const [file,symbol=null]=ref.split('#'),text=sources?.get(file);
  if(text===undefined)return null;
  let line=1;
  if(symbol){
    const i=text.split('\n').findIndex(l=>new RegExp(`^\\s*(?:export\\s+)?(?:const|let|function|class|async function)\\s+${symbol}\\b`).test(l));
    if(i<0)return null;line=i+1;
  }
  return{iri:iri.code(file,line),file,line,symbol};
}

// Utility subroutines are shared by dozens of scripts; walking into them
// would make every cutscene own every other cutscene.
export function utilityEvents(g,threshold=6){
  const set=new Set();
  for(const n of g.nodes.values())if(n.type==='event'&&n.backlinks.filter(b=>b.rel==='calls').length>=threshold)set.add(n.id);
  return set;
}
// Scene membership: roots plus everything they jump/call/branch into, stopping
// at utility routines and at other scenes' roots.
function derivedMembership(g,catalog){
  const utility=utilityEvents(g),roots=new Map();
  for(const scene of catalog.scenes??[])for(const l of g.get(iri.scene(scene.id)).links)if(l.rel==='root')roots.set(l.to,scene.id);
  for(const scene of catalog.scenes??[]){
    const id=iri.scene(scene.id),seen=new Set(),queue=g.get(id).links.filter(l=>l.rel==='root').map(l=>l.to);
    while(queue.length){
      const e=queue.shift();if(seen.has(e))continue;seen.add(e);
      const n=g.nodes.get(e);if(!n||n.type!=='event')continue;
      for(const l of n.links)if(['jumps','calls','branches'].includes(l.rel)&&!utility.has(l.to)&&parseIri(l.to).number!==0&&(!roots.has(l.to)||roots.get(l.to)===scene.id))queue.push(l.to);
    }
    for(const e of seen)if(g.nodes.get(e)?.type==='event')g.link(id,'contains',e);
  }
}

// Every event not owned by a curated scene joins a derived per-map area
// (ambient NPC talk, services, door scripts), so enumeration is total.
function derivedAreas(g){
  const owned=new Set();
  for(const n of g.nodes.values())if(n.type==='scene'&&n.curated)for(const l of n.links)if(l.rel==='contains')owned.add(l.to);
  for(const n of enumerate(g,'event')){
    if(owned.has(n.id)||n.kind==='empty'||n.kind==='utility')continue;
    const maps=n.maps?.length?n.maps:[null];
    for(const map of maps){
      const id=iri.scene(map===null?'area-unmapped':`area-${map}`);
      if(!g.nodes.has(id)){
        g.node(id,{slug:id.slice(6),curated:false,kind:'area',title:map===null?'Unmapped scripts':`${g.get(iri.map(map))?.name??'Map '+map} (ambient)`,
          notes:'Derived: events on this map that no curated scene owns.'});
        if(map!==null)g.link(id,'in',iri.map(map));
      }
      g.link(id,'contains',n.id);
    }
  }
}

// ---------------------------------------------------------------- crawl
// Breadth-first walk over named relations; yields {node,depth,via}.
export function* crawl(g,start,{rels=null,depth=Infinity,backlinks=false,types=null}={}){
  const seen=new Set([normalizeIri(start)]),queue=[{id:normalizeIri(start),depth:0,via:null}];
  while(queue.length){
    const item=queue.shift(),node=g.nodes.get(item.id);if(!node)continue;
    if(!types||types.includes(node.type)||item.depth===0)yield{node,depth:item.depth,via:item.via};
    if(item.depth>=depth)continue;
    const edges=[...node.links.map(l=>({...l,dir:'out',other:l.to})),...(backlinks?node.backlinks.map(l=>({...l,dir:'in',other:l.from})):[])];
    for(const e of edges)if((!rels||rels.includes(e.rel))&&!seen.has(e.other)){seen.add(e.other);queue.push({id:e.other,depth:item.depth+1,via:e});}
  }
}
export const enumerate=(g,type)=>[...g.nodes.values()].filter(n=>n.type===type);

// Where an event is reachable from: map objects/triggers, other events, code.
export function eventContext(g,id){
  const n=g.get(id);
  return{maps:(n.maps??[]).map(iri.map),code:n.backlinks.filter(b=>b.rel==='references').map(b=>b.from),
    callers:n.backlinks.filter(b=>['jumps','calls','branches'].includes(b.rel)).map(b=>b.from),
    scenes:n.backlinks.filter(b=>b.rel==='root'||b.rel==='contains').map(b=>b.from)};
}

// Readable script for one event and party variant. Original text is
// resolved from the ROM here and only returned to the caller.
export function renderScript(g,rom,id,{variant=null}={}){
  const n=g.get(id);if(!n||n.type!=='event')return[];
  const authored=variant!==null&&n.authored?.find(v=>v.variants.includes(variant));
  const ops=authored?parseBytes(authored.bytes):parseEvent(rom,n.num).ops;
  return ops.map(op=>{
    const d=describeOp(op);
    if(d.kind==='text'){
      const over=op.at!==null&&op.at!==undefined?g.nodes.get(iri.text(op.at))?.authored:null;
      return{kind:'text',at:op.at,original:d.text,authored:over??null};
    }
    return{...d,bytes:op.bytes};
  });
}

// The native interpreter pointer ($D1-$D3, a C0-bank address) → the ROM
// event it is executing. Relocated mod scripts live in virtual banks F0-F7
// and are reported by mod.story.status.lastEvent instead.
export function eventAtPointer(g,pointer){
  if((pointer>>16&0xc0)!==0xc0||(pointer>>16)>=0xf0)return null;
  const pc=pointer&0x3fffff;
  g.ranges??=enumerate(g,'event').filter(n=>n.size>0&&n.start!==undefined).map(n=>[n.start,n.end,n.num]).sort((a,b)=>a[0]-b[0]);
  let lo=0,hi=g.ranges.length-1;
  while(lo<=hi){const mid=lo+hi>>1,[a,b,id]=g.ranges[mid];if(pc<a)hi=mid-1;else if(pc>=b)lo=mid+1;else return id;}
  return null;
}

// Coverage: every story-relevant event belongs to a curated scene, or to a
// derived area (an ambient NPC on a map), or is reported.
export function coverage(g){
  const owned=new Set();
  for(const n of g.nodes.values())if(n.type==='scene'&&n.curated)for(const l of n.links)if(l.rel==='contains')owned.add(l.to);
  const report={cutscene:[],script:[],reward:[],dialogue:[],service:[]},areas=new Map();
  for(const n of enumerate(g,'event')){
    if(owned.has(n.id)||!(n.kind in report))continue;
    const maps=eventContext(g,n.id).maps;
    if(n.kind==='dialogue'||n.kind==='service'||n.kind==='script'&&!n.authored){for(const m of maps.length?maps:['map:unknown']){if(!areas.has(m))areas.set(m,[]);areas.get(m).push(n.id);}continue;}
    report[n.kind].push({id:n.id,maps,authored:!!n.authored,text:n.summary.text,flags:n.summary.flags});
  }
  return{owned:owned.size,uncovered:report,areas:Object.fromEntries(areas)};
}
