#!/usr/bin/env node
// Measures per-scene timing of the cartridge in Mesen (snes/test/core/measure.lua):
// frame-end scanline of the field/world loops, end of the native NMI work,
// per-frame DMA bytes, DMA/HDMA channel use and native OAM counts. Feeds
// docs/agents/snes-port/engine.md.
//   node snes/test/core/measure.mjs [--rom=path] [scene ...]
// A scene is a checkpoint name (waterfall, name-entry) or an import bundle
// name from .local/snes-import. Results: .local/snes-test/measure/summary.json
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const rom=resolve(args.find(a=>a.startsWith('--rom='))?.slice(6)??process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const cps=checkpointDir(),imports=join(dirname(cps),'snes-import');
const scenes=args.filter(a=>!a.startsWith('--'));
const list=scenes.length?scenes:['waterfall','emulator-probe__potos-state','preset__sandship','preset__battle','preset__beast','preset__fortress','barrier-audit__bosses__488-0-state','preset__flight','name-entry'];
const out=resolve(repo,'.local/snes-test/measure');
mkdirSync(out,{recursive:true});
const lua=readFileSync(join(here,'measure.lua'),'utf8');
const summary={};
for(const scene of list){
  const cp=join(cps,`${scene}.mss`),bundle=join(imports,scene);
  const isCp=existsSync(cp);
  if(!isCp&&!existsSync(bundle)){console.log(scene,'missing');continue;}
  // Imports start from the waterfall checkpoint (any running cartridge).
  const pre=[`MEASURE_FRAMES=240`,args.includes('--fastrom')?'MEASURE_FASTROM=true':'',isCp?'':`MEASURE_IMPORT=${JSON.stringify(bundle)}`,scene==='name-entry'?'':'MEASURE_WALK=true'].join('\n');
  const r=await runMesen({rom,test:pre+'\n'+lua,outDir:join(out,scene),state:isCp?cp:join(cps,'waterfall.mss')});
  summary[scene]=r.results;
  const s=r.results?.stats??{};
  const fmt=t=>t?`${t.p50}/${t.p90}/${t.max}`:'-';
  console.log(scene.padEnd(36),'fieldEnd',fmt(s.fieldEnd),'nmiEnd',fmt(s.fieldNmiEnd),'worldEnd',fmt(s.worldEnd),'worldNmiEnd',fmt(s.worldNmiEnd),'dma',fmt(s.dmaBytes),'oam',fmt(s.oam),r.results?.error??'');
}
writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,1));
