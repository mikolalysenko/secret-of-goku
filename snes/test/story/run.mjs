#!/usr/bin/env node
// Story module checks in Mesen against the browser mod's own story stack.
//   SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/story/run.mjs [case ...]
// Each case imports a browser-mod state (.local/snes-import), sets the story
// fields, starts an event the way the browser's story.request() does, and
// records every native event resolution (requested id -> first script
// pointer) plus every byte read from the compiled banks. Expectations come
// from evaluating the browser's real dispatch entries (snes/gen/story-env.mjs)
// for the same party and state, never from hand-copied data.
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {loadStoryEnvironment} from '../../gen/story-env.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..','..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const out=resolve(repo,'.local/snes-test/story');
// Private import bundles live in the main checkout's .local/ (worktrees
// share it through git's common directory).
const mainCheckout=()=>{try{const r=spawnSync('git',['rev-parse','--git-common-dir'],{cwd:repo,encoding:'utf8'});return resolve(repo,r.stdout.trim(),'..');}catch{return repo;}};
const imports=process.env.SNES_IMPORT??[resolve(repo,'.local/snes-import'),resolve(mainCheckout(),'.local/snes-import')].find(p=>existsSync(p))??resolve(repo,'.local/snes-import');
const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');
// Symbols and the addresses the module exports at story_addresses (dl
// goku_active, PERSIST_STORY, RAM_STORY, water buffer, test log, test
// queries), read from a built ROM.
function romInfo(path){
  const sym=new Map();
  for(const line of readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
    const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/i);if(m)sym.set(m[3],parseInt(m[1]+m[2],16));
  }
  const label=n=>{if(!sym.has(n))throw Error(`missing symbol ${n}`);return sym.get(n);};
  const bytes=new Uint8Array(readFileSync(path));
  const at=a=>bytes[((a>>16)&0x3f)<<16|(a&0xffff)],long=a=>at(a)|at(a+1)<<8|at(a+2)<<16;
  const t=label('story_addresses');
  return{path,label,addr:{goku:long(t),persist:long(t+3),ram:long(t+6),water:long(t+9),log:long(t+12),queries:long(t+15),sweep:long(t+18)}};
}
const prod=romInfo(rom);
// Test ROM: hooks log, foreign queries answer from a table (-DSTORY_TEST).
let testRom=null;
const testInfo=()=>{
  if(testRom)return testRom;
  const path=resolve(repo,'dist/snes/story-test.sfc');
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','-DSTORY_TEST',`--out=${path}`],{cwd:repo,stdio:'inherit'});
  if(b.status!==0)throw Error('story test build failed');
  return testRom=romInfo(path);
};
const label=prod.label,ADDR=prod.addr;
const catalog=JSON.parse(readFileSync(resolve(repo,'dist/snes/gen/story/catalog.json'),'utf8'));
const hookId=name=>{const h=catalog.hooks.find(x=>x.name===name);if(!h)throw Error('no hook '+name);return h.id;};
const queryId=name=>{const q=catalog.queries.find(x=>x.name===name);if(!q)throw Error('no query '+name);return q.id;};
const base=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
const env=await loadStoryEnvironment(repo,base);
const {eventRange}=await import(pathToFileURL(join(repo,'engine/event-codec.js')).href);
const {waterPalaceApproach}=await import(pathToFileURL(join(repo,'engine/water-palace.js')).href);
const {decodeText,commandLength:commandLengthOf}=await import(pathToFileURL(join(repo,'engine/event-codec.js')).href);
const {compiledText}=await import(pathToFileURL(join(repo,'engine/story-compiler.js')).href);
// The browser's choice for event `id` with party `mask` and state `assign`.
const js=(id,mask,assign=[])=>{const e=env.entries.get(0xc00000+eventRange(env.data,id).start);if(!e)return 0xc00000+eventRange(env.data,id).start;return env.evaluate(e,assign,mask).result;};
const alloc=addr=>catalog.allocations.find(a=>a.at===addr);
const text=addr=>{const a=alloc(addr);return compiledText(Array.from(env.scripts.get(addr).bytes)).map(decodeText).join(' | ');};
// SRAM / RAM addresses (snes/src/modules/story/module.asm, core/shared.asm)
const GOKU_ACTIVE=ADDR.goku,P_VERSION=ADDR.persist,P_MASK=ADDR.persist+1,P_SEEDS=ADDR.persist+2,P_WISHED=ADDR.persist+4,P_SPELLS=ADDR.persist+8;
const goku=[[GOKU_ACTIVE,1,1],[P_VERSION,1,1]];
const bundle=name=>join(imports,name);
const readsCover=(reads,at,end)=>{let n=0;for(const [a,b] of reads){const lo=Math.max(a,at),hi=Math.min(b,end-1);if(hi>=lo)n+=hi-lo+1;}return n;};
const ROLE={girl:0x7ee200,sprite:0x7ee400};

