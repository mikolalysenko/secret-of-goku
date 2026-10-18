// Vegeta / Hyperbolic Time Chamber data for the cartridge (snes/src/modules/vegeta).
//
// Single source of truth: the browser mod's own modules, run in Node.
//  - engine/time-chamber.js: the 64x64 room layout and its vanilla map
//    compression (encodeChamberPiece), the door patch, and the chamber's
//    picture. The picture is sampled from createTimeChamber()'s own PPU hook
//    (palace-stone floor, seams, border and the pavilion art), so every pixel
//    is the browser's.
//  - engine/vegeta-sprite.js: decodeVegetaSheet() (body sheet + generated
//    Super Saiyan hair), cut into 16x16 OBJ blocks per frame.
//
// Outputs (dist/snes/gen/vegeta/):
//   chamber_gen.asm     constants and ROM patches (map pieces, door)
//   chamber_tiles.bin   BG 4bpp tiles of the chamber (VRAM tile 0 = blank)
//   chamber_pal.bin     BG palettes 2-7 (colours 32-127)
//   chamber_meta.bin    BG2 metatile definitions (local ids 1..n, 8 bytes each)
//   chamber_grid.bin    BG2 visual grid, 64 x 64 metatile ids
//   preview-*.png       renders for visual checks (not shipped)
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readPng,writePng,blank,decodeTile,encodeTile} from '../tools/gfx.mjs';

const hex=(v,n=2)=>v.toString(16).toUpperCase().padStart(n,'0');
const db=bytes=>{const out=[];for(let i=0;i<bytes.length;i+=16)out.push('\tdb '+Array.from(bytes.slice(i,i+16),b=>'$'+hex(b)).join(','));return out.join('\n');};

// ---------------------------------------------------------------------------
// Minimal DOM for the browser modules' asset loaders (Image + 2D canvas).
function withDom(fn){
  const saved={Image:globalThis.Image,document:globalThis.document};
  class FakeImage{
    set src(href){this._href=href;}
    get src(){return this._href;}
    async decode(){
      const url=new URL(this._href);url.search='';
      const img=readPng(fileURLToPath(url));
      this.width=img.width;this.height=img.height;this._data=img.data;
    }
  }
  const document={createElement(tag){
    if(tag!=='canvas')throw Error('vegeta gen: only canvas is emulated');
    const canvas={width:0,height:0,getContext(){return {
      drawImage(img){canvas._img=img;},
      getImageData(x,y,w,h){
        const src=canvas._img,data=new Uint8ClampedArray(w*h*4);
        for(let j=0;j<h;j++)for(let i=0;i<w;i++){const s=((y+j)*src.width+x+i)*4,d=(j*w+i)*4;for(let k=0;k<4;k++)data[d+k]=src._data[s+k];}
        return {data,width:w,height:h};
      },
    };}};
    return canvas;
  }};
  globalThis.Image=FakeImage;globalThis.document=document;
  const done=()=>{globalThis.Image=saved.Image;globalThis.document=saved.document;};
  return Promise.resolve().then(fn).finally(done);
}

// ---------------------------------------------------------------------------
// The chamber picture: run createTimeChamber() on a stub SNES and read its
// getColor hook for every world pixel (1024 x 1024 RGB555).
async function sampleChamber(repo,rom){
  const tc=await import(pathToFileURL(join(repo,'engine/time-chamber.js')).href);
  const ram=new Uint8Array(0x20000);
  const cart=new Uint8Array(rom);           // load() patches its own copy
  const ppu={mode:1,getColor(){return [0,0,0];}};
  const mod={options:{enabled:true},gokuActive:true,trial:{roomLoaded:true},nativeField:true,frame:0};
  const snes={ram,ppu,cart:{data:cart}};
  let arena;
  await withDom(async()=>{arena=tc.createTimeChamber(snes,mod,{loadArt:true});await arena.ready;});
  arena.load();
  ram[0xdc]=72;ram[0xdd]=0;
  const {width,height}=tc.chamber,W=width*16,H=height*16;
  const pixels=new Uint16Array(W*H);
  for(let sy=0;sy<H;sy+=224)for(let sx=0;sx<W;sx+=256){
    ram[0xa8]=sx&255;ram[0xa9]=sx>>8;ram[0xaa]=sy&255;ram[0xab]=sy>>8;
    mod.frame++;
    for(let y=0;y<224&&sy+y<H;y++)for(let x=0;x<256&&sx+x<W;x++){
      const r=ppu.getColor(0,x,y);
      pixels[(sy+y)*W+sx+x]=r[0]&0x7fff;
    }
  }
  return {tc,cart,pixels,W,H};
}

