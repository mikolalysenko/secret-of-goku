// Real L input in imported field scenes. The oracle uses the browser's
// canAttack getter and drawKiAura strobe, independently of combat's cb_can
// and FX's request/renderer gates. --record keeps a failing baseline.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {hiromToPc} from '../../tools/w65816.mjs';
import {drawKiAura} from '../../../engine/ki-aura.js';

const repo=resolve(import.meta.dirname,'../../..');
const rom=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const root=resolve(process.env.FOCUS_OUT??join(repo,'.local/snes-test/fx/focus-scenes'));
mkdirSync(root,{recursive:true});
const symbols=Object.fromEntries([...readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gmi)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const bytes=readFileSync(rom),at=n=>hiromToPc(symbols[n],bytes.length);
const cells=new Set(),base=bytes.readUInt16LE(at('fx_aura_asm_id'));
for(let i=0;i<12;i++){
  const p=at('fx_asm_data')+bytes.readUInt16LE(at('fx_asm_ptr')+(base+i)*2);
  for(let c=0;c<bytes[p+1];c++)cells.add(bytes.readUInt16LE(p+6+c*2)&511);
}
const context={window:{}};
vm.runInNewContext(readFileSync(join(repo,'engine/mana-mod.js'),'utf8'),context);
const canAttack=Object.getOwnPropertyDescriptor(context.window.ManaMod.prototype,'canAttack').get;
const effects={'charge-orb':[[1,2,3,4,5]],'gold-arc':[[1,2,3,4,5]]};
const scenes=[
  ['potos','barrier-audit__potos-probe'],
  ['south-potos-walk','animation-audit__native__south-potos',0,1],
  ['rabite-ssj','animation-audit__native__rabite-field-a',1],
  ['rabite-scouter','animation-audit__native__rabite-field-b',0,1,1],
  ['waterfall','danger-progress__waterfall'],
  ['waterfall-scouter','danger-progress__waterfall',0,0,1],
  ['water-flight','danger-progress__waterfall',0,0,0,'a+right:30,none:10'],
  ['cave-room','readme-variety-probe__cave-room'],
  ['cave-wide-ssj','readme-variety-probe__cave-wide',1,1],
  ['cave-stairs','readme-variety-probe__cave-stairs'],
  ['boss-111-dialogue','barrier-audit__bosses__111-0-state'],
  ['boss-60-dialogue','barrier-audit__bosses__60-0-state',1],
  ['boss-488','barrier-audit__bosses__488-0-state'],
  ['buffy','preset__buffy'],
  ['slime','preset__slime'],
  ['late-town','preset__late'],
  ['sandship-wreck','sandship-wreck__final__wreck'],
  ['potos-ring','barrier-audit__potos-probe',0,0,0,'x:4,none:50'],
];
const summary=[];
for(const [name,bundle,form=0,walk=0,scouter=0,setup=''] of scenes){
  if(process.env.FOCUS_SCENES&&!process.env.FOCUS_SCENES.split(',').includes(name))continue;
  const copy=privateRom(rom,'focus-'+name);
  const pre=`BUNDLE=${JSON.stringify(join(repo,'.local/snes-import',bundle))}\nFORM=${form}\nWALK=${walk}\nSCOUTER=${scouter}\nWRECK=${name==='sandship-wreck'}\nSETUP=${JSON.stringify(setup)}\nSYM={${Object.entries(symbols).filter(([n])=>['fx_frame','fx_finish','fx_k_aura_obj','fx_entry_tile','fx_class_palettes','ui_sc_draw_frame'].includes(n)).map(([n,a])=>`${n}=${a}`).join(',')}}\nAURA_CELLS={${[...cells].map(c=>`[${c}]=true`).join(',')}}\n`;
  let result;
  try{result=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),test:pre+readFileSync(join(import.meta.dirname,'focus-scenes.lua'),'utf8'),outDir:join(root,name),exactFrames:true});}
  finally{cleanupRom(copy);}
  if(result.code!==0||!result.results||result.results.error)throw Error(`${name}: ${result.results?.error??result.output}`);
  const rows=result.results.rows;
  let expected=0,drawn=0,requested=0,wrongPalette=0,misses=0,maxRun=0,run=0,lateMisses=0;
  for(const r of rows){
    const ram=r.ram,read8=a=>ram[String(a)]??0;
    const can=canAttack.call({gokuActive:true,nativeField:true,menuActive:!!r.menu,nativeHurt:r.pose>=0x8c&&r.pose<=0x8f,read8});
    // Focus is established by real input, not injected into action RAM.
    // Other native/input locks legitimately own L until released.
    const focusing=r.act===24,charging=r.charging!==0,powering=r.act===21||r.act===22;
    let power=focusing?.25+.45*r.power/96:charging?.15+.4*r.charge/90:powering?1:0;
    let pixels=0;
    if(can&&(focusing||charging||powering))drawKiAura(effects,0,0,r.clock,()=>pixels++,{power,clock:r.clock});
    if(!pixels)continue;
    expected++;if(r.request)requested++;
    if(r.sprites>=6&&r.palette&&!r.auraOverflow){drawn++;run=0;}
    else{misses++;run++;maxRun=Math.max(maxRun,run);if(expected>1)lateMisses++;}
    if(r.sprites&& !r.palette)wrongPalette++;
  }
  const locked=name.endsWith('-dialogue')||name.endsWith('-ring');
  const pass=(locked?expected===0&&rows.every(r=>!r.request):expected>=20&&misses<=1&&maxRun<=1&&lateMisses===0)
    &&wrongPalette===0&&result.results.unsafe===0&&result.results.auraOverflowFrames===0
    &&(!scouter||result.results.scouterFrames>0)
    &&(name!=='waterfall-scouter'||result.results.readoutFrames>0)
    &&(name!=='water-flight'||result.results.flightFrames>0);
  const row={name,pass,expected,drawn,requested,misses,maxRun,lateMisses,wrongPalette,...Object.fromEntries(['heldFrames','lag','unsafe','overflows','maxSprites','maxSlivers','auraOverflowFrames','fxMean','fxMax','flightFrames','scouterFrames','readoutFrames'].map(k=>[k,result.results[k]]))};
  summary.push(row);console.log(`${name}: ${drawn}/${expected} drawn; ${requested} requested; ${wrongPalette} palette; ${row.lag} lag; ${pass?'pass':'FAIL'}`);
}
writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));
if(!process.argv.includes('--record')&&summary.some(r=>!r.pass))process.exitCode=1;
