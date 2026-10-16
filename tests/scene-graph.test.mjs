import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {describeOp,parseBytes,scriptFacts,classifyEvent,createGraph,crawl,indexSource,resolveCode,normalizeIri,parseIri,coverage,renderScript,eventAtPointer} from '../engine/scene-graph.js';
import {launchPlan,launchable,validateCatalog} from '../engine/scene-launcher.js';
import {box,call,jump} from '../engine/story-events.js';

const catalog=JSON.parse(readFileSync('engine/scene-catalog.json','utf8'));

test('event opcodes decode into flow, flag and party facts',()=>{
  assert.deepEqual(describeOp({op:0x14,bytes:[0x14,0xe1]}),{kind:'jump',target:0x4e1});
  assert.deepEqual(describeOp({op:0x1b,bytes:[0x1b,0xfc]}),{kind:'door',target:0x3fc});
  assert.deepEqual(describeOp({op:0x27,bytes:[0x27,0xd7]}),{kind:'call',target:0x7d7});
  assert.deepEqual(describeOp({op:0x42,bytes:[0x42,0x46,0x2f,0x10,0]}),{kind:'branch',condition:{flag:0x46,min:2,max:15},then:{kind:'jump',target:0}});
  assert.deepEqual(describeOp({op:0x30,bytes:[0x30,0x4e,6]}),{kind:'flag-set',flag:0x4e,value:6});
  const ops=parseBytes([0x30,0x4e,6,...box('GOKU:Hi.'),...call(0x7d7),0x2b,2,...jump(0x429),0]);
  const facts=scriptFacts(ops);
  assert.deepEqual(facts.calls,[0x7d7]);assert.deepEqual(facts.jumps,[0x429]);
  assert.deepEqual(facts.flagsWritten,[{flag:0x4e,value:6,op:'set'}]);
  assert.deepEqual(facts.party,[{member:2,op:'add'}]);
  assert.equal(ops.find(o=>o.op==='text').text,'GOKU:Hi.');
  assert.equal(classifyEvent({start:0,end:ops.length},facts),'cutscene');
  assert.equal(classifyEvent({start:0,end:1},scriptFacts([])),'empty');
});

test('IRIs normalise from human input',()=>{
  assert.equal(normalizeIri('4e1'),'event:4e1');assert.equal(normalizeIri('0x4E1'),'event:4e1');
  assert.equal(normalizeIri('a73f5'),'text:a73f5');assert.equal(normalizeIri('goblin-pot'),'scene:goblin-pot');
  assert.deepEqual(parseIri('flag:4e'),{type:'flag',key:'4e',number:0x4e});
});

test('crawl walks named relations breadth-first, optionally backwards',()=>{
  const g=createGraph();
  g.link('scene:a','root','event:1');g.link('event:1','calls','event:2');g.link('event:2','jumps','event:3');g.link('scene:b','root','event:3');
  assert.deepEqual([...crawl(g,'scene:a',{rels:['root','calls','jumps']})].map(x=>x.node.id),['scene:a','event:1','event:2','event:3']);
  assert.deepEqual([...crawl(g,'event:3',{backlinks:true,rels:['root'],depth:1})].map(x=>x.node.id),['event:3','scene:b']);
  assert.deepEqual([...crawl(g,'scene:a',{depth:1})].map(x=>x.depth),[0,1]);
});

test('source references are derived from event-shaped literals and symbols',()=>{
  const refs=indexSource('engine/x.js',[
    "events.set(0x4e1,[...]);",
    "route(F.theft,mask=>null);",
    " 0xa73f5:'Got it',",
    "const flags=0x30;",
  ].join('\n'));
  assert.deepEqual(refs.map(r=>`${r.line}>${r.to}`),['1>event:4e1','2>event:a8','3>text:a73f5']);
  const sources=new Map([['engine/y.js','// header\nexport function buildThing(){}\n']]);
  assert.deepEqual(resolveCode(sources,'engine/y.js#buildThing'),{iri:'code:engine/y.js:2',file:'engine/y.js',line:2,symbol:'buildThing'});
  assert.equal(resolveCode(sources,'engine/y.js#missing'),null);
});

test('the curated catalog is consistent linked data',()=>{
  assert.deepEqual(validateCatalog(catalog),[]);
  const ids=new Set(catalog.scenes.map(s=>s.id));
  for(const s of catalog.scenes){
    if(s.kind!=='chapter')assert.ok(ids.has(s.chapter),`${s.id} needs a chapter`);
    for(const t of s.tests??[])assert.ok(existsSync(t),`${s.id}: missing test ${t}`);
    // Curated notes paraphrase; the catalog must not carry dialogue tables.
    assert.ok(!('text' in s)&&!('ops' in s),`${s.id} duplicates derived state`);
  }
});

test('launch plans honour quick starts, warps and manual scenes',()=>{
  const plan=id=>launchPlan(catalog.scenes.find(s=>s.id===id));
  assert.deepEqual(plan('frieza-battle'),{...plan('frieza-battle'),start:'battle',map:null,door:null,event:null});
  const goblin=plan('goblin-pot');
  assert.equal(goblin.start,'sword');assert.equal(goblin.map,133);assert.equal(goblin.event,0x4e8);assert.deepEqual(goblin.flags,{0x0a:0,0x2e:0});
  assert.equal(launchable(plan('kai-radio')),false);
  assert.equal(launchPlan({id:'x',maps:[131],events:['10c'],launch:{base:'current'}}).start,null);
});

const romPath='.local/rom/secret-of-mana-us.sfc';
test('the ROM crawl covers every cutscene, script and reward',{skip:!existsSync(romPath)&&'Requires the private ROM.'},async()=>{
  const {loadGraph}=await import('../tools/scenes/load-graph.mjs');
  const {graph,rom}=await loadGraph();
  assert.deepEqual(validateCatalog(catalog,graph),[]);
  const report=coverage(graph);
  for(const kind of['cutscene','script','reward'])assert.deepEqual(report.uncovered[kind],[],`${kind} events without a scene`);
  // Every authored script and replacement text resolves to a real event.
  for(const n of graph.nodes.values()){
    // Compiler tables key exact run addresses; flight patches may sit inside a run.
    if(n.type==='text'&&n.authored&&!n.authored.every(a=>a.table==='flightDialogue'))assert.ok(n.event!==undefined&&!n.links.some(l=>l.rel==='within'),`${n.id} is not a text-run address`);
    if(n.type==='event'&&n.authored)assert.ok(n.backlinks.some(b=>b.rel==='contains'&&graph.nodes.get(b.from).curated),`${n.id} is authored but in no curated scene`);
  }
  // Launch plans resolve real doors for map-only recipes.
  for(const s of catalog.scenes){const p=launchPlan(s,graph);if(p.map!==null&&p.x===undefined)assert.notEqual(p.door,null,`${s.id} has no door into map ${p.map}`);}
  // The interpreter pointer maps back to the executing ROM event.
  const goblin=graph.get('event:4e8');
  assert.equal(eventAtPointer(graph,0xc00000|goblin.start+3),0x4e8);
  assert.equal(eventAtPointer(graph,0xf08000),null);
  // Rendering merges ROM text with authored overlays without storing either.
  const lines=renderScript(graph,rom,'event:4e8');
  assert.ok(lines.some(l=>l.kind==='text'&&l.authored?.length));
});
