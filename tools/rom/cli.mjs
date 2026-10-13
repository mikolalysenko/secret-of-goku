#!/usr/bin/env node
// SPDX-License-Identifier: LGPL-2.1-only
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {inspectRom,extractPotos,normalizeRom} from './rom.mjs';
import {readGraphics,readPalette,renderMap,encodePng} from './graphics.mjs';
import {readWorldMap,renderWorld} from './world.mjs';

const [command,input,...args]=process.argv.slice(2);
try {
  if(!['inspect','extract'].includes(command)||!input) throw new Error('Usage: node tools/rom/cli.mjs inspect ROM\n       node tools/rom/cli.mjs extract ROM --out output.json [--render-dir directory] [--allow-unknown]');
  const allowed=new Set(['--out','--allow-unknown','--render-dir']);
  let output=null,allowUnknown=false,renderDir=null;
  for(let i=0;i<args.length;++i) {
    if(!allowed.has(args[i])) throw new Error(`Unknown argument ${args[i]}`);
    if(args[i]==='--out') { output=args[++i]; if(!output||output.startsWith('--')) throw new Error('--out requires a path'); }
    else if(args[i]==='--render-dir') { renderDir=args[++i]; if(!renderDir||renderDir.startsWith('--')) throw new Error('--render-dir requires a path'); }
    else allowUnknown=true;
  }
  if(command==='extract'&&!output) throw new Error('Extraction requires an explicit --out path');
  if(command==='inspect'&&(output||renderDir||allowUnknown)) throw new Error('inspect writes to stdout and does not accept extraction options');
  if(output&&resolve(input)===resolve(output)) throw new Error('Refusing to overwrite the source ROM');
  const sourceStat=await stat(input);
  async function safeWrite(path,data) {
    try {
      const targetStat=await stat(path);
      if(sourceStat.dev===targetStat.dev&&sourceStat.ino===targetStat.ino) throw new Error('Refusing to overwrite the source ROM through an alias');
    } catch(error) { if(error.code!=='ENOENT') throw error; }
    await writeFile(path,data);
  }
  const bytes=await readFile(input);
  const result=command==='inspect' ? inspectRom(bytes) : extractPotos(bytes,{allowUnknown});
  if(output) {
    await mkdir(dirname(output),{recursive:true});
    await safeWrite(output,JSON.stringify(result)+'\n');
    console.log(`Extracted ${result.maps.length} maps to ${output}`);
    for(const map of result.maps) console.log(`${map.id}: ${map.name}, ${map.composite.width}x${map.composite.height} tiles, ${map.objects.length} objects, ${map.triggers.length} triggers`);
    if(renderDir) {
      await mkdir(renderDir,{recursive:true});
      const names={131:'potos',257:'houses',258:'elder-house',259:'inn',260:'mantis-cave'};
      const normalized=normalizeRom(bytes).bytes;
      for(const map of result.maps) {
        const graphics=readGraphics(normalized,map.header.tileset8),palette=readPalette(normalized,map.header.paletteSet);
        for(const layer of ['background','foreground','composite']) {
          const rendered=renderMap(map,result.tilesets[map.header.tileset16],graphics,palette,{layer:layer==='composite'?null:layer});
          await safeWrite(resolve(renderDir,`rom-${names[map.id]??map.id}-${layer}.png`),encodePng(rendered));
        }
      }
      const world=readWorldMap(normalized);
      await safeWrite(resolve(renderDir,'rom-world.png'),encodePng(renderWorld(world)));
      console.log(`Rendered ROM map layers to ${renderDir}`);
    }
  } else console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(`${error.name}: ${error.message}`); process.exitCode=1; }
