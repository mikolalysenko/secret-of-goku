#!/usr/bin/env node
// Crawl, enumerate and debug every scene. Cartridge text is printed to the
// terminal or written under ignored .local/scene-graph/, never to the repo.
//
//   node tools/scenes/cli.mjs list [--chapter <id>] [--kind <kind>]
//   node tools/scenes/cli.mjs show <scene|event|map|flag|text|door> [--variant "party 0"] [--text]
//   node tools/scenes/cli.mjs crawl <node> [--rels calls,jumps] [--depth 3] [--back] [--types event,map]
//   node tools/scenes/cli.mjs coverage [--all]
//   node tools/scenes/cli.mjs export            (writes .local/scene-graph/)
//   node tools/scenes/cli.mjs url <scene>       (player / viewer links)
//   node tools/scenes/cli.mjs validate | format (catalog integrity / canonical layout)
//   node tools/scenes/cli.mjs test <scene,...|all> [-- playwright args]
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {crawl,coverage,eventContext,renderScript,hex} from '../../engine/scene-graph.js';
import {validateCatalog,launchPlan} from '../../engine/scene-launcher.js';
import {loadGraph,formatCatalog} from './load-graph.mjs';

const args=process.argv.slice(2),command=args.shift()??'help';
const option=(name,fallback=null)=>{const i=args.indexOf(`--${name}`);return i<0?fallback:args[i+1]??true;};
const flag=name=>args.includes(`--${name}`);
const positional=args.filter((a,i)=>!a.startsWith('--')&&!(i>0&&args[i-1].startsWith('--')&&!['--text','--back','--all','--json'].includes(args[i-1])));

// Event ids, flags and doors read naturally in hex, as in the ROM tables.
const hexKeys=(k,v)=>typeof v==='number'&&['target','flag','event','door','at','start','end'].includes(k)?'0x'+v.toString(16):v;
const label=n=>n.type==='scene'?`${n.slug}  ${n.title}`:n.type==='map'?`${n.id}  ${n.name??''}`:n.type==='event'?`${n.id}  [${n.kind}${n.authored?', authored':''}]`:n.type==='code'?`${n.file}:${n.line}`:n.id;
function printScript(g,rom,id,variant,showText){
  for(const line of renderScript(g,rom,id,{variant})){
    if(line.kind==='text'){
      const authored=line.authored?.map(a=>`    ↳ ${a.table}${a.variant?` (${a.variant})`:''}: ${JSON.stringify(a.value)}`).join('\n');
      console.log(`  text ${line.at!=null?hex(line.at):'(authored)'}${showText||line.at==null?' '+JSON.stringify(line.original):''}${authored?'\n'+authored:''}`);
    }else{
      const {kind,bytes,...rest}=line;
      console.log(`  ${kind.padEnd(16)} ${JSON.stringify(rest,hexKeys)}`);
    }
  }
}

