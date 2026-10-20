// Goku sprite data for the cartridge: 4bpp OBJ tiles, palettes, cell tables,
// portraits and the animation tables used by snes/src/modules/goku.
//
// Single source of truth: the browser mod's sheets (assets/sprites/goku.png,
// ssj.png) and its authored descriptors (engine/goku-animation-data.js,
// engine/goku-native-actions.js). Synthesized cells (push, shuffled legs,
// hover legs, Super Saiyan lead jab) follow engine/sprite-layer.js exactly.
//
// Outputs (dist/snes/gen/goku/):
//   tiles0..N.bin   unique 8x8 4bpp tiles, 2048 per 64 KiB asset bank (tile 0 blank)
//   data.asm        palettes, cell/variant tables, portraits, animation tables
//   preview-*.png   quantized sheets for visual checks (not shipped)
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {readPng,encodeTile,writePng,blank} from '../tools/gfx.mjs';

export const TILES_PER_BANK=2048;
export const ASSET_BANK0=0xF8;
export const ASSET_BANKS=4;          // F8-FB
const W5=c=>[c&31,(c>>5)&31,(c>>10)&31];
const rgb=(r,g,b)=>r|(g<<5)|(b<<10);
// Perceptual-ish weighted distance on 5-bit channels.
const dist=(a,b)=>{const[x,y,z]=W5(a),[p,q,r]=W5(b);return 3*(x-p)**2+4*(y-q)**2+2*(z-r)**2;};

// ---------------------------------------------------------------------------
// Inputs
function loadEngine(repo){
  const context={window:{}};
  for(const f of['goku-animation-data.js','goku-native-actions.js'])
    vm.runInNewContext(readFileSync(join(repo,'engine',f),'utf8'),context);
  return {data:context.window.GokuAnimationData,actions:context.window.GokuNativeActions};
}
// Atlas pixels: 0 = transparent, otherwise 1 + RGB555 (as engine/sprite-layer.js).
function atlas(repo,name){
  const img=readPng(join(repo,'assets/sprites',name+'.png'));
  const pixels=new Uint16Array(img.width*img.height);
  for(let i=0;i<pixels.length;i++)if(img.data[i*4+3])pixels[i]=1+((img.data[i*4]>>3)|((img.data[i*4+1]>>3)<<5)|((img.data[i*4+2]>>3)<<10));
  return {pixels,width:img.width,height:img.height};
}
// engine/sprite-layer.js ManaSpriteLayer.leadPunchAtlas
function leadPunchAtlas(data,{goku,ssj}){
  const width=128,height=160,pixels=new Uint16Array(width*height);
  for(const cell of data.forms.ssjJab.cells){
    const {column,row,bodyColumn,head}=cell,[dx,dy]=head.offset,top=32+row*32;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      if((head.mask[y]>>>x)&1)continue;
      pixels[(top+y)*width+column*32+x]=goku.pixels[(top+y)*goku.width+bodyColumn*32+x];
    }
    for(let y=0;y<18;y++)for(let x=0;x<32;x++){
      const c=ssj.pixels[(top+y)*ssj.width+x];if(!c)continue;
      const at=(top+y+dy)*width+column*32+x+dx;
      if(!pixels[at])pixels[at]=c;
    }
  }
  return {pixels,width,height};
}
const cellPixels=(a,column,row)=>{
  const out=new Uint16Array(1024);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)out[y*32+x]=a.pixels[(32+row*32+y)*a.width+column*32+x];
  return out;
};
// engine/sprite-layer.js shuffleFrame
function shuffleFrame(a,column,row){
  const cell=new Uint16Array(1024);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const c=a.pixels[(32+row*32+y)*a.width+column*32+x];if(!c)continue;
    const step=y<25?0:Math.min(y-24,2),dx=x<16?step:-step;
    cell[y*32+x+dx]=c;
  }
  return cell;
}
// engine/sprite-layer.js pushFrame (beat = phase & 3)
function pushFrame(a,sheet,row,beat){
  const lean=[0,1,2,1][beat],cell=new Uint16Array(1024),gold=sheet==='ssj';
  const flip=row===1,get=(col,x,y)=>x<0||x>31||y<0?0:a.pixels[(32+row*32+y)*a.width+col*32+(flip?31-x:x)];
  const put=(x,y,c)=>{if(c&&x>=0&&x<32&&y>=0&&y<32)cell[y*32+(flip?31-x:x)]=c;};
  if(row===1||row===2){
    const brace=gold?26:30,stride=gold?19:23;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const arm=y>=13&&y<=19&&x>=21&&!(y<=15&&x===21),head=y<=12||y<=14&&x<=22;
      const c=arm?get(brace,x+3,y):y>=21?(lean===2?(x<24?get(stride,x-1,y):0):get(brace,x,y)):get(brace,x,y);
      if(head)put(x+(lean===2?3:lean),y+(lean>>1),c);else if(y<=18)put(x+(lean>>1),y,c);else put(x,y,c);
    }
  }else{
    const hands=gold?21:25;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(y>14)put(x,y,y>=25&&lean===2?get(hands,31-x,y):get(hands,x,y));
    for(let y=0;y<=14;y++)for(let x=0;x<32;x++)put(x,y+(lean?1:0),get(hands,x,y));
  }
  return cell;
}
// engine/sprite-layer.js blit() with `legs` (no cell): rows >= 24 come from
// the legs column, except the cupped hand on row 24.
function legsFrame(a,column,row,legs){
  const cell=new Uint16Array(1024);
  for(let ly=0;ly<32;ly++)for(let lx=0;lx<32;lx++){
    const hand=ly===24&&((row===1&&lx>=23)||(row===2&&lx<10)||(row===3&&lx>=22));
    const sc=ly>=24&&!hand?legs:column;
    cell[ly*32+lx]=a.pixels[(32+row*32+ly)*a.width+sc*32+lx];
  }
  return cell;
}

