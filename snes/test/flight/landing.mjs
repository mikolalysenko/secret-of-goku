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

// ceiling-escape.js roofColors() over a palette (CGRAM 0-127)
export function roofColors(cgram){
  const light=c=>(c&31)+((c>>5)&31)+((c>>10)&31);
  const colors=[...new Set(cgram.slice(0,128).map(c=>c&0x7fff))].filter(c=>{
    const r=c&31,g=c>>5&31,b=c>>10&31;
    return light(c)>18&&light(c)<75&&(Math.max(r,g,b)-Math.min(r,g,b)<=8||r>=g&&g>=b&&r-g<12&&g-b<12);
  }).sort((a,b)=>light(a)-light(b));
  return[0,colors[Math.floor(colors.length*.4)]??0x294a,colors[Math.floor(colors.length*.8)]??0x4631];
}

export async function landings({bundles,rom,outRoot}){
  const {createNativeLocalFlight}=await import(pathToFileURL(resolve(repo,'engine/native-local-flight.js')).href);
  const {createNativeTeleport}=await import(pathToFileURL(resolve(repo,'engine/native-teleport.js')).href);
  const base=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  const importRoot=join(mainCheckout(),'.local/snes-import');
  const lua=readFileSync(join(here,'landing.lua'),'utf8');
  // opening exits (native-local-flight.js), from the module's own source
  const src=readFileSync(resolve(repo,'engine/native-local-flight.js'),'utf8');
  const openingExits=Function(`return ${src.match(/const openingExits=(\{[\s\S]*?\n\});/)[1]}`)();
  const exitList=Object.entries(openingExits).flatMap(([map,list])=>list.map(e=>({map:Number(map),x:e.x,y:e.y,n:e.n})));
  const exitsLua=`{${exitList.map(e=>`{map=${e.map},x=${e.x},y=${e.y},n=${e.n}}`).join(',')}}`;
  const results=[];
  for(const name of bundles){
    const dir=join(importRoot,name);
    if(!existsSync(join(dir,'wram.bin'))){results.push({name,skipped:true});continue;}
    const outDir=join(outRoot,name);mkdirSync(outDir,{recursive:true});
    const cart=privateRom(rom,'flight-landing');
    const r=await runMesen({rom:cart,test:`BUNDLE=${JSON.stringify(dir)}\nEXITS=${exitsLua}\n`+lua,outDir,timeoutMs:900000});
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
    // flightExit() through the browser's own C0:D84C hook on the same WRAM:
    // the hero's position and velocity set, Y = the destination's idx; the
    // hook replaces Y with the exit's marker
    const ex=JSON.parse(readFileSync(join(outDir,'exits.json'),'utf8'));
    let exitBad=0,exitHits=0;
    if(ex.length){
      const ram=new Uint8Array(wram);
      const cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}};
      const snes2={ram,cart:{data:base},cpu,frames:1,ppu:{mode:ram[0x29]&7}};
      // eligible() is the hook's business (checked before fl_flight_exit on
      // the cartridge): make the copy's hero eligible; flightExit() reads none
      // of these fields
      ram.set([0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0],0x100);
      for(const a of[0xd0,0xff,0xe008,0xe00a,0xe01c,0xe060,0xe011])ram[a]=0;
      ram[0xec]&=1;ram[0xed]&=~0x40;ram[0xe190]&=~0x70;ram[0xe191]&=~0xd7;ram[0xe000]|=1;ram[0xe02c]|=1;
      const h2=createNativeLocalFlight(snes2,{active:()=>true,phase:true});
      for(const q of ex){
        ram[0xe002]=q.x&255;ram[0xe003]=q.x>>8;ram[0xe004]=q.y&255;ram[0xe005]=q.y>>8;
        ram[0x1e]=q.vel&255;ram[0x1f]=q.vel>>8;ram[0x10]=0;ram[0x11]=0;
        cpu.br[4]=0xd84c;cpu.r[1]=0;cpu.cyclesLeft=0;cpu.br[2]=0x1234;
        cpu.cycle.call(cpu);
        const js=cpu.br[2]===0x1234?-1:cpu.br[2];
        if(js>=0)exitHits++;
        if(js!==q.exit){exitBad++;if(examples.length<8)examples.push({exit:{q,js}});}
      }
      h2.dispose();
    }
    bad+=exitBad;
    // roofColors() (ceiling-escape.js) on the palette the cartridge read
    const roof=JSON.parse(readFileSync(join(outDir,'roof.json'),'utf8'));
    const want=roofColors(roof.palette);
    const roofOk=!roof.stable||(want[1]===roof.stone&&want[2]===roof.highlight);
    if(!roofOk)examples.push({roof:{js:want.slice(1),cart:[roof.stone,roof.highlight]}});
    results.push({name,map:r.results.map,queries:qs.length,found,bad:bad+(roofOk?0:1),examples,moved,ms:r.ms,roof:[roof.stone,roof.highlight],roofStable:roof.stable,exits:ex.length,exitHits});
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
    console.log(`${r.name.padEnd(44)} map ${String(r.map).padStart(3)} queries ${String(r.queries).padStart(5)} landings ${String(r.found).padStart(5)}  mismatches ${r.bad}${r.moved?` (map changed: ${r.moved})`:''} roof ${r.roof.map(c=>c.toString(16).padStart(4,'0')).join('/')}${r.roofStable?'':' (palette animated)'}${r.exits?` exits ${r.exits} (${r.exitHits} caught)`:''} ${r.ms}ms`);
    for(const e of r.examples.slice(0,r.bad?5:0))console.log('   ',JSON.stringify(e));
  }
  process.exit(fail?1:0);
}