// ---------------------------------------------------------------------------
// BG conversion with shared colours: every palette keeps `fixed` at indices
// 1.. (the floor, seam and border colours, so plain floor stays exact under
// any palette); the remaining slots are fitted per tile cluster ("palette
// k-means": tiles go to the palette that reproduces them best, palettes are
// refitted to their tiles). Tiles are deduplicated with flips afterwards.
const ch=c=>[c&31,(c>>5)&31,(c>>10)&31];
const cdist=(a,b)=>{const[x,y,z]=ch(a),[p,q,r]=ch(b);return 3*(x-p)**2+4*(y-q)**2+2*(z-r)**2;};
function kmeans(hist,n,seed=[]){
  const colors=[...hist.entries()];
  if(colors.length<=n)return colors.map(([c])=>c);
  colors.sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
  const centers=[...seed];
  if(!centers.length)centers.push(colors[0][0]);
  while(centers.length<n){
    let best=null,bd=-1;
    for(const[c,w]of colors){let d=Infinity;for(const k of centers)d=Math.min(d,cdist(c,k));const s=d*Math.sqrt(w);if(s>bd){bd=s;best=c;}}
    if(bd<=0)break;centers.push(best);
  }
  let cs=centers.map(ch);
  for(let it=0;it<16;it++){
    const acc=cs.map(()=>[0,0,0,0]);
    for(const[c,w]of colors){const v=ch(c);let bi=0,bd=Infinity;
      for(let i=0;i<cs.length;i++){const d=3*(v[0]-cs[i][0])**2+4*(v[1]-cs[i][1])**2+2*(v[2]-cs[i][2])**2;if(d<bd){bd=d;bi=i;}}
      acc[bi][0]+=v[0]*w;acc[bi][1]+=v[1]*w;acc[bi][2]+=v[2]*w;acc[bi][3]+=w;}
    cs=acc.map((a,i)=>a[3]?[a[0]/a[3],a[1]/a[3],a[2]/a[3]]:cs[i]);
  }
  return [...new Set(cs.map(([r,g,b])=>Math.round(r)|(Math.round(g)<<5)|(Math.round(b)<<10)))];
}
function quantizeTiles(tiles,{palettes:P,fixed,free}){
  // tiles: [Uint16Array(64) RGB555]
  const nearestIn=(pal,c)=>{let bi=0,bd=Infinity;for(let i=0;i<pal.length;i++){const d=cdist(pal[i],c);if(d<bd){bd=d;bi=i;}}return [bi,bd];};
  const fixedSet=new Set(fixed);
  const tileHist=tiles.map(t=>{const h=new Map();for(const c of t)if(!fixedSet.has(c))h.set(c,(h.get(c)??0)+1);return h;});
  const mean=h=>{let r=0,g=0,b=0,n=0;for(const[c,w]of h){const v=ch(c);r+=v[0]*w;g+=v[1]*w;b+=v[2]*w;n+=w;}return n?[r/n,g/n,b/n]:null;};
  // initial clusters: k-means on tile mean colours (tiles without own colours go anywhere)
  const means=tileHist.map(mean);
  const keyed=means.map((m,i)=>[i,m]).filter(([,m])=>m);
  let assign=new Int16Array(tiles.length).fill(0);
  {
    const meanHist=new Map();keyed.forEach(([i,m])=>{const c=Math.round(m[0])|(Math.round(m[1])<<5)|(Math.round(m[2])<<10);meanHist.set(c,(meanHist.get(c)??0)+[...tileHist[i].values()].reduce((a,b)=>a+b,0));});
    const centers=kmeans(meanHist,P);
    keyed.forEach(([i,m])=>{const c=Math.round(m[0])|(Math.round(m[1])<<5)|(Math.round(m[2])<<10);assign[i]=nearestIn(centers,c)[0];});
  }
  let pals=[];
  for(let it=0;it<10;it++){
    pals=[];
    for(let p=0;p<P;p++){const h=new Map();tileHist.forEach((th,i)=>{if(assign[i]!==p)return;for(const[c,w]of th)h.set(c,(h.get(c)??0)+w);});pals.push([0,...fixed,...kmeans(h,free)]);}
    let changed=0;
    tileHist.forEach((th,i)=>{if(!th.size)return;let bp=assign[i],be=Infinity;
      for(let p=0;p<P;p++){let e=0;for(const[c,w]of th)e+=nearestIn(pals[p].slice(1),c)[1]*w;if(e<be){be=e;bp=p;}}
      if(bp!==assign[i]){assign[i]=bp;changed++;}});
    if(!changed)break;
  }
  for(const p of pals)while(p.length<16)p.push(0);
  const indexed=tiles.map((t,i)=>{const pal=pals[assign[i]],o=new Uint8Array(64);for(let k=0;k<64;k++)o[k]=1+nearestIn(pal.slice(1),t[k])[0];return o;});
  return {pals,assign,indexed};
}

