// Shared by the scene CLI, unit tests and audits. Reads the private ROM.
import fs from 'node:fs/promises';
import {buildSceneGraph,crawlSources} from '../../engine/scene-graph.js';

export const romPath=process.env.SOM_ROM??'.local/rom/secret-of-mana-us.sfc';
export async function loadGraph({withSources=true}={}){
  const catalog=JSON.parse(await fs.readFile('engine/scene-catalog.json','utf8'));
  const mapNames=JSON.parse(await fs.readFile('tools/qa/map-names.json','utf8')).names;
  const sources=withSources?await crawlSources(f=>fs.readFile(f,'utf8')):new Map();
  const rom=await fs.readFile(romPath).catch(()=>null);
  if(!rom)throw Error(`ROM not found at ${romPath}. Set SOM_ROM or run npm run rom:import.`);
  const bytes=rom.length%0x8000===512?rom.subarray(512):rom;
  return{rom:bytes,catalog,graph:buildSceneGraph(bytes,{catalog,sources,mapNames})};
}


// Canonical layout: one scene per line, so diffs and merges stay per-scene.
export function formatCatalog(catalog){
  const {scenes,...head}=catalog;
  const top=Object.entries(head).map(([k,v])=>`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
  return `{\n${top}\n  "scenes": [\n${scenes.map(s=>'    '+JSON.stringify(s)).join(',\n')}\n  ]\n}\n`;
}
