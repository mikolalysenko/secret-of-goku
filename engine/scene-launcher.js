// Debug launcher: put the running game at any catalogued scene. Testing only;
// it seeds flags inside an explicitly requested scene, never in a normal run.
// Every temporary cartridge write is restored before control returns.
import {isQuickStart} from './quick-start.js';
import {resolveCode,eventAtPointer} from './scene-graph.js';

const hexNumber=v=>typeof v==='number'?v:parseInt(String(v).replace(/^0x/i,''),16);
const sceneKinds=['chapter','cutscene','boss','dialogue','system','ending','sequence','js'];

// A launch recipe (all optional):
//   start:   quick-start kind used as the base state ("sword", "late", ...)
//   map,x,y,layer: warp destination (tiles); or door: native door id (hex)
//   flags:   {"2e":0} story flags ($CF00+n) to write before entering
//   gold:    money to hold ($CC6A, three bytes), for shops and paid scenes
//   party:   0-3 companion mask (bit0 Primm, bit1 Popoi), via native commands
//   event:   event to request once control returns; npc: species to talk to
//   frieza/quest/challenge: mod state restored before entering
//   expect:  {map, flag:{"2e":1}, event} asserted by the Playwright harness
export function launchPlan(scene,graph=null){
  const l=scene.launch??{},roots=(scene.events??[]).map(hexNumber);
  // A quick start that already lands on the scene needs no warp. Otherwise
  // warp to the recipe's destination, or to the scene's first map.
  const destination=l.map!==undefined||l.door!==undefined||l.x!==undefined;
  let map=destination?l.map??null:l.start?null:(scene.maps??[])[0]??null;
  // Derive a door from the ROM when only a map is known. Prefer doors that
  // some other map's trigger actually uses: real entrances, not placeholders.
  let door=l.door!==undefined?hexNumber(l.door):null;
  if(map!==null&&l.x===undefined&&door===null&&graph){
    const entries=graph.get(`map:${map}`)?.backlinks.filter(b=>b.rel==='enters').map(b=>graph.get(b.from))??[];
    const used=entries.find(d=>d.backlinks.some(b=>b.rel==='exit'&&b.from!==`map:${map}`))??entries[0];
    if(used)door=used.num;
  }
  if(door!==null&&graph&&map===null)map=graph.get(`door:${door.toString(16)}`)?.map??null;
  // Without explicit flags, satisfy the root object's ROM visibility range
  // on the destination map so the NPC that owns the event is present.
  const flags=Object.fromEntries(Object.entries(l.flags??{}).map(([k,v])=>[hexNumber(k),v]));
  if(!l.flags&&graph&&map!==null)for(const root of roots){
    const object=graph.get(`map:${map}`)?.links.find(x=>x.rel==='object'&&x.to===`event:${root.toString(16)}`);
    const v=object?.visible;if(v&&v.flag&&v.min>0&&!(v.flag in flags))flags[v.flag]=v.min;
  }
  // base:'current' launches from whatever state the game is in now.
  const start=l.base==='current'?null:l.start??(map===null&&l.event===undefined?null:'sword');
  return{start,map,x:l.x,y:l.y,layer:l.layer??0,door,
    flags,party:l.party??null,gold:l.gold??null,fixture:!!l.fixture,
    event:l.event!==undefined?hexNumber(l.event):l.request===false?null:roots[0]??null,npc:l.npc??0,
    mod:{frieza:l.frieza,quest:l.quest,challenge:l.challenge},
    settle:l.settle??240,expect:l.expect??{},manual:!!l.manual,note:l.note??null};
}

// True when a plan loads something: a base state, a destination or an event.
export const launchable=plan=>!plan.manual&&(!!plan.start||plan.map!==null||plan.door!==null||plan.event!==null);

export function validateCatalog(catalog,graph=null){
  const problems=[],ids=new Set();
  for(const s of catalog.scenes??[]){
    if(!/^[a-z0-9][a-z0-9-]*$/.test(s.id??''))problems.push(`Bad scene id ${s.id}`);
    if(ids.has(s.id))problems.push(`Duplicate scene ${s.id}`);ids.add(s.id);
    if(!s.title)problems.push(`${s.id}: missing title`);
    if(!sceneKinds.includes(s.kind))problems.push(`${s.id}: unknown kind ${s.kind}`);
    for(const e of s.events??[]){const n=hexNumber(e);if(!(n>=0&&n<0x800))problems.push(`${s.id}: bad event ${e}`);
      else if(graph&&graph.get(`event:${n.toString(16)}`)?.kind==='empty'&&!graph.get(`event:${n.toString(16)}`)?.authored)problems.push(`${s.id}: event ${e} is an empty slot`);}
    for(const m of s.maps??[])if(graph&&!graph.get(`map:${m}`))problems.push(`${s.id}: unknown map ${m}`);
    if(s.launch?.start&&!isQuickStart(s.launch.start))problems.push(`${s.id}: unknown quick start ${s.launch.start}`);
    for(const ref of s.code??[])if(graph?.sources&&!resolveCode(graph.sources,ref))problems.push(`${s.id}: code ref ${ref} does not resolve in the crawled module graph`);
  }
  for(const s of catalog.scenes??[])for(const rel of['next','requires','chapter'])for(const t of[].concat(s[rel]??[]))if(!ids.has(t))problems.push(`${s.id}: ${rel} → unknown scene ${t}`);
  return problems;
}

