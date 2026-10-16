// Scene viewer and live debugger. Everything shown is crawled in this browser
// from the user's ROM, the engine source and scene-catalog.json; cartridge
// text never leaves the page. The player runs in a same-origin iframe and
// is driven through its window.mana handle.
import {buildSceneGraph,crawlSources,coverage,enumerate,eventContext,eventAtPointer,renderScript,normalizeIri,parseIri,hex} from './scene-graph.js';
import {validateCatalog,launchPlan} from './scene-launcher.js';
import {fetchDefaultRom,validateRom} from './rom-loader.js';

const $=id=>document.getElementById(id);
const el=(tag,{dataset={},...props}={},...children)=>{const n=Object.assign(document.createElement(tag),props);Object.assign(n.dataset,dataset);for(const c of children.flat())if(c!==null&&c!==undefined&&c!==false)n.append(c);return n;};
const state={rom:null,graph:null,catalog:null,problems:[],selected:null,variant:'ROM',filter:'all',query:'',snapshot:null,trace:[],lastEvent:null,romBytes:null};
const status=text=>{$('viewer-status').textContent=text;};

// ------------------------------------------------------------ boot
async function boot(bytes){
  status('Crawling the ROM, catalog and engine source…');
  const [catalog,mapNames,sources]=await Promise.all([
    fetch('engine/scene-catalog.json',{cache:'no-store'}).then(r=>r.json()),
    fetch('tools/qa/map-names.json').then(r=>r.ok?r.json():{names:{}}).then(j=>j.names).catch(()=>({})),
    crawlSources(path=>fetch(path,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(path);return r.text();})),
  ]);
  const t0=performance.now();
  state.rom=bytes;state.catalog=catalog;state.graph=buildSceneGraph(bytes,{catalog,sources,mapNames});
  state.problems=validateCatalog(catalog,state.graph);
  const cov=coverage(state.graph),ms=Math.round(performance.now()-t0);
  status(`${state.graph.nodes.size} nodes · ${catalog.scenes.length} curated scenes · ${sources.size} source files · ${ms} ms${state.problems.length?` · ${state.problems.length} catalog problems`:''}`);
  renderFilters();renderTree();
  route();
  window.sceneViewer.ready=true;
  window.sceneViewer.coverage=cov;
}
window.sceneViewer={ready:false,state,
  summary(){
    const cov=coverage(state.graph);
    return{problems:state.problems,catalog:state.catalog.scenes.length,curated:enumerate(state.graph,'scene').filter(n=>n.curated).length,
      uncovered:{cutscene:cov.uncovered.cutscene.length,script:cov.uncovered.script.length,reward:cov.uncovered.reward.length}};
  },
  select:iri=>select(iri),
};
async function start(){
  const found=await fetchDefaultRom().catch(()=>null);
  if(found){state.romBytes=found.bytes;await boot(found.bytes);}
  else status('Choose your Secret of Mana (USA) ROM. It stays in this browser.');
}
$('viewer-rom').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const bytes=await validateRom(await file.arrayBuffer());state.romBytes=bytes;await boot(bytes);}catch(error){status(error.message);}
});

