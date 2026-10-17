// Story compiler environment for the cartridge build (no generate(): the
// build only runs snes/gen/*.mjs files that export one).
//
// Runs the browser mod's own story stack (engine/native-story.js and every
// table and builder it loads) in Node, on the same patched ROM copy the
// browser compiles from, and captures its internal results while load()
// builds them: every allocated script (virtual banks F0-F7), its event id
// and party mask, the dispatch entries keyed by original event start, the
// Dragon Ball grant markers, crisis greetings and greeting kinds. Nothing is
// re-implemented here; the cartridge reuses one source of truth.
//
// Dispatch entries that the browser decides at runtime are JavaScript
// closures over mod state. They are converted into decision trees by
// evaluating each closure over every assignment of the state variables it
// actually reads (tracked through getters and a RAM proxy), so the native
// tables reproduce the browser's choice exactly on that domain.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';

// State the browser's routing closures read, with the native query that
// answers each one on the cartridge. `domain` lists the values the closure
// sees; the native query returns the index into it. Owners implement
// foreign queries (see docs/agents/snes-port/story.md).
export const QUERY_VARS=[
  // id, name, owner, domain, description
  [0x00,'mask','story',[0,1,2,3],'party mask: bit0 girl active ($E200&1), bit1 sprite active ($E400&1)'],
  [0x01,'questCount','story',[0,1,2,3,4,5,6,7],'Dragon Balls collected (popcount of ledger mask)'],
  [0x02,'questHeld7','story',[false,true],'all seven Balls held (ledger mask 127 and none stolen by Frieza)'],
  [0x03,'questSeedsAll','story',[false,true],'all seven seed Balls personally collected (seedMask=127, canFeed)'],
  [0x04,'questMaskAll','story',[false,true],'ledger mask = 127'],
  [0x05,'questWished','story',[false,true],'the restoration wish was granted'],
  [0x10,'friezaCrisis','frieza',[false,true],'five-minute core crisis active (crisisActive)'],
  [0x11,'friezaStolen','frieza',[false,true],'Frieza holds the stolen Balls (s.stolen / unresolved)'],
  [0x12,'friezaPending','frieza',[false,true],'Frieza entrance pending (pendingEntrance)'],
  [0x13,'friezaPalace','frieza',[false,true],'Frieza left the altar; Hexas/Rider III remain (stage palace)'],
  [0x14,'friezaNeedsTree','frieza',[false,true],'Frieza is hunting at the Mana Tree (needsTree)'],
  [0x15,'friezaEligible','frieza',[false,true],'late-game Dryad invitation is due (eligible)'],
  [0x16,'friezaTrial','frieza',[false,true],'Thanatos trial running (stage trial)'],
  [0x17,'friezaEmperorKilled','frieza',[false,true],'Frieza killed the Emperor'],
  [0x18,'friezaTreeComplete','frieza',[false,true],'Tree confrontation finished (status.tree complete)'],
  [0x19,'friezaTrialWon','frieza',[false,true],'Thanatos trial won'],
  [0x1a,'friezaDefeated','frieza',[false,true],'Frieza defeated (status.stage defeated)'],
  [0x1b,'friezaPopoiMember','frieza',[false,true],'Popoi was a recruited member at the showdown'],
  [0x1c,'friezaPrimmMember','frieza',[false,true],'Primm was a recruited member at the showdown'],
  [0x1d,'friezaStolenClass','frieza',[0,1,127],'stolen Balls: 0 none, 1 some, 2 all seven (popcount of stolenMask)'],
  [0x1e,'friezaInputLocked','frieza',[false,true],'Frieza cutscene owns input (inputLocked or orbit intro): R fast-forward stays masked'],
  [0x20,'fortressDestroyed','destroy',[false,true],'the Mana Fortress was destroyed by a full beam (world-ki)'],
  [0x21,'door:gaia-shortcut','destroy',[false,true],'Watts shortcut door broken (barriers.doorBroken)'],
  [0x22,'door:pandora-ruins-exit','destroy',[false,true],'Pandora ruins exit broken'],
  [0x23,'door:northtown-ruins-seal','destroy',[false,true],'Northtown ruins seal broken'],
  [0x28,'trialActive','vegeta',[false,true],'Vegeta trial in progress (trial.active)'],
  [0x29,'trialParty','vegeta',[0,1,2,3],'party mask the trial borrowed (trial.partyMask)'],
  [0x30,'beastFed','combat',[false,true],'Beast challenge: seeds fed'],
  [0x31,'beastStarted','combat',[false,true],'Beast challenge: fight started'],
  [0x32,'beastWon','combat',[false,true],'Beast challenge: upgraded Beast beaten'],
  [0x38,'sandshipCrash','destroy',[false,true],'Sandship ended by blowing up (ending crash)'],
  [0x39,'sandshipWrecked','destroy',[false,true],'Sandship is wrecked'],
  [0x3a,'sandshipPlanned','destroy',[false,true],'wreck came from the planned KAMEHAMEHA choice'],
  [0x3b,'sandshipDoor','destroy',[null,...Array.from({length:32},(_,i)=>0x1a0+i)],'ship door hovered by flight: 0 none, 1+i door 1A0+i'],
  [0x3c,'equipWeighted','goku',[false,true],'Goku still wears the weighted training gi'],
  [0x40,'endingActive','ending',[false,true],'ending sequence owns the player (ending.active)'],
  [0x41,'localFlight','flight',[false,true],'Goku hovers in local flight'],
];
// RAM bytes (bank 7E) the closures compare. The native query returns how
// many thresholds the byte reaches.
export const RAM_VARS={0xcf0d:[8],0xcf0e:[8],0xcf28:[11],0xcf44:[2],0xcf11:[8],0xdc:[139],0xdd:[]};

