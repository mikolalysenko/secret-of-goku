// UI module data: telepathy messages, the BG3 glyph atlas, radar strings and
// scouter/status tables, generated from the browser engine's own sources so
// the cartridge and the browser mod share one source of truth.
//
// Outputs (dist/snes/gen/ui/):
//   defines.asm   message/group/kind/barrier ids (!UI_*) for every module
//   messages.asm  message table + encoded text (included in the UI bank)
//   radar.asm     radar targets, strings and the dial picture
//   atlas.bin     79 glyphs x (top, bottom) 2bpp BG3 tiles with the window
//                 dither, decoded from the cartridge font (PC 0x12D600)
//   catalog.json  every message with its id, source, kind and frames
//
// Message sources: exported constant tables (native-radio.js, power-intro.js,
// frieza-crisis.js, world-ki.js) and every inline radio.say()/interrupt()/
// scouter joke() literal in engine/*.js, parsed from the source text.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const FONT=0x12d600, WINDOW_TILES=0x12d080;
export const ATLAS_FIRST=0x80, ATLAS_LAST=0xce;   // glyph codes in the atlas
export const ATLAS_TILE=0x122;                     // first BG3 tile of the atlas

// Kinds as the browser's radio uses them. Bits: 1 dropped by interrupt(),
// 2 aside (waits for attacks), 4 bottom of the screen on the ground.
const KINDS=[
  ['story',0],['warning',1],['flight',1],['power-intro',3],['barrier',3],['ceiling',3],
  ['core-crisis',1],['quest',0],['scouter',0],['trial',0],['sandship',0],['escape',0],
  ['collateral',0],['tree-blast',0],['fortress-shield',0],['full-power-frieza',4],
  ['lich-buff',0],['challenge',0],
];
const kindIndex=Object.fromEntries(KINDS.map(([k],i)=>[k,i]));

