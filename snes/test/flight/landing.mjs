#!/usr/bin/env node
// Differential Instant Transmission check: for imported browser-mod states,
// the cartridge (FLIGHT_TEST build, Mesen) answers findLanding() for a grid
// of targets (both layers, terrain from the floor below, every seventh one
// airborne like Frieza) and origins on each side; engine/native-teleport.js
// answers the same queries on the same WRAM with the browser's own
// collision (engine/native-local-flight.js). Every landing must agree:
// found or not, position, terrain, facing and hover.
//   node snes/test/flight/landing.mjs [bundle ...] [--rom=path]
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,privateRom,cleanupRom} from '../checkpoints.mjs';
import {DEFAULT_BUNDLES} from './classify.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export const LANDING_BUNDLES=[
  'animation-audit__native__rabite-field-b',// 130 river field (the teleport spec)
  ...DEFAULT_BUNDLES.filter(n=>!n.includes('beast-fed')),
];

export async function landings({bundles,rom,outRoot}){
  const {createNativeLocalFlight}=await import(pathToFileURL(resolve(repo,'engine/native-local-flight.js')).href);
  const {createNativeTeleport}=await import(pathToFileURL(resolve(repo,'engine/native-teleport.js')).href);
  const base=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  const importRoot=join(mainCheckout(),'.local/snes-import');
  const lua=readFileSync(join(here,'landing.lua'),'utf8');
  const results=[];
  for(const name of bundles){
    const dir=join(importRoot,name);
    if(!existsSync(join(dir,'wram.bin'))){results.push({name,skipped:true});continue;}
    const outDir=join(outRoot,name);mkdirSync(outDir,{recursive:true});
    const cart=privateRom(rom,'flight-landing');
    const r=await runMesen({rom:cart,test:`BUNDLE=${JSON.stringify(dir)}\n`+lua,outDir,timeoutMs:900000});
    cleanupRom(cart);
    if(!r.results?.pass){results.push({name,error:r.results?.error??r.output.slice(-400)});continue;}
    const wram=new Uint8Array(readFileSync(join(outDir,'wram.bin'))),after=new Uint8Array(readFileSync(join(outDir,'wram_end.bin')));
    let moved=0;for(let a=0x10000;a<0x18000;a++)if(wram[a]!==after[a])moved++;
    for(let a=0x1b800;a<0x1c000;a++)if(wram[a]!==after[a])moved++;
    const snes={ram:wram,cart:{data:base},cpu:{r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}},frames:1,ppu:{mode:wram[0x29]&7}};
    const h=createNativeLocalFlight(snes,{active:()=>true,phase:true});
    const t=createNativeTeleport(snes,{options:{enabled:true},write16(){}},h);
    const qs=JSON.parse(readFileSync(join(outDir,'landing.json'),'utf8'));
    let bad=0,found=0;const examples=[];
    for(const q of qs){
      const e=t.findLanding({x:q.x,y:q.y,terrain:q.t,custom:q.air?'frieza':undefined},{x:q.ox,y:q.oy});
      const js=e?{found:true,lx:e.x,ly:e.y,lt:e.terrain,facing:e.facing,hover:!!e.air}:{found:false};
      const cart=q.found?{found:true,lx:q.lx,ly:q.ly,lt:q.lt,facing:q.facing,hover:!!q.hover}:{found:false};
      if(js.found)found++;
      if(JSON.stringify(js)!==JSON.stringify(cart)){bad++;if(examples.length<8)examples.push({q:{x:q.x,y:q.y,ox:q.ox,oy:q.oy,t:q.t,air:q.air},js,cart});}
    }
    t.dispose();h.dispose();
    results.push({name,map:r.results.map,queries:qs.length,found,bad,examples,moved,ms:r.ms});
  }
  return results;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const rom=resolve(args.find(a=>a.startsWith('--rom='))?.slice(6)??resolve(repo,'.local/snes-test/roms/flight-test.sfc'));
  if(!args.some(a=>a.startsWith('--rom='))){
    const b=spawnSync(process.execPath,[resolve(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${rom}`,'-DFLIGHT_TEST=1'],{cwd:repo,stdio:'inherit'});
    if(b.status!==0)process.exit(1);
  }
  let bundles=args.filter(a=>!a.startsWith('--'));
  if(!bundles.length)bundles=LANDING_BUNDLES;
  const results=await landings({bundles,rom,outRoot:resolve(repo,'.local/snes-test/flight/landing')});
  let fail=0;
  for(const r of results){
    if(r.skipped){console.log(`${r.name}: skipped (no bundle)`);continue;}
    if(r.error){fail++;console.log(`${r.name}: ERROR ${r.error}`);continue;}
    if(r.bad||r.moved)fail++;
    console.log(`${r.name.padEnd(44)} map ${String(r.map).padStart(3)} queries ${String(r.queries).padStart(5)} landings ${String(r.found).padStart(5)}  mismatches ${r.bad}${r.moved?` (map changed: ${r.moved})`:''} ${r.ms}ms`);
    for(const e of r.examples.slice(0,r.bad?5:0))console.log('   ',JSON.stringify(e));
  }
  process.exit(fail?1:0);
}
