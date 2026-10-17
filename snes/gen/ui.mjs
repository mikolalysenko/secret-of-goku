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
  // ui_put_rom writes without a column check: every composed line must fit
  {const cols=s=>encodeText(s).length,R=radarStrings;
   const guides=[R.land,R.ahead,R.around,R.left,R.right];
   const lines=[...guides.flatMap(g=>[R.radar+R.eighth+R.gap+g,R.radar+'7'+R.of7+R.gap+g]),
     ...quest.dragonBallPalaces.map(n=>R.next+`${n} Palace`),
     ...[R.tree_name,R.frieza_name,R.dryad_name,R.fortress_name,R.beast_name].map(n=>R.next+n),
     ...radar.radarPalaces.map(p=>p.hint),R.tree_hint,R.frieza_hint,R.dryad_hint,R.finale_hint,R.crisis];
   for(const l of lines)if(cols(l)>28)throw Error(`ui gen: radar line "${l}" wider than 28 columns`);}
  // ---------------------------------------------------------------------------
  // World flight band (BG3, opaque: Mode 7 cannot show through it). Glyphs
  // that any displayable text uses, with the dither holes filled with black
  // (index 1), packed into BG3 tiles from !UI_WATLAS_TILE; then the opaque
  // frame tiles (corner, edge, side) and a black tile.
  const used=new Set([0x80]);
  const addText=s=>{for(const b of encodeText(s))if(b>=ATLAS_FIRST&&b<=ATLAS_LAST)used.add(b);};
  for(const m of messages)addText(m.text.replace(/<f[01]>/g,''));
  for(const list of Object.values(paramTables))list.forEach(addText);
  for(const s of Object.values(radarStrings))addText(s);
  quest.dragonBallPalaces.forEach(n=>addText(`${n} Palace`));
  radar.radarPalaces.forEach(p=>addText(p.hint));
  addText('0123456789');
  const wGlyphs=[...used].sort((a,b)=>a-b);
  const opaque=bytes=>{const out=Uint8Array.from(bytes);
    for(let t=0;t<out.length;t+=16)for(let y=0;y<8;y++){const p0=out[t+y*2],p1=out[t+y*2+1],hole=~(p0|p1)&0xff;out[t+y*2]=p0|hole;}
    return out;};
  const wAtlas=[];
  for(const g of wGlyphs)wAtlas.push(...opaque(atlas.slice((g-ATLAS_FIRST)*32,(g-ATLAS_FIRST)*32+32)));
  const winOpaque=opaque(rom.slice(WINDOW_TILES,WINDOW_TILES+64));
  wAtlas.push(...winOpaque.slice(0,16),...winOpaque.slice(16,32),...winOpaque.slice(48,64));
  for(let y=0;y<8;y++)wAtlas.push(0xff,0x00);          // black (index 1)
  const W_TILE=0x6c;                                     // BG3 chr base $7000: tile $6C = VRAM $7360
  if(W_TILE+wAtlas.length/16>0x100)throw Error('ui gen: world atlas exceeds BG3 tiles $6C-$FF');
  writeFileSync(join(outDir,'watlas.bin'),Uint8Array.from(wAtlas));
  const wMap=new Array(ATLAS_LAST-ATLAS_FIRST+1).fill(W_TILE);   // unknown glyphs: space
  wGlyphs.forEach((g,i)=>{wMap[g-ATLAS_FIRST]=W_TILE+i*2;});
  const wFrame=W_TILE+wGlyphs.length*2;
  def.push(`!UI_WATLAS_TILE = ${hex(W_TILE)}`);
  def.push(`!UI_WATLAS_BYTES = ${wAtlas.length}`);
  def.push(`!UI_W_CORNER = ${hex(wFrame,3)}`);
  def.push(`!UI_W_EDGE = ${hex(wFrame+1,3)}`);
  def.push(`!UI_W_SIDE = ${hex(wFrame+2,3)}`);
  def.push(`!UI_W_BLACK = ${hex(wFrame+3,3)}`);
  // glyph word ((code - $80) * 2) -> the top map entry of that glyph in the
  // world atlas (bottom = +1); the attribute bits are world.asm's !UI_WT_TEXT
  rd.push('ui_wtab16:   ; glyph word -> !UI_WT_TEXT | top BG3 tile of the world atlas');
  for(let i=0;i<wMap.length;i+=8)rd.push('\tdw '+wMap.slice(i,i+8).map(v=>`!UI_WT_TEXT|${hex(v,3)}`).join(','));

  // ---------------------------------------------------------------------------
  // Radar dial (dragon-radar.js update()), 48x48 at screen (8,8): OBJ palette
  // indices 1 ring, 2 fill, 3 grid, 4 sweep, 5 blip, 6 white. OBJ region C
  // (tiles $190-$1FF, 16 per VRAM row): the base (ring, fill, grid, centre
  // and N mark) is nine 16x16 cells in columns 0-5 of rows 0-5; the 8x8
  // effect tiles (blip, centre, sweep segments) fill columns 6-15 of rows
  // 0-5, then row 6. The sweep (the browser's continuous frame * 0.045 rad,
  // quantised to 64 angles) is three 8x8 segment sprites (d 1-6, 7-12,
  // 13-19); angles 17-63 mirror the first quadrant's 0-16 with OBJ flips.
  const DIAL_COLORS=[0x739c,0x0440,0x1102,0x2284,0x03ff,0x7fff];
  const base=new Uint8Array(48*48);
  const put=(img,x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<48&&y>=0&&y<48)img[y*48+x]=c;};
  for(let y=0;y<48;y++)for(let x=0;x<48;x++){
    const d=Math.hypot(x-24,y-24);
    if(d<23)put(base,x,y,d>=21?1:2);
    if(d<20&&(Math.abs(d-10)<.6||x===24||y===24))put(base,x,y,3);
  }
  put(base,24,24,6);put(base,24,4,6);
  // check against the browser's own drawing
  {const src=readFileSync(join(repo,'engine','dragon-radar.js'),'utf8');
   for(const c of DIAL_COLORS)if(!src.includes('0x'+c.toString(16).padStart(4,'0')))throw Error(`ui gen: dial colour ${c.toString(16)} not in dragon-radar.js`);
   if(!src.includes('const sweep=mod.frame*.045;')||!src.includes('for(let d=1;d<20;d++)put(24+Math.sin(sweep)*d,24-Math.cos(sweep)*d,0x2284)'))throw Error('ui gen: dragon-radar.js sweep changed');}
  const tile4=(img,w,tx,ty)=>{const out=new Uint8Array(32);
    for(let y=0;y<8;y++){let p=[0,0,0,0];
      for(let x=0;x<8;x++){const c=img[(ty*8+y)*w+tx*8+x];for(let b=0;b<4;b++)p[b]|=(c>>b&1)<<(7-x);}
      out[y*2]=p[0];out[y*2+1]=p[1];out[16+y*2]=p[2];out[16+y*2+1]=p[3];}
    return out;};
  const pixel4=(t,x,y)=>{const bit=7-x;return (t[y*2]>>bit&1)|(t[y*2+1]>>bit&1)<<1|(t[16+y*2]>>bit&1)<<2|(t[17+y*2]>>bit&1)<<3;};
  const DIAL_TILE=0x190,DIAL_VRAM=0x7900;
  const dialBase=[];
  for(let ty=0;ty<6;ty++)for(let tx=0;tx<6;tx++)dialBase.push(...tile4(base,48,tx,ty));
  // effect tiles, deduplicated; slot s -> OBJ tile number
  const fx=[],fxKey=new Map();
  const addFx=data=>{const k=Array.from(data).join(',');if(!fxKey.has(k)){fxKey.set(k,fx.length);fx.push(data);}return fxKey.get(k);};
  const fxTile=s=>s<60?DIAL_TILE+Math.floor(s/10)*16+6+s%10:DIAL_TILE+0x60+(s-60);
  const blipImg=new Uint8Array(8*8);for(let y=0;y<3;y++)for(let x=0;x<3;x++)blipImg[y*8+x]=5;
  const ctrImg=new Uint8Array(8*8);ctrImg[0]=6;
  const blipS=addFx(tile4(blipImg,8,0,0)),ctrS=addFx(tile4(ctrImg,8,0,0));
  const SEGS=[[1,6],[7,12],[13,19]];
  const sweepPixels=th=>{const img=new Uint8Array(48*48);for(let d=1;d<20;d++)put(img,24+Math.sin(th)*d,24-Math.cos(th)*d,4);return img;};
  const segTab=[],segSlot=[];
  for(let b=0;b<=16;b++){
    const th=b*2*Math.PI/64;
    for(const [d0,d1] of SEGS){
      const px=[];for(let d=d0;d<=d1;d++)px.push([Math.round(24+Math.sin(th)*d),Math.round(24-Math.cos(th)*d)]);
      const x0=Math.min(...px.map(q=>q[0])),y0=Math.min(...px.map(q=>q[1]));
      const img=new Uint8Array(64);
      for(const [x,y] of px){
        if(x-x0>7||y-y0>7)throw Error('ui gen: sweep segment wider than 8 pixels');
        if(x===24&&(y===24||y===4))throw Error('ui gen: sweep over the white centre / N mark');
        img[(y-y0)*8+x-x0]=4;
      }
      const slot=addFx(tile4(img,8,0,0));
      segSlot.push(slot);
      segTab.push(x0,y0,fxTile(slot)&0xff);
    }
  }
  if(fx.length>76)throw Error(`ui gen: ${fx.length} dial effect tiles (max 76)`);
  // every angle drawn from the first quadrant must equal the direct drawing
  // (angle a: quadrant q = a >> 4, i = a & 15; odd quadrants use 16 - i;
  // H flip in quadrants 2-3, V flip in 1-2; a flipped 8x8 at p moves to 41 - p)
  for(let a=0;a<64;a++){
    const q=a>>4,i=a&15,b=q&1?16-i:i,hf=q===2||q===3,vf=q===1||q===2;
    const got=new Uint8Array(48*48);
    for(let k=0;k<3;k++){
      const x0=segTab[(b*3+k)*3],y0=segTab[(b*3+k)*3+1],t=fx[segSlot[b*3+k]];
      const sx0=hf?41-x0:x0,sy0=vf?41-y0:y0;
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const c=pixel4(t,hf?7-x:x,vf?7-y:y);
        if(c)got[(sy0+y)*48+sx0+x]=c;
      }
    }
    const want=sweepPixels(a*2*Math.PI/64);
    for(let j=0;j<48*48;j++)if(got[j]!==want[j])throw Error(`ui gen: sweep angle ${a} symmetry mismatch`);
  }
  const fxBytes=[];for(const t of fx)fxBytes.push(...t);
  writeFileSync(join(outDir,'dial.bin'),Uint8Array.from([...dialBase,...fxBytes]));
  // upload steps: VRAM word address, source offset in dial.bin, bytes
  const ups=[];
  for(let r=0;r<6;r++)ups.push([DIAL_VRAM+r*0x100,r*192,192]);
  for(let r=0;r<7;r++){
    const s0=r*10,n=r<6?Math.min(10,fx.length-s0):fx.length-60;
    if(n<=0)continue;
    ups.push([DIAL_VRAM+(r<6?r*0x100+6*16:0x600),dialBase.length+s0*32,n*32]);
  }
  def.push(`!UI_DIAL_TILE = ${hex(DIAL_TILE,3)}`);
  def.push(`!UI_DIAL_VRAM = ${hex(DIAL_VRAM,4)}`);
  def.push(`!UI_BLIP_TILE = ${hex(fxTile(blipS),3)}`);
  def.push(`!UI_CTR_TILE = ${hex(fxTile(ctrS),3)}`);
  def.push(`!UI_DIAL_UPS = ${ups.length}`);
  def.push(`!UI_DIAL_FX_TILES = ${fx.length}`);
  rd.push('ui_dial_ups:    ; VRAM word address, offset in ui_dial_data, bytes');
  for(const u of ups)rd.push(`\tdw ${hex(u[0],4)},${hex(u[1],4)},${hex(u[2],4)}`);
  // per angle, the three segment sprites as OAM words (screen x | y << 8,
  // tile | flips | !UI_DIAL_ATTR): copied straight into the dial's run
  rd.push('ui_sweep_oam:   ; 64 angles x 3 sprites x (x | y << 8, attributes | tile)');
  for(let a=0;a<64;a++){
    const q=a>>4,i=a&15,b=q&1?16-i:i,hf=q===2||q===3,vf=q===1||q===2,w=[];
    for(let k=0;k<3;k++){
      const x0=segTab[(b*3+k)*3],y0=segTab[(b*3+k)*3+1],tile=segTab[(b*3+k)*3+2];
      const x=8+(hf?41-x0:x0),y=8+(vf?41-y0:y0);
      w.push(hex(x|y<<8,4),`!UI_DIAL_ATTR|${hex((vf?0x8000:0)|(hf?0x4000:0)|tile,4)}`);
    }
    rd.push('\tdw '+w.join(','));
  }
  rd.push('ui_dial_colors: dw '+DIAL_COLORS.map(c=>hex(c,4)).join(','));
  // Trigonometry for the bearing (heading units: 1024 per turn).
  const sinq=Array.from({length:257},(_,i)=>Math.round(Math.sin(i*Math.PI/512)*16384));
  rd.push('ui_sinq:     ; sin(i * pi / 512) * 16384, i = 0..256 (a quarter turn of heading units)');
  for(let i=0;i<257;i+=16)rd.push('\tdw '+sinq.slice(i,i+16).join(','));
  const secT=Array.from({length:129},(_,k)=>Math.round(Math.sqrt(1+(k/128)**2)*256));
  rd.push('ui_sec128:   ; sqrt(1 + (k/128)^2) * 256: hypot = max * sec / 256');
  for(let i=0;i<129;i+=16)rd.push('\tdw '+secT.slice(i,i+16).join(','));
  writeFileSync(join(outDir,'radar.asm'),rd.join('\n')+'\n');
  writeFileSync(join(outDir,'defines.asm'),def.join('\n')+'\n');

  writeFileSync(join(outDir,'catalog.json'),JSON.stringify({
    messages:messages.map(({bytes,...m})=>({...m,lines:m.text.split('\n')})),groups,barriers,inline,
  },null,1));
}