const cases=[];
// 1-4. Party variants: the Moogle (24B) has four authored variants.
for(const [name,file,writes,mask] of[
  ['party-solo','emulator-probe__potos-state',[],0],
  ['party-both','barrier-audit__potos-probe',[],3],
  ['party-girl','barrier-audit__potos-probe',[[ROLE.sprite,0,1]],1],
  ['party-sprite','barrier-audit__potos-probe',[[ROLE.girl,0,1]],2],
]){
  cases.push({name,bundle:file,writes:[...goku,...writes],request:[0x24b,0],frames:900,mash:24,shots:[60,200,400],
    check(r){
      const want=js(0x24b,mask),first=r.trace.find(t=>t[0]===0x24b);
      const a=alloc(want);
      return [
        ['24B resolves to the browser variant for mask '+mask,first&&first[1]===want,`native ${first?hex(first[1],6):'none'}, browser ${hex(want,6)} "${text(want).slice(0,60)}"`],
        ['the compiled text was read',readsCover(r.reads,a.at,a.end)>=a.length*0.8,`${readsCover(r.reads,a.at,a.end)}/${a.length} bytes`],
      ];
    }});
}
// 5. Luka's menu (134) -> Advice (85) with three Balls in the ledger.
// CF C3 = 1: the one-time spear gift (92 -> 13A) was already given; its
// sound-bank upload cannot complete in imported states (APU handshake).
cases.push({name:'luka-advice',bundle:'emulator-probe__potos-state',writes:[...goku,[P_MASK,0x0b,1],[P_SEEDS,0x0b,1],[0x7ecfc3,1,1]],request:[0x134,0],frames:1500,mash:30,shots:[40,120,300,600],
  check(r){
    const menu=js(0x134,0),advice=js(0x85,0,[['questCount',3]]);
    const m=r.trace.find(t=>t[0]===0x134),a=r.trace.find(t=>t[0]===0x85);
    return [
      ['134 resolves to Luka\'s menu',m&&m[1]===menu,`native ${m?hex(m[1],6):'none'} browser ${hex(menu,6)}`],
      ['Advice (85) chooses the 3/7 page',a&&a[1]===advice,`native ${a?hex(a[1],6):'none'} browser ${hex(advice,6)} "${text(advice).slice(0,40)}"`],
      ['advice text was read',a&&readsCover(r.reads,advice,alloc(advice).end)>=alloc(advice).length*0.8,''],
    ];
  }});
// 6. Water Palace Jema (131) before the plate (CF11 = 7): dynamic walk.
cases.push({name:'water-palace-walk',bundle:'power-flight-fixes__jema-7',writes:[...goku],request:[0x131,0],frames:30,mash:0,shots:[20],dump_water:true,
  check(r){
    const w=readFileSync(join(bundle('power-flight-fixes__jema-7'),'wram.bin'));
    const word=a=>w[a]|w[a+1]<<8;
    let jema=null;for(let i=0;i<12;i++){const b=0xe000+i*0x200;if((w[b]&1)&&w[b+0x180]===0xa0){jema={index:i};break;}}
    let leader=0xe000;for(const b of[0xe000,0xe200,0xe400])if((w[b]&1)&&(w[b+0x2c]&1)){leader=b;break;}
    const want=jema?waterPalaceApproach({x:word(leader+2),y:word(leader+4)},jema):null;
    const t=r.trace.find(x=>x[0]===0x131);
    const got=r.water?.slice(0,want?.length??0);
    return [
      ['Jema found in the state',!!jema,jema?`index ${jema.index}`:''],
      ['131 resolves to the SRAM walk',t&&t[1]===ADDR.water,t?hex(t[1],6):'none'],
      ['walk bytes equal water-palace.js',want&&got&&want.every((v,i)=>v===got[i]),want?`${want.length} bytes`:''],
    ];
  }});