export const BASE_ROM_SHA256='4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f';

// The browser compiles from cart.data = gokuDialoguePatch(originalGamePatch(rom))
// (engine/lab.js loadROM). Reproduce that preparation from the same scripts.
export function browserCartData(repo,rom){
  const window={};
  const context=vm.createContext({window,Uint8Array,Error,Object,JSON,Math});
  for(const f of['engine/rom-patches.js','engine/dialogue-patches.js'])vm.runInContext(readFileSync(join(repo,f),'utf8'),context,{filename:f});
  return new Uint8Array(window.gokuDialoguePatch(window.originalGamePatch(Uint8Array.from(rom))));
}

export async function loadStoryEnvironment(repo,rom){
  const engine=name=>import(pathToFileURL(join(repo,'engine',name)).href);
  const {createNativeStory}=await engine('native-story.js');
  const data=browserCartData(repo,rom);
  // ---- tracked mock state -------------------------------------------------
  const vars=new Map(QUERY_VARS.map(([id,name,owner,domain,text])=>[name,{id,name,owner,domain,text}]));
  for(const [addr,thresholds]of Object.entries(RAM_VARS)){
    const name='ram:'+Number(addr).toString(16);
    vars.set(name,{id:null,name,owner:'story',domain:[0,...thresholds],ram:Number(addr),thresholds,text:`$7E:${Number(addr).toString(16).toUpperCase().padStart(4,'0')} reaches ${thresholds.join('/')}`});
  }
  const st={assign:new Map(),reads:[],effects:[],tracking:false};
  const val=name=>{
    const def=vars.get(name);if(!def)throw Error(`Story closure reads undeclared state ${name}`);
    if(st.tracking&&!st.reads.includes(name))st.reads.push(name);
    return def.domain[st.assign.get(name)??0];
  };
  const effect=name=>{if(st.tracking){if(st.reads.length)throw Error(`Effect ${name} after state reads`);st.effects.push(name);}};
  const raw=new Uint8Array(0x20000);
  const ram=new Proxy(raw,{
    get(t,p){
      if(typeof p==='string'&&/^\d+$/.test(p)){
        const i=Number(p);
        if(st.tracking){const name='ram:'+i.toString(16);if(vars.has(name))return val(name);throw Error(`Story closure reads undeclared RAM $${i.toString(16)}`);}
        return t[i];
      }
      const v=Reflect.get(t,p);return typeof v==='function'?v.bind(t):v;
    },
    set(t,p,v){t[p]=v;return true;},
  });
  const popcount=n=>{let b=0;for(;n;n&=n-1)b++;return b;};
  const quest={
    get status(){return{
      get count(){return val('questCount');},
      get held(){return val('questHeld7')?7:0;},
      get seedMask(){return val('questSeedsAll')?127:0;},
      get canFeed(){return val('questSeedsAll');},
      get mask(){return val('questMaskAll')?127:0;},
      get wished(){return val('questWished');},
    };},
    collect(){},recover(){},wish(){},
  };
  const frieza={
    get crisisActive(){return val('friezaCrisis');},
    get unresolved(){return val('friezaStolen');},
    get pendingEntrance(){return val('friezaPending');},
    get palace(){return val('friezaPalace');},
    get needsTree(){return val('friezaNeedsTree');},
    get eligible(){return val('friezaEligible');},
    get trial(){return val('friezaTrial');},
    get popoiMember(){return val('friezaPopoiMember');},
    get stolenMask(){return val('friezaStolenClass');},
    get status(){return{
      get emperorKilled(){return val('friezaEmperorKilled');},
      get tree(){return val('friezaTreeComplete')?'complete':'pursuit';},
      get trialWon(){return val('friezaTrialWon');},
      get primmMember(){return val('friezaPrimmMember');},
      get stage(){return val('friezaDefeated')?'defeated':'hunt';},
      get stolen(){return val('friezaStolen');},
    };},
    onEvent(){},repairCore(){},
  };
  const mod={
    options:{enabled:true},gokuActive:true,canAttack:true,
    entities(){if(st.tracking&&!st.reads.includes('entities'))st.reads.push('entities');return[];},
    quest,frieza,
    worldKi:{get status(){return{get fortressDestroyed(){return val('fortressDestroyed');}};}},
    barriers:{doorBroken(id){return val('door:'+id);}},
    trial:{get active(){return val('trialActive');},get partyMask(){return val('trialParty');},onEvent(){}},
    challenge:{victory(){effect('beastVictory');},get status(){return{get fed(){return val('beastFed');},get started(){return val('beastStarted');},get won(){return val('beastWon');}};},choose(){}},
    sandship:{get ending(){return val('sandshipCrash')?'crash':null;},get wrecked(){return val('sandshipWrecked');},get planned(){return val('sandshipPlanned');},get door(){return val('sandshipDoor');},read(){return undefined;},onEvent(){}},
    equipment:{get weighted(){return val('equipWeighted');},confiscate(){}},
    ending:{begin(){},cue(){},reunion:false},
  };
  const cart={data,read(bank,address){return data[((bank&0x3f)<<16)|address];}};
  const cpu={cycle(){},r:new Uint8Array(4),br:new Uint16Array(8),cyclesLeft:0,getP(){return 0;},setP(){},pushByte(){},pushWord(){}};
  const snes={ram,cpu,cart,write(){},read(){}};
  const story=createNativeStory(snes,mod);
  // ---- capture load()'s internal maps -------------------------------------
  const maps=[],sets=[];
  const mset=Map.prototype.set,sadd=Set.prototype.add;
  Map.prototype.set=function(k,v){if(!maps.includes(this))maps.push(this);return mset.call(this,k,v);};
  Set.prototype.add=function(v){if(!sets.includes(this))sets.push(this);return sadd.call(this,v);};
  try{story.load();}finally{Map.prototype.set=mset;Set.prototype.add=sadd;}
  const inF=k=>typeof k==='number'&&k>=0xf00000&&k<0xf80000,inEvents=k=>typeof k==='number'&&k>=0xc90000&&k<0xcb0000;
  const pick=(test,what)=>{const hits=maps.filter(test);if(hits.length!==1)throw Error(`Could not identify the story ${what} map (${hits.length} candidates)`);return hits[0];};
  const first=m=>m.entries().next().value;
  const isObject=v=>typeof v==='object'&&v!==null;
  const scripts=pick(m=>m.size>0&&inF(first(m)[0])&&isObject(first(m)[1])&&first(m)[1].bytes,'scripts');
  const metadata=pick(m=>m.size>0&&inF(first(m)[0])&&isObject(first(m)[1])&&'id'in first(m)[1]&&'mask'in first(m)[1],'metadata');
  const entries=pick(m=>m.size>0&&inEvents(first(m)[0])&&(Array.isArray(first(m)[1])||typeof first(m)[1]==='function'),'entries');
  const eventIds=pick(m=>m.size===0x800&&inEvents(first(m)[0])&&typeof first(m)[1]==='number','event id');
  const greetingKinds=pick(m=>m.size>1000&&typeof first(m)[0]==='number'&&first(m)[0]<0x800&&typeof first(m)[1]==='string','greeting kind');
  const {crisisGreetings}=await engine('frieza-crisis.js');
  const kinds=Object.keys(crisisGreetings);
  const greetings=pick(m=>m.size===kinds.length&&[...m.keys()].every(k=>kinds.includes(k))&&[...m.values()].every(inF),'greeting');
  const grantMaps=maps.filter(m=>m!==metadata&&m!==scripts&&m.size>0&&inF(first(m)[0])&&typeof first(m)[1]==='number');
  if(grantMaps.length>1)throw Error('Could not identify the story grant map');
  const grants=grantMaps[0]??new Map();
  const greetingEnds=sets.find(s=>s.size>0&&inF(s.values().next().value));
  // ---- closure evaluation ---------------------------------------------------
  function evaluate(fn,assign,mask){
    st.assign=new Map(assign);st.reads=[];st.effects=[];st.tracking=true;
    let result;
    try{result=typeof fn==='function'?fn(mask):fn[mask];}finally{st.tracking=false;}
    return{result,reads:[...st.reads],effects:[...st.effects]};
  }
  return{data,story,mod,cart,ram:raw,vars,scripts,metadata,entries,eventIds,greetingKinds,greetings,greetingEnds,grants,evaluate,popcount};
}