// ------------------------------------------------------------ tree
const kinds=['all','cutscene','boss','system','ending','js','area'];
function renderFilters(){
  $('scene-filters').replaceChildren(...kinds.map(k=>el('button',{textContent:k,ariaPressed:String(state.filter===k),onclick:()=>{state.filter=k;renderFilters();renderTree();}})));
}
function sceneMatches(n){
  if(state.filter!=='all'&&n.kind!==state.filter)return false;
  const q=state.query.trim().toLowerCase();if(!q)return true;
  if(`${n.title} ${n.slug} ${n.notes??''} ${n.dialogue??''}`.toLowerCase().includes(q))return true;
  return n.links.some(l=>l.to.toLowerCase().includes(q));
}
function sceneButton(n){
  const b=el('button',{dataset:{iri:n.id},onclick:()=>select(n.id)},n.title,el('span',{className:'kind',textContent:n.kind}));
  if(state.selected===n.id)b.classList.add('selected');
  if(state.lastEvent&&n.links.some(l=>l.rel==='contains'&&l.to===state.lastEvent))b.classList.add('current');
  return b;
}
function renderTree(){
  const g=state.graph;if(!g)return;
  const scenes=enumerate(g,'scene'),chapters=scenes.filter(n=>n.kind==='chapter');
  const groups=chapters.map(ch=>{
    const members=scenes.filter(n=>n.chapter===ch.slug&&sceneMatches(n));
    if(!members.length&&state.query)return null;
    return el('details',{open:!!state.query||members.some(m=>m.id===state.selected)},el('summary',{},ch.title),
      el('button',{dataset:{iri:ch.id},onclick:()=>select(ch.id)},'Chapter overview',el('span',{className:'kind',textContent:'chapter'})),...members.map(sceneButton));
  });
  const areas=scenes.filter(n=>n.kind==='area'&&sceneMatches(n));
  groups.push(el('details',{open:!!state.query&&areas.length<30},el('summary',{},`Derived map areas (${areas.length})`),...areas.map(sceneButton)));
  // Direct node lookups: event ids, text addresses, maps, flags.
  const q=state.query.trim();
  if(q&&/^(?:0x)?[0-9a-f]{1,5}$|^(event|text|map|flag|door|code):/i.test(q)){
    const iri=/^\d+$/.test(q)&&Number(q)<511&&!/[a-f]/i.test(q)?null:normalizeIri(q);
    const hits=[iri,`map:${q}`,`flag:${q.replace(/^0x/,'')}`].filter(x=>x&&g.nodes.has(x));
    if(hits.length)groups.unshift(el('div',{},...hits.map(h=>el('button',{dataset:{iri:h},onclick:()=>select(h)},h,el('span',{className:'kind',textContent:g.nodes.get(h).type})))));
  }
  $('scene-tree').replaceChildren(...groups.filter(Boolean));
}
$('scene-search').addEventListener('input',e=>{state.query=e.target.value;renderTree();});

// ------------------------------------------------------------ detail
function ref(iri,label=null){
  const n=state.graph.nodes.get(iri),text=label??(n?.type==='scene'?n.title:n?.type==='map'?`${iri} ${n.name??''}`:n?.type==='code'?`${n.file}:${n.line}`:iri);
  return el('button',{className:'ref',dataset:{iri},onclick:()=>select(iri),title:iri},text,n?.type==='event'?el('small',{textContent:` ${n.kind}${n.authored?' ✎':''}`}):null);
}
const section=(title,...body)=>body.flat().filter(Boolean).length?[el('h3',{textContent:title}),...body]:[];
function linkGroups(n,{skip=[]}={}){
  const out=[],groups=new Map();
  for(const l of n.links)if(!skip.includes(l.rel)){if(!groups.has(`→ ${l.rel}`))groups.set(`→ ${l.rel}`,new Set());groups.get(`→ ${l.rel}`).add(l.to);}
  for(const l of n.backlinks)if(!skip.includes(l.rel)){if(!groups.has(`← ${l.rel}`))groups.set(`← ${l.rel}`,new Set());groups.get(`← ${l.rel}`).add(l.from);}
  for(const[rel,set]of groups)out.push(el('tr',{},el('th',{textContent:rel}),el('td',{},el('div',{className:'links'},...[...set].slice(0,200).map(i=>ref(i))))));
  return out.length?[el('h3',{textContent:'Links'}),el('table',{},...out)]:[];
}
function select(iri,{push=true}={}){
  const g=state.graph;if(!g)return;
  iri=normalizeIri(iri);const n=g.nodes.get(iri);
  state.selected=iri;if(push&&location.hash.slice(1)!==iri)history.pushState(null,'',`#${iri}`);
  if(!n){$('detail').replaceChildren(el('h2',{textContent:iri}),el('p',{className:'muted',textContent:'Not in the graph.'}));return;}
  const view={scene:sceneView,event:eventView,map:mapView,flag:flagView,code:codeView,text:textView,door:doorView}[n.type]??(()=>[el('h2',{textContent:iri}),...linkGroups(n)]);
  $('detail').replaceChildren(...view(n).filter(Boolean));$('detail').scrollTop=0;
  renderTree();renderFlags();
}
window.addEventListener('popstate',()=>route());
function route(){const h=decodeURIComponent(location.hash.slice(1));if(h)select(h,{push:false});}