// ---- names (engine/native-names.js) ----------------------------------------
const {displayName}=await import(pathToFileURL(join(repo,'engine/native-names.js')).href);
const {encodeText}=await import(pathToFileURL(join(repo,'engine/event-codec.js')).href);
const wramOf=name=>new Uint8Array(readFileSync(join(bundle(name),'wram.bin')));
const NAME_BUF=0x7ea22f;
for(const [name,tail] of[['names-boy-state',null],['names-boy-tail',encodeText('Ann')],['names-boy-unnamed',encodeText('BOY')],['names-boy-empty',[]]]){
  const writes=[...goku];
  if(tail){for(let i=0;i<6;i++)writes.push([0x7ecc06+i,tail[i]??0,1]);}
  cases.push({name,bundle:'emulator-probe__potos-state',writes,request:[0x107,0],frames:500,mash:24,shots:[80],dump:[[NAME_BUF,13]],
    check(r){
      const w=wramOf('emulator-probe__potos-state');
      if(tail){for(let i=0;i<6;i++)w[0xcc06+i]=tail[i]??0;}
      const want=[...displayName(w,3),0,0,0,0,0,0,0,0,0,0,0,0,0].slice(0,13);
      const got=r.dumps?.[0]??[];
      const t=r.trace.find(x=>x[0]===0x107);
      return [
        ['107 resolves to its compiled line',t&&t[1]===js(0x107,0),t?hex(t[1],6):'none'],
        ['57 03 shows displayName(3)',want.every((v,i)=>v===got[i]),`native [${got.map(v=>hex(v)).join(' ')}] browser [${want.map(v=>hex(v)).join(' ')}]`],
      ];
    }});
}
// ---- Dragon Ball grant marker (588: Water seed) -----------------------------
cases.push({name:'grant-water',bundle:'emulator-probe__potos-state',writes:[...goku,[P_MASK,0,1],[P_SEEDS,0,1],[0x7ecf90,0,1],[0x7ecf45,0,1]],request:[0x588,0],frames:700,mash:20,shots:[100,300],
  check(r){
    const p=r.persist,ram=r.ram,hits=ram[0x74]|ram[0x75]<<8;
    const marker=catalog.grants.find(g=>g.index===0&&alloc(js(0x588,0))&&g.addr>=js(0x588,0)&&g.addr<alloc(js(0x588,0)).end);
    return [
      ['588 resolves to the compiled seed event',r.trace.some(t=>t[0]===0x588&&t[1]===js(0x588,0)),''],
      ['native flag CF90 set by the event',r.flags[0x90]===1,`CF90=${r.flags[0x90]}`],
      ['grant marker fetched',!!marker&&r.reads.some(([a,b])=>marker.addr>=a&&marker.addr<=b),marker?hex(marker.addr,6):'no marker'],
      ['ledger collected the Water Ball',(p[1]&1)===1&&(p[2]&1)===1&&hits>=1,`mask ${hex(p[1])} seeds ${hex(p[2])} hits ${hits}`],
    ];
  }});
// ---- spell grants kept for an absent companion (583) -------------------------
cases.push({name:'spell-grant',bundle:'emulator-probe__potos-state',writes:[...goku,[P_SPELLS+3,0,1],[P_SPELLS+11,0,1],[0x7ee3cb,0,1],[0x7ee5cb,0,1]],request:[0x583,0],frames:90,mash:0,
  timed:[[60,[[0x7ee200,1,1],[0x7ee3cb,0,1]]]],dump:[[0x7ee3cb,1],[0x7ee5cb,1]],
  check(r){
    const p=r.persist,girl=r.dumps?.[0]?.[0];
    return [
      ['girl grant remembered (39 02 CB 38)',p[8+3]===0x38,`spells[3]=${hex(p[8+3])}`],
      ['sprite grant remembered (39 03 CB 07)',p[16+3]===0x07,`spells[11]=${hex(p[16+3])}`],
      ['re-granted once the girl is present',(girl&0x38)===0x38,`E3CB=${hex(girl??0)}`],
    ];
  }});
// ---- story-area prerequisites on map entry (door 45 -> Upper Land map 40) ---
cases.push({name:'story-area',bundle:'emulator-probe__potos-state',writes:[...goku,[0x7ecf20,0,1],[0x7ecf21,0,1],[0x7ecf22,0,1]],request:[0x845,0],frames:240,mash:0,shots:[200],
  check(r){
    return [
      ['door 45 loads map 40',r.map===40,`map ${r.map}`],
      ['floors raised to 3/2/1 (story-areas.js)',r.flags[0x20]===3&&r.flags[0x21]===2&&r.flags[0x22]===1,`CF20-22 = ${r.flags[0x20]},${r.flags[0x21]},${r.flags[0x22]}`],
    ];
  }});
// ---- absent companions never take movement (28A solo) ------------------------
cases.push({name:'absent-skip',bundle:'emulator-probe__potos-state',writes:[...goku],request:[0x28a,0],frames:2400,mash:16,stopIdle:true,shots:[120,400],
  check(r){
    const at=js(0x28a,0),b=Array.from(env.scripts.get(at).bytes);
    let moves=0;
    for(let i=0;i<b.length;){const op=b[i];if(op>=0x7f||op===0x57){i+=op===0x57?2:1;continue;}if([0x31,0x32,0x34].includes(op)&&(b[i+1]===2||b[i+1]===3))moves++;i+=commandLengthOf(b,i);}
    const skipped=r.ram[4]|r.ram[5]<<8;
    return [
      ['28A resolves to the solo variant',r.trace.some(t=>t[0]===0x28a&&t[1]===at),hex(at,6)],
      ['companion moves skipped',skipped===moves,`skipped ${skipped}, companion moves in script ${moves}`],
      ['the scene finished (no WAIT stall)',r.d0===0,`D0=${hex(r.d0)} after ${r.frames_run} frames`],
    ];
  }});