// ---------------------------------------------------------------------------
// A small reader for the JavaScript expressions used as radio arguments:
// string/template literals, arrays, `test ? a : b` and identifiers.
function parseArgs(src,start){
  let i=start;
  const ws=()=>{for(;;){
    while(i<src.length&&/\s/.test(src[i]))i++;
    if(src.startsWith('//',i)){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(src.startsWith('/*',i)){i=src.indexOf('*/',i)+2;continue;}
    break;}};
  const str=q=>{
    i++;let out='';
    while(src[i]!==q){
      if(src[i]==='\\'){const c=src[i+1];out+=c==='n'?'\n':c==='t'?'\t':c;i+=2;}
      else out+=src[i++];
    }
    i++;return {type:'str',value:out};
  };
  const tmpl=()=>{
    i++;const parts=[];let cur='';
    while(src[i]!=='`'){
      if(src[i]==='\\'){const c=src[i+1];cur+=c==='n'?'\n':c;i+=2;}
      else if(src[i]==='$'&&src[i+1]==='{'){
        parts.push(cur);cur='';i+=2;let depth=1,e='';
        while(depth){if(src[i]==='{')depth++;if(src[i]==='}'){depth--;if(!depth)break;}e+=src[i++];}
        i++;parts.push({expr:e.trim()});
      }else cur+=src[i++];
    }
    i++;parts.push(cur);return {type:'tmpl',parts};
  };
  // Skip a balanced "test" expression up to a top-level '?' (not '?.'),
  // ',' or ')' and report what stopped it.
  const skipTest=()=>{
    let depth=0;const from=i;
    for(;;){
      const c=src[i];
      if(c==="'"||c==='"'){str(c);continue;}
      if(c==='`'){tmpl();continue;}
      if('([{'.includes(c))depth++;
      else if(')]}'.includes(c)){if(!depth)return src.slice(from,i);depth--;}
      else if(!depth&&(c===','||c===':'))return src.slice(from,i);
      else if(!depth&&c==='?'&&src[i+1]!=='.')return src.slice(from,i);
      i++;
    }
  };
  const expr=()=>{
    ws();
    let node;
    const c=src[i];
    if(c==="'"||c==='"')node=str(c);
    else if(c==='`')node=tmpl();
    else if(c==='['){
      i++;const items=[];
      for(;;){ws();if(src[i]===']'){i++;break;}items.push(expr());ws();if(src[i]===',')i++;}
      node={type:'array',items};
    }else{
      const text=skipTest().trim();
      if(src[i]==='?'){i++;const a=expr();ws();if(src[i]!==':')throw Error(`expected : at ${i}`);i++;const b=expr();return {type:'cond',test:text,a,b};}
      return /^[A-Za-z_$][\w$]*$/.test(text)?{type:'ident',name:text}:{type:'expr',text};
    }
    ws();
    if(src[i]==='?'&&src[i+1]!=='.'){i++;const a=expr();ws();i++;const b=expr();return {type:'cond',test:node,a,b};}
    return node;
  };
  const first=expr();ws();
  let opts='';
  if(src[i]===','){i++;ws();if(src[i]==='{'){const end=src.indexOf('}',i);opts=src.slice(i,end+1);i=end+1;}}
  return {first,opts,end:i};
}

// Template expressions the cartridge can fill in at run time.
const PARAMS={
  'count()':{code:0xf1},                         // decimal number parameter
  'dragonBallPalaces[index]':{code:0xf0,table:'palace'},
  'fresh[0][1]':{code:0xf0,table:'town'},
};

export async function generate({rom,repo,outDir}){
  const eng=name=>import(pathToFileURL(join(repo,'engine',name)).href);
  const codec=await eng('event-codec.js');
  const radio=await eng('native-radio.js');
  const intro=await eng('power-intro.js');
  const crisis=await eng('frieza-crisis.js');
  const worldKi=await eng('world-ki.js');
  const quest=await eng('dragon-quest.js');
  const scars=await eng('world-scars.js');
  const radar=await eng('dragon-radar.js');
  const {encodeText,wrapText,textWidth}=codec;

  const messages=[];const byKey=new Map();const groups=[];
  const named=new Set();
  const sanitize=s=>s.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
  function add(name,text,{kind,frames,source,params=null}){
    if(!(kind in kindIndex))throw Error(`ui gen: unknown radio kind ${kind} (${source})`);
    const key=JSON.stringify([text,kind,frames,params]);
    if(byKey.has(key))return byKey.get(key);
    let base=sanitize(typeof name==='function'?name():name),n=base,k=2;while(named.has(n))n=`${base}_${k++}`;
    named.add(n);
    const m={id:messages.length,name:n,text,kind,frames,source,params};
    messages.push(m);byKey.set(key,m);return m;
  }
  function group(name,list){groups.push({name:sanitize(name),first:list[0].id,count:list.length,ids:list.map(m=>m.id)});
    for(let i=1;i<list.length;i++)if(list[i].id!==list[0].id+i)throw Error(`ui gen: group ${name} is not contiguous`);}
  const addAll=(name,texts,opts)=>{const list=texts.map((t,i)=>add(`${name}_${i}`,t,opts));group(name,list);return list;};

  // Exported tables, with the kinds/frames their browser callers use.
  addAll('KAI_WARNING',radio.kaiWarnings,{kind:'warning',frames:220,source:'native-radio.js kaiWarnings'});
  addAll('FIRST_FLIGHT',radio.firstFlightMessages,{kind:'flight',frames:240,source:'native-radio.js firstFlightMessages'});
  addAll('TREE_BLAST',radio.treeBlastMessages,{kind:'tree-blast',frames:270,source:'world-ki.js treeBlastMessages'});
  addAll('CEILING',radio.ceilingRemarks,{kind:'ceiling',frames:200,source:'native-radio.js ceilingRemarks'});
  addAll('POWER_FLIGHT',intro.powerIntroMessages.flight,{kind:'power-intro',frames:185,source:'power-intro.js'});
  addAll('POWER_SUPER',intro.powerIntroMessages.super,{kind:'power-intro',frames:185,source:'power-intro.js'});
  addAll('DEATH_BALL',crisis.deathBallAnnouncement,{kind:'story',frames:220,source:'frieza.js deathBallAnnouncement'});
  addAll('DEATH_BALL_AFTER',crisis.deathBallAftermath,{kind:'core-crisis',frames:300,source:'frieza.js deathBallAftermath'});
  addAll('CRISIS_FLIGHT',crisis.crisisFlightMessages,{kind:'core-crisis',frames:300,source:'frieza.js crisisFlightMessages'});
  addAll('FORTRESS_SHIELD',worldKi.fortressDeflectionMessages,{kind:'fortress-shield',frames:240,source:'world-ki.js fortressDeflectionMessages'});
  // Barrier reactions: one id per authored barrier (choices rotate).
  const barriers=Object.entries(radio.barrierReactions).map(([id,choices],index)=>{
    const list=choices.map((t,i)=>add(`BARRIER_${id}${choices.length>1?'_'+i:''}`,t,{kind:'barrier',frames:230,source:`native-radio.js barrierReactions['${id}']`}));
    return {id,index,first:list[0].id,count:list.length};
  });

  // Inline literals at every radio call site (and the scouter's jokes).
  const constants={...radio,...intro.powerIntroMessages,...crisis,...worldKi};
  const callRe=/radio\??\.(say|interrupt)(?:\?\.)?\(|\bjoke\(\s*'([\w-]+)'\s*,/g;
  const files=readdirSync(join(repo,'engine')).filter(f=>f.endsWith('.js')&&f!=='native-radio.js'&&f!=='power-intro.js').sort();
  const inline=[],counters={};
  for(const file of files){
    const src=readFileSync(join(repo,'engine',file),'utf8');
    let m;
    callRe.lastIndex=0;
    while((m=callRe.exec(src))){
      if(file==='scouter.js'&&m[1]==='say')continue;   // the joke() helper itself
      const method=m[1]??'say',joke=m[2];
      let parsed;
      try{parsed=parseArgs(src,m.index+m[0].length);}
      catch(e){throw Error(`ui gen: cannot parse the radio call in ${file}: ${src.slice(m.index,m.index+120)} (${e.message})`);}
      const {first,opts}=parsed;
      const frames=Number(opts.match(/frames:(\d+)/)?.[1]??(joke?260:method==='say'?230:240));
      const kind=opts.match(/kind:'([\w-]+)'/)?.[1]??(joke?'scouter':'story');
      const fileBase=sanitize(file.replace(/\.js$/,''));
      const base=fileBase+(joke?'_'+sanitize(joke):fileBase.includes(sanitize(kind))?'':'_'+sanitize(kind));
      // Each alternative of a conditional is one variant; an array is one
      // variant holding a sequence (an interrupt() group).
      const variants=node=>{
        if(node.type==='str')return [[{text:node.value}]];
        if(node.type==='tmpl'){
          let text='';const params=[];
          for(const p of node.parts){
            if(typeof p==='string')text+=p;
            else{const P=PARAMS[p.expr];if(!P)throw Error(`ui gen: unsupported template expression ${p.expr} in ${file}`);text+=`<${P.code.toString(16)}>`;params.push(P);}
          }
          return [[{text,params}]];
        }
        if(node.type==='array')return [node.items.flatMap(n=>variants(n).flat())];
        if(node.type==='cond')return [...variants(node.a),...variants(node.b)];
        if(node.type==='ident'){
          const v=constants[node.name];
          if(!Array.isArray(v)&&typeof v!=='string')throw Error(`ui gen: cannot resolve ${node.name} in ${file}`);
          return [(Array.isArray(v)?v:[v]).map(t=>({text:t}))];
        }
        throw Error(`ui gen: unsupported radio argument in ${file}: ${JSON.stringify(node).slice(0,80)}`);
      };
      for(const variant of variants(first)){
        const list=variant.map(t=>add(()=>`${base}_${(counters[base]=(counters[base]??-1)+1)}`,t.text,{kind,frames,source:file,params:t.params?.length?t.params:null}));
        inline.push({file,method,kind,frames,ids:list.map(x=>x.id)});
        if(list.length>1&&list.every((x,k)=>x.id===list[0].id+k)&&!groups.some(g=>g.first===list[0].id&&g.count===list.length))
          group(`${base}_SEQ_${(counters[base+'#']=(counters[base+'#']??-1)+1)}`,list);
      }
    }
  }
  // Drop the "_0" of names that are alone in their call-site family.
  for(const m of messages){
    const stem=m.name.replace(/_\d+$/,'');
    if(m.name.endsWith('_0')&&!messages.some(o=>o!==m&&o.name.replace(/_\d+$/,'')===stem)&&!named.has(stem)){named.delete(m.name);m.name=stem;named.add(stem);}
  }

  // ---------------------------------------------------------------------------
  // Encode. Lines are wrapped exactly like the browser (wrapText, 28 columns,
  // name codes counted as six letters) and must fit the three-line window.
  const paramTables={palace:quest.dragonBallPalaces,town:scars.blastTowns.map(([,name])=>name)};
  const longest=t=>Math.max(...paramTables[t].map(s=>s.length));
  const encodeMessage=m=>{
    let text=m.text;
    // Measure with the longest parameter value.
    let probe=text;
    for(const p of m.params??[])probe=probe.replace(`<${p.code.toString(16)}>`,p.table?'W'.repeat(longest(p.table)):'99');
    const wrapped=wrapText(probe);
    if(wrapped!==probe)throw Error(`ui gen: message ${m.name} needs wrapping (authored lines must fit 28 columns)`);
    const lines=wrapped.split('\n');
    if(lines.length>3)throw Error(`ui gen: message ${m.name} exceeds three lines`);
    for(const l of lines)if(textWidth(l)>28)throw Error(`ui gen: message ${m.name} line too long: ${l}`);
    const bytes=encodeText(text.replace(/<f[01]>/g,'<81>'));   // validate glyphs
    void bytes;
    // Real encoding with the parameter codes kept.
    const out=[];
    for(const piece of text.split(/(<f[01]>)/)){
      if(piece==='<f0>')out.push(0xf0);else if(piece==='<f1>')out.push(0xf1);else out.push(...encodeText(piece));
    }
    return out;
  };
  for(const m of messages){
    m.bytes=encodeMessage(m);
    m.table=m.params?.find(p=>p.table)?.table??null;
    m.names=m.bytes.some((b,i)=>b===0x57);
  }

  // ---------------------------------------------------------------------------
  // Glyph atlas: each code is an 8x16 cell (two BG3 tiles) exactly as the
  // native window draws text: glyph rows at cell y 2..13, white (3) with a
  // black (1) outline from a 3x3 dilation, over the window dither (2) where
  // (x + (y >> 1)) is even. The font only uses columns 1..6, so cells never
  // touch: one atlas serves every message.
  const atlas=[];
  for(let g=ATLAS_FIRST;g<=ATLAS_LAST;g++){
    const pix=Array.from({length:16},()=>new Uint8Array(8));
    const on=(x,y)=>y>=2&&y<14&&x>=0&&x<8&&(rom[FONT+g*12+(y-2)]>>(7-x)&1);
    for(let y=0;y<16;y++)for(let x=0;x<8;x++){
      let c=((x+(y>>1))&1)===0?2:0;
      if(on(x,y))c=3;
      else{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(on(x+dx,y+dy))c=1;}
      pix[y][x]=c;
    }
    for(let t=0;t<2;t++)for(let y=0;y<8;y++){
      let p0=0,p1=0;
      for(let x=0;x<8;x++){const c=pix[t*8+y][x];p0|=(c&1)<<(7-x);p1|=(c>>1&1)<<(7-x);}
      atlas.push(p0,p1);
    }
  }
  writeFileSync(join(outDir,'atlas.bin'),Uint8Array.from(atlas));
  // The four window tiles (corner, horizontal, -, vertical), as BG3 $110-$113.
  writeFileSync(join(outDir,'window.bin'),rom.slice(WINDOW_TILES,WINDOW_TILES+64));

  // ---------------------------------------------------------------------------
  const hex=(v,w=2)=>'$'+v.toString(16).toUpperCase().padStart(w,'0');
  const def=[];const dat=[];
  def.push('; Generated by snes/gen/ui.mjs from engine/*.js. Do not edit.');
  def.push(`!UI_MSG_COUNT = ${messages.length}`);
  for(const m of messages)def.push(`!UI_MSG_${m.name} = ${m.id}`);
  for(const g of groups)def.push(`!UI_GROUP_${g.name} = (${g.first}|(${g.count}<<12))`);
  KINDS.forEach(([k],i)=>def.push(`!UI_KIND_${sanitize(k)} = ${i}`));
  def.push(`!UI_BARRIER_COUNT = ${barriers.length}`);
  for(const b of barriers)def.push(`!UI_BARRIER_${sanitize(b.id)} = ${b.index}`);
  def.push(`!UI_ATLAS_TILE = ${hex(ATLAS_TILE,3)}`);
  def.push(`!UI_ATLAS_FIRST = ${hex(ATLAS_FIRST)}`);
  def.push(`!UI_ATLAS_GLYPHS = ${ATLAS_LAST-ATLAS_FIRST+1}`);
  // Destroy-module reaction ids (dist/snes/gen/destroy/reactions.json) map
  // to barrier indices when that generator ran first (it sorts before ui).
  let reactions=null;
  try{reactions=JSON.parse(readFileSync(join(outDir,'..','destroy','reactions.json'),'utf8'));}catch{}
  def.push(`!UI_DESTROY_REACTIONS = ${reactions?reactions.length:0}`);
  writeFileSync(join(outDir,'defines.asm'),def.join('\n')+'\n');

  dat.push('; Generated by snes/gen/ui.mjs. Message table and text.');
  dat.push('ui_msg_text:');
  for(const m of messages)dat.push(`\tdw ui_txt_${m.id}`);
  dat.push('ui_msg_frames:');
  for(const m of messages)dat.push(`\tdw ${m.frames}`);
  dat.push('ui_msg_kind:');
  for(const m of messages)dat.push(`\tdb ${kindIndex[m.kind]}`);
  dat.push('ui_msg_ptable:   ; 0 none, 1 palace names, 2 town names');
  for(const m of messages)dat.push(`\tdb ${m.table==='palace'?1:m.table==='town'?2:0}`);
  dat.push('ui_kind_bits:');
  for(const [,bits] of KINDS)dat.push(`\tdb ${bits}`);
  for(const m of messages)dat.push(`ui_txt_${m.id}: db ${[...m.bytes,0].map(b=>hex(b)).join(',')}  ; ${m.name}`);
  dat.push('ui_barrier_first:');
  for(const b of barriers)dat.push(`\tdw ${b.first}  ; ${b.id}`);
  dat.push('ui_barrier_count:');
  for(const b of barriers)dat.push(`\tdb ${b.count}`);
  // Parameter string tables: dw offsets then text.
  const strTable=(label,list)=>{
    dat.push(`${label}:`);
    list.forEach((s,i)=>dat.push(`\tdw ${label}_${i}`));
    list.forEach((s,i)=>dat.push(`${label}_${i}: db ${[...encodeText(s),0].map(b=>hex(b)).join(',')}`));
  };
  dat.push('ui_ptables: dw 0, ui_str_palace, ui_str_town');
  strTable('ui_str_palace',paramTables.palace);
  strTable('ui_str_town',paramTables.town);
  // Default names for {n} codes when a slot is empty (native-names.js).
  dat.push('ui_default_names:');
  for(const n of [0,1,2,3]){
    const name={0:'GOKU',1:'Primm',2:'Popoi',3:'Randi'}[n];
    dat.push(`\tdb ${[...encodeText(name)].concat(Array(6-name.length).fill(0)).map(b=>hex(b)).join(',')}`);
  }
  dat.push('ui_destroy_react:');
  if(reactions)for(const r of reactions){const b=barriers.find(x=>x.id===r);dat.push(`\tdb ${b?b.index:'$FF'}  ; ${r}`);}
  else dat.push('\tdb $FF');
  writeFileSync(join(outDir,'messages.asm'),dat.join('\n')+'\n');

  // ---------------------------------------------------------------------------
  // Radar (dragon-radar.js): palace takeoff entrances from the native world
  // takeoff table (PC 0x67A80 + map*2, 16-pixel units), names and hints.
  const rd=[];
  const take=map=>({x:rom[0x67a80+map*2]*16,y:rom[0x67a81+map*2]*16});
  rd.push('; Generated by snes/gen/ui.mjs from dragon-radar.js / dragon-quest.js.');
  rd.push('ui_radar_route: db '+[0,1,2,3,5,4,6].join(','));
  rd.push('ui_radar_palace_xy:');
  for(const p of radar.radarPalaces){const t=take(p.map);rd.push(`\tdw ${t.x},${t.y}  ; map ${p.map}`);}
  const special={tree:take(198),dryad:take(195)};
  rd.push(`ui_radar_tree_xy: dw ${special.tree.x},${special.tree.y}`);
  rd.push(`ui_radar_dryad_xy: dw ${special.dryad.x},${special.dryad.y}`);
  const enc=s=>[...encodeText(s),0].map(b=>hex(b)).join(',');
  rd.push('ui_radar_names:');
  quest.dragonBallPalaces.forEach((n,i)=>rd.push(`\tdw ui_radar_name_${i}`));
  quest.dragonBallPalaces.forEach((n,i)=>rd.push(`ui_radar_name_${i}: db ${enc(`${n} Palace`)}`));
  rd.push('ui_radar_hints:');
  radar.radarPalaces.forEach((p,i)=>rd.push(`\tdw ui_radar_hint_${i}`));
  radar.radarPalaces.forEach((p,i)=>rd.push(`ui_radar_hint_${i}: db ${enc(p.hint)}`));
  // Strings from radarTarget()/the panel text (dragon-radar.js).
  const radarStrings={
    tree_name:'Mana Tree / Pure Land',tree_hint:'Chase Frieza. Save the Tree.',
    frieza_name:'Frieza / Fortress',frieza_hint:'Keep eighth. Confront him.',
    dryad_name:'Tree Palace',dryad_hint:'See Dryad before the wish.',
    fortress_name:'Mana Fortress',beast_name:'Mana Beast',finale_hint:'All seven! Time to fix this.',
    radar:'RADAR ',eighth:'8TH BALL',of7:'/7',gap:'  ',next:'Next: ',crisis:'CORE: 5 MINUTES REMAIN',
    land:'LAND HERE',ahead:'AHEAD',around:'TURN AROUND',left:'LEFT',right:'RIGHT',
  };
  // Check the strings against the browser source so a text edit there fails
  // the build instead of drifting.
  const radarSrc=readFileSync(join(repo,'engine','dragon-radar.js'),'utf8');
  for(const [k,s] of Object.entries(radarStrings))if(!radarSrc.includes(s.trim()))throw Error(`ui gen: radar string "${s}" (${k}) not found in dragon-radar.js`);
  for(const [k,s] of Object.entries(radarStrings))rd.push(`ui_rs_${k}: db ${enc(s)}`);
  writeFileSync(join(outDir,'radar.asm'),rd.join('\n')+'\n');

  writeFileSync(join(outDir,'catalog.json'),JSON.stringify({
    messages:messages.map(({bytes,...m})=>({...m,lines:m.text.split('\n')})),groups,barriers,inline,
  },null,1));
}