function sceneFlags(n){
  const flags=new Set();
  for(const l of n.links)if(l.rel==='contains')for(const e of state.graph.nodes.get(l.to).links)if(e.rel==='writes'||e.rel==='reads')flags.add(parseIri(e.to).number);
  for(const k of Object.keys(n.launch?.flags??{}))flags.add(parseInt(k,16));
  return[...flags].filter(f=>f<0xf0).sort((a,b)=>a-b);
}
function sceneView(n){
  const g=state.graph,events=n.links.filter(l=>l.rel==='contains').map(l=>g.nodes.get(l.to));
  const plan=n.curated&&n.kind!=='chapter'?launchPlan(n,g):null;
  const children=n.kind==='chapter'?enumerate(g,'scene').filter(s=>s.chapter===n.slug):[];
  const texts=events.reduce((t,e)=>t+e.summary.text,0),authored=events.filter(e=>e.authored).length;
  return[
    el('h2',{textContent:n.title}),
    el('p',{className:'muted'},`${n.kind}${n.chapter?` · chapter `:''}`,n.chapter?ref(`scene:${n.chapter}`):'',` · ${events.length} events · ${texts} text runs · ${authored} authored`),
    n.notes?el('p',{textContent:n.notes}):null,
    n.dialogue?el('p',{},el('strong',{textContent:'Dialogue notes: '}),n.dialogue):null,
    plan?el('div',{className:'actions'},
      el('button',{className:'primary',textContent:'Launch in player',onclick:()=>openPlayer(n.slug)}),
      el('button',{textContent:'Launch from current game state',onclick:()=>launchHere(n.slug)}),
      el('button',{textContent:'Copy test command',onclick:()=>navigator.clipboard?.writeText(`node tools/scenes/cli.mjs test ${n.slug}`)}),
      el('a',{href:`./?scene=${n.slug}`,target:'_blank',textContent:`?scene=${n.slug}`})):null,
    ...(plan?section('Launch plan',el('pre',{className:'script',textContent:JSON.stringify(plan,(k,v)=>typeof v==='number'&&['door','event'].includes(k)?'0x'+hex(v):v,1)})):[]),
    ...section('Scenes',children.length?el('div',{className:'links'},...children.map(c=>ref(c.id))):null),
    ...section('Events',events.length?el('table',{},el('tr',{},...['event','kind','text','flags','maps','code'].map(h=>el('th',{textContent:h}))),
      ...events.map(e=>el('tr',{},el('td',{},ref(e.id,hex(e.num))),el('td',{textContent:e.kind+(e.authored?' ✎':'')}),el('td',{textContent:e.summary.text}),
        el('td',{className:'mono',textContent:e.facts.flagsWritten.filter(w=>w.flag<0xf0).map(w=>hex(w.flag)+(w.value!==undefined?'='+w.value:w.op==='inc'?'+':'−')).join(' ')}),
        el('td',{},...(e.maps??[]).slice(0,4).map(m=>ref(`map:${m}`,String(m)))),
        el('td',{},...e.backlinks.filter(b=>b.rel==='references').slice(0,3).map(b=>ref(b.from,g.nodes.get(b.from).file.split('/').pop()+':'+g.nodes.get(b.from).line)))))):null),
    ...linkGroups(n,{skip:['contains']}),
  ];
}
function scriptLines(n){
  const lines=renderScript(state.graph,state.rom,n.id,{variant:state.variant==='ROM'?null:state.variant});
  return el('div',{className:'script'},...lines.map(line=>{
    if(line.kind==='text')return el('div',{},
      el('div',{className:'text'},line.at!=null?ref(`text:${hex(line.at)}`,hex(line.at)):'',' ',line.original),
      ...(line.authored??[]).map(a=>el('div',{className:'authored',textContent:`↳ ${a.table}${a.variant?` (${a.variant})`:''}: ${a.value}`})));
    const {kind,bytes,...rest}=line,target=rest.target??rest.then?.target;
    const to=kind==='door'||rest.then?.kind==='door'?`door:${hex(target)}`:target!==undefined?`event:${hex(target)}`:rest.flag!==undefined?`flag:${hex(rest.flag)}`:rest.condition?.flag!==undefined?`flag:${hex(rest.condition.flag)}`:null;
    return el('div',{className:to?'flow':'op'},kind.padEnd(16),' ',JSON.stringify(rest,(k,v)=>typeof v==='number'&&['target','flag'].includes(k)?'0x'+hex(v):v),' ',to?ref(to):'');
  }));
}
function eventView(n){
  const ctx=eventContext(state.graph,n.id),variants=['ROM',...new Set((n.authored??[]).flatMap(v=>v.variants))];
  if(!variants.includes(state.variant))state.variant='ROM';
  return[
    el('h2',{textContent:`${n.id} · ${n.kind}${n.authored?' · authored':''}${n.utility?' · utility':''}`}),
    el('p',{className:'muted',textContent:`ROM ${n.start!==undefined?'0x'+hex(n.start):''}…0x${hex(n.end??0)} · ${n.size} bytes · ${n.summary.text} text runs · ${n.summary.choices} choices`}),
    ...section('Scenes',el('div',{className:'links'},...[...new Set(ctx.scenes)].map(s=>ref(s)))),
    ...section('Maps',el('div',{className:'links'},...ctx.maps.map(m=>ref(m)))),
    el('div',{className:'actions'},
      el('label',{},'Script variant ',el('select',{onchange:e=>{state.variant=e.target.value;select(n.id,{push:false});}},...variants.map(v=>el('option',{value:v,selected:v===state.variant,textContent:v})))),
      el('button',{textContent:'Request in live game',onclick:()=>live(m=>m.mod.story.request(n.num))})),
    scriptLines(n),
    ...linkGroups(n,{skip:['says']}),
  ];
}
function mapView(n){
  const g=state.graph,objects=n.links.filter(l=>l.rel==='object');
  return[
    el('h2',{textContent:`${n.id} ${n.name??''}`}),
    el('div',{className:'actions'},el('button',{textContent:'Warp live game here',onclick:()=>warpLive(n)})),
    ...section('Objects',objects.length?el('table',{},el('tr',{},...['#','species','tile','visible when','event'].map(h=>el('th',{textContent:h}))),
      ...objects.map(o=>el('tr',{},el('td',{textContent:o.index}),el('td',{textContent:o.species}),el('td',{textContent:`${o.x},${o.y}`}),
        el('td',{},o.visible.flag?ref(`flag:${hex(o.visible.flag)}`):'',` ${o.visible.min}–${o.visible.max}`),el('td',{},ref(o.to))))):null),
    ...linkGroups(n,{skip:['object']}),
    ...section('Scenes here',el('div',{className:'links'},...enumerate(g,'scene').filter(s=>s.links.some(l=>l.rel==='in'&&l.to===n.id)).map(s=>ref(s.id)))),
  ];
}
function flagView(n){
  return[el('h2',{textContent:`${n.id} · $CF${hex(parseIri(n.id).number).padStart(2,'0')}`}),
    el('div',{className:'actions'},el('button',{textContent:'Watch in live game',onclick:()=>{state.extraFlags.add(parseIri(n.id).number);renderFlags();}})),
    ...linkGroups(n)];
}
function codeView(n){
  const text=state.graph.sources?.get(n.file)??'',lines=text.split('\n'),from=Math.max(0,n.line-9),to=Math.min(lines.length,n.line+12);
  return[el('h2',{textContent:`${n.file}:${n.line}`}),n.symbol?el('p',{className:'muted',textContent:n.symbol}):null,
    el('div',{className:'source'},...lines.slice(from,to).map((l,i)=>el('div',{className:from+i+1===n.line?'hit':''},el('span',{className:'ln',textContent:from+i+1}),l))),
    ...linkGroups(n)];
}
function textView(n){
  const text=n.event!==undefined?renderScript(state.graph,state.rom,`event:${hex(n.event)}`).find(l=>l.kind==='text'&&l.at===n.at):null;
  return[el('h2',{textContent:n.id}),n.event!==undefined?el('p',{},'In ',ref(`event:${hex(n.event)}`)):null,
    text?el('div',{className:'script'},el('div',{className:'text',textContent:text.original})):null,
    ...section('Authored replacements',...(n.authored??[]).map(a=>el('div',{className:'script'},el('div',{className:'authored',textContent:`${a.table}${a.variant?` (${a.variant})`:''}: ${a.value}`})))),
    ...linkGroups(n)];
}
function doorView(n){return[el('h2',{textContent:`${n.id} → map ${n.map} (${n.x},${n.y})`}),el('div',{className:'actions'},el('button',{textContent:'Travel live game through this door',onclick:()=>live(m=>m.mod.story.travel(n.num))})),...linkGroups(n)];}

