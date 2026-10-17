#!/usr/bin/env node
// FX module tests in Mesen. Builds an FX_TEST cartridge (the test mailbox
// in snes/test/fx/testmod.asm drives the public API like a client module),
// imports browser-mod scenes with H.importSnesJs and checks/screenshots the
// effects:
//   gallery  every OBJ kind at fixed screen points, several ages (Potos)
//   beams    charge orb at Goku's palm, Kamehameha in four directions,
//            ki shots, impacts, transformation ring + flash + quake
//   battle   effects over the Frieza arena (preset__battle)
//   budget   frame-logic end line and NMI end with heavy effects
//   node snes/test/fx/run.mjs [test ...]
// Outputs: .local/snes-test/fx/<test>/ (results.json, screenshots).
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const outRoot=resolve(repo,'.local/snes-test/fx');
mkdirSync(outRoot,{recursive:true});
const testRom=resolve(repo,'.local/snes-test/roms/fx-test.sfc');
const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${testRom}`,'-DFX_TEST=1'],{cwd:repo,stdio:'inherit'});
if(b.status!==0){console.error('fx: FX_TEST build failed');process.exit(1);}
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('fx: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
function prelude(rom){
  const sym={};
  for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
    const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (fx_\w+)$/i);
    if(m)sym[m[3]]=parseInt(m[1]+m[2],16);
  }
  return `SYM={${Object.entries(sym).map(([k,v])=>`${k}=0x${v.toString(16)}`).join(',')}}\nFX_IMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
}
const tests=['gallery','beams','battle','budget'].filter(t=>existsSync(join(here,`${t}.lua`))&&(!only.length||only.includes(t)));
let ok=true;
for(const t of tests){
  const rom=privateRom(testRom,`fx-${t}`);
  const t0=Date.now();
  const r=await runMesen({rom,test:prelude(testRom)+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const fails=Object.entries(res).filter(([k,v])=>typeof v==='string'&&v.startsWith('FAIL'));
  const pass=r.code===0&&!res.error&&res.failures===0;
  if(!pass)ok=false;
  console.log(`fx ${t.padEnd(10)} ${pass?'pass':'FAIL'} (${((Date.now()-t0)/1000).toFixed(1)} s)${res.error?' error: '+res.error:''}`);
  for(const [k,v] of fails)console.log(`   ${k}: ${v}`);
}
process.exit(ok?0:1);