// ---------------------------------------------------------------------------
// Palette optimisation: Ward-style agglomerative merge to `n` colours with
// fixed members, refined by weighted Lloyd iterations.
function optimisePalette(hist,n,fixed){
  let clusters=[...hist.entries()].map(([c,w])=>({members:[[c,w]],w,c,fixed:false}));
  for(const f of fixed){
    let k=clusters.find(x=>x.c===f);
    if(!k){k={members:[],w:0,c:f};clusters.push(k);}k.fixed=true;
  }
  const centroid=m=>{let r=0,g=0,b=0,w=0;for(const[c,ww]of m){const[x,y,z]=W5(c);r+=x*ww;g+=y*ww;b+=z*ww;w+=ww;}return w?rgb(Math.round(r/w),Math.round(g/w),Math.round(b/w)):0;};
  const sse=(m,c)=>m.reduce((s,[x,w])=>s+w*dist(x,c),0);
  while(clusters.length>n){
    let best=null,bc=Infinity;
    for(let i=0;i<clusters.length;i++)for(let j=i+1;j<clusters.length;j++){
      const a=clusters[i],b=clusters[j];if(a.fixed&&b.fixed)continue;
      const m=[...a.members,...b.members],c=a.fixed?a.c:b.fixed?b.c:centroid(m);
      const cost=sse(m,c)-sse(a.members,a.c)-sse(b.members,b.c);
      if(cost<bc){bc=cost;best=[i,j,m,c];}
    }
    const[i,j,m,c]=best,fx=clusters[i].fixed||clusters[j].fixed;
    clusters[i]={members:m,w:m.reduce((s,[,w])=>s+w,0),c,fixed:fx};clusters.splice(j,1);
  }
  // Lloyd refinement
  for(let it=0;it<8;it++){
    const groups=clusters.map(()=>[]);
    for(const[c,w]of hist){let bi=0,bd=Infinity;clusters.forEach((k,i)=>{const d=dist(c,k.c);if(d<bd){bd=d;bi=i;}});groups[bi].push([c,w]);}
    clusters=clusters.map((k,i)=>({...k,members:groups[i],c:k.fixed||!groups[i].length?k.c:centroid(groups[i])}));
  }
  return clusters;
}
// Hungarian assignment (square cost matrix) -> assignment[row] = column.
function hungarian(cost){
  const n=cost.length,u=new Array(n+1).fill(0),v=new Array(n+1).fill(0),p=new Array(n+1).fill(0),way=new Array(n+1).fill(0);
  for(let i=1;i<=n;i++){
    p[0]=i;let j0=0;const minv=new Array(n+1).fill(Infinity),used=new Array(n+1).fill(false);
    do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=n;j++)if(!used[j]){const cur=cost[i0-1][j-1]-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0;}if(minv[j]<delta){delta=minv[j];j1=j;}}
      for(let j=0;j<=n;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minv[j]-=delta;
      j0=j1;}while(p[j0]!==0);
    do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
  }
  const a=new Array(n);for(let j=1;j<=n;j++)a[p[j]-1]=j-1;return a;
}
export function boyPalette(rom){
  const out=[];for(let i=0;i<16;i++){const at=0x80ffe+0x80*30+i*2;out.push((rom[at]|rom[at+1]<<8)&0x7fff);}
  return out;
}
const SHADOW=0x10A6;   // native palette-1 index 1: every actor's shadow and outline
const WHITE=0x7FFF;
// Build a 16-colour OBJ palette for a histogram: index 0 transparent, index 1
// the native shadow colour, 2..15 Goku colours ordered to sit on the boy's
// palette entries they resemble (so other palette-1 users degrade gracefully).
// Index 15 stays white: the ring cursor (bank-1 tile 08) draws with palette 1
// indices 10-12 and 15.
function buildPalette(hist,boy){
  const clusters=optimisePalette(hist,15,[SHADOW,WHITE]);
  const free=clusters.filter(k=>!(k.fixed&&(k.c===SHADOW||k.c===WHITE)));
  while(free.length<13)free.push({c:0,members:[],w:0});
  const cost=free.map(k=>Array.from({length:13},(_,j)=>dist(k.c,boy[j+2])));
  const asg=hungarian(cost),pal=new Array(16).fill(0),clusterOf=new Array(16).fill(null);
  pal[1]=SHADOW;clusterOf[1]=clusters.find(k=>k.fixed&&k.c===SHADOW);
  pal[15]=WHITE;clusterOf[15]=clusters.find(k=>k.fixed&&k.c===WHITE);
  free.forEach((k,i)=>{pal[asg[i]+2]=k.c;clusterOf[asg[i]+2]=k;});
  return {pal,clusterOf};
}
// Status-palette transfer tables (engine/sprite-layer.js tint()).
const SKIN=new Set([0x0d50,0x1df5,0x32bb,0x3b1e,0x15b5,0x2a58,0x19b4,0x4efb,0x1592]);
function tintTables(pal,clusterOf,boy){
  const map=new Array(16).fill(1),shade=new Array(16).fill(0);
  for(let k=1;k<16;k++){
    const members=clusterOf[k]?.members??[];let skin=0,black=0,total=0;
    for(const[c,w]of members){total+=w;if(SKIN.has(c))skin+=w;if(c===0)black+=w;}
    const c=pal[k],[r,g,b]=W5(c);
    const candidates=k===1||(total&&black*2>total)?[1]:total&&skin*2>total?[5,6,7]:[1,2,3,4,8,9,10,11,12,13,14,15];
    let best=candidates[0],bd=Infinity;
    for(const i of candidates){const[x,y,z]=W5(boy[i]),d=(r-x)**2+(g-y)**2+(b-z)**2;if(d<bd){bd=d;best=i;}}
    map[k]=best;shade[k]=Math.min(5,Math.round((r*3+g*6+b)/62));
  }
  map[1]=1;
  return {map,shade};
}
function quantizeCell(px,pal){
  const out=new Uint8Array(1024),cache=new Map();
  for(let i=0;i<1024;i++){const v=px[i];if(!v)continue;const c=v-1;
    let k=cache.get(c);if(k===undefined){let bd=Infinity;k=1;for(let j=1;j<16;j++){const d=dist(c,pal[j]);if(d<bd){bd=d;k=j;}}cache.set(c,k);}
    out[i]=k;}
  return out;
}
const cellError=(px,pal)=>{let e=0,n=0;for(let i=0;i<1024;i++){const v=px[i];if(!v)continue;n++;let bd=Infinity;for(let j=1;j<16;j++)bd=Math.min(bd,dist(v-1,pal[j]));e+=bd;}return n?e/n:0;};
const hist=(cells)=>{const h=new Map();for(const px of cells)for(const v of px)if(v)h.set(v-1,(h.get(v-1)??0)+1);return h;};