// ---- crisis greeting prefix and resume -------------------------------------
// The Frieza module owns crisisActive; the test ROM answers it from the
// test query table.
{
  const w=wramOf('emulator-probe__potos-state');
  let npc=null;
  for(let slot=0x600;slot<0x1800;slot+=0x200){
    const id=(w[0xe03e+slot]|w[0xe03f+slot]<<8)&0x7ff;
    if(id&&(w[0xe000+slot]&1)&&w[0xe180+slot]>=0x80&&env.greetingKinds.has(id)&&env.entries.has(0xc00000+eventRange(env.data,id).start)){npc={slot,id,kind:env.greetingKinds.get(id)};break;}
  }
  if(npc)cases.push({name:'crisis-greeting',rom:'test',queries:[['friezaCrisis',1]],bundle:'emulator-probe__potos-state',writes:[...goku],
    request:[npc.id,npc.slot],frames:900,mash:24,stopIdle:true,shots:[30,90],
    check(r){
      const g=catalog.greetings.find(x=>x.kind===npc.kind),script=js(npc.id,0);
      const count=r.ram[0x18]|r.ram[0x19]<<8;
      const sc=alloc(script);
      return [
        [`NPC ${hex(npc.id,3)} (${npc.kind}) greeted once`,count===1,`greet count ${count}`],
        ['greeting text read',readsCover(r.reads,g.start,g.end)>=(g.end-g.start)*0.8,`${hex(g.start,6)}-${hex(g.end,6)}`],
        ['NPC script resumed after the greeting',sc?readsCover(r.reads,sc.at,sc.end)>0:r.trace.length>0,sc?hex(sc.at,6):'native script'],
      ];
    }});
}

// ---- object record overlays (native-story.js storyRead, story-owned) ------
// Travel into the map, then compare the loader's record copies ($C808+16i)
// with the browser's own cartridge read view under the same RAM.
{
  const listOf=map=>{const w=a=>env.data[a]|env.data[a+1]<<8;const start=0x80000+w(0x87000+map*2),end=0x80000+w(0x87002+map*2);return{start,count:(end-start-8)/8};};
  const jsRecords=(map,ram)=>{
    env.ram.fill(0);for(const [a,v] of ram)env.ram[a&0x1ffff]=v;
    const {start,count}=listOf(map),out=[];
    for(let i=0;i<count;i++)for(let b=0;b<8;b++){const at=start+8+i*8+b;out.push(env.cart.read(0xc8,at&0xffff));}
    return out;
  };
  const objCase=(name,file,door,map,ramWrites,note)=>{
    const {count}=listOf(map);
    cases.push({name,bundle:file,writes:[...goku,...ramWrites.map(([a,v])=>[a,v,1])],request:[0x800|door,0],frames:150,mash:0,shots:[140],dump:[[0x7ec800,count*16]],
      check(r){
        const w=wramOf(file),party=[[0x7ee000,w[0xe000]],[0x7ee200,w[0xe200]],[0x7ee400,w[0xe400]]];
        const want=jsRecords(map,[...party,...ramWrites]),got=r.dumps?.[0]??[];
        const bad=[];for(let i=0;i<count;i++)for(let b=0;b<8;b++)if(got[i*16+8+b]!==want[i*8+b])bad.push(`r${i}+${b}: ${hex(got[i*16+8+b]??0)}/${hex(want[i*8+b])}`);
        return [[`door ${hex(door,3)} loads map ${map}`,r.map===map,`map ${r.map}`],[`all ${count} records match the browser view (${note})`,bad.length===0,bad.slice(0,6).join(' ')]];
      }});
  };
  objCase('objects-northtown','emulator-probe__potos-state',0x9f,408,[[0x7ecf0d,0]],'no captive Primm');
  objCase('objects-northtown-captive','emulator-probe__potos-state',0x9f,408,[[0x7ecf0d,8]],'old captive save keeps retail records');
  objCase('objects-tree-solo','emulator-probe__potos-state',0x5e,236,[],'absent stand-ins hidden');
  objCase('objects-tree-party','barrier-audit__potos-probe',0x5e,236,[],'full party keeps stand-ins');
  objCase('objects-water-luka','emulator-probe__potos-state',0x96,139,[[0x7ecf11,5]],'introduction Jema kept until CF11=10');
  objCase('objects-water-late','emulator-probe__potos-state',0x96,139,[[0x7ecf11,12]],'later Jema visible');
  objCase('objects-tree-palace','emulator-probe__potos-state',0x30a,195,[],'approach Jema on the dry path');
}