// Exhaustive evaluation of one dispatch entry over the variables it reads.
// Returns {vars, rows:[{values, result}], effects, dynamic}. `mask` is always
// var 0; `dynamic` marks closures that inspect live actors (mod.entities()).
export function tabulate(env,fn){
  const known=['mask'];let dynamic=false;
  for(let round=0;round<32;round++){
    const domains=known.map(n=>env.vars.get(n).domain.length);
    const rows=[];let grown=false,effects=null;
    const total=domains.reduce((a,b)=>a*b,1);
    if(total>1<<16)throw Error(`Story entry state space too large (${known.join(',')})`);
    for(let index=0;index<total;index++){
      const values=[];let rest=index;
      for(const d of domains){values.push(rest%d);rest=Math.floor(rest/d);}
      const assign=known.slice(1).map((n,i)=>[n,values[i+1]]);
      const out=env.evaluate(fn,assign,values[0]);
      for(const r of out.reads){
        if(r==='entities'){dynamic=true;continue;}
        if(!known.includes(r)){known.push(r);grown=true;}
      }
      const key=out.effects.join(',');
      if(effects===null)effects=key;else if(effects!==key)throw Error('Story entry side effects depend on state');
      if(typeof out.result!=='number')throw Error('Story entry produced no script pointer');
      rows.push({values,result:out.result});
    }
    if(!grown)return{vars:[...known],domains,rows,effects:effects?effects.split(','):[],dynamic};
  }
  throw Error('Story entry variable discovery did not converge');
}