// ---------------------------------------------------------------------------
// Tile store with de-duplication (tile 0 = blank).
class TileStore{
  constructor(){this.tiles=[new Uint8Array(32)];this.index=new Map([[Buffer.from(this.tiles[0]).toString('base64'),0]]);}
  add(bytes){const k=Buffer.from(bytes).toString('base64');let i=this.index.get(k);if(i===undefined){i=this.tiles.length;this.tiles.push(bytes);this.index.set(k,i);}return i;}
  // 8x8 tiles of an index image (width w) in row-major tile order.
  addImage(idx,w,h){const out=[];for(let ty=0;ty<h;ty+=8)for(let tx=0;tx<w;tx+=8)out.push(this.add(encodeTile(idx,w,tx,ty,4)));return out;}
}

// ---------------------------------------------------------------------------
// Cell inventory
const EXCLUDE=(sheet,column,row)=>
  (sheet==='goku'&&((row===1||row===2)&&column>=52))||   // fusion dance, never shown
  (sheet==='goku'&&column>=44&&column<=47)||             // diagonal flight, unused by the mod
  (sheet==='ssj'&&((row===1||row===2)&&column>=44))||    // fusion dance
  (sheet==='ssj'&&row===0&&column>=42&&column<=46);      // long-hair transformation, unused