// ---- route matrix: first resolution under story-owned state ---------------
// Foreign queries are stubs (0) natively, which is index 0 of every
// domain in the browser model as well.
{
  const popcount=n=>{let b=0;for(;n;n&=n-1)b++;return b;};
  const ledger=(mask,seeds)=>({writes:[[P_MASK,mask,1],[P_SEEDS,seeds,1]],assign:[['questCount',popcount(mask&127)],['questHeld7',Number((mask&127)===127)],['questSeedsAll',Number((seeds&127)===127)],['questMaskAll',Number((mask&127)===127)]]});
  const ramv=(addr,value,index)=>({writes:[[0x7e0000|addr,value,1]],assign:[['ram:'+addr.toString(16),index]]});
  const join=(...parts)=>({writes:parts.flatMap(p=>p.writes),assign:parts.flatMap(p=>p.assign)});
  const rows=[
    ['558 free',0x558,ramv(0xcf0d,0,0)],['558 captive',0x558,ramv(0xcf0d,8,1)],
    ['93 incomplete',0x93,ledger(0x0b,0x0b)],['93 all seven',0x93,ledger(0x7f,0x7f)],
    ['9A ordinary',0x9a,ledger(0x7f,0x3f)],['9A feed',0x9a,ledger(0x7f,0x7f)],
    ['A8 none',0xa8,join(ramv(0xcf44,0,0),ledger(0,0))],['A8 some palace',0xa8,join(ramv(0xcf44,2,1),ledger(0x05,0x05))],['A8 seven',0xa8,join(ramv(0xcf44,0,0),ledger(0x7f,0x7f))],
    ['297 none',0x297,join(ramv(0xcf0d,0,0),ramv(0xcf0e,0,0))],['297 girl',0x297,join(ramv(0xcf0d,8,1),ramv(0xcf0e,0,0))],['297 both',0x297,join(ramv(0xcf0d,8,1),ramv(0xcf0e,8,1))],
    ['42F balls',0x42f,ledger(0x0b,0x0b)],['42F frieza',0x42f,ledger(0x7f,0x7f)],
  ];
  for(const [title,id,st] of rows){
    const name='route-'+title.replace(/\s+/g,'-');
    cases.push({name,bundle:'emulator-probe__potos-state',writes:[...goku,...st.writes],request:[id,0],frames:6,mash:0,
      check(r){
        const want=js(id,0,st.assign),t=r.trace.find(x=>x[0]===id);
        return [[`${hex(id,3)} ${title}`,t&&t[1]===want,`native ${t?hex(t[1],6):'none'} browser ${hex(want,6)}${alloc(want)?' ['+hex(alloc(want).id,3)+']':''}`]];
      }});
  }
}

// ---- hook and query contract (test ROM: hooks log, foreign queries set) ----
{
  const HK=hookId;
  const entries=(r,name)=>(r.hooklog??[]).filter(e=>e[0]===HK(name));
  const seq=(r,list)=>{let i=0;for(const e of r.hooklog??[])if(i<list.length&&e[0]===HK(list[i][0])&&e[1]===list[i][1])i++;return i===list.length;};
  const logText=r=>(r.hooklog??[]).slice(0,12).map(([h,a,x])=>`${catalog.hooks.find(k=>k.id===h)?.name??h}(${hex(a,3)},${hex(x,4)})`).join(' ');
  cases.push({name:'hooks-objects',rom:'test',bundle:'emulator-probe__potos-state',writes:[...goku],request:[0x800|0x9f,0],frames:150,
    check(r){
      const ok=[0,1,2].every(i=>['OBJECT_SANDSHIP','OBJECT_ENDING','OBJECT_FRIEZA','OBJECT_TRIAL'].every(n=>entries(r,n).some(e=>e[1]===i&&e[2]===i*16)));
      return [['object list hooks get the map',entries(r,'OBJECT_LIST_SANDSHIP').some(e=>e[1]===408)&&entries(r,'OBJECT_LIST_ENDING').some(e=>e[1]===408),logText(r)],
        ['record hooks get A = record, X = slot (3 records x 4 owners)',ok,'']];
    }});
  cases.push({name:'hooks-grant',rom:'test',bundle:'emulator-probe__potos-state',writes:[...goku,[P_MASK,0,1],[P_SEEDS,0,1],[0x7ecf90,0,1],[0x7ecf45,0,1]],request:[0x588,0],frames:700,mash:20,
    check(r){return [['EVENT_ANY on entering 588',entries(r,'EVENT_ANY').some(e=>e[1]===0x588),''],['QUEST_COLLECTED with the Water index',entries(r,'QUEST_COLLECTED').some(e=>e[1]===0),logText(r)]];}});
  cases.push({name:'hooks-opcode',rom:'test',bundle:'emulator-probe__potos-state',writes:[...goku],script:[ADDR.water+0x100,[0x3d,HK('OPCODE_SCRIPT'),0x00]],frames:20,
    check(r){return [['3D hh calls story_hook_table[hh] and the script ends',entries(r,'OPCODE_SCRIPT').length===1&&r.d0===0,logText(r)]];}});
  cases.push({name:'hooks-theft',rom:'test',bundle:'emulator-probe__potos-state',writes:[...goku],request:[0xa8,0],frames:180,
    check(r){return [['theft: EVENT_ANY, FRIEZA_THEFT, then the Emperor prelude call',seq(r,[['EVENT_ANY',0xa8],['FRIEZA_THEFT',0xa8],['EVENT_ANY',0x4a7],['FRIEZA_EMPEROR_PRELUDE',0x4a7]]),logText(r)]];}});
  const good=[['friezaDefeated',1],['beastFed',1],['beastStarted',1],['beastWon',1]];
  cases.push({name:'hooks-ending',rom:'test',bundle:'emulator-probe__potos-state',writes:[...goku,[P_MASK,0x7f,1],[P_SEEDS,0x7f,1]],queries:good,request:[0x42f,0],frames:8,
    check(r){
      const want=js(0x42f,0,[['questSeedsAll',1],['questMaskAll',1],...good]),t=r.trace.find(x=>x[0]===0x42f);
      return [['good ending chosen as in the browser',t&&t[1]===want,`native ${t?hex(t[1],6):'none'} browser ${hex(want,6)}`],
        ['BEAST_VICTORY before EVENT_ANY and ENDING_BEGIN',seq(r,[['BEAST_VICTORY',0x42f],['EVENT_ANY',0x42f],['ENDING_BEGIN',0x42f]]),logText(r)]];
    }});
  for(const [title,id,queries] of[
    ['4E1 pending',0x4e1,[['friezaPending',1]]],['4E1 tree',0x4e1,[['friezaNeedsTree',1]]],['4E1 showdown',0x4e1,[['friezaStolen',1],['friezaTrialWon',1]]],['4E1 trial',0x4e1,[['friezaStolen',1]]],
    ['4A4 palace',0x4a4,[['friezaPalace',1]]],['4A4 crisis',0x4a4,[['friezaCrisis',1]]],['5F8 tree after',0x5f8,[['friezaTreeComplete',1]]],['429 destroyed',0x429,[['fortressDestroyed',1]]],
    ['4E5 trial',0x4e5,[['trialActive',1],['trialParty',3]]],['28B weighted',0x28b,[['equipWeighted',1]]],['7A door 1A5',0x7a,[['sandshipDoor',6]]],
  ]){
    cases.push({name:'route-'+title.replace(/\s+/g,'-'),rom:'test',bundle:'emulator-probe__potos-state',writes:[...goku],queries,request:[id,0],frames:6,
      check(r){
        const want=js(id,0,queries),t=r.trace.find(x=>x[0]===id);
        return [[`${hex(id,3)} ${title}`,t&&t[1]===want,`native ${t?hex(t[1],6):'none'} browser ${hex(want,6)}${alloc(want)?' ['+hex(alloc(want).id,3)+']':''}`]];
      }});
  }
}