function chamberData(repo,rom,out,sample){
  const {tc,cart,pixels,W}=sample;
  const {width:MW,height:MH,pavilion}=tc.chamber;
  // ROM patches exactly as time-chamber.js load(): both pieces packed in the
  // trial's original 388-byte slot (piece 712 at C:FE243, 713 repointed),
  // and door 304 entering below the central doorway.
  const bytes=tc.encodeChamberPiece(tc.chamberLayout()),blankPiece=tc.encodeChamberPiece(tc.chamberForeground());
  const start=0xfe243,fg=start+bytes.length,slot=388;
  if(bytes.length+blankPiece.length>slot)throw Error('Time Chamber pieces exceed the trial slot');
  for(let i=0;i<bytes.length;i++)if(cart[start+i]!==bytes[i])throw Error('time-chamber.js load() bytes differ from encodeChamberPiece');
  for(let i=0;i<blankPiece.length;i++)if(cart[fg+i]!==blankPiece[i])throw Error('time-chamber.js load() foreground differs');
  const pointer=0xd0004+713*2;
  if(cart[pointer]!==(fg&255)||cart[pointer+1]!==((fg>>8)&255))throw Error('piece 713 pointer differs');
  if(cart[0x83000+0x304*4+1]!==64)throw Error('door 304 patch differs');
  // Original bytes for the asserts.
  const orig={piece0:rom[start],pieceLast:rom[start+slot-1],ptr:rom[pointer]|rom[pointer+1]<<8,door:rom[0x83000+0x304*4+1]};

  // Visual metatiles: every 16x16 world cell, deduplicated.
  // The browser paints screen line y from world row y + scrollY; the PPU
  // shows BG row y + VOFS + 1 there (the game writes VOFS = scrollY), so a
  // native BG row holds the browser's picture one row up.
  const cellKey=(mx,my)=>{const a=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++)a.push(pixels[Math.max(0,my*16+y-1)*W+mx*16+x]);return a;};
  const ids=new Map(),cells=[],grid=new Uint8Array(MW*MH);
  for(let my=0;my<MH;my++)for(let mx=0;mx<MW;mx++){
    const px=cellKey(mx,my),k=px.join(',');
    let id=ids.get(k);
    if(id===undefined){id=cells.length;ids.set(k,id);cells.push(px);}
    grid[my*MW+mx]=id+1;                     // local BG2 id; 0 stays the blank native one
  }
  if(cells.length>190)throw Error(`too many chamber metatiles: ${cells.length}`);
  // Shared colours: the plain floor, the seam and the border (the three
  // colours of everything outside the pavilion).
  const counts=new Map();for(const c of pixels)counts.set(c,(counts.get(c)??0)+1);
  const fixed=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c])=>c);
  // 8x8 quarters of every unique metatile, in TL TR BL BR order.
  const quarters=[];
  cells.forEach(px=>{for(const[dx,dy]of[[0,0],[8,0],[0,8],[8,8]]){const t=new Uint16Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)t[y*8+x]=px[(dy+y)*16+dx+x];quarters.push(t);}});
  const PALS=6,PAL_BASE=2;
  const q=quantizeTiles(quarters,{palettes:PALS,fixed,free:15-fixed.length});
  // VRAM tile 0 is the blank tile (BG1's floor and walls become
  // transparent); the chamber's tiles follow it. Flip-deduplicated.
  const flip=(px,h,v)=>{const o=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)o[y*8+x]=px[(v?7-y:y)*8+(h?7-x:x)];return o;};
  const tileList=[new Uint8Array(64)],index=new Map([[Buffer.from(tileList[0]).toString('base64')+':-1',0]]);
  const words=quarters.map((_,i)=>{
    const px=q.indexed[i],pal=q.assign[i];
    for(const[h,v]of[[0,0],[1,0],[0,1],[1,1]]){const k=Buffer.from(flip(px,h,v)).toString('base64')+':'+pal;if(index.has(k))return index.get(k)|((pal+PAL_BASE)<<10)|(h<<14)|(v<<15);}
    const id=tileList.length;tileList.push(px);index.set(Buffer.from(px).toString('base64')+':'+pal,id);
    return id|((pal+PAL_BASE)<<10);
  });
  const meta=new Uint8Array(cells.length*8);
  words.forEach((w,i)=>{meta[i*2]=w&255;meta[i*2+1]=w>>8;});
  const tiles=new Uint8Array(tileList.length*32);
  tileList.forEach((px,i)=>tiles.set(encodeTile(px,8,0,0,4),i*32));
  const pal=new Uint8Array(PALS*32);
  q.pals.forEach((p,i)=>{for(let c=0;c<16;c++){pal[i*32+c*2]=p[c]&255;pal[i*32+c*2+1]=p[c]>>8;}});
  const bg={tileCount:tileList.length-1,palettes:q.pals};
  writeFileSync(join(out,'chamber_tiles.bin'),tiles);
  writeFileSync(join(out,'chamber_pal.bin'),pal);
  writeFileSync(join(out,'chamber_meta.bin'),meta);
  writeFileSync(join(out,'chamber_grid.bin'),grid);
  // Preview: the whole room as the cartridge will draw it.
  const prev=blank(MW*16,MH*16);
  const tilePx=t=>decodeTile(tiles,t*32);
  for(let my=0;my<MH;my++)for(let mx=0;mx<MW;mx++){
    const id=grid[my*MW+mx]-1;
    for(let q=0;q<4;q++){const w=meta[id*8+q*2]|meta[id*8+q*2+1]<<8,t=w&0x3ff,p=(w>>10)&7,h=(w>>14)&1,v=(w>>15)&1,px=tilePx(t),palette=bg.palettes[p-2];
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=px[(v?7-y:y)*8+(h?7-x:x)];const col=palette[c];const X=mx*16+(q&1)*8+x,Y=my*16+(q>>1)*8+y,d=(Y*prev.width+X)*4;
        prev.data[d]=(col&31)*255/31|0;prev.data[d+1]=((col>>5)&31)*255/31|0;prev.data[d+2]=((col>>10)&31)*255/31|0;prev.data[d+3]=255;}}
  }
  writeFileSync(join(out,'preview-chamber.png'),writePng(prev));
  const ref=blank(MW*16,MH*16);
  for(let i=0;i<pixels.length;i++){const c=pixels[i];ref.data[i*4]=(c&31)*255/31|0;ref.data[i*4+1]=((c>>5)&31)*255/31|0;ref.data[i*4+2]=((c>>10)&31)*255/31|0;ref.data[i*4+3]=255;}
  writeFileSync(join(out,'preview-chamber-browser.png'),writePng(ref));
  // Quantisation error against the browser picture (5-bit channel distance).
  let worst=0,sum=0;
  for(let i=0;i<pixels.length;i++){const a=pixels[Math.max(0,i-W)],d=(i*4);const r=Math.round(prev.data[d]*31/255),g=Math.round(prev.data[d+1]*31/255),b=Math.round(prev.data[d+2]*31/255);
    const e=Math.abs((a&31)-r)+Math.abs(((a>>5)&31)-g)+Math.abs(((a>>10)&31)-b);worst=Math.max(worst,e);sum+=e;}
  const pieces=new Uint8Array(bytes.length+blankPiece.length);pieces.set(bytes,0);pieces.set(blankPiece,bytes.length);
  const lines=[
    '; Generated by snes/gen/vegeta.mjs from engine/time-chamber.js. Do not edit.',
    `!VEGETA_CHAMBER_MAP = ${tc.chamber.map}`,
    `!VEGETA_CHAMBER_W = ${MW}`,
    `!VEGETA_CHAMBER_H = ${MH}`,
    `!VEGETA_CHAMBER_PX = ${MW*16}`,
    `!VEGETA_CHAMBER_TILES = ${bg.tileCount+1}            ; incl. blank tile 0`,
    `!VEGETA_CHAMBER_TILE_BYTES = $${hex((bg.tileCount+1)*32,4)}`,
    `!VEGETA_CHAMBER_METAS = ${cells.length}            ; BG2 local ids 1..n`,
    `!VEGETA_CHAMBER_PALS = ${bg.palettes.length}`,
    `!VEGETA_PIECE_START = $CFE243`,
    `!VEGETA_PIECE_SLOT = ${slot}`,
    `!VEGETA_PIECE_LEN = ${bytes.length+blankPiece.length}            ; bytes written into the slot`,
    `!VEGETA_PIECE_FG = $${hex(fg&0xffff,4)}            ; piece 713, bank CF`,
    `!VEGETA_PIECE_PTR = $CD${hex((pointer&0xffff),4)}    ; piece table entry of 713`,
    `!VEGETA_DOOR_X = $C8${hex((0x83000+0x304*4+1)&0xffff,4)}    ; door 304 entry x (metatiles*2)`,
    `!VEGETA_ORIG_PIECE0 = $${hex(orig.piece0)}`,
    `!VEGETA_ORIG_PIECE_LAST = $${hex(orig.pieceLast)}`,
    `!VEGETA_ORIG_PTR = $${hex(orig.ptr,4)}`,
    `!VEGETA_ORIG_DOOR = $${hex(orig.door)}`,
    `!VEGETA_NEW_PTR = $${hex(fg&0xffff,4)}`,
    `!VEGETA_NEW_DOOR = $${hex(cart[0x83000+0x304*4+1])}`,
    'macro vegeta_piece_bytes()',db(pieces),'endmacro',
  ];
  writeFileSync(join(out,'chamber_gen.asm'),lines.join('\n')+'\n');
  return {metas:cells.length,tiles:bg.tileCount+1,palettes:bg.palettes.length,error:{worst,mean:sum/pixels.length},pavilion};
}

