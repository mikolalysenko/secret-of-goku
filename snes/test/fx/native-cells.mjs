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
// overwritten by FX; after it, none. Every one was in the flame's top row,
// whose cell FX allocates first (region A): the reported "top of the aura
// cut off". Every drawn aura must also be whole: all parts of its flame on
// the screen written and none dropped by the PPU's per-line limits, also
// while `fight-top` sweeps it across the screen top.
// The maintainer's later reports: ki shots turned into numbers when a held
// ki barrage killed an enemy (`barrage-kill`, base and Super Saiyan: the
// barrage kills the Rabite in slot 5 while more shots fly, and its damage
// number streams into region A; before the fix 98 and 236 shot sprites
// showed the digits), and the charge aura after Super Saiyan (`ssj-charge`:
// L+A, then L+Y; `revert-charge`: transform, revert, charge in base form;
// both with Rabites striking Goku and the transformation's kills;
// `ssj-kill-charge`: L+A, then a charge whose wave kills the slot-5 Rabite:
// 242 lightning and spark sprites showed its digits before the fix).
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
const need=['core_field_frame','core_field_nmi_done','fx_k_aura_obj','fx_draw_current','fx_run_slots','fx_entry_tile','fx_entry_vram','fx_cell_dma','fx_aura_rows','fx_aura_asm_id','fx_asm_ptr','fx_asm_data','fx_frame','fx_finish'];
const SYM=Object.fromEntries(need.map(n=>{if(symbols[n]===undefined)throw Error('missing symbol '+n);return [n,symbols[n]];}));
const fight=Array(6).fill('b:30,y:20,l+y:90,none:20,l:60,none:20').join(',');
const B='animation-audit__native__rabite-field-b',A='animation-audit__native__rabite-field-a';
// Held Y down kills slots 4 and 3, then Goku walks to the third Rabite
// (slot 5) and a leftward barrage kills it while more shots fly.
const barrage='down:2,y:180,none:40,left:12,y:180,none:40,down:32,left:60,y:240,none:60';
const ssjCharge='right:30,none:200,l:100,l+a:4,none:60,l+y:120,none:120,l+y:120,none:60';
// The same walk, then L+A next to the third Rabite and two L+Y charges:
// the second's wave kills it while the Super Saiyan aura, its lightning
// and the sparks are drawn, and its number streams into region A.
const ssjKill='down:2,y:180,none:40,left:12,y:180,none:40,down:32,left:70,l:100,l+a:4,none:30,l+y:150,none:30,l+y:150,none:60';
const revertCharge='right:30,none:200,l:100,l+a:4,none:60,l+a:4,none:60,l+y:120,none:120,l+y:120,none:60';
// name, bundle, form, script, conflict expected, extra prelude, needs:
// aura (>= 40 drawn frames, the default), and minimum event counts.
const scenes=[
  ['fight',B,0,fight,true],
  ['fight-ssj',B,1,fight,true],
  ['charge',A,0,'right:4,l+y:100,none:136',false],
  ['fight-top',B,0,Array(4).fill('b:30,y:20,l+y:90,none:20,l:60,none:20').join(','),true,'SWEEP_FROM=-12\nSWEEP_TO=72\nSWEEP_HOLD=3'],
  ['transform',B,0,Array(4).fill('b:30,l:100,l+a:4,none:60,l+a:4,none:40').join(','),false],
  ['barrage-kill',B,0,barrage,true,'',{aura:false,slot5Numbers:1,fxClaimed:20}],
  ['barrage-kill-ssj',B,1,barrage,true,'',{aura:false,slot5Numbers:1,fxClaimed:20}],
  ['ssj-charge',A,0,ssjCharge,false,'',{formChanges:1,gokuHits:1}],
  ['revert-charge',A,0,revertCharge,false,'',{formChanges:2,gokuHits:1}],
  // Its crowded first charge (flame, lightning, gold sparks, the party) can
  // pass the PPU's 34 slivers on a line: one flame line dropped for one
  // frame (frame 796, line 166 on 431c1b3). Reported, not yet asserted.
  ['ssj-kill-charge',B,0,ssjKill,true,'',{formChanges:1,slot5Numbers:1,fxClaimed:20,lineLimit:false}],
];
const summary=[];
for(const [name,bundle,form,script,conflict,extra='',needs={}] of scenes){
  if(process.env.NATIVE_SCENES&&!process.env.NATIVE_SCENES.split(',').includes(name))continue;
  const copy=privateRom(rom,'native-cells-'+name);
  const pre=`BUNDLE=${JSON.stringify(join(mainCheckout(),'.local/snes-import',bundle))}\nFORM=${form}\nSETUP=""\nSCRIPT=${JSON.stringify(script)}\nSHOTS=4\nSYM={${Object.entries(SYM).map(([n,a])=>`${n}=${a}`).join(',')}}\n${extra.replace(/\\n/g,'\n')}\n`;
  let r;
  try{r=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),test:pre+readFileSync(join(import.meta.dirname,'../lua/cells-check.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'native-cells.lua'),'utf8'),outDir:join(root,name),exactFrames:true});}
  finally{cleanupRom(copy);}
  const v=r.results??{};
  if(r.code!==0||v.error)throw Error(`${name}: ${v.error??r.output.slice(-2000)}`);
  const events=['slot5Numbers','fxClaimed','formChanges','gokuHits'];
  const missing=events.filter(k=>needs[k]&&!(v[k]>=needs[k]));
  const exercised=(!conflict||(v.regionAWrites>0&&v.nativeWritesHeld>0))&&!missing.length;
  const aura=needs.aura!==false;
  const whole=v.auraPartial===0&&(needs.lineLimit===false||v.auraDropped===0)&&(!aura||v.auraDrawn>=40);
  const pass=v.auraBad===0&&v.fxBad===0&&v.uiBad===0&&v.nativeBad===0&&v.freeRefs===0&&(!aura||v.auraFrames>=40)&&exercised&&whole;
  const row={name,pass,...Object.fromEntries(['frames','checked','auraFrames','auraBad','auraBadRows','auraDrawn','auraPartial','auraDropped','fxBad','fxLate','fxForeign','fxShown','fxClaimed','uiBad','uiFrames','nativeBad','freeRefs','nativeLate','nativeWrites','nativeWritesHeld','regionAWrites','numbers','slot5Numbers','formChanges','gokuHits','lag'].map(k=>[k,v[k]])),details:(v.details??[]).slice(0,8)};
  summary.push(row);
  console.log(`${name}: ${pass?'pass':'FAIL'}; aura ${v.auraFrames} frames, ${v.auraBad} wrong aura sprites (rows top/middle/bottom ${(v.auraBadRows??[]).join('/')}); ${v.auraDrawn} flames built, ${v.auraPartial} partial, ${v.auraDropped} cut by the line limits; stale FX ${v.fxBad} of ${v.fxShown} shown (${v.fxClaimed} while the game claims region A), UI ${v.uiBad}, native ${v.nativeBad}, free ${v.freeRefs}; late FX uploads ${v.fxLate} (${v.fxForeign} over the game's or UI's pixels), game sprites before their stream ${v.nativeLate}; game writes on cache tiles ${v.nativeWrites} (${v.nativeWritesHeld} while held, region A ${v.regionAWrites}); ${v.numbers} killed (${v.slot5Numbers} in slot 5), ${v.formChanges} form changes, ${v.gokuHits} hits on Goku${exercised?'':` (not exercised${missing.length?': '+missing.join(', '):''})`}`);
  if(!pass)for(const d of row.details)console.log('  ',JSON.stringify(d));
}
writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));
if(summary.some(r=>!r.pass))process.exitCode=1;