// ---- exhaustive dispatch sweep (test ROM) -----------------------------------
// story_test_sweep evaluates every route program on the cartridge; compare
// all 324 choices with the browser's closures under the same state.
{
  const routed=catalog.routes.map(r=>r.id).sort((a,b)=>a-b);
  const foreign=catalog.queries.filter(q=>q.owner!=='story');
  let seed=0x5eed;
  const rnd=n=>{seed=(Math.imul(seed,1103515245)+12345)&0x7fffffff;return (seed>>>16)%n;};
  const fixed=[
    {mask:0,ledger:[0,0],ram:{0xcf0d:0,0xcf0e:0,0xcf28:0,0xcf44:0,0xcf11:0},q:{}},
    {mask:3,ledger:[0x7f,0x7f],ram:{0xcf0d:8,0xcf0e:8,0xcf28:11,0xcf44:2,0xcf11:9},q:Object.fromEntries(foreign.map(q=>[q.name,q.domain.length-1]))},
  ];
  const randomState=()=>({mask:rnd(4),ledger:[rnd(128),rnd(2)?0x7f:rnd(128)],ram:{0xcf0d:rnd(2)*8,0xcf0e:rnd(2)*8,0xcf28:rnd(2)?11:3,0xcf44:rnd(3),0xcf11:rnd(12)},
    q:Object.fromEntries(foreign.map(q=>[q.name,rnd(q.domain.length)]))});
  const states=[...fixed,...Array.from({length:6},randomState)];
  const popcount=n=>{let b=0;for(;n;n&=n-1)b++;return b;};
  states.forEach((st,k)=>{
    const [held,seeds]=st.ledger;
    const writes=[...goku,[ROLE.girl,st.mask&1?1:0,1],[ROLE.sprite,st.mask&2?1:0,1],[P_MASK,held,1],[P_SEEDS,seeds,1],...Object.entries(st.ram).map(([a,v])=>[0x7e0000|Number(a),v,1])];
    const assign=[['questCount',popcount(held&127)],['questHeld7',Number((held&127)===127&&!(st.q.friezaStolen&&st.q.friezaStolenClass))],['questSeedsAll',Number((seeds&127)===127)],['questMaskAll',Number((held&127)===127)],
      ...Object.entries(st.ram).map(([a,v])=>{const name='ram:'+Number(a).toString(16),def=env.vars.get(name);return[name,def?def.thresholds.filter(t=>v>=t).length:0];}),
      ...Object.entries(st.q)];
    cases.push({name:`sweep-${k}`,rom:'test',bundle:'emulator-probe__potos-state',writes,queries:Object.entries(st.q),frames:20,
      timed:[[8,[[ADDR.sweep,1,1]]]],dump:[[ADDR.sweep,1+routed.length*3]],
      check(r){
        const table=r.dumps?.[0]??[];
        const bad=[];
        routed.forEach((id,i)=>{const got=table[1+i*3]|table[2+i*3]<<8|table[3+i*3]<<16,want=js(id,st.mask,assign);if(got!==want)bad.push(`${hex(id,3)}: ${hex(got,6)}/${hex(want,6)}`);});
        return [[`all ${routed.length} routed events choose the browser's script (mask ${st.mask})`,table.length>0&&bad.length===0,bad.slice(0,6).join(' ')]];
      }});
  });
}