// ------------------------------------------------------------ live player
state.extraFlags=new Set();
const frame=()=>$('player').contentWindow;
const mana=()=>{try{return frame()?.mana??null;}catch{return null;}};
function openPlayer(scene=null){
  $('player').src=scene?`./?scene=${encodeURIComponent(scene)}`:'./';
  state.trace=[];
  // A ROM chosen in this page is handed to the player if it cannot find one.
  const handoff=setInterval(()=>{
    const m=mana();if(!m)return;
    if(m.ready||m.snes?.cart){clearInterval(handoff);return;}
    if(state.romBytes&&frame().document.getElementById('boot-local')&&!frame().document.getElementById('boot-local').disabled){clearInterval(handoff);m.bootOriginal(state.romBytes);}
  },1000);
}
async function launchHere(id){
  const m=mana();if(!m?.ready){openPlayer(id);return;}
  try{const s=await m.scenes.launch(id,{base:'current'});traceNote(`launched ${id}: ${s.steps.join(' · ')}`);}catch(error){traceNote(`launch failed: ${error.message}`,true);}
}
function warpLive(map){
  const plan=launchPlan({id:'warp',maps:[map.num],launch:{request:false}},state.graph);
  if(plan.door===null){traceNote(`no door enters ${map.id}`,true);return;}
  live(m=>m.mod.story.travel(plan.door));
}
function live(action){const m=mana();if(!m?.ready){traceNote('Player not ready',true);return;}const result=action(m);traceNote(`→ ${result}`);m.render?.();}
function traceNote(text,error=false){$('live-trace').prepend(el('li',{className:error?'err':'',textContent:text}));}
$('live-open').onclick=()=>openPlayer();
$('live-toggle').onclick=()=>live(m=>m.running?(m.pause(),'paused'):(m.play(),'playing'));
$('live-step1').onclick=()=>live(m=>JSON.stringify(m.run(1)).length&&'stepped 1');
$('live-step60').onclick=()=>live(m=>(m.run(60),'stepped 60'));
$('live-mash').onclick=()=>live(m=>{for(let i=0;i<15;i++)m.run(20,[11]);return'mashed B for 300 frames';});
$('live-snap').onclick=()=>live(m=>{state.snapshot=m.snapshot();$('live-restore').disabled=false;return'snapshot taken';});
$('live-restore').onclick=()=>live(m=>{m.restore(state.snapshot);return'snapshot restored';});