// Run a short native script through a borrowed END-only event slot, the same
// way tests/browser/cutscenes.spec.mjs prepares party masks. Restores bytes.
function nativeScript(mana,bytes,frames=120){
  const cart=mana.snes.cart.data,slot=0x98,table=0x90000+slot*2,free=0x9f300;
  const pointer=cart.slice(table,table+2),code=cart.slice(free,free+bytes.length+1);
  try{
    cart.set([free&255,free>>8&255],table);cart.set([...bytes,0],free);
    if(!mana.mod.story.request(slot))return false;mana.run(frames);return true;
  }finally{cart.set(pointer,table);cart.set(code,free);}
}
// Warp through a borrowed door record and a tiny interpreter stub.
function warp(mana,{map,x,y,layer=0,door=null,flags={}}){
  const cart=mana.snes.cart.data,stub=0x742b0,record=0x8300c;
  const code=cart.slice(stub,stub+5),saved=cart.slice(record,record+4);
  try{
    if(door!==null)cart.set(cart.slice(0x83000+door*4,0x83000+door*4+4),record);
    else cart.set([map&255,x*2+(map>>8),y*2+layer,0],record);
    cart.set([4,24,3,5,0],stub);
    for(const[k,v]of Object.entries(flags))mana.write8(0xcf00+Number(k),v);
    mana.write8(0xd1,0xb0);mana.write8(0xd2,0x42);mana.write8(0xd3,0xc7);mana.write8(0xd0,1);mana.run(240);
  }finally{cart.set(code,stub);cart.set(saved,record);}
}

// Drive the page's `mana` handle. Returns a status record for tests/UI.
export async function launchScene(mana,scene,{graph=null,quickStart=mana.quickStart,log=()=>{}}={}){
  const plan=launchPlan(scene,graph),status={scene:scene.id,plan,steps:[]};
  const step=text=>{status.steps.push(text);log(text);};
  if(plan.manual){step(plan.note??'Manual scene: no automatic launch.');return{...status,ok:true};}
  if(plan.start){step(`base: ?start=${plan.start}`);if(!await quickStart(plan.start))throw Error(`Quick start ${plan.start} failed`);}
  mana.pause();const m=mana.mod;
  Object.assign(m.options,{enabled:true,power:true});
  if(plan.mod.frieza)m.frieza.restore({...m.frieza.snapshot(),...plan.mod.frieza});
  if(plan.mod.quest)m.quest.restore({...m.quest.snapshot?.(),...plan.mod.quest});
  if(plan.mod.challenge)m.challenge.restore(plan.mod.challenge);
  if(plan.gold!==null){step(`gold ${plan.gold}`);for(let i=0;i<3;i++)mana.write8(0xcc6a+i,plan.gold>>(8*i)&255);}
  if(plan.party!==null){
    const bytes=[];
    for(let i=0;i<2;i++){const present=!!(mana.read8(0xe200+i*0x200)&1),want=!!(plan.party>>i&1);if(present&&!want)bytes.push(0x2c,i+1);if(!present&&want)bytes.push(0x2b,i+1);}
    if(bytes.length){step(`party mask ${plan.party}`);nativeScript(mana,bytes);}
  }
  if(plan.map!==null||plan.door!==null){
    step(plan.door!==null?`door ${plan.door.toString(16)} → map ${plan.map}`:`warp map ${plan.map} (${plan.x},${plan.y})`);
    warp(mana,{...plan,door:plan.x!==undefined?null:plan.door});
  }else for(const[k,v]of Object.entries(plan.flags))mana.write8(0xcf00+Number(k),v);
  if(plan.event!==null){
    for(let i=0;i<60&&!m.canAttack;i++)mana.run(10);
    const actor=plan.npc?m.entities().find(e=>e.active&&e.species===plan.npc):null;
    const ok=m.story.request(plan.event,{actor:actor?actor.base-0xe000:0});
    step(`request event ${plan.event.toString(16)}${actor?` as species ${plan.npc}`:''}: ${ok?'queued':'refused'}`);
    status.requested=ok;
  }
  // Record what executes while settling, so short events are not missed.
  const ran=new Set();
  for(let f=0;f<plan.settle;f+=4){
    mana.run(4);
    if(graph&&mana.read8(0xd0)){const e=eventAtPointer(graph,mana.read8(0xd1)|mana.read8(0xd2)<<8|mana.read8(0xd3)<<16);if(e!==null)ran.add(e);}
    for(const id of m.story.status.recentEvents??[m.story.status.lastEvent])if(id!=null)ran.add(id);
  }
  status.ran=[...ran];
  status.map=m.status.map;status.lastEvent=m.story.status.lastEvent;status.error=m.story.status.error;status.ok=!status.error;
  return status;
}