const SHEETS=[['goku',63],['ssj',55],['ssjJab',4]];
const formOfSheet=s=>s==='goku'?'goku':'ssj';
// Cells whose shuffled-leg / hover-leg variants pose() can request
// (shuffle kinds: charge, ready, focus, transform, revert).
function variantSources(){
  const list=[];
  for(const[sheet,charge,guard]of[['goku',22,25],['ssj',18,21]])for(let row=0;row<4;row++)list.push([sheet,charge,row],[sheet,guard,row]);
  for(const c of[54,55,56,57,58])list.push(['goku',c,0]);
  for(const c of[47,48,49,50])list.push(['ssj',c,0]);
  return list;
}
export function collectCells(atlases){
  const cells=[];
  for(const[sheet,cols]of SHEETS)for(let column=0;column<cols;column++)for(let row=0;row<4;row++){
    if(EXCLUDE(sheet,column,row))continue;
    const px=cellPixels(atlases[sheet],column,row);if(!px.some(v=>v))continue;
    cells.push({key:`${sheet}:${column}:${row}`,sheet,column,row,variant:'plain',form:formOfSheet(sheet),px});
  }
  for(const sheet of['goku','ssj'])for(let row=0;row<4;row++)for(let beat=0;beat<4;beat++)
    cells.push({key:`push:${sheet}:${row}:${beat}`,sheet,column:0,row,beat,variant:'push',form:sheet,px:pushFrame(atlases[sheet],sheet,row,beat)});
  for(const[sheet,column,row]of variantSources()){
    cells.push({key:`shuffle:${sheet}:${column}:${row}`,sheet,column,row,variant:'shuffle',form:sheet,px:shuffleFrame(atlases[sheet],column,row)});
    const legs=sheet==='ssj'?34:38;
    cells.push({key:`legs:${sheet}:${column}:${row}`,sheet,column,row,variant:'legs',form:sheet,px:legsFrame(atlases[sheet],column,row,legs)});
  }
  return cells;
}
export function loadInputs(repo){
  const {data,actions}=loadEngine(repo);
  const atlases={goku:atlas(repo,'goku'),ssj:atlas(repo,'ssj')};
  atlases.ssjJab=leadPunchAtlas(data,atlases);
  return {data,actions,atlases};
}
export {buildPalette,tintTables,quantizeCell,cellError,hist,TileStore,cellPixels,dist,SHADOW};

