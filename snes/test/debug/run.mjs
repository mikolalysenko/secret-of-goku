#!/usr/bin/env node
// Scene-select tests: every preset is started in Mesen from power-on through
// the title code and the menu, as a player would, and its end state is
// compared with the browser reference (.local/snes-ref/<preset>/: state.json
// and frame-00000.png, from snes/tools/ref-capture.mjs) when present.
//   node snes/test/debug/run.mjs [preset ...] [--jobs=6] [--battery=sram.bin]
// SNES_ROM selects the cartridge (default dist/snes/secret-of-goku.sfc).
// Each preset is FULL when its native state (map, position, flags, party,
// inventory, names, form, Goku and the ledger) equals the browser's, NATIVE
// when every difference is owned by a module not merged here (GAPS),
// PARTIAL otherwise, FAILED when the recipe did not finish. Fails on PARTIAL
// or FAILED. Report: .local/snes-test/debug/report.json.
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom,mainCheckout,mesenSaveDir} from '../checkpoints.mjs';
import {comparePictures,compareState,referenceState} from './compare.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const opt=(n,d)=>{const a=args.find(x=>x.startsWith(`--${n}=`));return a?a.slice(n.length+3):d;};
const rom=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const catalog=JSON.parse(readFileSync(join(repo,'dist/snes/gen/debug/catalog.json'),'utf8'));
const kinds=catalog.presets.map(p=>p.kind);
const only=args.filter(a=>!a.startsWith('--'));
for(const k of only)if(!kinds.includes(k))throw Error(`unknown preset ${k}`);
const list=only.length?only:kinds;
const out=resolve(repo,'.local/snes-test/debug');
const refRoot=join(mainCheckout(),'.local/snes-ref');
mkdirSync(out,{recursive:true});

// SRAM work address from the symbol file (debug_addresses).
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const m=sym.match(/^([0-9A-F]{2}):([0-9A-F]{4}) debug_addresses$/m);
const work=m?parseInt(m[1]+m[2],16):0x317600;

// Differences from the browser that belong to modules not merged on this
// branch ('*' = every preset); each names the browser behaviour behind it.
const GAPS=[
  {preset:'*',key:/^party0\.level$/,owner:'combat',why:'Goku starts at level 99 (mana-mod level and weapon caps)'},
  {preset:'sword',key:/^party0\.hp$/,owner:'combat',why:'999 maximum HP once Goku has arrived'},
  {preset:'rider',key:/^(map|flags|party0\.pos)$/,owner:'frieza',why:'requests 4A3 in room 419 during the palace stage (frieza.js), which leads to Mech Rider III on map 237'},
  {preset:'trial',key:/^(flags|party0\.pos|party[12]\.active)$/,owner:'vegeta',why:'the Time Chamber trial starts with event 3DB and keeps the borrowed party (joch-trial.js)'},
  {preset:'thanatos',key:/^party[12]\.pos$/,owner:'frieza',why:'stages Primm and Popoi in the Thanatos scene'},
  {preset:'good-ending',key:/^(map|party0\.pos)$/,owner:'frieza',why:'FRIEZA_DEFEATED / BEAST_* answers make 42F choose the good ending'},
];
const gapOf=(kind,d)=>GAPS.find(g=>(g.preset==='*'||g.preset===kind)&&g.key.test(d.k));

// Which module owns each hook kind the recipes call (none implemented yet
// on this branch unless a module defines the hook).
const HOOK_OWNER={1:'combat',2:'radio/ui',3:'combat',4:'world',5:'frieza',6:'frieza',7:'frieza/orbit',8:'frieza (Beast challenge)',9:'scene owner',10:'scene owner',11:'combat'};

