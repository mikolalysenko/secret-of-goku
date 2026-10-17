#!/usr/bin/env node
// Differential terrain check: for imported browser-mod states, every tile of
// both layers is classified by the cartridge (FLIGHT_TEST build, Mesen) and
// by the browser's own engine/native-local-flight.js on the same WRAM:
// canFly and canLand (terrains 0-3) at the tile centre and lowObstacle.
//   node snes/test/flight/classify.mjs [bundle ...] [--all] [--rom=path]
// Without bundles, a fixed set covering towns, forests, caves, palaces,
// castles, the Sandship, the Fortress and the Mana Beast is used.
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,privateRom,cleanupRom} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export const DEFAULT_BUNDLES=[
  'barrier-audit__potos-flight-probe',      // 131 Potos (village)
  'animation-audit__native__rabite-field-a',// 129 woodland path
  'arrival-research__arrival-complete-state',// 128 waterfall
  'ending-fix__bee-last',                   // 25 Gaia's Navel exterior (forest, long banks)
  'ending-fix__vine',                       // 28 Haunted Forest
  'barrier-audit__bosses__143-1-state',     // 139 Water Palace
  'power-flight-fixes__native-284',         // 284 Gaia's Navel (cave)
  'power-flight-fixes__native-285',         // 285
  'readme-variety-probe__cave-stairs',      // 286
  'tree-presentation__gaia-open',           // 73
  'barrier-audit__route-probe-72-state',    // 72 Joch's room
  'kamehameha-voice__orb-before',           // 291 Earth Palace
  'kamehameha-voice__gap-before',           // 313 Earth Palace
  'power-flight-fixes__native-302',         // 302 Witch castle
  'barrier-audit__ship-continuation-state', // 99 Sandship deck
  'snes-ref__buffy__state',                 // 244 Fortress
  'fortress-boss-fix__attack-state',        // 250 Fortress
  'danger-progress__beast-normal',          // 255 Fortress deck
  'danger-progress__beast-fed-real',        // 253 Mana Beast (Mode 7)
  'ssj-update__ntr-position',               // 402 Northtown ruins
  'barrier-audit__tree-continuation-state', // 198 Pure Land
  'tree-presentation__staging-core',        // 195 Lost Continent
  'ending-fix__end-42',                     // 146
  'ending-fix__end-73',                     // 103
  'readme-variety-probe__desert',           // 67 desert
  'juice-research__plants__layer2-before',  // 432
  'frieza__wall-after',                     // 345 Fire Palace
];

export const SHIP_AIR=[98,99,270,271,318,319,324,339,91];
export function expected(wram,rom,createNativeLocalFlight){
  const snes={ram:wram,cart:{data:rom},cpu:{r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}},frames:1,ppu:{mode:wram[0x29]&7}};
  // the Sandship's openAir (sandship.js: ship maps and the dunes), as lab.js wires it
  const map=wram[0xdc]|wram[0xdd]<<8;
  const h=createNativeLocalFlight(snes,{active:()=>true,phase:true,openAir:()=>SHIP_AIR.includes(map)});
  const W=Math.min(128,(wram[0xc0]|wram[0xc1]<<8)>>4),H=Math.min(128,(wram[0xc2]|wram[0xc3]<<8)>>4);
  const out=new Uint8Array(2*H*128);
  for(let l=0;l<2;l++)for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++){
    const x=tx*16+8,y=ty*16+8;let b=0x80;
    if(h.canFly(x,y,l))b|=1;
    for(let T=0;T<4;T++)if(h.canLand(x,y,l,T))b|=2<<T;
    const t=h.tileAt(x,y,l);if(t&&h.lowObstacle(t))b|=0x20;
    out[(l*H+ty)*128+tx]=b;
  }
  h.dispose();
  return {out,W,H};
}

