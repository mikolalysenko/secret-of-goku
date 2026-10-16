// Story module data generator (see docs/agents/snes-port/story.md).
//
// Runs the browser mod's story stack in Node (snes/gen/story-env.mjs) and
// emits, into dist/snes/gen/story/:
//   bank_fX.bin   the virtual event banks F0-F7 ($Fx:8000-FFFF), byte for
//                 byte what the browser serves through its cartridge reads
//   events.asm    places those banks
//   defines.asm   query/hook/opcode ids shared with snes/src/modules/story
//   data.asm      dispatch index, route programs, hook lists, greetings,
//                 grant markers, RAM queries, story areas, Water Palace
//                 templates and the bounded native text patches
//   hooks.asm     story_hook_table / story_query_table (owners fill them by
//                 defining !STORY_HOOK_<NAME> / !STORY_QUERY_<NAME>)
//   catalog.json  every relocated event, route, hook and query (docs/tests)
// The generator fails if its output would not reproduce the browser.
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadStoryEnvironment,tabulate,decisionTree,evalTree,QUERY_VARS} from './story-env.mjs';

const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');
// Native event opcode extension (C1:E922 table entries 3D-3F are bare RTS
// in the cartridge and never used by an original event).
export const STORY_OPCODES={hook:0x3d};
// Program bank layout ($E5:0000-7FFF, !DATA_STORY).
const PROGRAM_BASE=0x2000,DATA_END=0x8000;

