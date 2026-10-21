// FX cache cells against the game's actor effect pieces, on the production
// cartridge with real input (fx.md "Native effect cells"). A Rabite-field
// fight puts the game's damage numbers into actor slot 5, whose effect
// pieces are the cache's first region, while Goku charges and focuses; a
// party member's thrown weapon takes slot 2's fifth piece. Every displayed
// FX sprite must show its ROM cell, every UI lease its own upload and every
// native sprite on cache tiles the game's own pixels (snes/test/lua/
// cells-check.lua, shared with ui analyzerCharge). Before the fix the
// `fight` scene showed 620 wrong aura sprites (the game's digits or blank
// cells over the flame) and `fight-ssj` 542, plus 100 native tile-frames
// overwritten by FX; after it, none.
// NATIVE_SCENES filters cases; NATIVE_OUT selects the output directory.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';

const repo=resolve(import.meta.dirname,'../../..');
const rom=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const root=resolve(process.env.NATIVE_OUT??join(repo,'.local/snes-test/fx/native-cells'));
mkdirSync(root,{recursive:true});
const symbols=Object.fromEntries([...readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gmi)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const need=['core_field_frame','core_field_nmi_done','fx_k_aura_obj','fx_draw_current','fx_run_slots','fx_entry_tile','fx_entry_vram','fx_cell_dma'];
const SYM=Object.fromEntries(need.map(n=>{if(symbols[n]===undefined)throw Error('missing symbol '+n);return [n,symbols[n]];}));
const fight=Array(6).fill('b:30,y:20,l+y:90,none:20,l:60,none:20').join(',');
// name, bundle, form, script, conflict expected
const scenes=[
  ['fight','animation-audit__native__rabite-field-b',0,fight,true],
  ['fight-ssj','animation-audit__native__rabite-field-b',1,fight,true],
  ['charge','animation-audit__native__rabite-field-a',0,'right:4,l+y:100,none:136',false],
];
const summary=[];
for(const [name,bundle,form,script,conflict] of scenes){
  if(process.env.NATIVE_SCENES&&!process.env.NATIVE_SCENES.split(',').includes(name))continue;
  const copy=privateRom(rom,'native-cells-'+name);
  const pre=`BUNDLE=${JSON.stringify(join(mainCheckout(),'.local/snes-import',bundle))}\nFORM=${form}\nSETUP=""\nSCRIPT=${JSON.stringify(script)}\nSHOTS=4\nSYM={${Object.entries(SYM).map(([n,a])=>`${n}=${a}`).join(',')}}\n`;
  let r;
  try{r=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),test:pre+readFileSync(join(import.meta.dirname,'../lua/cells-check.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'native-cells.lua'),'utf8'),outDir:join(root,name),exactFrames:true});}
  finally{cleanupRom(copy);}
  const v=r.results??{};
  if(r.code!==0||v.error)throw Error(`${name}: ${v.error??r.output.slice(-2000)}`);
  const exercised=!conflict||(v.regionAWrites>0&&v.nativeWritesHeld>0);
  const pass=v.auraBad===0&&v.fxBad===0&&v.uiBad===0&&v.nativeBad===0&&v.freeRefs===0&&v.auraFrames>=40&&exercised;
  const row={name,pass,...Object.fromEntries(['frames','checked','auraFrames','auraBad','fxBad','fxLate','uiBad','uiFrames','nativeBad','freeRefs','nativeLate','nativeWrites','nativeWritesHeld','regionAWrites','lag'].map(k=>[k,v[k]])),details:(v.details??[]).slice(0,8)};
  summary.push(row);
  console.log(`${name}: ${pass?'pass':'FAIL'}; aura ${v.auraFrames} frames, ${v.auraBad} wrong aura sprites; stale FX ${v.fxBad}, UI ${v.uiBad}, native ${v.nativeBad}, free ${v.freeRefs}; late FX uploads ${v.fxLate}, game sprites before their stream ${v.nativeLate}; game writes on cache tiles ${v.nativeWrites} (${v.nativeWritesHeld} while held, region A ${v.regionAWrites})${exercised?'':' (conflict not exercised)'}`);
  if(!pass)for(const d of row.details)console.log('  ',JSON.stringify(d));
}
writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));
if(summary.some(r=>!r.pass))process.exitCode=1;