async function runOne(kind,{battery=opt('battery',null),tag='',romPath=rom}={}){
  const index=kinds.indexOf(kind),p=catalog.presets[index];
  const dir=join(out,kind+tag);
  const lua=readFileSync(join(here,'preset.lua'),'utf8');
  const prelude=`DBG_WORK=${work}\nPRESET=${index}\nMAXF=${kind==='sword'?26000:16000}\nSHOTS={60,240}\n`;
  const copy=privateRom(romPath,`debug-${kind}${tag.replace(/\W/g,'')}`);
  // --battery=<8 KiB original save area>: start with those native saves
  // (GAME FILE becomes the game select's default); they must survive.
  let saves=null;
  if(battery){
    const image=new Uint8Array(0x8000);saves=readFileSync(resolve(battery)).subarray(0,0x2000);image.set(saves);
    writeFileSync(join(mesenSaveDir(),basename(copy).replace(/\.sfc$/,'.srm')),image);
  }
  const r=await runMesen({rom:copy,test:prelude+lua,outDir:dir,timeoutMs:900000});
  cleanupRom(copy);
  const res=r.results??{};
  if(tag==='+hooks')return{kind:kind+tag,res,p};
  if(saves){
    const after=existsSync(join(dir,'sram-saves.bin'))?readFileSync(join(dir,'sram-saves.bin')):null;
    res.savesKept=!!after&&Buffer.compare(Buffer.from(saves),after)===0;
  }
  const report={kind:kind+tag,label:p.label,status:['idle','running','done','failed','aborted'][res.status]??'error',savesKept:res.savesKept,selectCursor:res.select_cursor,
    error:res.error,frames:res.frames,bootFrame:res.boot_frame,state:res.state,trace:res.trace,mesen:r.code};
  if(res.status===3)report.failedOp={op:res.error,pc:res.err_pc?.toString(16)};
  if(res.soft)report.softWaits={count:res.soft,pc:res.soft_pc?.toString(16)};
  // Steps owned by modules that are not merged here (hooks with stubs).
  const kindsUsed=new Set(p.recipe.filter(o=>o[0]==='HOOK').map(o=>parseInt(o[1],16)));
  if(p.recipe.some(o=>o[0]==='UNTIL'&&parseInt(o[3],16)&0x40))kindsUsed.add(9);
  report.moduleSteps=[...kindsUsed].filter(k=>k!==10).map(k=>HOOK_OWNER[k]);
  const refDir=join(refRoot,kind);
  const ref=referenceState(refDir);
  if(ref&&res.state){
    report.diffs=compareState(res.state,ref);
    report.picture=comparePictures(join(refDir,'frame-00000.png'),join(dir,'frame-00000.png'),join(dir,'compare-00000.png'));
    report.picture240=comparePictures(join(refDir,'frame-00240.png'),join(dir,'frame-00240.png'),join(dir,'compare-00240.png'));
    report.refMap=ref.ram[0xdc]|ref.ram[0xdd]<<8;
  }
  const real=(report.diffs??[]).filter(d=>!d.transient);
  for(const d of real){const g=gapOf(kind,d);if(g){d.owner=g.owner;d.why=g.why;}}
  report.gaps=[...new Set(real.filter(d=>d.owner).map(d=>d.owner))];
  report.result=report.status!=='done'||report.savesKept===false?'FAILED':!ref?'DONE (no reference)':!real.length?'FULL':real.every(d=>d.owner)?'NATIVE':'PARTIAL';
  return report;
}