// ---------------------------------------------------------------------------
// Vegeta: decodeVegetaSheet() frames (56 x 40, anchor 28,39; 32 frames:
// base 0-7, gold 8-15, base 16-23, gold 24-31) as 16x16 OBJ blocks.
// Each frame's block grid is placed to need the fewest blocks; a block is
// stored once per frame (no cross-frame sharing: a frame is uploaded whole).
async function vegetaData(repo,out){
  const vs=await import(pathToFileURL(join(repo,'engine/vegeta-sprite.js')).href);
  const body=readPng(join(repo,'assets/sprites/vegeta.png')),hair=readPng(join(repo,'assets/sprites/vegeta-ssj-hair.png'));
  const frames=vs.decodeVegetaSheet(body.data,body.width,body.height,hair);
  const {width:W,height:H,x:OX,y:OY}=vs.vegetaCell;
  if(frames.length!==32)throw Error('vegeta gen: expected 32 frames');
  // Palette: the sheet's own colours (1 + RGB555), 15 at most.
  const colors=new Map();
  for(const f of frames)for(const c of f)if(c)colors.set(c,(colors.get(c)??0)+1);
  if(colors.size>15)throw Error(`vegeta gen: ${colors.size} colours`);
  const palette=[0,...[...colors.keys()].sort((a,b)=>colors.get(b)-colors.get(a)||a-b)];
  const index=new Map(palette.map((c,i)=>[c,i]));
  const pal=new Uint8Array(32);
  palette.forEach((c,i)=>{const v=i?c-1:0;pal[i*2]=v&255;pal[i*2+1]=v>>8;});
  const blockTiles=[],frameInfo=[];
  let maxBlocks=0;
  for(let f=0;f<32;f++){
    const px=frames[f];
    const opaque=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&px[y*W+x]!==0;
    let best=null;
    for(let oy=0;oy<16;oy++)for(let ox=0;ox<16;ox++){
      const blocks=[];
      for(let by=-oy;by<H;by+=16)for(let bx=-ox;bx<W;bx+=16){
        let any=false;for(let y=0;y<16&&!any;y++)for(let x=0;x<16;x++)if(opaque(bx+x,by+y)){any=true;break;}
        if(any)blocks.push([bx,by]);
      }
      if(!best||blocks.length<best.length)best=blocks;
    }
    maxBlocks=Math.max(maxBlocks,best.length);
    const list=best.map(([bx,by])=>{
      const idx=new Uint8Array(256);
      for(let y=0;y<16;y++)for(let x=0;x<16;x++){const c=opaque(bx+x,by+y)?px[(by+y)*W+bx+x]:0;idx[y*16+x]=c?index.get(c):0;}
      // 16x16 block as four 8x8 tiles TL TR BL BR (uploaded as two 2-tile rows).
      const tiles=[[0,0],[8,0],[0,8],[8,8]].map(([dx,dy])=>encodeTile(idx,16,dx,dy,4));
      blockTiles.push(tiles);
      // Offsets relative to the anchor; flipped: x' = -(dx + 16).
      return {dx:bx-OX,dy:by-OY,tile:blockTiles.length-1};
    });
    frameInfo.push(list);
  }
  // Tile data per frame: the top rows (TL TR) of its blocks, then their
  // bottom rows (BL BR), so a frame is two DMA transfers into two VRAM tile
  // rows (n x 64 bytes each).
  const tiles=new Uint8Array(blockTiles.length*128),frameData=[];
  {let at=0;frameInfo.forEach(list=>{frameData.push(at);
    list.forEach(b=>{const t=blockTiles[b.tile];tiles.set(t[0],at);tiles.set(t[1],at+32);at+=64;});
    list.forEach(b=>{const t=blockTiles[b.tile];tiles.set(t[2],at);tiles.set(t[3],at+32);at+=64;});});}
  writeFileSync(join(out,'vegeta_tiles.bin'),tiles);
  writeFileSync(join(out,'vegeta_pal.bin'),pal);
  // Frame table (5 bytes per frame): block count, data offset (word, from
  // vegeta_tiles), offsets pointer (word, bank of the table); offsets: dx, dy
  // per block (signed bytes, from the anchor; flipped: x = -(dx + 16)).
  const lines=['; Generated by snes/gen/vegeta.mjs from engine/vegeta-sprite.js. Do not edit.',
    `!VEGETA_FRAMES = 32`,`!VEGETA_MAX_BLOCKS = ${maxBlocks}`,`!VEGETA_BLOCKS = ${blockTiles.length}`,
    `!VEGETA_TILE_BYTES = $${hex(tiles.length,4)}`,
    'vegeta_frame_table:'];
  const offs=[];
  frameInfo.forEach((list,f)=>{lines.push(`\tdb ${list.length} : dw $${hex(frameData[f],4)}, vegeta_frame_offsets_${f}`);});
  frameInfo.forEach((list,f)=>{offs.push(`vegeta_frame_offsets_${f}:`);offs.push('\tdb '+list.map(b=>`$${hex(b.dx&255)},$${hex(b.dy&255)}`).join(', '));});
  lines.push(...offs);
  writeFileSync(join(out,'vegeta_gen.asm'),lines.join('\n')+'\n');
  // Preview sheet (both forms) for visual checks.
  const sheet=blank(8*64,4*48);
  frameInfo.forEach((list,f)=>{const ox=(f%8)*64+28,oy=((f/8)|0)*48+44;
    for(const b of list){const t=blockTiles[b.tile];
      t.forEach((bytes,k)=>{const px=decodeTile(bytes,0,4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=px[y*8+x];if(!c)continue;const v=palette[c]-1;const X=ox+b.dx+(k&1)*8+x,Y=oy+b.dy+(k>>1)*8+y;if(X<0||Y<0||X>=sheet.width||Y>=sheet.height)continue;const d=(Y*sheet.width+X)*4;sheet.data[d]=(v&31)*255/31|0;sheet.data[d+1]=((v>>5)&31)*255/31|0;sheet.data[d+2]=((v>>10)&31)*255/31|0;sheet.data[d+3]=255;}});}});
  writeFileSync(join(out,'preview-vegeta.png'),writePng(sheet));
  // Exactness check: blocks reproduce every decoded pixel.
  let mismatch=0;
  frameInfo.forEach((list,f)=>{const got=new Uint16Array(W*H);
    for(const b of list){const t=blockTiles[b.tile];t.forEach((bytes,k)=>{const px=decodeTile(bytes,0,4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const X=b.dx+OX+(k&1)*8+x,Y=b.dy+OY+(k>>1)*8+y;if(X<0||Y<0||X>=W||Y>=H)continue;if(px[y*8+x])got[Y*W+X]=palette[px[y*8+x]];}});}
    for(let i=0;i<W*H;i++)if(got[i]!==frames[f][i])mismatch++;});
  if(mismatch)throw Error(`vegeta gen: ${mismatch} pixels differ from decodeVegetaSheet`);
  return {colors:colors.size,blocks:blockTiles.length,maxBlocks,bytes:tiles.length};
}

