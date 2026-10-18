// Power-on sensitivity (`run.mjs --power-on[=presets] [--bisect]`): real
// WRAM and battery RAM power up holding leftovers, so code that reads RAM it
// never wrote behaves differently on every console. Each preset runs on one
// core (snes9x by default: fast) from zeroed RAM and again with seeded noise
// in WRAM or in battery RAM; any change in the recipe trace, the end state
// or the pictures means something read memory before writing it. --bisect
// then narrows each sensitive case down to single bytes by filling ranges
// with noise over zeroed RAM (the reader is native when the original
// cartridge reads the same byte; snes/tools/disasm.mjs and a Mesen watch on
// the byte find the code).
import {readFileSync,existsSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {playPreset,maxFramesOf} from './presets.mjs';

// `pattern` is what the bisection writes into a range: the same bytes the
// whole-memory fill put there (the host's noise is position-stable).
export const FILLS=[
  {name:'zero',sram:'zero',wramInit:'zero'},
  {name:'wram-noise-a',sram:'zero',wramInit:'noise:2026',mem:'wram',pattern:{seed:2026,absolute:true}},
  {name:'wram-noise-b',sram:'zero',wramInit:'noise:77',mem:'wram',pattern:{seed:77,absolute:true}},
  {name:'wram-ff',sram:'zero',wramInit:'ff',mem:'wram',pattern:{value:0xFF}},
  {name:'sram-noise',sram:'noise:1993',wramInit:'zero',mem:'sram',pattern:{seed:1993,absolute:true}},
];
const picHash=(dir,name)=>existsSync(join(dir,name))?createHash('sha1').update(readFileSync(join(dir,name))).digest('hex').slice(0,12):null;

// What a run is judged by: timing of every recipe step, the end state, and
// the three pictures (exact PNG bytes; same core, so equal means equal).
export function signature(res,dir){
  return {status:res?.status,wall:res?.wall_frames,trace:res?.trace??[],state:res?.state??null,
    pics:['frame-00000+0.png','frame-00060+0.png','frame-00240+0.png'].map(n=>picHash(dir,n))};
}
export function sigDiffs(a,b){
  const d=[];
  if(a.status!==b.status)d.push(`status ${a.status}/${b.status}`);
  if(a.wall!==b.wall)d.push(`wall frames ${a.wall}/${b.wall}`);
  const ti=a.trace.findIndex((t,i)=>t!==b.trace[i]);
  if(ti>=0||a.trace.length!==b.trace.length)d.push(`trace from step ${ti<0?a.trace.length:ti}: ${a.trace[ti]??'-'} / ${b.trace[ti]??'-'}`);
  const flat=(o,p='')=>o?Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?flat(v,`${p}${k}.`):[[`${p}${k}`,v]]):[];
  const sb=new Map(flat(b.state));
  for(const [k,v] of flat(a.state))if(sb.get(k)!==v)d.push(`state ${k}`);
  a.pics.forEach((h,i)=>{if(h!==b.pics[i])d.push(`picture +${[0,60,240][i]}`);});
  return d;
}

// Runs preset `kind` with `fill` and optional extra writes at frame 0.
export async function presetRun(startHost,{kind,index,work,fill,writes=[],out}){
  rmSync(out,{recursive:true,force:true});
  mkdirSync(out,{recursive:true});
  const h=await startHost({out,sram:fill.sram,wramInit:fill.wramInit});
  try{
    for(const w of writes)await h.step({op:'fill',...w});
    const res=await playPreset(h,{index,work,maxFrames:maxFramesOf(kind)});
    return {res,sig:signature(res,out)};
  }finally{await h.close().catch(()=>{});}
}

// Bytes of `mem` whose power-on value changes the preset: zeroed RAM with
// the sensitive fill's own bytes in a range (`pattern`), halved until the
// change stays with single bytes.
export async function bisect(startHost,{kind,index,work,mem,size,base,pattern,out,log=()=>{}}){
  const fill={name:'zero',sram:'zero',wramInit:'zero'};
  const found=[];
  let runs=0;
  const changed=async(lo,hi)=>{
    runs++;
    const r=await presetRun(startHost,{kind,index,work,fill,out,writes:[{mem,addr:lo,len:hi-lo,...pattern}]});
    const d=sigDiffs(base,r.sig);
    return d.length?d:null;
  };
  const search=async(lo,hi,known)=>{
    const d=known??await changed(lo,hi);
    if(!d)return;
    if(hi-lo<=1){found.push({addr:lo,effects:d});log(`  ${mem} +${lo.toString(16)} matters: ${d.slice(0,3).join('; ')}`);return;}
    const mid=(lo+hi)>>1;
    const a=await changed(lo,mid),b=await changed(mid,hi);
    if(!a&&!b){found.push({range:[lo,hi],effects:d,together:true});log(`  ${mem} ${lo.toString(16)}-${hi.toString(16)} matters only as a whole`);return;}
    if(a)await search(lo,mid,a);
    if(b)await search(mid,hi,b);
  };
  await search(0,size);
  return {mem,found,runs};
}
