#!/usr/bin/env node
// Exports every private SnesJs probe state under .local/ that reaches the field
// wait loop into .local/snes-import/<flattened-path>/ and writes a catalogue
// (.local/snes-import/catalog.json: name, source, map, ok/error).
import {readdirSync,statSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {exportState} from './snesjs-export.mjs';
const out='.local/snes-import',files=[];
(function walk(d){for(const f of readdirSync(d)){const p=join(d,f);let s;try{s=statSync(p);}catch{continue;}
 if(s.isDirectory()){if(!/^(tools|snes-import|snes-checkpoints)$/.test(f))walk(p);}else if(f.endsWith('.json')&&s.size>1e6)files.push(p);}})('.local');
mkdirSync(out,{recursive:true});
const rom=new Uint8Array(readFileSync('rom/secret-of-mana-us.sfc'));
const catalog=[];
for(const f of files){
  const name=relative('.local',f).replace(/\.json$/,'').replace(/[\/\\]/g,'__');
  try{
    const head=readFileSync(f,{encoding:'utf8',flag:'r'}).slice(0,64);
    if(!head.includes('SnesJs-probe-v1'))continue;
    const r=exportState(f,join(out,name),{rom});
    catalog.push({name,source:f,map:r.map,steps:r.steps,ok:true});
  }catch(e){catalog.push({name,source:f,ok:false,error:String(e.message).slice(0,120)});}
}
writeFileSync(join(out,'catalog.json'),JSON.stringify(catalog,null,1));
console.log('exported',catalog.filter(c=>c.ok).length,'of',catalog.length);