async function main(){
  if(command==='help'){console.log((await fs.readFile(new URL(import.meta.url),'utf8')).split('\n').slice(1,12).join('\n'));return;}
  if(command==='test'){
    const scenes=positional[0]??'all',rest=args.includes('--')?args.slice(args.indexOf('--')+1):[];
    const result=spawnSync('npx',['playwright','test','tests/browser/scenes.spec.mjs',...rest],{stdio:'inherit',env:{...process.env,SCENE:scenes}});
    process.exitCode=result.status;return;
  }
  if(command==='format'){
    const file='engine/scene-catalog.json',catalog=JSON.parse(await fs.readFile(file,'utf8'));
    await fs.writeFile(file,formatCatalog(catalog));console.log(`Formatted ${file}.`);return;
  }
  const {graph:g,rom,catalog}=await loadGraph();
  if(command==='validate'){
    const problems=validateCatalog(catalog,g);
    console.log(problems.length?problems.join('\n'):`Catalog OK: ${catalog.scenes.length} scenes.`);
    process.exitCode=problems.length?1:0;return;
  }
  if(command==='list'){
    const chapter=option('chapter'),kind=option('kind');
    for(const s of catalog.scenes){
      if(chapter&&s.chapter!==chapter&&s.id!==chapter)continue;if(kind&&s.kind!==kind)continue;
      const n=g.get('scene:'+s.id),count=n.links.filter(l=>l.rel==='contains').length;
      console.log(`${s.id.padEnd(34)} ${String(s.kind).padEnd(9)} ${String(count).padStart(3)} ev  ${s.title}`);
    }
    return;
  }
  if(command==='show'){
    const n=g.get(positional[0]);if(!n)throw Error('Unknown node '+positional[0]);
    const {links,backlinks,facts,authored,...props}=n;
    console.log(label(n));
    for(const[k,v]of Object.entries(props))if(!['id','type','links','backlinks','summary','maps','num'].includes(k)&&v!==undefined&&v!==null)console.log(`  ${k}: ${typeof v==='object'?JSON.stringify(v,hexKeys):hexKeys(k,v)}`);
    if(n.type==='event'){
      const ctx=eventContext(g,n.id);console.log('  maps:',ctx.maps.map(m=>`${m} ${g.get(m).name??''}`).join(', ')||'-');
      console.log('  scenes:',[...new Set(ctx.scenes)].join(', ')||'-');
      if(authored)console.log('  authored variants:',authored.map(v=>v.variants.join(' | ')).join(' ;; '));
      console.log('  script (ROM):');printScript(g,rom,n.id,null,flag('text'));
      const variant=option('variant');if(variant){console.log(`  script (${variant}):`);printScript(g,rom,n.id,variant,true);}
    }
    console.log('  links:');for(const l of links)console.log(`    ${l.rel.padEnd(12)} → ${l.to}${l.authored?' (authored)':''}${l.when?' when '+JSON.stringify(l.when):''}${g.nodes.get(l.to)?.title?'  '+g.nodes.get(l.to).title:''}`);
    console.log('  backlinks:');for(const l of backlinks)console.log(`    ${l.rel.padEnd(12)} ← ${l.from}${g.nodes.get(l.from)?.file?'':''}`);
    if(n.type==='scene'){const plan=launchPlan(n,g);console.log('  launch plan:',JSON.stringify(plan,hexKeys));}
    return;
  }
  if(command==='crawl'){
    const rels=option('rels')?.split(','),types=option('types')?.split(',');
    for(const{node,depth,via}of crawl(g,positional[0],{rels,depth:Number(option('depth',3)),backlinks:flag('back'),types}))
      console.log(`${'  '.repeat(depth)}${via?`${via.dir==='in'?'←':'→'}${via.rel} `:''}${label(node)}`);
    return;
  }
  if(command==='coverage'){
    const c=coverage(g);
    console.log(`Curated scenes own ${c.owned} events.`);
    for(const[kind,list]of Object.entries(c.uncovered)){
      console.log(`${kind}: ${list.length} uncovered`);
      if(flag('all'))for(const e of list)console.log(`  ${e.id} text=${e.text} flags=${e.flags}${e.authored?' authored':''} ${e.maps.map(m=>`${m}(${g.get(m)?.name??''})`).join(' ')}`);
    }
    console.log(`Ambient dialogue areas: ${Object.keys(c.areas).length} maps, ${Object.values(c.areas).flat().length} events.`);
    return;
  }
  if(command==='export'){
    const out='.local/scene-graph';await fs.mkdir(out,{recursive:true});
    const nodes=[...g.nodes.values()].map(({facts,authored,...n})=>({...n,facts,authored:authored?.map(({bytes,...v})=>v)}));
    await fs.writeFile(`${out}/graph.json`,JSON.stringify({nodes},null,1));
    const lines=[];
    for(const s of catalog.scenes){
      lines.push(`# ${s.title}  (scene:${s.id})`,'',s.notes??'','',`Dialogue notes: ${s.dialogue??'-'}`,'');
      for(const l of g.get('scene:'+s.id).links.filter(l=>l.rel==='contains')){
        lines.push(`## ${l.to}`);
        for(const line of renderScript(g,rom,l.to))if(line.kind==='text')lines.push(`${line.at!=null?hex(line.at):''} ${JSON.stringify(line.original)}${line.authored?` → ${line.authored.map(a=>JSON.stringify(a.value)).join(' | ')}`:''}`);
        lines.push('');
      }
    }
    await fs.writeFile(`${out}/scenes.md`,lines.join('\n'));
    console.log(`Wrote ${out}/graph.json (${g.nodes.size} nodes) and ${out}/scenes.md (private; contains cartridge text).`);
    return;
  }
  if(command==='url'){
    const id=positional[0];console.log(`player:   http://127.0.0.1:5173/?scene=${id}\nviewer:   http://127.0.0.1:5173/scenes.html#scene:${id}\ntest:     node tools/scenes/cli.mjs test ${id}`);return;
  }
  throw Error('Unknown command '+command);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