// ---------------------------------------------------------------------------
// Animation descriptors -> compact tables
export const SHEET_ID={goku:0,ssj:1,ssjJab:2};
export const SHEET_BASE=[0,63*4,63*4+55*4];          // index-table offsets
export const INDEX_SIZE=63*4+55*4+4*4;
// Cells that use their own palette (gold/black hair transition frames).
const TRANSITION=['goku:55:0','goku:56:0','goku:57:0','goku:58:0','ssj:48:0','ssj:49:0'];
const ROW_CALLER=0xFF,ROW_SIDE=0xFE;
const rowMode=r=>r===null||r===undefined?ROW_CALLER:r==='side'?ROW_SIDE:r;
// Native action dispatch modes (see engine/goku-animation.js pose()).
const MODE={nativePose:0,locomotion:1,idle:2,guard:3,guardStep:4};

class Asm{
  constructor(){this.lines=[];}
  label(l){this.lines.push(`${l}:`);}
  db(a){for(let i=0;i<a.length;i+=16)this.lines.push('\tdb '+a.slice(i,i+16).map(v=>'$'+(v&255).toString(16).toUpperCase().padStart(2,'0')).join(','));}
  dw(a){for(let i=0;i<a.length;i+=12)this.lines.push('\tdw '+a.slice(i,i+12).map(v=>'$'+(v&0xffff).toString(16).toUpperCase().padStart(4,'0')).join(','));}
  def(n,v){this.lines.push(`!${n} = $${v.toString(16).toUpperCase()}`);}
  raw(s){this.lines.push(s);}
  text(){return this.lines.join('\n')+'\n';}
}