// Decision tree over a full truth table. A variable is relevant to a subset
// when two rows that differ only in it have different results; among those,
// split on the one leaving the fewest distinct results per branch.
export function decisionTree(vars,domains,rows){
  function relevant(subset,i){
    const groups=new Map();
    for(const r of subset){
      const key=r.values.map((v,j)=>j===i?'*':v).join(',');
      const seen=groups.get(key);
      if(seen===undefined)groups.set(key,r.result);else if(seen!==r.result)return true;
    }
    return false;
  }
  function build(subset,used){
    const results=new Set(subset.map(r=>r.result));
    if(results.size===1)return{leaf:subset[0].result};
    let best=null;
    for(let i=0;i<vars.length;i++){
      if(used.has(i)||!relevant(subset,i))continue;
      const groups=Array.from({length:domains[i]},()=>[]);
      for(const r of subset)groups[r.values[i]].push(r);
      const cost=groups.reduce((n,g)=>n+new Set(g.map(r=>r.result)).size,0);
      if(!best||cost<best.cost)best={i,cost,groups};
    }
    if(!best)throw Error('Inconsistent story truth table');
    const next=new Set(used);next.add(best.i);
    return{test:vars[best.i],branches:best.groups.map(g=>build(g,next))};
  }
  return build(rows,new Set());
}

// values: Map name -> domain index.
export function evalTree(tree,values){
  while(!('leaf'in tree))tree=tree.branches[values.get(tree.test)??0];
  return tree.leaf;
}
