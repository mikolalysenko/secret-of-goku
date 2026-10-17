#!/usr/bin/env node
// Scene-select tests: every preset is started in Mesen from power-on through
// the title code and the menu, as a player would, and its end state is
// compared with the browser reference (.local/snes-ref/<preset>/: state.json
// and frame-00000.png, from snes/tools/ref-capture.mjs) when present.
//   node snes/test/debug/run.mjs [preset ...] [--jobs=6]
// SNES_ROM selects the cartridge (default dist/snes/secret-of-goku.sfc).
// Fails when a preset does not finish its recipe, or ends on another map
// than the reference. Everything else is reported per preset (FULL when the
// native state equals the browser's, PARTIAL with the differences
// otherwise) in .local/snes-test/debug/report.json.
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
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

// Which module owns each hook kind the recipes call (none implemented yet
// on this branch unless a module defines the hook).
const HOOK_OWNER={1:'combat',2:'radio/ui',3:'combat',4:'world',5:'frieza',6:'frieza',7:'frieza/orbit',8:'frieza (Beast challenge)',9:'scene owner',10:'scene owner',11:'combat'};

async function runOne(kind){
  const index=kinds.indexOf(kind),p=catalog.presets[index];
  const dir=join(out,kind);
  const lua=readFileSync(join(here,'preset.lua'),'utf8');
  const prelude=`DBG_WORK=${work}\nPRESET=${index}\nMAXF=${kind==='sword'?26000:16000}\nSHOTS={60,240}\n`;
  const copy=privateRom(rom,`debug-${kind}`);
  const r=await runMesen({rom:copy,test:prelude+lua,outDir:dir,timeoutMs:900000});
  cleanupRom(copy);
  const res=r.results??{};
  const report={kind,label:p.label,status:['idle','running','done','failed','aborted'][res.status]??'error',
    error:res.error,frames:res.frames,bootFrame:res.boot_frame,state:res.state,trace:res.trace,mesen:r.code};
  if(res.status===3)report.failedOp={op:res.error,pc:res.err_pc?.toString(16)};
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
  report.result=report.status!=='done'?'FAILED':!ref?'DONE (no reference)':report.diffs.length?'PARTIAL':'FULL';
  return report;
}

const jobs=Number(opt('jobs','6'));
const reports=[];
const queue=[...list];
await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{
  while(queue.length){const k=queue.shift();const r=await runOne(k);reports.push(r);console.log(`${k.padEnd(12)} ${r.result.padEnd(8)} map ${r.state?.map} (ref ${r.refMap??'-'}) frames ${r.frames} picture ${r.picture!=null?(r.picture*100).toFixed(0)+'%':'-'}${r.diffs?.length?'  diffs: '+r.diffs.map(d=>d.k).join(','):''}${r.failedOp?'  failed op '+r.failedOp.op+' at '+r.failedOp.pc:''}`);}
}));
reports.sort((a,b)=>kinds.indexOf(a.kind)-kinds.indexOf(b.kind));
writeFileSync(join(out,'report.json'),JSON.stringify(reports,null,1));
const bad=reports.filter(r=>r.status!=='done'||(r.refMap!==undefined&&r.state?.map!==r.refMap));
console.log(`\n${reports.filter(r=>r.result==='FULL').length} full, ${reports.filter(r=>r.result==='PARTIAL').length} partial, ${reports.filter(r=>r.result==='FAILED').length} failed of ${reports.length}; report ${join(out,'report.json')}`);
process.exit(bad.length?1:0);