export async function generate({rom,repo,outDir,xdata}){
  const {data,actions,atlases}=loadInputs(repo);
  const boy=boyPalette(rom);
  const cells=collectCells(atlases);
  const base3=c=>`${c.sheet}:${c.column}:${c.row}`;
  const isTransition=c=>c.variant!=='push'&&TRANSITION.includes(base3(c));

  // Palettes: 0 base, 1 Super Saiyan, 2.. transition frames.
  const palettes=[
    buildPalette(hist(cells.filter(c=>c.form==='goku'&&!isTransition(c)).map(c=>c.px)),boy),
    buildPalette(hist(cells.filter(c=>c.form==='ssj'&&!isTransition(c)).map(c=>c.px)),boy),
  ];
  const transitionPal={};
  for(const key of TRANSITION){transitionPal[key]=palettes.length;palettes.push(buildPalette(hist([cells.find(c=>c.key===key).px]),boy));}
  for(const c of cells)c.pal=isTransition(c)?transitionPal[base3(c)]:c.form==='goku'?0:1;

  // Tiles: full 32x32 cells (16 tiles, row-major 4x4) and 16x16 miniatures.
  const store=new TileStore();
  for(const c of cells){
    const idx=quantizeCell(c.px,palettes[c.pal].pal);c.idx=idx;
    c.tiles=store.addImage(idx,32,32);
    c.mask=0;for(let q=0;q<4;q++){const qx=(q&1)*16,qy=(q>>1)*16;for(let y=0;y<16&&!(c.mask&(1<<q));y++)for(let x=0;x<16;x++)if(idx[(qy+y)*32+qx+x]){c.mask|=1<<q;break;}}
    const mini=new Uint8Array(256);for(let y=0;y<16;y++)for(let x=0;x<16;x++)mini[y*16+x]=idx[(y*2)*32+x*2];
    c.mini=store.addImage(mini,16,16);
  }
  // Portraits (engine/sprite-layer.js injectPortrait): HUD 16x16 head crop of
  // the form's front idle cell; ring marker uses the same crop at 10x10 placed
  // at (+3,+2) inside its 16x16 OBJ. The base-form HUD crop is also the GAME
  // FILE face (savePortrait). Menu figures use whole cells (menu.asm).
  const portrait=(form,size,ox,oy)=>{
    const c=cells.find(x=>x.key===`${form}:0:0`),out=new Uint8Array(256);
    for(let row=0;row<size;row++)for(let col=0;col<size;col++){
      const sx=3+Math.floor(col*26/size),sy=Math.floor(row*21/size);
      out[(row+oy)*16+col+ox]=c.idx[sy*32+sx];
    }
    return store.addImage(out,16,16);
  };
  const portraits=[portrait('goku',16,0,0),portrait('ssj',16,0,0),portrait('goku',10,3,2),portrait('ssj',10,3,2)];

  const tileCount=store.tiles.length;
  if(tileCount>TILES_PER_BANK*ASSET_BANKS)throw Error(`goku: ${tileCount} tiles exceed ${ASSET_BANKS} asset banks`);
  const banks=Math.ceil(tileCount/TILES_PER_BANK);
  for(let b=0;b<banks;b++){
    const n=Math.min(TILES_PER_BANK,tileCount-b*TILES_PER_BANK),buf=new Uint8Array(n*32);
    for(let i=0;i<n;i++)buf.set(store.tiles[b*TILES_PER_BANK+i],i*32);
    writeFileSync(join(outDir,`tiles${b}.bin`),buf);
  }

  // Index tables: sheet/column/row -> cell id, and the shuffled / hover-leg variants.
  const index=new Array(INDEX_SIZE).fill(0xFFFF),shuffle=new Array(INDEX_SIZE).fill(0xFFFF),legs=new Array(INDEX_SIZE).fill(0xFFFF);
  const slot=c=>SHEET_BASE[SHEET_ID[c.sheet]]+c.column*4+c.row;
  const pushCells=new Array(32).fill(0xFFFF);
  cells.forEach((c,id)=>{
    c.id=id;
    if(c.variant==='plain')index[slot(c)]=id;
    else if(c.variant==='shuffle')shuffle[slot(c)]=id;
    else if(c.variant==='legs')legs[slot(c)]=id;
    else if(c.variant==='push')pushCells[(c.sheet==='ssj'?16:0)+c.row*4+c.beat]=id;
  });

  // Clips
  const clipNames=[...new Set(['goku','ssj'].flatMap(f=>Object.keys(data.forms[f].clips)))];
  const clipId=Object.fromEntries(clipNames.map((n,i)=>[n,i]));
  const clipBytes=[],clipPtr=[];
  for(const form of['goku','ssj'])for(const name of clipNames){
    const clip=data.forms[form].clips[name]??data.forms[form].clips.idle;
    let frames=clip.frames;if(!frames.length)frames=data.forms[form].clips[clip.fallback??'idle'].frames;
    clipPtr.push(clipBytes.length);
    clipBytes.push(frames.length,clip.loop?1:0);
    const total=frames.reduce((s,f)=>s+f.ticks,0);clipBytes.push(total&255,total>>8);
    for(const f of frames)clipBytes.push(f.column,f.ticks,f.sheet?SHEET_ID[f.sheet]:0xFF,f.row??ROW_CALLER,f.nudge??0xFF);
  }

  // Native actions (D1:37CC table, 51 entries). Header: mode, clip, run flag,
  // side-row flag, kind code; 3 sequence pointers; fixed; phases.
  const actBytes=[],actPtr=[];
  const GENERIC_KIND={idle:0,walk:1,run:2,guard:4};
  const keys=[...new Set(actions.map(e=>e.key))].filter(k=>!(k in GENERIC_KIND));
  for(const e of actions){
    actPtr.push(actBytes.length);
    let mode=MODE.nativePose;
    if(['walk','run'].includes(e.clip)&&!e.phases&&!e.fixed)mode=e.key==='guardStep'?MODE.guardStep:MODE.locomotion;
    else if(e.key==='idle')mode=MODE.idle;else if(e.key==='guard')mode=MODE.guard;
    const ptrs=[...e.pointers,0,0,0].slice(0,3);
    const kind=e.key in GENERIC_KIND?GENERIC_KIND[e.key]:0x80+keys.indexOf(e.key);
    actBytes.push(mode,clipId[e.clip],e.clip==='run'?1:0,['fall','sleep','dead'].includes(e.clip)?1:0,kind);
    for(const p of ptrs)actBytes.push(p&255,p>>8);
    // fixed: row mode, then per form: count, columns
    if(e.fixed){actBytes.push(1,rowMode(e.fixed.row));for(const f of['goku','ssj']){const cols=e.fixed.columns[f];actBytes.push(cols.length,...cols);}}
    else actBytes.push(0);
    const phases=e.phases??[];actBytes.push(phases.length);
    for(const p of phases){
      actBytes.push(p.frames.length);for(const fr of p.frames)actBytes.push(fr&255,fr>>8);
      for(const f of['goku','ssj']){const s=p.source[f];actBytes.push(rowMode(s.row),s.columns.length,...s.columns);}
    }
  }
  // Hypotenuse table (8.8) for |dx|,|dy| <= 12; distances above 12 px are
  // doors/teleports and count as zero (pose(): `if(distance>12)distance=0`).
  const hyp=[];for(let dy=0;dy<=12;dy++)for(let dx=0;dx<=12;dx++){const h=Math.hypot(dx,dy);hyp.push(h>12?0:Math.round(h*256));}
  // Flight transitions (pose(): takeoff/landing extraLift by transition age).
  const takeoffLift=[],landingLift=[];
  for(let t=0;t<64;t++)takeoffLift.push(Math.min(160,Math.round(Math.max(0,t-4)**2*.22)));
  for(let t=0;t<64;t++)landingLift.push(Math.ceil(72*Math.max(0,1-t/24)**2));

  // Emit data.asm
  const a=new Asm();
  a.raw('; Generated by snes/gen/goku.mjs - do not edit.');
  a.def('GOKU_CELL_COUNT',cells.length);a.def('GOKU_TILE_COUNT',tileCount);a.def('GOKU_TILE_BANKS',banks);
  a.def('GOKU_PALETTE_COUNT',palettes.length);a.def('GOKU_CLIP_COUNT',clipNames.length);
  for(const[n,i]of Object.entries(clipId))a.def(`GOKU_CLIP_${n.replace(/[A-Z]/g,m=>'_'+m).toUpperCase()}`,i);
  a.label('goku_palettes');for(const p of palettes)a.dw(p.pal);
  const tints=palettes.map(p=>tintTables(p.pal,p.clusterOf,boy));
  a.label('goku_tint_map');for(const t of tints)a.db(t.map);
  a.label('goku_tint_shade');for(const t of tints)a.db(t.shade);
  a.label('goku_cell_tiles');for(const c of cells)a.dw(c.tiles);
  a.label('goku_cell_mini');for(const c of cells)a.dw(c.mini);
  // Field uploads use contiguous rows: four 128-byte transfers instead of
  // sixteen scattered tiles. Keep the deduplicated tables for menu figures
  // and byte-level references. A complete cell stays inside one ROM bank.
  for(const [kind,bytes,perBank] of [['tiles',512,64],['mini',128,256]]){
    const prefix=`GOKU_DMA_${kind.toUpperCase()}`;
    for(let start=0;start<cells.length;start+=perBank){
      const group=cells.slice(start,start+perBank),packed=new Uint8Array(group.length*bytes);
      group.forEach((c,i)=>c[kind].forEach((tile,j)=>packed.set(store.tiles[tile],i*bytes+j*32)));
      xdata(`${prefix}_${start/perBank}`,packed);
    }
    a.label(`goku_dma_${kind}`);
    cells.forEach((c,i)=>a.raw(`\tdl !XDATA_${prefix}_${Math.floor(i/perBank)}+$${((i%perBank)*bytes).toString(16)} : db $00`));
  }
  a.label('goku_cell_mask');a.db(cells.map(c=>c.mask));
  a.label('goku_cell_pal');a.db(cells.map(c=>c.pal));
  a.label('goku_cell_index');a.dw(index);
  a.label('goku_shuffle_index');a.dw(shuffle);
  a.label('goku_legs_index');a.dw(legs);
  a.label('goku_push_cells');a.dw(pushCells);
  a.label('goku_portrait_tiles');a.dw(portraits.flat());
  a.label('goku_clip_ptr');a.dw(clipPtr);
  a.label('goku_clip_data');a.db(clipBytes);
  a.label('goku_action_ptr');a.dw(actPtr);
  a.label('goku_action_data');a.db(actBytes);
  a.label('goku_hypot');a.dw(hyp);
  a.label('goku_takeoff_lift');a.db(takeoffLift);
  a.label('goku_landing_lift');a.db(landingLift);
  a.def('GOKU_ACTION_COUNT',actions.length);
  // Hand sockets: packed x/y words indexed by form, column and row. Charge
  // effects query these every frame; avoid walking the authored column list.
  // Missing cells use $FFFF, outside the local 32x32 coordinate range.
  a.label('goku_socket_xy');
  for(const form of['goku','ssj']){
    const sockets=new Array(32*4).fill(0xFFFF);
    for(const[col,rows]of Object.entries(data.forms[form].sockets)){
      if(!Number.isInteger(Number(col))||Number(col)<0||Number(col)>=32||rows.length!==4)
        throw Error(`Goku socket table bounds: ${form}:${col}`);
      rows.forEach(([x,y],row)=>{
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=32||y<0||y>=32)
          throw Error(`Goku socket coordinates: ${form}:${col}:${row}`);
        sockets[Number(col)*4+row]=x|(y<<8);
      });
    }
    a.dw(sockets);
  }
  // Retain the compact list for the comparison build.
  for(const form of['goku','ssj']){
    a.label(`goku_sockets_${form}`);
    for(const[col,rows]of Object.entries(data.forms[form].sockets)){a.db([Number(col),...rows.flat()]);}
    a.db([0xFF]);
  }
  writeFileSync(join(outDir,'data.asm'),a.text());

  // Previews (not shipped): quantized cells as rendered on hardware.
  const preview=blank(34*24,34*Math.ceil(cells.length/24));
  cells.forEach((c,k)=>{const ox=(k%24)*34,oy=Math.floor(k/24)*34,pal=palettes[c.pal].pal;
    for(let i=0;i<1024;i++){const v=c.idx[i];if(!v)continue;const col=pal[v],d=((oy+(i>>5))*preview.width+ox+(i&31))*4;
      preview.data[d]=(col&31)*255/31;preview.data[d+1]=((col>>5)&31)*255/31;preview.data[d+2]=((col>>10)&31)*255/31;preview.data[d+3]=255;}});
  writeFileSync(join(outDir,'preview-cells.png'),writePng(preview));
  writeFileSync(join(outDir,'manifest.json'),JSON.stringify({tiles:tileCount,banks,cells:cells.map(c=>({id:c.id,key:c.key,pal:c.pal,mask:c.mask})),palettes:palettes.map(p=>p.pal),clips:clipNames},null,0));
  return {cells,tileCount,palettes};
}
