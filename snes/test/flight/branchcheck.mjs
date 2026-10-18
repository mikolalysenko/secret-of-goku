#!/usr/bin/env node
// Static check for the flight module's patch sites: no traced branch, jump or
// call of the original game lands strictly inside a replaced byte range (a
// target there would execute half of our JML). Uses the coverage trace
// (snes/tools/trace.mjs, $SNES_ANALYSIS/coverage.bin) for instruction starts
// and M/X widths.
//   node snes/test/flight/branchcheck.mjs            (ranges from the last build)
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decode,hiromToPc} from '../../tools/w65816.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export function checkBranches(ranges){
  const rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  const covPath=resolve(process.env.SNES_ANALYSIS??resolve(repo,'dist/snes/analysis'),'coverage.bin');
  if(!existsSync(covPath))return {skipped:'no coverage trace'};
  const cov=new Uint8Array(readFileSync(covPath));
  const read=a=>{const o=hiromToPc(a);return o>=0&&o<rom.length?rom[o]:0;};
  const problems=[];
  for(let off=0;off<0x200000;off++){
    const c=cov[off];if(!(c&1))continue;
    const m=(c&6)===4?false:true,x=(c&24)===16?false:true;
    const pc=0xc00000+off,d=decode(read,pc,m,x);
    if(d.target===null)continue;
    // Bank 00/01 mirrors: compare by ROM offset.
    const t=hiromToPc(d.target);
    if(t<0)continue;
    for(const r of ranges){
      const start=hiromToPc(r.addr),end=start+r.len;
      if(t>start&&t<end)problems.push(`${pc.toString(16)} ${d.name} -> ${d.target.toString(16)} inside ${r.module} patch ${r.addr.toString(16)}+${r.len}`);
    }
  }
  return {problems};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  // Ranges from the build's own hijack bookkeeping (%hijack / %patch).
  const {build}=await import('../../build.mjs');
  const {hijacks}=await build();
  const ranges=hijacks.map(h=>({addr:h.addr,len:h.len,module:h.mod}));
  const r=checkBranches(ranges);
  if(r.skipped){console.log('branchcheck skipped:',r.skipped);process.exit(0);}
  for(const p of r.problems)console.log(p);
  console.log(`branchcheck: ${ranges.length} patch ranges, ${r.problems.length} problems`);
  process.exit(r.problems.length?1:0);
}