// ---------------------------------------------------------------------------
// The clash ball (vegeta-clash.js drawTrainingClash): for every radius 1-32
// the lower-right quadrant (px, py >= 0) as 16x16 OBJ blocks; the other
// quadrants are the same tiles flipped. Colours by rim = r - sqrt(d): < 2
// blue[0], < 5 the enemy's [1] (palette index 2, purple or gold at run time),
// < 9 blue[2], else the white core.
async function clashData(repo,out){
  const vc=await import(pathToFileURL(join(repo,'engine/vegeta-clash.js')).href);
  const {blue,gold,purple}=vc.trainingBeamPalettes;
  const white=0x7fff;
  // palette: 0 transparent, 1 blue[0], 2 enemy[1] (purple; gold swapped in), 3 blue[2], 4 white
  const pal=new Uint8Array(32),put=(i,c)=>{pal[i*2]=c&255;pal[i*2+1]=c>>8;};
  put(1,blue[0]);put(2,purple[1]);put(3,blue[2]);put(4,white);
  const tiles=[],radii=[];
  for(let r=1;r<=32;r++){
    const n=Math.ceil((r+1)/16),blocks=[];
    for(let by=0;by<n;by++)for(let bx=0;bx<n;bx++){
      const idx=new Uint8Array(256);let any=false;
      for(let y=0;y<16;y++)for(let x=0;x<16;x++){
        const px=bx*16+x,py=by*16+y,d=px*px+py*py;if(d>r*r)continue;
        const rim=r-Math.sqrt(d);idx[y*16+x]=rim<2?1:rim<5?2:rim<9?3:4;any=true;
      }
      if(any)blocks.push({bx:bx*16,by:by*16,idx});
    }
    radii.push({r,blocks});
  }
  // tiles: per radius, top rows then bottom rows of its blocks (as Vegeta's frames)
  const data=[],table=[];let at=0;
  for(const {r,blocks} of radii){
    table.push({n:blocks.length,at,offs:blocks.map(b=>[b.bx,b.by])});
    for(const b of blocks){data.push(encodeTile(b.idx,16,0,0,4),encodeTile(b.idx,16,8,0,4));at+=64;}
    for(const b of blocks){data.push(encodeTile(b.idx,16,0,8,4),encodeTile(b.idx,16,8,8,4));at+=64;}
  }
  const bytes=new Uint8Array(at);let o=0;for(const t of data){bytes.set(t,o);o+=t.length;}
  writeFileSync(join(out,'clash_tiles.bin'),bytes);
  writeFileSync(join(out,'clash_pal.bin'),pal);
  const maxBlocks=Math.max(...table.map(t=>t.n));
  const lines=['; Generated by snes/gen/vegeta.mjs from engine/vegeta-clash.js. Do not edit.',
    `!VEGETA_BALL_MAX_BLOCKS = ${maxBlocks}`,`!VEGETA_BALL_BYTES = $${hex(bytes.length,4)}`,
    `!VEGETA_BALL_GOLD = $${hex(gold[1],4)}`,`!VEGETA_BALL_PURPLE = $${hex(purple[1],4)}`,
    'vegeta_ball_table:            ; per radius 1-32: blocks, data offset, offsets pointer'];
  table.forEach((t,i)=>lines.push(`\tdb ${t.n} : dw $${hex(t.at,4)}, vegeta_ball_offsets_${i+1}`));
  table.forEach((t,i)=>{lines.push(`vegeta_ball_offsets_${i+1}:`);lines.push('\tdb '+t.offs.map(([x,y])=>`$${hex(x)},$${hex(y)}`).join(', '));});
  writeFileSync(join(out,'clash_gen.asm'),lines.join('\n')+'\n');
  return {radii:32,maxBlocks,bytes:bytes.length};
}

export async function generate({rom,repo,outDir,xdata}){
  mkdirSync(outDir,{recursive:true});
  const sample=await sampleChamber(repo,rom);
  const chamber=chamberData(repo,rom,outDir,sample);
  const vegeta=await vegetaData(repo,outDir);
  const clash=await clashData(repo,outDir);
  // The art is read only by DMA: the extended banks (ExHiROM xdata) hold it.
  if(xdata){
    xdata('vegeta_chamber_tiles',readFileSync(join(outDir,'chamber_tiles.bin')));
    xdata('vegeta_sprite_tiles',readFileSync(join(outDir,'vegeta_tiles.bin')));
    xdata('vegeta_ball_tiles',readFileSync(join(outDir,'clash_tiles.bin')));
  }
  writeFileSync(join(outDir,'summary.json'),JSON.stringify({chamber,vegeta,clash},null,1));
  return {chamber,vegeta,clash};
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const here=fileURLToPath(new URL('.',import.meta.url));
  const repo=join(here,'../..');
  const {loadBaseRom}=await import('../build.mjs');
  const r=await generate({rom:loadBaseRom(),repo,outDir:join(repo,'dist/snes/gen/vegeta')});
  console.log(JSON.stringify(r,null,1));
}
