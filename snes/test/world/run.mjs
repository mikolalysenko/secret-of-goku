#!/usr/bin/env node
// WORLD module tests in Mesen (browser-mod states imported with
// H.importSnesJs, plus the shared waterfall checkpoint):
//   sprite    Goku replaces Flammie in Mode 7 flight (OAM, VRAM, palettes,
//             banking, bob, shadow), both forms
//   takeoff   L+R from the field: native $0C00|map path without the summon
//   landing   B over land: no BG3 fly-by, landing pose, ordinary loader
//   ki        aerial ki shots, charge, Fortress shield deflection
//   fortress  full Super Saiyan wave: destruction, cutaway, deck landing
//   scars     town craters in the 7F ring and the Mode 7 tilemap, persistence
//   dock      docking approach: ki boost, curve into the Fortress, deck
//   node snes/test/world/run.mjs [test ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/world/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/world');
mkdirSync(outRoot,{recursive:true});
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc)){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${romSrc}`],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('world: build failed');process.exit(1);}
}
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('world: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
function prelude(rom){
  const sym={};
  for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
    const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) ((?:world|goku)_\w+)$/i);
    if(m)sym[m[3]]=parseInt(m[1]+m[2],16);
  }
  return `SYM={${Object.entries(sym).map(([k,v])=>`${k}=0x${v.toString(16)}`).join(',')}}\nIMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
}
const tests=['sprite','takeoff','landing','ki','wave','fortress','scars','dock','item'].filter(t=>existsSync(join(here,`${t}.lua`))&&want(t));
const summary=[];
for(const t of tests){
  const rom=privateRom(romSrc,`world-${t}`);
  const t0=Date.now();
  const r=await runMesen({rom,test:prelude(romSrc)+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const fails=Object.entries(res).filter(([,v])=>typeof v==='string'&&v.startsWith('FAIL'));
  const ok=r.code===0&&!res.error&&res.failures===0;
  summary.push({test:t,ok,seconds:((Date.now()-t0)/1000).toFixed(1),fails:fails.map(([k,v])=>`${k}: ${v}`),error:res.error});
  console.log(`world ${t.padEnd(10)} ${ok?'pass':'FAIL'} (${((Date.now()-t0)/1000).toFixed(1)} s)`);
  for(const[k,v]of fails)console.log(`   ${k}: ${v}`);
  if(res.error)console.log('   error:',res.error);
  if(!ok&&r.code!==0&&!res.error)console.log(r.output.slice(-1500));
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
process.exit(summary.every(s=>s.ok)?0:1);