// ---- differential: the browser's own story stack on SnesJs ---------------
// Same source state, writes, request and B mashing; compare all 256 story
// flags, the relocated events entered, the ledger and absent-actor skips.
{
  const {runBrowserStory}=await import('./jsref.mjs');
  const importCatalog=JSON.parse(readFileSync(join(imports,'catalog.json'),'utf8'));
  const sourceOf=name=>{const e=importCatalog.find(x=>x.name===name);return e?resolve(mainCheckout(),e.source):null;};
  const diff=(c,{file,writes=[],ledger=[0,0],request,frames,mash})=>cases.push({...c,bundle:file,
    writes:[...goku,[P_MASK,ledger[0],1],[P_SEEDS,ledger[1],1],...writes.map(([a,v])=>[a,v,1])],request:[request,0],frames,mash,
    async check(r){
      const src=sourceOf(file);
      if(!src||!existsSync(src))return [['browser source state available',false,src??file]];
      const b=await runBrowserStory({repo,rom:base,statePath:src,writes,ledger,request,frames,mash});
      const native=[];for(const [id] of r.events)if(native.at(-1)!==id||true)native.push(id);
      const flagDiff=[];for(let i=0;i<256;i++)if(r.flags[i]!==b.flags[i])flagDiff.push(`CF${hex(i)} ${hex(r.flags[i])}/${hex(b.flags[i])}`);
      const ev=r.events.map(e=>e[0]),bev=b.entered;
      const p=r.persist,skipped=r.ram[4]|r.ram[5]<<8;
      return [
        ['browser accepted the same request',b.requested,''],
        ['relocated events entered match the browser',ev.join()===bev.join(),`native [${ev.map(x=>hex(x,3)).join(' ')}] browser [${bev.map(x=>hex(x,3)).join(' ')}]`],
        ['all 256 story flags match the browser',flagDiff.length===0,flagDiff.slice(0,8).join(' ')],
        ['Dragon Ball ledger matches',(p[1]&127)===b.ledger.mask&&(p[2]&127)===b.ledger.seedMask,`native ${hex(p[1])}/${hex(p[2])} browser ${hex(b.ledger.mask)}/${hex(b.ledger.seedMask)}`],
        ['absent-actor skips match',skipped===b.status.skippedActors,`native ${skipped} browser ${b.status.skippedActors}`],
      ];
    }});
  diff({name:'diff-moogle'},{file:'emulator-probe__potos-state',request:0x24b,frames:900,mash:24});
  diff({name:'diff-moogle-party'},{file:'barrier-audit__potos-probe',request:0x24b,frames:900,mash:24});
  diff({name:'diff-water-seed'},{file:'emulator-probe__potos-state',writes:[[0x7ecf90,0],[0x7ecf45,0]],request:0x588,frames:700,mash:20});
  diff({name:'diff-luka'},{file:'emulator-probe__potos-state',writes:[[0x7ecfc3,1]],ledger:[0x0b,0x0b],request:0x134,frames:1500,mash:30});
  diff({name:'diff-absent'},{file:'emulator-probe__potos-state',request:0x28a,frames:900,mash:16});
  diff({name:'diff-story-area'},{file:'emulator-probe__potos-state',writes:[[0x7ecf20,0],[0x7ecf21,0],[0x7ecf22,0]],request:0x845,frames:240,mash:0});
  diff({name:'diff-villager'},{file:'emulator-probe__potos-state',request:0x107,frames:500,mash:24});
  diff({name:'diff-elder',shots:[90,300]},{file:'mega-beam__elder-end',request:0x114,frames:900,mash:24});
  diff({name:'diff-potos-arrival',shots:[200,600,1200]},{file:'emulator-probe__potos-state',request:0x10c,frames:2400,mash:24});
}