const jobs=Number(opt('jobs','6'));
const reports=[];
// The full run also starts one preset with a battery that holds a native
// save (GAME FILE is then the default) when that private fixture exists.
const SAVE_FIXTURE=join(mainCheckout(),'.local/snes-import/power-flight-fixes__save-3/sram.bin');
const queue=list.map(k=>[k,{}]);
if(!only.length&&!opt('battery',null)&&existsSync(SAVE_FIXTURE))queue.push(['late',{battery:SAVE_FIXTURE,tag:'+saves'}]);
await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{
  while(queue.length){const[k,o]=queue.shift();const r=await runOne(k,o);reports.push(r);console.log(`${r.kind.padEnd(14)} ${r.result.padEnd(8)} map ${r.state?.map} (ref ${r.refMap??'-'}) frames ${r.frames} picture ${r.picture!=null?(r.picture*100).toFixed(0)+'%':'-'}/${r.picture240!=null?(r.picture240*100).toFixed(0)+'%':'-'}${r.diffs?.length?'  diffs: '+r.diffs.map(d=>d.k+(d.owner?'('+d.owner+')':'')).join(','):''}${r.softWaits?'  soft wait at '+r.softWaits.pc:''}${r.failedOp?'  failed op '+r.failedOp.op+' at '+r.failedOp.pc:''}`);}
}));
reports.sort((a,b)=>kinds.indexOf(a.kind.split('+')[0])-kinds.indexOf(b.kind.split('+')[0])||a.kind.length-b.kind.length);
// Controls: wrong and slow codes, Y back to a working title, abort.
let controls=null;
if(!only.length||args.includes('--controls')){
  const copy=privateRom(rom,'debug-controls');
  const r=await runMesen({rom:copy,test:`DBG_WORK=${work}\nLATE=${kinds.indexOf('late')}\n`+readFileSync(join(here,'controls.lua'),'utf8'),outDir:join(out,'controls')});
  cleanupRom(copy);
  const c=r.results??{};
  const want={wrong_code_menu:false,wrong_code_title:true,slow_code_menu:false,code_menu:true,back_to_title:true,patched_again:true,
    start_game_select:true,armed_after_start:false,abort_status:4,abort_title:true};
  controls={ok:r.code===0&&Object.entries(want).every(([k,v])=>c[k]===v),results:c};
  console.log(`controls       ${controls.ok?'pass':'FAIL'}  ${Object.entries(want).map(([k,v])=>`${k}=${c[k]}${c[k]===v?'':' (want '+v+')'}`).join(' ')}`);
}
// Hook contract: a -DDEBUG_TEST build defines !DEBUG_PRESET_HOOK_ANY (logs
// kind, preset, payload) and _BEAST (a SCENE wait answers "not yet" 30
// times). Every HOOK op must reach ANY with the recipe's kind, the preset id
// and its payload's address, in order; SCENE polls must hold the wait.
let hooks=null;
if(!only.length||args.includes('--hooks')){
  const testRom=join(repo,'dist/snes/debug-test.sfc');
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${testRom}`,'-DDEBUG_TEST=1'],{cwd:repo,stdio:'inherit'});
  if(b.status!==0)throw Error('DEBUG_TEST build failed');
  const tsym=readFileSync(testRom.replace(/\.sfc$/,'.sym'),'utf8');
  const addr=label=>{const m=tsym.match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${label}$`,'m'));return m?parseInt(m[2],16):null;};
  hooks={ok:true,cases:[]};
  for(const kind of['late','beast']){
    const {res,p}=await runOne(kind,{tag:'+hooks',romPath:testRom});
    const log=Uint8Array.from((res.hooklog??'').match(/../g)??[],h=>parseInt(h,16));
    const n=log[0]|log[1]<<8,calls=[];
    for(let i=0;i<Math.min(n,63);i++)calls.push({kind:log[2+i*4],preset:log[3+i*4],payload:log[4+i*4]|log[5+i*4]<<8});
    const want=p.recipe.filter(o=>o[0]==='HOOK').map(o=>({kind:parseInt(o[1],16),payload:addr(o[2])}));
    const got=calls.filter(c=>c.kind!==0x09);
    const scene=calls.filter(c=>c.kind===0x09).length;
    const index=kinds.indexOf(kind);
    const ok=res.status===2&&got.length===want.length&&got.every((c,i)=>c.kind===want[i].kind&&c.payload===want[i].payload&&c.preset===index)
      &&(kind!=='beast'||scene>=31);
    hooks.cases.push({kind,ok,calls:got.length,want:want.length,scene});
    hooks.ok&&=ok;
    console.log(`hooks ${kind.padEnd(8)} ${ok?'pass':'FAIL'}  ${got.length}/${want.length} hook calls in order with kind, preset and payload${kind==='beast'?`, ${scene} SCENE polls held the Beast wait`:''}`);
  }
}
writeFileSync(join(out,'report.json'),JSON.stringify({presets:reports,controls,hooks},null,1));
const bad=reports.filter(r=>r.result==='FAILED'||r.result==='PARTIAL');
if(controls&&!controls.ok)bad.push(controls);
if(hooks&&!hooks.ok)bad.push(hooks);
const count=k=>reports.filter(r=>r.result===k).length;
console.log(`\n${count('FULL')} full, ${count('NATIVE')} native (remaining differences owned by: ${[...new Set(reports.flatMap(r=>r.gaps??[]))].join(', ')||'-'}), ${count('PARTIAL')} partial, ${count('FAILED')} failed of ${reports.length}; report ${join(out,'report.json')}`);
process.exit(bad.length?1:0);