export async function classify({bundles,rom,outRoot}){
  const {createNativeLocalFlight}=await import(pathToFileURL(resolve(repo,'engine/native-local-flight.js')).href);
  const base=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  const importRoot=join(mainCheckout(),'.local/snes-import');
  const lua=readFileSync(join(here,'classify.lua'),'utf8');
  const results=[];
  for(const name of bundles){
    const dir=join(importRoot,name);
    if(!existsSync(join(dir,'wram.bin'))){results.push({name,skipped:true});continue;}
    const outDir=join(outRoot,name);mkdirSync(outDir,{recursive:true});
    const cart=privateRom(rom,'flight-classify');
    const r=await runMesen({rom:cart,test:`BUNDLE=${JSON.stringify(dir)}\n`+lua,outDir,timeoutMs:900000});
    cleanupRom(cart);
    if(!r.results?.pass){results.push({name,error:r.results?.error??r.output.slice(-400)});continue;}
    const wram=new Uint8Array(readFileSync(join(outDir,'wram.bin'))),after=new Uint8Array(readFileSync(join(outDir,'wram_end.bin')));
    // the map buffers and descriptors must not change while classifying
    let moved=0;for(let a=0x10000;a<0x18000;a++)if(wram[a]!==after[a])moved++;
    for(let a=0x1b800;a<0x1c000;a++)if(wram[a]!==after[a])moved++;
    const got=new Uint8Array(readFileSync(join(outDir,'rows.bin')));
    const exp=expected(wram,base,createNativeLocalFlight);
    const bad={fly:0,land:0,low:0},examples=[];
    for(let l=0;l<2;l++)for(let ty=0;ty<exp.H;ty++)for(let tx=0;tx<exp.W;tx++){
      const i=(l*exp.H+ty)*128+tx,e=exp.out[i],g=got[i];
      if(e===g)continue;
      if((e^g)&1)bad.fly++;if((e^g)&0x1e)bad.land++;if((e^g)&0x20)bad.low++;
      if(examples.length<12)examples.push({l,tx,ty,js:e.toString(2),cart:g.toString(2),tile:wram[0x10000+l*0x4000+ty*128+tx]});
    }
    const tiles=2*exp.W*exp.H,flyable=[...exp.out].filter(b=>b&1).length,lows=[...exp.out].filter(b=>b&0x20).length;
    results.push({name,map:r.results.map,size:`${exp.W}x${exp.H}`,tiles,flyable,lows,bad,examples,moved,ms:r.ms});
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
  if(args.includes('--all')){
    const cat=JSON.parse(readFileSync(join(mainCheckout(),'.local/snes-import/catalog.json')));
    const seen=new Set();bundles=[];
    for(const e of cat)if(e.ok&&e.map!==undefined&&!seen.has(e.map)){seen.add(e.map);bundles.push(e.name);}
  }
  if(!bundles.length)bundles=DEFAULT_BUNDLES;
  const results=await classify({bundles,rom,outRoot:resolve(repo,'.local/snes-test/flight/classify')});
  let fail=0;
  for(const r of results){
    if(r.skipped){console.log(`${r.name}: skipped (no bundle)`);continue;}
    if(r.error){fail++;console.log(`${r.name}: ERROR ${r.error}`);continue;}
    const n=r.bad.fly+r.bad.land+r.bad.low;
    if(n||r.moved)fail++;
    console.log(`${r.name.padEnd(44)} map ${String(r.map).padStart(3)} ${r.size.padEnd(7)} tiles ${String(r.tiles).padStart(5)} fly ${String(r.flyable).padStart(5)} low ${String(r.lows).padStart(4)}  mismatches fly ${r.bad.fly} land ${r.bad.land} low ${r.bad.low}${r.moved?` (map changed: ${r.moved})`:''} ${r.ms}ms`);
    for(const e of r.examples.slice(0,n?6:0))console.log('   ',JSON.stringify(e));
  }
  process.exit(fail?1:0);
}