export async function generate({rom,repo,outDir}){
  const engine=name=>import(pathToFileURL(join(repo,'engine',name)).href);
  const env=await loadStoryEnvironment(repo,rom);
  const {eventRange,parseEvent}=await engine('event-codec.js');
  const {box}=await engine('story-events.js');
  const {friezaEvents}=await engine('frieza-events.js');
  const {endingEvents}=await engine('ending-rules.js');
  const {breakout,crashEvents}=await engine('sandship.js');
  const {storyAreas}=await engine('story-areas.js');
  const {crisisGreetings}=await engine('frieza-crisis.js');
  const {waterPalaceApproach}=await engine('water-palace.js');
  const {flightDialogue}=await engine('flight-dialogue.js');
  const {nativeOnlyEvents}=await engine('story-compiler.js');
  const source=name=>readFileSync(join(repo,'engine',name),'utf8');
  const data=env.data,report={};

  // ---- 1. virtual banks F0-F7 -------------------------------------------
  const image=new Uint8Array(0x80000);
  const allocations=[];
  for(const [at,script] of env.scripts){
    image.set(script.bytes,at-0xf00000);
    const meta=env.metadata.get(at);
    allocations.push({at,end:script.end,id:meta.id,mask:meta.mask,length:script.bytes.length});
  }
  let mismatches=0;
  for(let a=0;a<0x80000;a++){
    if((a&0xffff)<0x8000){if(image[a])throw Error('Story allocation outside $Fx:8000-FFFF');continue;}
    if(env.story.inspectByte(0xf00000+a)!==image[a])mismatches++;
  }
  if(mismatches)throw Error(`Story bank image differs from the browser in ${mismatches} bytes`);
  const banks=[];
  for(let b=0;b<8;b++){
    const half=image.subarray(b*0x10000+0x8000,b*0x10000+0x10000);
    let last=-1;for(let i=0;i<half.length;i++)if(half[i])last=i;
    // The trailing END gap of the last script is part of the allocation.
    const used=allocations.filter(a=>(a.at>>16)===0xf0+b).reduce((m,a)=>Math.max(m,(a.end&0xffff)-0x8000),0);
    if(used>0){writeFileSync(join(outDir,`bank_f${b}.bin`),half.subarray(0,used));banks.push({bank:0xf0+b,used});}
    else if(last>=0)throw Error('Story bank bytes without allocation');
  }
  report.banks=banks;report.allocations=allocations.length;report.layout=env.story.layout;

  // ---- 2. dispatch programs ----------------------------------------------
  const startOf=id=>0xc00000+eventRange(data,id).start;
  const idAt=new Map();
  for(let id=0;id<0x800;id++){const at=startOf(id);if(idAt.has(at))throw Error('Two story events share a start');idAt.set(at,id);if(env.eventIds.get(at)!==id)throw Error('Event id table mismatch');}
  const leafOf=addr=>{const meta=env.metadata.get(addr);if(!meta)throw Error(`Story leaf ${hex(addr,6)} is not an allocation`);return{addr,id:meta.id};};
  const varInfo=name=>env.vars.get(name);
  // RAM queries get ids 0x80+ in a table of (address, thresholds).
  const ramQueries=[];
  const queryId=name=>{
    const v=varInfo(name);
    if(v.ram!==undefined){let i=ramQueries.findIndex(q=>q.name===name);if(i<0){ramQueries.push({name,addr:v.ram,thresholds:v.thresholds});i=ramQueries.length-1;}return 0x80+i;}
    return v.id;
  };
  const effectsHook={beastVictory:'BEAST_VICTORY'};
  const routes=new Map(); // id -> {kind, vars, tree, effects, dynamic}
  for(let id=0;id<0x800;id++){
    const entry=env.entries.get(startOf(id));
    if(!entry)continue;
    if(Array.isArray(entry)){
      const rows=[0,1,2,3].map(mask=>({values:[mask],result:entry[mask]}));
      routes.set(id,{kind:'party',vars:['mask'],domains:[4],rows,tree:decisionTree(['mask'],[4],rows),effects:[],dynamic:false});
    }else{
      const t=tabulate(env,entry);
      routes.set(id,{kind:'route',...t,tree:decisionTree(t.vars,t.domains,t.rows)});
    }
  }
  // Water Palace Jema (0x131): only the dynamic walk inspects live actors.
  for(const [id,r] of routes)if(r.dynamic&&id!==0x131)throw Error(`Unexpected live-actor story route ${hex(id,3)}`);
  if(!routes.get(0x131)?.dynamic)throw Error('Water Palace route changed');
  // Encode trees with shared subtrees.
  const program=[];const at=()=>PROGRAM_BASE+program.length;
  // Hook ids referenced before the catalogue exists are patched below.
  const pendingHooks=[];
  const hookIdLater=name=>{pendingHooks.push({offset:program.length+1,name});return 0;};
  const nodeCache=new Map();
  const leafUse=new Map();
  function emitTree(tree){
    const key=JSON.stringify(tree);
    if(nodeCache.has(key))return nodeCache.get(key);
    let addr;
    if('leaf'in tree){
      const leaf=leafOf(tree.leaf);
      addr=at();program.push(0x00,leaf.addr&255,leaf.addr>>8&255,leaf.addr>>16,leaf.id&255,leaf.id>>8);
      leafUse.set(leaf.addr,leaf);
    }else{
      // Children first, so this node can reference them.
      const kids=tree.branches.map(emitTree);
      addr=at();program.push(0x01,queryId(tree.test),kids.length,...kids.flatMap(k=>[k&255,k>>8]));
    }
    nodeCache.set(key,addr);return addr;
  }
  const dispatch=new Uint16Array(0x800);
  for(const [id,r] of routes){
    const prefix=[];
    for(const e of r.effects){const h=effectsHook[e];if(!h)throw Error(`Unknown story route effect ${e}`);prefix.push({hook:h});}
    if(r.dynamic)prefix.push({dynamic:1});
    const root=emitTree(r.tree);
    if(prefix.length){
      const start=at();
      for(const p of prefix){if(p.hook)program.push(0x02,hookIdLater(p.hook));else program.push(0x03,p.dynamic);}
      // Continue with the tree: an unconditional SWITCH on mask with one
      // shared target would cost more than a jump; use opcode 04 (goto).
      program.push(0x04,root&255,root>>8);
      dispatch[id]=start;
    }else dispatch[id]=root;
  }

  // ---- 3. hook catalogue -------------------------------------------------
  // Every JavaScript callback a relocated event triggers, keyed by the id
  // of the script actually entered (native-story.js lastEvent), in the
  // browser's call order. Names are checked against the engine sources.
  const F=friezaEvents;
  const snake=s=>s.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();
  const friezaSrc=source('frieza.js');
  const friezaHandled=[...new Set([...friezaSrc.matchAll(/if\(id===F\.(\w+)\)/g)].map(m=>m[1]))];
  for(const n of friezaHandled)if(F[n]===undefined)throw Error(`frieza.onEvent handles unknown event ${n}`);
  const sandSrc=source('sandship.js'),sandBody=sandSrc.slice(sandSrc.indexOf('onEvent(id){'),sandSrc.indexOf('input(input)'));
  const sandshipHandled=[['SANDSHIP_CAPTURE',0x28b,/id===0x28b/],['SANDSHIP_CRASH',crashEvents.crash,/id===crashEvents\.crash/],['SANDSHIP_WAVE',breakout.wave,/id===breakout\.wave/],['SANDSHIP_DECK',breakout.deck,/id===breakout\.deck/]];
  for(const [,,re] of sandshipHandled)if(!re.test(sandBody))throw Error('sandship.onEvent changed');
  if((sandBody.match(/id===/g)||[]).length!==sandshipHandled.length)throw Error('sandship.onEvent changed');
  const trialSrc=source('joch-trial.js');if(!/onEvent\(id\)\{if\(id===0x3db\)start\(true\);\}/.test(trialSrc))throw Error('joch-trial onEvent changed');
  const storySrc=source('native-story.js');
  const need=(re,what)=>{if(!re.test(storySrc))throw Error(`native-story.js ${what} changed`);};
  need(/if\(lastEvent===0x28b\)mod\.equipment\?\.confiscate\(\);/,'confiscate');
  need(/if\(lastEvent===0x88\)fastTrack=true;/,'fast track');
  need(/if\(lastEvent===0x42f\)mod\.ending\?\.begin\(\);/,'ending begin');
  need(/\['dragon','wish','village','complete'\]\[lastEvent-0xa3\]/,'ending cues');
  need(/if\(lastEvent===0xa4&&mod\.quest\?\.status\.wished\)mod\.frieza\?\.repairCore\(\);/,'repair core');
  need(/if\(lastEvent===0x95\|\|lastEvent===0x96\)mod\.challenge\?\.choose\(lastEvent===0x96\);/,'beast choice');
  const hooks=[]; // {name, owner, text, internal}
  const hookIndex=new Map();
  const addHook=(name,owner,text,internal=null)=>{if(!hookIndex.has(name)){hookIndex.set(name,hooks.length+1);hooks.push({name,owner,text,internal});}return hookIndex.get(name);};
  const eventHooks=new Map(); // lastEvent id -> [hook names]
  const onEvent=(id,name)=>{if(!eventHooks.has(id))eventHooks.set(id,[]);eventHooks.get(id).push(name);};
  addHook('EVENT_ANY','any','every relocated event entry, A = event id (frieza/sandship/trial onEvent observers)');
  for(const n of friezaHandled){const name='FRIEZA_'+snake(n);addHook(name,'frieza',`frieza.onEvent(F.${n} = ${hex(F[n],3)})`);onEvent(F[n],name);}
  for(const [name,id] of sandshipHandled){addHook(name,'destroy',`sandship.onEvent(${hex(id,3)})`);onEvent(id,name);}
  addHook('TRIAL_START','vegeta','trial.onEvent(3DB): start the Vegeta trial');onEvent(0x3db,'TRIAL_START');
  addHook('EQUIP_CONFISCATE','goku','equipment.confiscate(): stow the weighted gi (28B)');onEvent(0x28b,'EQUIP_CONFISCATE');
  addHook('STORY_FAST_TRACK','story','fastTrack = 1 (retired Luka travel 88)','story_hook_fast_track');onEvent(0x88,'STORY_FAST_TRACK');
  addHook('ENDING_BEGIN','ending','ending.begin() (42F)');onEvent(0x42f,'ENDING_BEGIN');
  const cues=[[0xa3,'DRAGON'],[0xa4,'WISH'],[0xa5,'VILLAGE'],[0xa6,'COMPLETE'],[endingEvents.depart,'DEPART'],[endingEvents.kai,'KAI'],[endingEvents.scatter,'SCATTER'],[endingEvents.reunion,'REUNION'],[endingEvents.clearing,'SUMMON']];
  for(const [id,phase] of cues){addHook('ENDING_CUE_'+phase,'ending',`ending.cue('${phase.toLowerCase()}') (${hex(id,3)})`);onEvent(id,'ENDING_CUE_'+phase);}
  addHook('STORY_REPAIR_IF_WISHED','story','A4 after the wish: frieza.repairCore() when the ledger says wished','story_hook_repair_if_wished');onEvent(0xa4,'STORY_REPAIR_IF_WISHED');
  addHook('FRIEZA_REPAIR_CORE','frieza','frieza.repairCore(): the wish repairs the core (called by STORY_REPAIR_IF_WISHED)');
  addHook('BEAST_CHOOSE_ORDINARY','combat','challenge.choose(false) (95)');onEvent(0x95,'BEAST_CHOOSE_ORDINARY');
  addHook('BEAST_CHOOSE_FEED','combat','challenge.choose(true) (96)');onEvent(0x96,'BEAST_CHOOSE_FEED');
  addHook('BEAST_VICTORY','combat','challenge.victory() before 42F picks the ending');
  addHook('QUEST_COLLECTED','misc','quest.collect(n): King Kai radio "DRAGON BALLS: n / 7" (A = palace index)');
  addHook('QUEST_WISH_REPAIR','destroy','quest.wish(): ceiling.repair() and worldScars.restore()');
  addHook('FLIGHT_LAND','flight','Potos gatekeeper: cancel combat and local flight, land (landing sound)');
  // Per object record as a map loads (00:DD85), A = record index, X = slot
  // offset into $C800 (record bytes at $C808+X). Mirrors the read overlays
  // native-story.js storyRead applies for those owners.
  addHook('OBJECT_SANDSHIP','destroy','object record overlay: Sandship wreck view (sandship.read)');
  addHook('OBJECT_ENDING','ending','object record overlay: reunion cliff Dyluck record');
  addHook('OBJECT_FRIEZA','frieza','object record overlay: Emperor, exterior Jema, arena 246 records');
  addHook('OBJECT_TRIAL','vegeta','object record overlay: trial Dyluck/Thanatos records on map 246');
  addHook('OPCODE_SCRIPT','any','reserved for scripts using the 3D opcode');
  for(const p of pendingHooks)program[p.offset]=hookIndex.get(p.name)??(()=>{throw Error('Unknown hook '+p.name);})();
  if(program.length+PROGRAM_BASE>0x6000)throw Error('Story route programs overflow');
  // Hook lists, indexed by lastEvent id.
  const hookLists=[],eventHookIndex=new Uint8Array(0x800);
  for(const [id,names] of [...eventHooks].sort((a,b)=>a[0]-b[0])){
    const list=[1,...names.map(n=>hookIndex.get(n))]; // EVENT_ANY first, as the browser calls onEvent observers first
    let i=hookLists.findIndex(l=>l.join()===list.join());
    if(i<0){hookLists.push(list);i=hookLists.length-1;}
    if(i>=255)throw Error('Too many story hook lists');
    eventHookIndex[id]=i+1;
  }
  report.hooks=hooks.length;

  // ---- 4. crisis greetings -----------------------------------------------
  const kinds=Object.keys(crisisGreetings);
  const greetingKind=new Uint8Array(0x800);
  for(const [id,kind] of env.greetingKinds){const k=kinds.indexOf(kind);if(k<0)throw Error('Unknown greeting kind');greetingKind[id]=k+1;}
  const greetings=kinds.map(kind=>{const start=env.greetings.get(kind),length=box(crisisGreetings[kind]).length,end=start+length;if(!env.greetingEnds.has(end))throw Error('Greeting end mismatch');if(image[end-0xf00000]!==0x01)throw Error('Greeting end is not its NOP');return{kind,start,end};});

  // ---- 5. Dragon Ball grant markers ---------------------------------------
  const grants=[...env.grants].sort((a,b)=>a[0]-b[0]).map(([addr,index])=>({addr,index}));
  const pages=new Uint8Array(8*16); // bank F0-F7, 128 pages of 256 bytes in $8000-$FFFF
  for(const g of grants){const b=(g.addr>>16)-0xf0,page=((g.addr&0xffff)-0x8000)>>8;pages[b*16+(page>>3)]|=1<<(page&7);}

  // ---- 6. story areas ----------------------------------------------------
  const areaRows=[];
  for(const area of storyAreas)for(const map of area.maps)for(const [flag,min] of area.floors)areaRows.push({map,flag,min,area:area.name});
  areaRows.sort((a,b)=>a.map-b.map);

  // ---- 7. Water Palace approach templates ---------------------------------
  // Split the real builder's output around its walk so the native builder
  // reuses the authored text and commands: prefix | steps | suffix(ji).
  const sample=(index,hero)=>waterPalaceApproach(hero,{index});
  const a=sample(5,{x:280,y:308}),b=sample(6,{x:280,y:308});
  const guideStart=a.findIndex((v,i)=>v===0x32&&a[i+1]===6&&a[i+2]===0x3c&&a[i+3]===8);
  if(guideStart<0)throw Error('Water Palace template changed');
  const prefix=a.slice(0,guideStart);
  const suffixA=a.slice(guideStart+12),suffixB=b.slice(guideStart+12);
  const jiOffsets=suffixA.map((v,i)=>v!==suffixB[i]?i:-1).filter(i=>i>=0);
  if(jiOffsets.length!==1||suffixA[jiOffsets[0]]!==6||suffixB[jiOffsets[0]]!==7)throw Error('Water Palace template changed');
  if(a.slice(guideStart,guideStart+12).join()!==[0x32,6,0x3c,8,0x32,6,0x3c,8,0x32,6,0xae,8].join())throw Error('Water Palace guide changed');
  // Reference samples for tests (native builder vs. browser builder).
  const waterSamples=[[{x:200,y:400},4],[{x:300,y:350},7],[{x:231,y:291},3],[{x:280,y:308},5],[{x:100,y:500},9],[{x:390,y:200},11]].map(([hero,index])=>({hero,index,bytes:waterPalaceApproach(hero,{index})}));

  // ---- 7b. character names (engine/native-names.js displayName) ----------
  // The cartridge's name copy (C0:1866) is served the browser's view: the
  // boy's name from the tail of Goku's slot, retail defaults when unnamed.
  const names=await engine('native-names.js');
  const {encodeText}=await engine('event-codec.js');
  const boyMatch=source('native-names.js').match(/unnamedBoy=encodeText\('([^']+)'\)/);
  if(!boyMatch)throw Error('native-names.js unnamed boy changed');
  const unnamedBoy=encodeText(boyMatch[1]);
  const nameRam=()=>new Uint8Array(0x20000);
  const defaults=[1,2,3].map(n=>names.displayName(nameRam(),n));
  { // behaviour checks: tail BOY -> default, real tail -> itself, slot names win
    const r=nameRam();r.set(unnamedBoy,names.boyTail);
    if(names.displayName(r,3).join()!==defaults[2].join())throw Error('native-names.js unnamed boy behaviour changed');
    r.set(encodeText('Ann'),names.boyTail);r[names.boyTail+3]=0;
    if(names.displayName(r,3).join()!==encodeText('Ann').join())throw Error('native-names.js boy tail behaviour changed');
    r.set(encodeText('Kim'),names.nameSlot(1));
    if(names.displayName(r,1).join()!==encodeText('Kim').join())throw Error('native-names.js slot behaviour changed');
    if(names.boyTail!==0xcc06||names.nameSlot(1)!==0xcc0c)throw Error('native-names.js layout changed');
  }
  const pad=(b,n)=>[...b,...Array(n).fill(0)].slice(0,n);

  // ---- 8. bounded native text patches (non-relocated events) -------------
  // Flight dialogue is a read overlay in the browser over cartridge text.
  // A relocated event shows its compiled copy instead, so only patch text
  // whose event runs from the cartridge (plus the Fly item name).
  const relocatedSpan=at=>{for(let id=0;id<0x800;id++){const r=eventRange(data,id);if(at>=r.start&&at<r.end)return env.entries.has(0xc00000+r.start)?id:-1;}return -2;};
  const textPatches=[];
  for(const p of flightDialogue){
    const owner=relocatedSpan(p.at);
    if(owner>=0){textPatches.push({at:p.at,skipped:`event ${hex(owner,3)} is relocated`});continue;}
    for(let i=0;i<p.original.length;i++)if(rom[p.at+i]!==p.original[i])throw Error('Flight text differs from the cartridge');
    textPatches.push({at:p.at,bytes:[...p.bytes],name:!!p.name,event:owner<0?null:owner});
  }

  // ---- 9. verification of the encoded programs ----------------------------
  const prog=Uint8Array.from(program);
  const read=(addr)=>prog[addr-PROGRAM_BASE];
  function run(id,values){
    let pc=dispatch[id];const effects=[];let dynamic=false;
    for(let guard=0;guard<256;guard++){
      const op=read(pc);
      if(op===0x00)return{addr:read(pc+1)|read(pc+2)<<8|read(pc+3)<<16,id:read(pc+4)|read(pc+5)<<8,effects,dynamic};
      if(op===0x01){const q=read(pc+1),n=read(pc+2);let v=values(q);if(v>=n)v=n-1;pc=read(pc+3+v*2)|read(pc+4+v*2)<<8;continue;}
      if(op===0x02){effects.push(read(pc+1));pc+=2;continue;}
      if(op===0x03){dynamic=true;pc+=2;continue;}
      if(op===0x04){pc=read(pc+1)|read(pc+2)<<8;continue;}
      throw Error('Bad story program opcode');
    }
    throw Error('Story program loops');
  }
  let checked=0;
  for(const [id,r] of routes){
    const nameOf=q=>q>=0x80?ramQueries[q-0x80].name:QUERY_VARS.find(v=>v[0]===q)[1];
    for(const row of r.rows){
      const values=q=>row.values[r.vars.indexOf(nameOf(q))]??0;
      const out=run(id,values);
      if(out.addr!==row.result)throw Error(`Story program ${hex(id,3)} disagrees with the browser`);
      if(out.id!==env.metadata.get(row.result).id)throw Error('Story leaf id mismatch');
      if(evalTree(r.tree,new Map(r.vars.map((n,i)=>[n,row.values[i]])))!==row.result)throw Error('Story tree mismatch');
      checked++;
    }
  }
  report.routeRowsChecked=checked;

  // ---- 10. emit -----------------------------------------------------------
  const lines=[];const L=s=>lines.push(s);
  const bytes=(arr,per=16)=>{for(let i=0;i<arr.length;i+=per)L('\tdb '+Array.from(arr.slice(i,i+per),v=>'$'+hex(v)).join(','));};
  const words=(arr,per=16)=>{for(let i=0;i<arr.length;i+=per)L('\tdw '+Array.from(arr.slice(i,i+per),v=>'$'+hex(v,4)).join(','));};
  const longs=(arr,per=8)=>{for(let i=0;i<arr.length;i+=per)L('\tdl '+Array.from(arr.slice(i,i+per),v=>'$'+hex(v,6)).join(','));};
  // defines.asm
  const d=[];const D=s=>d.push(s);
  D('; Generated by snes/gen/story.mjs. Do not edit.');
  D(`!STORY_LAYOUT = $${hex(Number.parseInt(env.story.layout,16)>>>0,8)}`);
  D(`!STORY_OP_HOOK = $${hex(STORY_OPCODES.hook)}`);
  for(const [id,name] of QUERY_VARS)D(`!STORY_Q_${snake(name).replace(/[^A-Z0-9_]/g,'_')} = $${hex(id)}`);
  for(const h of hooks)D(`!STORY_H_${h.name} = $${hex(hookIndex.get(h.name))}`);
  D(`!STORY_HOOK_COUNT = ${hooks.length+1}`);
  D(`!STORY_GREETING_KINDS = ${kinds.length}`);
  D(`!STORY_GRANT_COUNT = ${grants.length}`);
  D(`!STORY_AREA_ROWS = ${areaRows.length}`);
  D(`!STORY_RAMQ_COUNT = ${ramQueries.length}`);
  D(`!STORY_WATER_PREFIX_LEN = ${prefix.length}`);
  D(`!STORY_WATER_SUFFIX_LEN = ${suffixA.length}`);
  D(`!STORY_WATER_SUFFIX_JI = ${jiOffsets[0]}`);
  writeFileSync(join(outDir,'defines.asm'),d.join('\n')+'\n');
  // events.asm
  const ev=['; Generated by snes/gen/story.mjs: the browser mod\'s virtual event banks.','pushpc'];
  for(const b of banks)ev.push(`org $${hex(b.bank)}8000`,`\tincbin "story/bank_f${b.bank-0xf0}.bin"`);
  ev.push('pullpc');
  writeFileSync(join(outDir,'events.asm'),ev.join('\n')+'\n');
  // data.asm (bank E5)
  L('; Generated by snes/gen/story.mjs. Do not edit.');
  L('pushpc');
  L('org !DATA_STORY');
  L('story_dispatch: ; event id -> route program address in this bank (0 = native script)');
  words(dispatch);
  L(`org !DATA_STORY+$1000`);
  L('story_event_hook_index: ; lastEvent id -> hook list number (0 = none)');
  bytes(eventHookIndex);
  L(`org !DATA_STORY+$1800`);
  L('story_greeting_kind: ; event id -> crisis greeting kind (0 = none)');
  bytes(greetingKind);
  L(`org !DATA_STORY+$${hex(PROGRAM_BASE,4)}`);
  L('story_programs:');
  bytes(prog);
  L('story_hook_lists: ; list n: hook ids, 0-terminated');
  L('story_hook_list_ptr:');
  L('\tdw '+['story_hook_list_none',...hookLists.map((_,i)=>`story_hook_list_${i}`)].map(s=>s+'&$FFFF').join(','));
  L('story_hook_list_none:');L('\tdb 0');
  hookLists.forEach((list,i)=>{L(`story_hook_list_${i}:`);L('\tdb '+[...list,0].map(v=>'$'+hex(v)).join(','));});
  L('story_greeting_start: ; kind 1..n');
  longs([0,...greetings.map(g=>g.start)]);
  L('story_greeting_end:');
  longs([0,...greetings.map(g=>g.end)]);
  L('story_grant_pages: ; bank F0-F7 x 16 bytes, bit per 256-byte page of $8000-$FFFF');
  bytes(pages);
  L('story_grant_table: ; addr24, ball index');
  for(const g of grants)L(`\tdl $${hex(g.addr,6)} : db $${hex(g.index)}`);
  L('\tdl $000000 : db $FF');
  L('story_ramq_table: ; address (bank 7E), threshold count, thresholds[3]');
  for(const q of ramQueries)L(`\tdw $${hex(q.addr,4)} : db ${q.thresholds.length},${[...q.thresholds,0,0,0].slice(0,3).map(v=>'$'+hex(v)).join(',')}`);
  L('story_area_table: ; map (word), flag, minimum (sorted by map), terminated by $FFFF');
  for(const r of areaRows)L(`\tdw ${r.map} : db $${hex(r.flag)},${r.min} ; ${r.area}`);
  L('\tdw $FFFF : db 0,0');
  L('story_water_prefix:');bytes(prefix);
  L('story_water_suffix:');bytes(suffixA);
  L('story_name_default: ; names 1-3 when unnamed (12 bytes each)');
  bytes([...pad(defaults[0],12),...pad(defaults[1],12),...pad(defaults[2],12)],12);
  L('story_name_unnamed_boy: ; the title editor default, read as unnamed');
  bytes(pad(unnamedBoy,6));
  L(`!STORY_UNNAMED_BOY_LEN = ${unnamedBoy.length}`);
  L('story_data_end:');
  L(`assert story_data_end <= !DATA_STORY+$${hex(DATA_END,4)}, "story data bank overflow"`);
  L('pullpc');
  // Bounded text patches into original bytes.
  L('; Flight dialogue (engine/flight-dialogue.js) for events that run from the cartridge.');
  for(const p of textPatches){
    if(!p.bytes){L(`; $${hex(0xc00000+p.at,6)} kept: ${p.skipped}`);continue;}
    L(`%patch($${hex(0xc00000+p.at,6)}, ${p.bytes.length}, story)`);
    L('pushpc');L(`org $${hex(0xc00000+p.at,6)}`);bytes(p.bytes);L('pullpc');
  }
  writeFileSync(join(outDir,'data.asm'),lines.join('\n')+'\n');
  // hooks.asm: assembled after every module so owners' defines are visible.
  const h=['; Generated by snes/gen/story.mjs. Include last in modules.asm.','pushpc','org !CODE_STORY+$7C00','story_hook_table: ; hook id -> JSL target (A = event id)','\tdl story_hook_stub'];
  for(const k of hooks){
    if(k.internal){h.push(`\tdl ${k.internal} ; ${k.name}`);continue;}
    h.push(`if defined("STORY_HOOK_${k.name}")`,`\tdl !STORY_HOOK_${k.name}`,'else',`\tdl story_hook_stub ; ${k.name} (${k.owner})`,'endif');
  }
  h.push('story_query_table: ; query id 00-7F -> JSL target returning A');
  for(let q=0;q<0x80;q++){
    const v=QUERY_VARS.find(x=>x[0]===q);
    if(!v){h.push('\tdl story_query_zero');continue;}
    const [,name,owner]=v,N=snake(name).replace(/[^A-Z0-9_]/g,'_');
    if(owner==='story'){h.push(`\tdl story_query_${N.toLowerCase()} ; ${name}`);continue;}
    h.push(`if defined("STORY_QUERY_${N}")`,`\tdl !STORY_QUERY_${N}`,'else',`\tdl story_query_zero ; ${name} (${owner})`,'endif');
  }
  h.push('story_hooks_end:','assert story_hooks_end <= !CODE_STORY+$8000, "story hook table overflow"','pullpc');
  writeFileSync(join(outDir,'hooks.asm'),h.join('\n')+'\n');
  // catalog.json
  const routeList=[...routes].map(([id,r])=>({id,kind:r.kind,program:dispatch[id],vars:r.vars,effects:r.effects,dynamic:r.dynamic,
    byMask:r.kind==='party'?r.rows.map(x=>x.result):undefined,
    leaves:[...new Set(r.rows.map(x=>x.result))].map(addr=>({addr,id:env.metadata.get(addr).id,mask:env.metadata.get(addr).mask}))}));
  const catalog={layout:env.story.layout,banks,allocations,routes:routeList,
    queries:QUERY_VARS.map(([id,name,owner,domain,text])=>({id,name,owner,domain,text})),ramQueries,
    hooks:hooks.map(k=>({id:hookIndex.get(k.name),...k})),eventHooks:Object.fromEntries([...eventHooks].map(([id,n])=>[hex(id,3),n])),
    greetings,greetingKinds:kinds,grants,areas:areaRows,textPatches,water:{prefix,suffix:suffixA,ji:jiOffsets[0],samples:waterSamples},
    nativeOnlyEvents,programBytes:program.length,report};
  writeFileSync(join(outDir,'catalog.json'),JSON.stringify(catalog));
  return catalog;
}