// ---- from a new game (core checkpoint: Potos via the native door) ---------
// snes/test/checkpoints.mjs --potos: a fresh NEW GAME with empty battery RAM;
// Goku is made active as the arrival module does at the impact.
{
  const dir=process.env.SNES_CHECKPOINTS??resolve(mainCheckout(),'.local/snes-checkpoints');
  const state=join(dir,'potos.mss');
  const fresh=[[GOKU_ACTIVE,1,1],[P_VERSION,0,1],[P_MASK,0xff,1],[P_SEEDS,0xff,1]];
  cases.push({name:'newgame-init',state,writes:fresh,frames:10,
    check(r){const p=r.persist;return [['ledger initialised from the native flags of a new game',p[0]===1&&p[1]===0&&p[2]===0,`version ${p[0]} mask ${hex(p[1])} seeds ${hex(p[2])}`]];}});
  cases.push({name:'newgame-villager',state,writes:fresh,request:[0x107,0],frames:400,mash:24,shots:[80],dump:[[NAME_BUF,13]],
    check(r){
      const t=r.trace.find(x=>x[0]===0x107),got=r.dumps?.[0]??[];
      const randi=[...encodeText('Randi'),0,0,0,0,0,0,0,0].slice(0,13);
      return [['107 resolves to its compiled line',t&&t[1]===js(0x107,0),t?hex(t[1],6):'none'],['{3} reads Randi (no name in the slot tail)',randi.every((v,i)=>v===got[i]),got.map(v=>hex(v)).join(' ')]];
    }});
  cases.push({name:'newgame-luka',state,writes:fresh,request:[0x134,0],frames:1800,mash:30,shots:[60,240,640,665,900],
    check(r){
      const ids=r.trace.map(t=>t[0]);
      return [['the one-time spear gift (92 -> 13A) runs before the menu',ids.includes(0x92)&&ids.includes(0x13a),ids.map(x=>hex(x,3)).join(' ')],
        ['the menu returns (134 again) and Advice opens (85)',ids.filter(x=>x===0x134).length>=2&&ids.includes(0x85),''],
        ['the gift flag advanced',r.flags[0xc3]>=1,`CFC3=${r.flags[0xc3]}`],
        ['Advice chose the 0/7 page',r.trace.some(t=>t[0]===0x85&&t[1]===js(0x85,0,[['questCount',0]])),'']];
    }});
  cases.push({name:'newgame-elder',state,writes:fresh,request:[0x114,0],frames:600,mash:24,shots:[90],
    check(r){const t=r.trace.find(x=>x[0]===0x114),a=alloc(js(0x114,0));return [['114 resolves to the Elder\'s compiled line',t&&t[1]===a.at,hex(a.at,6)],['its text was read',readsCover(r.reads,a.at,a.end)>=a.length*0.8,'']];}});
}

const only=process.argv.slice(2);
mkdirSync(out,{recursive:true});
let failures=0;
const luaBody=readFileSync(join(here,'story.lua'),'utf8');
const lua=v=>Array.isArray(v)?'{'+v.map(lua).join(',')+'}':typeof v==='string'?JSON.stringify(v):typeof v==='boolean'?String(v):v===null||v===undefined?'nil':String(v);
for(const c of cases){
  if(only.length&&!only.includes(c.name))continue;
  if(c.bundle&&!existsSync(bundle(c.bundle))){console.log(`skip ${c.name}: no bundle ${c.bundle}`);continue;}
  if(c.state&&!existsSync(c.state)){console.log(`skip ${c.name}: no checkpoint ${c.state}`);continue;}
  const info=c.rom==='test'?testInfo():prod,A=info.addr;
  const queries=c.rom==='test'?(c.queries??[]).map(([n,v])=>[queryId(n),v]):[];
  const prelude=`CASE = {bundle=${c.bundle?lua(bundle(c.bundle)):'nil'}, writes=${lua(c.writes)}, before=${lua(c.before??[])}, request=${lua(c.request)}, frames=${c.frames}, mash=${c.mash??0}, shots=${lua(c.shots??[])}, resolve=${info.label('story_resolve_done')}, ram=${A.ram}, persist=${A.persist}, water=${A.water}, dump_water=${!!c.dump_water}, stop_idle=${!!c.stopIdle}, rom_writes=${lua(c.romWrites??[])}, timed=${lua(c.timed??[])}, dump=${lua(c.dump??[])}, log=${c.rom==='test'?A.log:'nil'}, queries=${A.queries}, test_queries=${lua(queries)}, script=${lua(c.script??null)}}\n`;
  const r=await runMesen({rom:info.path,test:prelude+luaBody,outDir:join(out,c.name),state:c.state??null});
  const res=r.results??{};
  if(res.error||!res.trace){console.log(`FAIL ${c.name}: ${res.error??'no results'}\n${r.output.slice(-1500)}`);failures++;continue;}
  writeFileSync(join(out,c.name,'trace.txt'),res.trace.map(([id,p,f])=>`${f} ${hex(id,3)} -> ${hex(p,6)}${alloc(p)?' ['+hex(alloc(p).id,3)+' m'+alloc(p).mask+']':''}`).join('\n'));
  const checks=await c.check(res);
  const ok=checks.every(x=>x[1]);
  if(!ok)failures++;
  console.log(`${ok?'pass':'FAIL'} ${c.name} (${(r.ms/1000).toFixed(1)}s)`);
  for(const [what,pass,detail] of checks)console.log(`   ${pass?'ok  ':'BAD '} ${what}${detail?' — '+detail:''}`);
}
console.log(failures?`${failures} story case(s) failed`:'story: all cases passed');
process.exit(failures?1:0);