function renderFlags(){
  const g=state.graph,n=g?.nodes.get(state.selected),flags=new Set([...(n?.type==='scene'?sceneFlags(n):[]),...state.extraFlags]),m=mana();
  $('live-flags').replaceChildren(...[...flags].map(f=>el('label',{title:`$CF${hex(f).padStart(2,'0')}`},ref(`flag:${hex(f)}`,hex(f)),
    el('input',{type:'number',min:0,max:255,value:m?.ready?m.read8(0xcf00+f):'',dataset:{flag:f},onchange:e=>live(x=>{x.write8(0xcf00+f,Number(e.target.value));return`flag ${hex(f)} = ${e.target.value}`;})}))));
}
function poll(){
  const m=mana(),out=[];
  if(!m){$('live-state').textContent='not running';}
  else{
    const s=m.mod?.status??{},story=m.mod?.story?.status??{},launch=m.scenes?.status;
    $('live-state').textContent=m.ready?(m.running?'running':'paused'):'loading';
    out.push(['map',s.map!==undefined?ref(`map:${s.map}`):'-'],['position',`${s.x??'-'}, ${s.y??'-'}`],['control',m.mod?.canAttack?'field':'event / menu'],
      ['last event',story.lastEvent!=null?ref(`event:${hex(story.lastEvent)}`):'-'],['story error',story.error??'none']);
    if(launch)out.push(['scene launch',`${launch.scene}${launch.running?' (running)':launch.ok===false?` failed: ${launch.error}`:''}`]);
    // Native events are traced from the interpreter pointer; relocated mod
    // scripts report themselves through story.lastEvent.
    const pointer=m.read8(0xd1)|m.read8(0xd2)<<8|m.read8(0xd3)<<16,native=m.read8(0xd0)?eventAtPointer(state.graph,pointer):null;
    const current=native??story.lastEvent;
    out.push(['interpreter',native!=null?ref(`event:${hex(native)}`):m.read8(0xd0)?`0x${hex(pointer)}`:'idle']);
    const event=current!=null?`event:${hex(current)}`:null;
    if(event&&event!==state.lastEvent){
      state.lastEvent=event;
      const scenes=[...new Set(state.graph?.nodes.get(event)?.backlinks.filter(b=>b.rel==='contains').map(b=>b.from)??[])];
      $('live-trace').prepend(el('li',{},ref(event,hex(current)),' ',...scenes.map(x=>ref(x))));
      renderTree();
    }
    for(const input of $('live-flags').querySelectorAll('input'))if(document.activeElement!==input&&m.ready)input.value=m.read8(0xcf00+Number(input.dataset.flag));
  }
  $('live-readout').replaceChildren(...out.flatMap(([k,v])=>[el('dt',{textContent:k}),el('dd',{},v)]));
}
setInterval(poll,300);
start();
