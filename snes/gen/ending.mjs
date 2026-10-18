// Ending module data generator: King Kai's planet, globes, explosion
// fragments, Shenron's vista, wish flight, departure and cards.
// Pictures are produced with the browser engine's own code or the same
// formulas (engine/kai-planet.js, planet-view.js, planet-fragments.js,
// mana-tree-vista.js, wish-flight.js, native-radio.js), then converted to
// SNES tiles. Output: dist/snes/gen/ending/ending_data.asm (+ .bin files).
// Blobs the CPU reads (tables, block-move sources) stay in the module's fast
// data banks; everything only DMA or HDMA reads goes to extended data
// (ExHiROM banks $40-$7D, ctx.xdata), named ending_<blob> there too.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gfx,rgb,surfaceToImage,imageToSurface,quantizeSurfaces,objCell,quadCells,reduceBlocks,bgPicture,u16bytes,fitGroupPalettes,nearestIn} from './ending-art.mjs';

// A radio-window card (engine/native-radio.js radioPixels) at (x, y) of a
// transparent 256x224 picture, as a single-palette BG with priority set.
function radioCard(rom,radioPixels,text,x0,y0,paletteBase,tileBase){
  const px=radioPixels(rom,text),img=gfx.blank(256,224);
  for(let y=0;y<64;y++)for(let x=0;x<240;x++){
    const c=px[y*240+x];if(!c||y+y0>=224)continue;const v=c-1,d=((y+y0)*256+x+x0)*4;
    img.data[d]=(v&31)*255/31|0;img.data[d+1]=(v>>5&31)*255/31|0;img.data[d+2]=(v>>10&31)*255/31|0;img.data[d+3]=255;
  }
  return bgPicture(img,{maxPalettes:1,paletteBase,tileBase,priority:1});
}

const here=dirname(fileURLToPath(import.meta.url));
const VERSION=7;
// Fast data banks for the ending (lower halves): its own data bank and the
// spare code banks' lower halves assigned by the integrator. ED:0000 holds
// the module's second code area (module.asm), so it is not packed here.
export const DATA_BANKS=[0xE9,0xEC,0xEE,0xEF];
// Blobs the CPU reads in its loops (long,X or block moves into palettes):
// these stay in fast ROM. All others are DMA/HDMA sources: extended data.
const FAST_BLOBS=new Set(['fade_words','space_frag_oam','space_crack_events','space_spark_oam','space_win_ta',
  'flight_pose','flight_t12','flight_turn','flight_stars','flight_ring']);

const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');

class Out{
  constructor(){this.blobs=[];this.lines=[];}
  blob(name,data){this.blobs.push({name,data:data instanceof Uint8Array?data:new Uint8Array(data)});return name;}
  def(name,value){this.lines.push(`!${name} = ${typeof value==='number'?'$'+hex(value,value>0xffff?6:4):value}`);}
  table(label,kind,values,per=16){
    this.lines.push(`${label}:`);
    for(let i=0;i<values.length;i+=per)this.lines.push(`\t${kind} ${values.slice(i,i+per).map(v=>'$'+hex(v&(kind==='dw'?0xffff:0xff),kind==='dw'?4:2)).join(',')}`);
  }
  raw(text){this.lines.push(text);}
}

async function engine(repo,file){return import(pathToFileURL(join(repo,'engine',file)).href);}

// ---------------------------------------------------------------------------
// King Kai's planet (engine/kai-planet.js createKaiArt + planet-view kaiPlanet)
// Fade curves (shenron-ending dim/brighten, planet-view light): 33 levels of
// 8/256, 32 entries each, applied per colour channel by palette_build.
function fadeTables(o){
  const dark=[],white=[];
  for(let l=0;l<=32;l++)for(let c=0;c<32;c++){const a=l/32;dark.push(Math.round(c*(1-a)));white.push(Math.round(c+(31-c)*a));}
  o.table('ending_fade_dark','db',dark);o.table('ending_fade_white','db',white);
  // The channel tables (red c, green c << 5, blue c << 10: 32 words each)
  // of every level of a pure dark, then a pure white mix: palette_build
  // copies one set whole when only one of the two mixes is in use.
  const words=[];
  for(const curve of [dark,white])for(let l=0;l<=32;l++){
    const row=curve.slice(l*32,l*32+32);
    words.push(...row,...row.map(v=>v<<5),...row.map(v=>v<<10));
  }
  o.blob('fade_words',u16bytes(Uint16Array.from(words)));
}

async function kaiAssets(o,{rom,repo}){
  const {radioPixels}=await engine(repo,'native-radio.js');
  const {kaiActors}=await engine(repo,'kai-planet.js');
  // Backdrop: canvas drawImage(256x224) without smoothing, fully opaque.
  const backdrop=gfx.resize(gfx.readPng(join(repo,'assets/sprites/kai-planet.png')),256,224);
  for(let i=3;i<backdrop.data.length;i+=4)backdrop.data[i]=255;
  const reduced=reduceBlocks(backdrop,o.kaiTileBudget??740);
  const bg=bgPicture(reduced.img,{maxPalettes:6,paletteBase:1,fit:true});
  o.blob('kai_bg_tiles',bg.tiles);o.blob('kai_bg_map',u16bytes(bg.map));
  o.def('ENDING_KAI_TILES',bg.tileCount);
  o.table('ending_kai_bg_palettes','dw',bg.palettes.flat().map(c=>c&0x7fff));
  o.stats.kai={tiles:bg.tileCount,blocks:reduced.blocks};
  // End cards: radio window at (8,14), BG2 above the map (palette 7). Only
  // one card is resident, right after the map's tiles.
  const cardBase=bg.tileCount;
  for(const [name,text] of [['good','        SECRET OF GOKU\n          THE END'],['bad','         BAD ENDING\n      THE WORLD IS GONE.']]){
    const card=radioCard(rom,radioPixels,text,8,14,7,cardBase);
    o.blob(`kai_card_${name}_tiles`,card.tiles);o.blob(`kai_card_${name}_map`,u16bytes(card.map));
    o.table(`ending_card_${name}_palette`,'dw',card.palettes[0].map(c=>c&0x7fff));
    o.def(`ENDING_CARD_${name.toUpperCase()}_TILES`,card.tileCount);
  }
  o.def('ENDING_CARD_BASE',cardBase);
  // NPC sheet: frames cropped exactly like createKaiArt().
  const sheet=gfx.readPng(join(repo,'assets/sprites/kai-npcs.png'));
  const W=sheet.width,H=sheet.height,pix=imageToSurface(sheet,128);
  const frames=[];
  for(let i=0;i<16;i++){
    const x0=Math.round(i%4*W/4),x1=Math.round((i%4+1)*W/4),y0=Math.round((i>>2)*H/4)+(i>=4&&i<8?32:0),y1=Math.round(((i>>2)+1)*H/4)+(i<4?16:0);
    let x=x1,y=y1,right=x0,bottom=y0;
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pix[yy*W+xx]){x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
    frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  const scale=[32/Math.max(...frames.slice(0,4).map(f=>f.h)),22/Math.max(...frames.slice(4).map(f=>f.h))];
  const cells=frames.map((f,i)=>{
    const s=scale[i<4?0:1],w=Math.round(f.w*s),h=Math.round(f.h*s),surf=new Uint16Array(32*32);
    // Bottom-centre anchor: put(x-floor(w/2)+xx, y-h+yy). Cell origin = anchor-(16,32).
    const ox=16-Math.floor(w/2),oy=32-h;
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
      const c=pix[(f.y+Math.floor(yy*f.h/h))*W+f.x+Math.floor(xx*f.w/w)];
      if(c&&ox+xx>=0&&ox+xx<32&&oy+yy>=0)surf[(oy+yy)*32+ox+xx]=c;
    }
    return surf;
  });
  const kai=quantizeSurfaces(cells.slice(0,4)),bub=quantizeSurfaces(cells.slice(4));
  // 16 frames x 512 bytes, each as four 16x16 cells (core's field OBJ regions).
  o.blob('kai_npc_cells',concat([...kai.index,...bub.index].map(ix=>quadCells(ix))));
  o.table('ending_kai_npc_palette','dw',kai.palette);
  o.table('ending_bubbles_palette','dw',bub.palette);
  o.def('ENDING_KAI_X',kaiActors.kai.x);o.def('ENDING_KAI_Y',kaiActors.kai.y);
  o.def('ENDING_KAI_GOKU_X',kaiActors.goku.x);o.def('ENDING_KAI_GOKU_Y',kaiActors.goku.y);
  // Teleport-in lines (planet-view kaiPlanet arriving): 9 one-pixel lines in
  // blue[1..3]. Three 16x16 cells, a full-height line at x=0 in colour 1..3.
  const blue=[rgb(4,7,20),rgb(6,17,30),rgb(16,26,31),rgb(31,31,31)];
  const lineCells=[1,2,3].map(c=>{const ix=new Uint8Array(32*32);for(let y=0;y<32;y++)ix[y*32]=c;return quadCells(ix).slice(0,128);});
  o.blob('kai_lines_cells',concat(lineCells));
  o.table('ending_lines_palette','dw',[0,blue[1]-1,blue[2]-1,blue[3]-1,0,0,0,0,0,0,0,0,0,0,0,0]);
  // Line geometry: x, y0, length per line (planet-view kaiPlanet).
  const geo=[];for(let i=0;i<9;i++){const y0=129+i%3*2,y1=163-i%2*4;geo.push(138+i*3,y0,y1-y0+1,i%3);}
  o.table('ending_lines_geometry','db',geo);
  // Bubbles' target sampling (tickKaiScene): angle tables for the lawn
  // radii, sqrt for the uniform-area radius, and the lawn ellipse
  // ((x-128)/56)^2+((y-145)/35)^2<1 as the largest dx^2 per |dy|.
  o.table('ending_cos52','db',Array.from({length:256},(_,a)=>Math.round(Math.cos(a*Math.PI/128)*52)&255));
  o.table('ending_sin31','db',Array.from({length:256},(_,a)=>Math.round(Math.sin(a*Math.PI/128)*31)&255));
  o.table('ending_sqrt8','db',Array.from({length:256},(_,v)=>Math.min(255,Math.round(Math.sqrt((v+.5)/256)*256))));
  o.table('ending_kai_lawn','dw',Array.from({length:35},(_,dy)=>{const limit=3136*(1-dy*dy/1225);let k=0;while((k+1)<limit)k++;return k;}));
}

// ---------------------------------------------------------------------------
// Space: globes (planet-view planet()), starfield, the explosion fracture
// with its crack-reveal events, sparks and the GAME OVER card.
// BG tiles (base VRAM $2000): stars first (tile 0 empty), then the globe
// (night or day), then the card. BG palettes 1-6 globe, 7 stars + card.
const SPACE_BG_BASE=0x2000;
function encodeIndexTiles(index,w,h,{tileBase=0,palette=7,priority=0}={}){
  // Exact dedupe (no flips) of an index picture; returns tiles + 32x32 map.
  const cols=w>>3,rows=h>>3,tiles=[],keys=new Map(),map=new Uint16Array(32*32);
  const empty=new Uint8Array(64);keys.set(Buffer.from(empty).toString('base64'),0);tiles.push(empty);
  for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){
    const px=new Uint8Array(64);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)px[y*8+x]=index[(ty*8+y)*w+tx*8+x];
    const k=Buffer.from(px).toString('base64');let id=keys.get(k);
    if(id===undefined){id=tiles.length;tiles.push(px);keys.set(k,id);}
    map[ty*32+tx]=(id+tileBase)|(palette<<10)|(priority?0x2000:0);
  }
  for(let ty=rows;ty<32;ty++)for(let tx=0;tx<32;tx++)map[ty*32+tx]=tileBase|(palette<<10);
  const bytes=new Uint8Array(tiles.length*32);tiles.forEach((px,i)=>bytes.set(gfx.encodeTile(px,8,0,0,4),i*32));
  return {tiles:bytes,tileCount:tiles.length,map};
}
async function spaceAssets(o,{rom,repo}){
  const sp=await import('./ending-space.mjs');
  const {radioPixels}=await engine(repo,'native-radio.js');
  const {createNativeEffects}=await engine(repo,'native-effects.js');
  const effects=createNativeEffects(rom,JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8')));
  // BG palette 7: 1-4 star shades, 5-9 the radio card, 10-12 the teleport
  // lines (planet-view blue[0..2]).
  const cardColors=[0x0000,0x2c00,0x5250,0x739c,0x7fff],blue=sp.BLUE.map(c=>c-1);
  const pal7=[0,...[0,1,2,3].map(s=>sp.starColor(s)-1),...cardColors,blue[0],blue[1],blue[2]];while(pal7.length<16)pal7.push(0);
  o.table('ending_space_pal7','dw',pal7);
  o.table('ending_blue','dw',blue);
  // Stars (BG2, transparent between).
  const stars=sp.starList(),starIdx=new Uint8Array(256*224);
  for(const s of stars)starIdx[s.y*256+s.x]=1+s.shade;
  const st=encodeIndexTiles(starIdx,256,224,{tileBase:0});
  o.blob('space_star_tiles',st.tiles);o.blob('space_star_map',u16bytes(st.map));
  const S=st.tileCount;o.def('ENDING_STAR_TILES',S);

  // Night globe. The fracture's seams are revealed by rewriting their tiles
  // (index 15 = crack colour), so those tiles stay unique and are moved to
  // the end of the globe's tiles in order of first reveal.
  const night=sp.planetSurface(rom,{night:true});
  const fr=sp.brickFracture(night,{candidates:60,maxTiles:496});
  const crackPx=new Set();for(const p of fr.pieces)for(const i of p.edge)crackPx.add(i);
  const ageOf=i=>{const d=Math.hypot(i%256-sp.VIEW.x,(i/256|0)-sp.VIEW.y);return Math.floor(d/1.9)+1;};
  const tileOfPx=i=>((i/256|0)>>3)*32+((i%256)>>3);
  const crackTiles=new Set([...crackPx].filter(i=>ageOf(i)<=47).map(tileOfPx));
  const ng0=makeBgFitTiles(surfaceToImage(night,256,224),{tileBase:S,colors:14,unique:crackTiles});
  const minAge=new Map();for(const i of crackPx){const a=ageOf(i);if(a>47)continue;const t=tileOfPx(i);minAge.set(t,Math.min(minAge.get(t)??99,a));}
  const crackPos=[...crackTiles].sort((a,b)=>minAge.get(a)-minAge.get(b)||a-b);
  const crackIds=new Set(crackPos.map(t=>ng0.tileIds[t]));
  const order=[];for(let id=0;id<ng0.tileCount;id++)if(!crackIds.has(id))order.push(id);
  const nonCrack=order.length;for(const t of crackPos)order.push(ng0.tileIds[t]);
  const newId=new Int32Array(ng0.tileCount);order.forEach((id,k)=>newId[id]=k);
  const nightTiles=new Uint8Array(ng0.tiles.length);order.forEach((id,k)=>nightTiles.set(ng0.tiles.subarray(id*32,id*32+32),k*32));
  const nightMap=ng0.map.map(w=>{const t=(w&0x3ff)-S;return t>=0&&t<ng0.tileCount?(w&~0x3ff)|(newId[t]+S):w;});
  o.blob('space_night_tiles',nightTiles);o.blob('space_night_map',u16bytes(nightMap));
  o.table('ending_space_night_pal','dw',ng0.palettes.flat().map(c=>c&0x7fff));
  o.def('ENDING_NIGHT_TILES',ng0.tileCount);o.def('ENDING_CRACK_FIRST',S+nonCrack);o.def('ENDING_CRACK_NONCRACK',nonCrack);o.def('ENDING_CRACK_TILES',crackPos.length);
  // Crack reveal (planet-view: seams within age*1.9 of the centre). The
  // cartridge keeps a 128-tile ring mirror of the crack tiles in SRAM: at
  // age a it seeds the tiles first revealed at a from ROM, stores the rows
  // that change (base | mask in all planes) and uploads the changed span.
  // Events: mirror offset ((k & 127) * 32 + row * 2), planes 0-1, planes 2-3.
  const K=crackPos.length,kOf=new Map(crackPos.map((t,k)=>[t,k]));
  const rowMask=new Map();
  for(const i of crackPx){
    const x=i%256,y=i/256|0,a=ageOf(i);if(a>47)continue;
    const key=kOf.get(tileOfPx(i))*8+(y&7);
    if(!rowMask.has(key))rowMask.set(key,[]);rowMask.get(key).push([a,0x80>>(x&7)]);
  }
  const events=Array.from({length:49},()=>[]),changed=Array.from({length:49},()=>new Set());
  for(const [key,list] of rowMask){
    const k=key>>3,r=key&7,base=nightTiles.subarray((nonCrack+k)*32,(nonCrack+k)*32+32);
    list.sort((p,q)=>p[0]-q[0]);let m=0;
    for(let n=0;n<list.length;n++){
      m|=list[n][1];
      if(n+1<list.length&&list[n+1][0]===list[n][0])continue;
      const a=list[n][0];
      events[a].push((k&127)*32+r*2,(base[r*2]|m)|((base[r*2+1]|m)<<8),(base[16+r*2]|m)|((base[16+r*2+1]|m)<<8));
      changed[a].add(k);
    }
  }
  const firstAge=k=>minAge.get(crackPos[k]);
  // Per age (8 bytes): event byte offset.w, tiles that must be seeded by
  // then (first reveal <= age), first uploaded tile, uploaded span, spare.
  // Tile k may be seeded ahead of time once tile k-128 (same ring slot) has
  // left every upload span (2 frames of margin for a deferred upload).
  const ageRows=[],spans=[];let evWords=[];
  for(let a=0;a<49;a++){
    const ks=[...changed[a]],lo=ks.length?Math.min(...ks):0,hi=ks.length?Math.max(...ks):-1;
    const need=[...Array(K).keys()].filter(k=>firstAge(k)<=a).length;
    if(ks.length&&need-lo>128)throw Error(`crack ring mirror overflow at age ${a}`);
    spans.push([lo,hi]);
    ageRows.push(evWords.length*2,need,lo|((hi-lo+1)<<8),0);
    evWords=evWords.concat(events[a]);
  }
  ageRows.push(evWords.length*2,K,0,0);
  const lastUse=k=>{let last=-1;spans.forEach(([lo,hi],a)=>{if(k>=lo&&k<=hi)last=a;});return last;};
  const seedAge=[...Array(K).keys()].map(k=>k<128?0:lastUse(k-128)+2);
  for(let k=128;k<K;k++)if(lastUse(k-128)+1>firstAge(k))throw Error('crack ring slot reused too early');
  o.blob('space_crack_events',u16bytes(Uint16Array.from(evWords)));
  o.table('ending_crack_ages','dw',ageRows);
  o.table('ending_crack_seed','db',seedAge.map(a=>Math.min(255,a)));
  o.stats.crack={pixels:crackPx.size,tiles:K,events:evWords.length/3,bytes:evWords.length*2,maxSpan:Math.max(...changed.map(s=>s.size?Math.max(...s)-Math.min(...s)+1:0))};

  // Day globe (doomed without Frieza's crisis, departure).
  const dg=makeBgFitTiles(surfaceToImage(sp.planetSurface(rom,{night:false}),256,224),{tileBase:S,colors:15});
  o.blob('space_day_tiles',dg.tiles);o.blob('space_day_map',u16bytes(dg.map));
  o.table('ending_space_day_pal','dw',dg.palettes.flat().map(c=>c&0x7fff));
  o.def('ENDING_DAY_TILES',dg.tileCount);
  // GAME OVER card (boss-rush-death: radio window at (8,80)), after the
  // globes; its map replaces the globe's on BG1 when the card shows.
  const cardBase=S+Math.max(ng0.tileCount,dg.tileCount);
  const cardPx=radioPixels(rom,'          GAME OVER\n\n      The planet is gone.'),cardIdx=new Uint8Array(256*224);
  for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=cardPx[y*240+x];if(!c)continue;const k=cardColors.indexOf(c-1);if(k<0)throw Error('card colour');cardIdx[(y+80)*256+x+8]=5+k;}
  const cd=encodeIndexTiles(cardIdx,256,224,{tileBase:cardBase,priority:1});
  o.blob('space_card_tiles',cd.tiles);o.blob('space_card_map',u16bytes(cd.map));
  o.def('ENDING_SPACE_CARD_BASE',cardBase);
  // Escape teleport lines (planet-view escape): x = 170 + 2i, colour
  // blue[i % 3] = BG palette 7 indices 10-12, on BG1 tile columns 21-24,
  // rows 8-13 (y 64-111); a TM band per line limits them to 64+age..104-age.
  const curtainBase=cardBase+cd.tileCount,curtainTiles=new Uint8Array(4*32);
  for(let col=0;col<4;col++){const px=new Uint8Array(64);
    for(let i=0;i<12;i++){const x=170+2*i-(168+col*8);if(x<0||x>7)continue;for(let y=0;y<8;y++)px[y*8+x]=10+i%3;}
    curtainTiles.set(gfx.encodeTile(px,8,0,0,4),col*32);}
  const curtainMap=new Uint16Array(32*32);
  for(let ty=8;ty<14;ty++)for(let col=0;col<4;col++)curtainMap[ty*32+21+col]=(curtainBase+col)|(7<<10)|0x2000;
  o.blob('space_curtain_map',u16bytes(curtainMap));
  // Twinkling bright stars (planet-view sky: a cross while (age + phase) %
  // 240 < 9): alternative star tiles swapped in through BG2 map words.
  // Rows: phase, word count, 3 x (VRAM address, plain word, twinkle word).
  const twBase=curtainBase+4,twTiles=[],twRows=[];
  const bright=stars.filter(s=>s.bright);
  for(const s of bright){
    const pts=[[s.x,s.y],[s.x-1,s.y],[s.x+1,s.y],[s.x,s.y-1],[s.x,s.y+1]].filter(([x,y])=>x>=0&&x<256&&y>=0&&y<224);
    const tiles=[...new Set(pts.map(([x,y])=>(y>>3)*32+(x>>3)))];
    const words=[];
    for(const t of tiles){
      const tx=t%32,ty=t/32|0,px=new Uint8Array(64);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++)px[y*8+x]=starIdx[(ty*8+y)*256+tx*8+x];
      for(const [x,y] of pts)if((y>>3)===ty&&(x>>3)===tx)px[(y&7)*8+(x&7)]=1+s.shade;
      const id=twBase+twTiles.length;twTiles.push(gfx.encodeTile(px,8,0,0,4));
      words.push(0x5400+t,st.map[t],id|(7<<10));
    }
    while(words.length<9)words.push(0,0,0);
    twRows.push(s.phase,tiles.length,...words);
  }
  o.table('ending_twinkle','dw',twRows);o.def('ENDING_TWINKLES',bright.length);
  const extra=new Uint8Array((4+twTiles.length)*32);extra.set(curtainTiles,0);twTiles.forEach((b,i)=>extra.set(b,128+i*32));
  o.blob('space_extra_tiles',extra);
  o.def('ENDING_SPACE_CURTAIN_BASE',curtainBase);
  if(twBase+twTiles.length>512)throw Error('space BG tiles exceed 512');

  // Fragments: OBJ palettes 4-7: colours 1-13, 14 = the piece's depth side
  // (drawn 2 px right and 3 px down, as planet-view's depth pass), 15 = the
  // hot seam; 14 and 15 and the heat are set per frame.
  const P=4,groups=fr.pieces.map(p=>{const h=new Map();for(const i of p.pixels)if(!p.edge.has(i)){const c=night[i]-1;h.set(c,(h.get(c)??0)+1);}return h;});
  const fit=fitGroupPalettes(groups,{P,colors:13});
  const fragPal=[];
  for(let k=0;k<P;k++){
    const pal=fit.palettes[k]??[0];let r=0,g=0,b=0,n=0;
    fr.pieces.forEach((p,j)=>{if(fit.assign[j]!==k)return;for(const i of p.edge){const c=night[i]-1;r+=c&31;g+=c>>5&31;b+=c>>10&31;n++;}});
    const avg=n?(Math.round(r/n)|(Math.round(g/n)<<5)|(Math.round(b/n)<<10)):0;
    const row=[0,...pal.slice(0,13)];while(row.length<15)row.push(0);row.push(avg);fragPal.push(...row.slice(0,16));
  }
  o.table('ending_frag_pal','dw',fragPal);
  // Heat glow per drift frame t < 48 (heat = 1 - t/48, floor as shade()):
  // face (10,4,0), seam (26,12,2), depth (18,6) over (8,3,3).
  const heat=Array.from({length:48},(_,t)=>{const g=v=>Math.floor(v*(48-t)/48);return [g(10),g(4),g(26),g(12),g(2),g(18),g(6),0];});
  o.table('ending_heat','db',heat.flat());
  // Whole fragment palettes (64 colours) the frame copies by DMA: one per
  // face glow (g10, g4) for t < 48 (seam and depth are set per frame), one
  // per fade level (33 levels of the palette pipeline's dark curve) after.
  const clamp=v=>Math.min(31,v),ch=(c,k)=>c>>(k*5)&31,mk=(r,g,b)=>r|(g<<5)|(b<<10);
  const plain=fragPal.map((c,i)=>i%16===14?mk(8,3,3):c);
  const glowStates=[],stateOf=[];
  for(const h of heat){const key=h[0]+','+h[1];let k=glowStates.indexOf(key);if(k<0){k=glowStates.length;glowStates.push(key);}stateOf.push(k);}
  const glowPal=glowStates.flatMap(key=>{const [g10,g4]=key.split(',').map(Number);return plain.map((c,i)=>i%16===0||i%16>=14?c:mk(clamp(ch(c,0)+g10),clamp(ch(c,1)+g4),ch(c,2)));});
  o.table('ending_frag_glowpal','dw',glowPal);
  o.table('ending_frag_glowstate','db',stateOf);
  const fadePal=[];
  for(let l=0;l<=32;l++)for(const c of plain){const d=v=>Math.round(v*(1-l/32));fadePal.push(mk(d(ch(c,0)),d(ch(c,1)),d(ch(c,2))));}
  o.table('ending_frag_fadepal','dw',fadePal);
  o.stats.fragPalettes={glowStates:glowStates.length,bytes:(glowStates.length+33)*128};
  // OBJ tiles (base $0000): 32x32 blocks, 16x16 cells, and the spark strip
  // (tile rows 30-31, columns 0-7 = four 16x16 cells; the escape puts
  // Goku's 32x32 there).
  const used=new Uint8Array(16*32),vram=new Uint8Array(512*32);
  const alloc=size=>{const n=size/8;for(let r=0;r+n<=32;r+=n)for(let c=0;c+n<=16;c+=n){let free=true;for(let y=0;y<n&&free;y++)for(let x=0;x<n;x++)if(used[(r+y)*16+c+x]){free=false;break;}if(!free)continue;for(let y=0;y<n;y++)for(let x=0;x<n;x++)used[(r+y)*16+c+x]=1;return r*16+c;}throw Error('OBJ VRAM full');};
  const putTile=(tile,px)=>vram.set(gfx.encodeTile(px,8,0,0,4),tile*32);
  const SPARK_TILE=30*16;
  for(let y=30;y<32;y++)for(let x=0;x<8;x++)used[y*16+x]=1;
  fr.pieces.forEach((p,j)=>{
    const pal=fit.palettes[fit.assign[j]]??[0];
    p.index=new Map();for(const i of p.pixels)p.index.set(i,p.edge.has(i)?15:1+nearestIn(pal.slice(0,13),night[i]-1));
  });
  const bySize=fr.pieces.map((p,j)=>j).sort((a,b)=>fr.pieces[b].sprites[0].size-fr.pieces[a].sprites[0].size);
  for(const j of bySize){
    const p=fr.pieces[j];
    for(const s of p.sprites){
      s.tile=alloc(s.size);const n=s.size/8;
      for(let ty=0;ty<n;ty++)for(let tx=0;tx<n;tx++){
        const px=new Uint8Array(64);
        for(let y=0;y<8;y++)for(let x=0;x<8;x++){
          const gx=p.left+s.x+tx*8+x,gy=p.top+s.y+ty*8+y;if(gx>=256||gy>=224)continue;
          const face=p.index.get(gy*256+gx);
          px[y*8+x]=face??(p.index.has((gy-3)*256+gx-2)?14:0);
        }
        putTile(s.tile+ty*16+tx,px);
      }
    }
  }
  const sparkTile=[0,1,2,3].map(f=>SPARK_TILE+f*2);
  const gold=effects['gold-spark'],sparkPal=quantizeSurfaces(gold.map(cell=>cell));
  gold.forEach((cell,f)=>{const ix=sparkPal.index[f];for(let ty=0;ty<2;ty++)for(let tx=0;tx<2;tx++){const px=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)px[y*8+x]=ix[(ty*8+y)*16+tx*8+x];putTile(sparkTile[f]+ty*16+tx,px);}});
  o.table('ending_spark_pal','dw',sparkPal.palette);
  o.def('ENDING_SPARK_TILE',SPARK_TILE);
  let top=0;for(let t=0;t<512;t++)if(used[t])top=t+1;
  const objRows=Math.ceil(top/16);
  o.blob('space_obj',vram.slice(0,objRows*16*32));
  o.def('ENDING_SPACE_OBJ_BYTES',objRows*16*32);
  // Fragment sprites in piece order (8 bytes): x0.w y0.w (rest corner),
  // chr.w (tile | palette << 9 | priority 2), piece, flags (bit 0 32x32,
  // bit 1 x moves left, bit 2 y moves up). Offsets per drift frame t < 115:
  // |round(dx*d)|, |round(dy*d)| for every piece (ending_frag_offsets).
  o.def('ENDING_FRAG_PIECES',fr.pieces.length);
  const sprites=[];
  fr.pieces.forEach((p,j)=>{
    const pal=4+Math.max(0,fit.assign[j]);
    for(const s of p.sprites)sprites.push({x:p.left+s.x,y:p.top+s.y,chr:s.tile|(pal<<9)|0x2000,j,flags:(s.size===32?1:0)|(p.dx<0?2:0)|(p.dy<0?4:0)});
  });
  o.def('ENDING_FRAG_SPRITES',sprites.length);
  if(sprites.length>48)throw Error('fragment OAM block holds 48 sprites');
  // OAM block (slots 24-71, fixed): chr words; per drift frame t < 115 the
  // 48 (x low, y) pairs and the block's 12 high-table bytes (x bit 8,
  // size). Hidden sprites (off screen, or inside the flash disc while
  // t < 8) sit at y = 224.
  o.table('ending_frag_chr','dw',sprites.map(s=>s.chr));
  const fragOam=[];
  const cullSets=sp.sparkBudget(fr.pieces).cull;
  for(let t=0;t<sp.FRAG_FRAMES;t++){
    const hi=new Array(12).fill(0);let k=0;
    for(const p of fr.pieces){const o2=sp.pieceOffsetExact(p,t);
      for(const s of p.sprites){
        const x=p.left+s.x+o2.x,y=p.top+s.y+o2.y,size=s.size;
        const hidden=x<=-size||x>=256||y<=-size||y>=224||(t<8&&cullSets[t].has(k));
        fragOam.push(hidden?0:x&255,hidden?224:y&255);
        hi[k>>2]|=((size===32?2:0)|(!hidden&&x<0?1:0))<<((k&3)*2);
        k++;
      }}
    for(;k<48;k++)fragOam.push(0,224);
    fragOam.push(...hi);
  }
  o.blob('space_frag_oam',Uint8Array.from(fragOam));
  // Sparks: per drift frame t < 70, 18 x (x + 64, y) top-left corners;
  // keep masks from the scanline budget.
  // Sparks in OAM slots 0-17: per drift frame t < 70, 18 (x low, y) pairs
  // (y = 224: left out by the scanline budget, or off screen) and the 5
  // high-table bytes of slots 0-19 (x bit 8; sparks are 16x16).
  const budget=sp.sparkBudget(fr.pieces);
  const sparkOam=[];
  for(let t=0;t<70;t++){
    const hi=new Array(5).fill(0);
    for(let i=0;i<sp.SPARKS;i++){
      const s=sp.sparkPos(i,t),shown=(budget.keep[t]>>i&1)&&s.x>-16&&s.x<256&&s.y>-16&&s.y<224;
      sparkOam.push(shown?s.x&255:0,shown?s.y&255:224);
      if(shown&&s.x<0)hi[i>>2]|=1<<((i&3)*2);
    }
    sparkOam.push(...hi);
  }
  o.blob('space_spark_oam',Uint8Array.from(sparkOam));
  // Flash disc (t < 8, radius min(86, 18 + 10t)): k(d) = floor(sqrt(r^2 -
  // d^2)) per line offset d = 0..r. Shock ring (t = 8..89, radius 8 + 3t,
  // y-radius .42 r): the arc's inner x at d, R sqrt(1 - ((d + .5)/ry)^2),
  // d = 0..round(ry), clipped to 255. Rows: data offset.w, D, R (<= 255).
  const winRows=[],winData=[];
  for(let t=0;t<90;t++){
    const at=winData.length;let D,R;
    if(t<8){R=sp.discRadius(t);D=R;for(let d=0;d<=D;d++)winData.push(Math.floor(Math.sqrt(R*R-d*d)));}
    else{R=8+3*t;const ry=.42*R;D=Math.round(ry);for(let d=0;d<=D;d++){const u=(d+.5)/ry;winData.push(u>=1?0:Math.min(255,Math.round(R*Math.sqrt(1-u*u))));}}
    winRows.push(at,D|(Math.min(255,R)<<8));
  }
  o.blob('space_win_data',Uint8Array.from(winData));
  o.table('ending_win_rows','dw',winRows);
  // The browser's ring is 180 dots (2 degrees apart): at large radii they
  // leave lines empty. Per t, bit d = line offset d has a dot (16 bytes).
  const dots=[];
  for(let t=0;t<90;t++){
    const bits=new Array(16).fill(0);
    if(t<8)bits.fill(255);
    else{const R=8+3*t;for(let i=0;i<180;i++){const d=Math.abs(Math.round(140+Math.sin(i*Math.PI/90)*R*.42)-140);if(d<128)bits[d>>3]|=1<<(d&7);}}
    dots.push(...bits);
  }
  o.table('ending_ring_dots','db',dots);
  // Window registers WH0-WH3 come from four indirect HDMA channels reading
  // per-line byte arrays U0-U3 in SRAM (two buffers at s_big = $7000 and
  // $7400; U0 +$000, U1 +$080, U2 +$100, U3 +$180, empty bytes +$200-3).
  // Line 140 +- d reads index d (the ellipse is symmetric), lines 0-23
  // the empty bytes: the tables are constant. Lookups for a half width v:
  // 87 - v (>= 1, else 1/0 = empty left), 87 + v (<= 254, else 255/254).
  const WIN_BUFS=[0x7000,0x7400],U=[0x000,0x080,0x100,0x180],EMPTY=[1,0,0xff,0xfe],tables=[];
  for(const buf of WIN_BUFS)for(let ch=0;ch<4;ch++){
    const at=buf+U[ch],t=[24,(buf+0x200+ch)&255,(buf+0x200+ch)>>8];
    for(let d=116;d>=1;d--)t.push(1,(at+d)&255,(at+d)>>8);
    t.push(0x80|117,at&255,at>>8,0);
    tables.push(t);
  }
  const tableLen=tables[0].length;
  o.blob('space_win_hdma',Uint8Array.from(tables.flat()));
  o.def('ENDING_WIN_HDMA_LEN',tableLen);
  o.table('ending_win_empty','db',EMPTY);
  const ta=(f)=>Array.from({length:256},(_,v)=>f(v));
  o.blob('space_win_ta',Uint8Array.from([
    ...ta(v=>v<=87?87-v:1),        // TA0: outer left edge
    ...ta(v=>v<=87?87-v:0),        // TA1: inner left edge (0 with TA0 = 1: empty)
    ...ta(v=>v<=168?87+v:255),     // TA2: inner right edge
    ...ta(v=>v<=167?87+v:254),     // TA3: outer right edge (254 with TA2 = 255: empty)
  ]));
  o.stats.space={stars:S,night:ng0.tileCount,day:dg.tileCount,card:cd.tileCount,twinkleTiles:twTiles.length,bgTiles:twBase+twTiles.length,pieces:fr.pieces.length,sprites:sprites.length,objTiles:top,load:fr.load,winData:winData.length,
    sparksDropped:budget.keep.reduce((a,m)=>a+sp.SPARKS-m.toString(2).split('').filter(c=>c==='1').length,0)};
  // What the Fortress cutaway shares with the space stage.
  const globeMask=new Uint8Array(256*224),day=sp.planetSurface(rom,{night:false});
  for(let i=0;i<globeMask.length;i++)globeMask[i]=day[i]?1:0;
  return {S,stars,starMap:st.map,globeMask,pal7,blue,
    globePals:{day:dg.palettes.flat().map(c=>c&0x7fff),night:ng0.palettes.flat().map(c=>c&0x7fff)}};
}
// makeBgFit for a full picture with the space conventions: palettes 1-6.
function makeBgFitTiles(img,{tileBase,colors,unique=null}){
  const bg=bgPicture(img,{maxPalettes:6,paletteBase:1,tileBase,fit:true,colors,unique});
  return {tiles:bg.tiles,tileCount:bg.tileCount,map:bg.map,palettes:bg.palettes,tileIds:bg.tileIds};
}

// ---------------------------------------------------------------------------
// Departure (ending-departure.js; shenron-ending.js depart; orbit-effects
// stamp): the charge-orb cells and palette, the take-off rise and the
// orbit across the day globe, exact from the browser's own formulas.
async function departAssets(o,{rom,repo}){
  const {createNativeEffects}=await engine(repo,'native-effects.js');
  const {departurePose,departureOrbit,departureTiming:T}=await engine(repo,'ending-departure.js');
  const effects=createNativeEffects(rom,JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8')));
  const orb=effects['charge-orb'],q=quantizeSurfaces(orb);
  o.blob('orb_cells',concat(q.index.map(ix=>objCell(ix,16,0,0,16))));
  o.table('ending_orb_palette','dw',q.palette);
  o.def('ENDING_ORB_FRAMES',orb.length);
  // y of the pose relative to the take-off point, ages launch..space-1
  o.table('ending_depart_rise','dw',Array.from({length:T.space-T.launch},(_,t)=>departurePose(T.launch+t,{x:0,y:0}).y));
  // the miniature's (x, y) for t = 0..106 after `space` (fixed afterwards)
  const orbit=[];for(let t=0;t<=106;t++){const p=departureOrbit(T.space+t);orbit.push(p.x,p.y);}
  o.table('ending_depart_orbit','dw',orbit);
  o.def('ENDING_ORBIT_LAST',106);
}

function concat(list){const n=list.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let p=0;for(const b of list){out.set(b,p);p+=b.length;}return out;}

// ---------------------------------------------------------------------------
function pack(o){
  // First fit, largest first, within the lower 32 KiB of each data bank.
  const bins=DATA_BANKS.map(bank=>({bank,used:0,items:[]}));
  const sorted=[...o.blobs].sort((a,b)=>b.data.length-a.data.length);
  for(const b of sorted){
    const bin=bins.find(x=>x.used+b.data.length<=0x8000);
    if(!bin)throw Error(`ending data does not fit: ${b.name} (${b.data.length} bytes)`);
    b.bank=bin.bank;b.offset=bin.used;bin.used+=b.data.length;bin.items.push(b);
  }
  return bins;
}

function inputsHash(repo,rom){
  const h=createHash('sha256');
  h.update(String(VERSION));
  for(const f of ['snes/gen/ending.mjs','snes/gen/ending-art.mjs','snes/gen/ending-space.mjs','engine/planet-view.js','engine/planet-fragments.js','engine/native-effects.js','engine/native-effects.json','engine/ending-departure.js','snes/gen/ending-vista.mjs','snes/gen/ending-flight.mjs','snes/gen/ending-cutaway.mjs','engine/wish-flight.js','engine/orbit-pixels.js','engine/world-texture.js','engine/mana-tree-vista.js','engine/cinematic-map.js','tools/rom/map-codec.mjs','assets/sprites/shenron.png','assets/sprites/dragon-balls.png','snes/tools/gfx.mjs','assets/sprites/kai-planet.png','assets/sprites/kai-npcs.png','engine/kai-planet.js','engine/native-radio.js'])
    h.update(readFileSync(join(repo,f)));
  h.update(rom);
  return h.digest('hex');
}

// Extended data is registered on every build (the build places it afresh),
// from the cached .bin files when the generator's inputs are unchanged.
function registerXdata(outDir,names,xdata){
  if(!xdata)throw Error('ending: the build has no extended data (ExHiROM) support');
  for(const name of names)xdata(`ending_${name}`,readFileSync(join(outDir,`${name}.bin`)));
}

export async function generate({rom,repo,outDir,xdata}){
  const hash=inputsHash(repo,rom),stamp=join(outDir,'stamp.txt'),manifest=join(outDir,'xdata.json');
  if(existsSync(stamp)&&readFileSync(stamp,'utf8')===hash&&existsSync(join(outDir,'ending_data.asm'))&&existsSync(manifest)){
    registerXdata(outDir,JSON.parse(readFileSync(manifest,'utf8')),xdata);
    return;
  }
  const o=new Out();o.stats={};
  fadeTables(o);
  await kaiAssets(o,{rom,repo});
  const space=await spaceAssets(o,{rom,repo});
  o.cut=new Out();
  const {cutawayAssets}=await import('./ending-cutaway.mjs');
  cutawayAssets(o,{gfx,u16bytes,xblob:(n,d)=>o.blob(n,d),space});
  await departAssets(o,{rom,repo});
  const {vistaAssets}=await import('./ending-vista.mjs');
  await vistaAssets(o,{rom,repo,engine});
  const {flightAssets}=await import('./ending-flight.mjs');
  await flightAssets(o,{rom,repo,engine});
  const fast=o.blobs.filter(b=>FAST_BLOBS.has(b.name)),ext=o.blobs.filter(b=>!FAST_BLOBS.has(b.name));
  const bins=pack({blobs:fast});
  mkdirSync(outDir,{recursive:true});
  const asm=['; Generated by snes/gen/ending.mjs. Do not edit.'];
  asm.push(...o.lines.filter(l=>l.startsWith('!')));
  for(const b of o.blobs)asm.push(`!ENDING_${b.name.toUpperCase()}_SIZE = $${hex(b.data.length,4)}`);
  // DMA/HDMA sources in extended data (dist/snes/gen/xdata.asm, included
  // before the modules, defines !XDATA_ENDING_<NAME>).
  for(const b of ext){
    writeFileSync(join(outDir,`${b.name}.bin`),b.data);
    asm.push(`ending_${b.name} = !XDATA_ENDING_${b.name.toUpperCase()}`);
  }
  asm.push('pushpc');
  for(const bin of bins){
    if(!bin.items.length)continue;
    asm.push(`org $${hex(bin.bank)}0000`);
    for(const b of bin.items){
      writeFileSync(join(outDir,`${b.name}.bin`),b.data);
      asm.push(`ending_${b.name}: incbin "ending/${b.name}.bin"`);
    }
    asm.push(`assert pc() <= $${hex(bin.bank)}8000, "ending data bank ${hex(bin.bank)} overflow"`);
  }
  asm.push('pullpc');
  writeFileSync(join(outDir,'ending_data.asm'),asm.join('\n')+'\n');
  // Tables (palettes, small descriptors) are included in the code bank.
  writeFileSync(join(outDir,'ending_tables.asm'),['; Generated by snes/gen/ending.mjs. Do not edit.',...o.lines.filter(l=>!l.startsWith('!'))].join('\n')+'\n');
  // The cutaway's defines and per-age tables (the second code area).
  writeFileSync(join(outDir,'ending_cut_defs.asm'),['; Generated by snes/gen/ending.mjs. Do not edit.',...o.cut.lines.filter(l=>l.startsWith('!'))].join('\n')+'\n');
  writeFileSync(join(outDir,'ending_cut_tables.asm'),['; Generated by snes/gen/ending.mjs. Do not edit.',...o.cut.lines.filter(l=>!l.startsWith('!'))].join('\n')+'\n');
  writeFileSync(join(outDir,'stats.json'),JSON.stringify({stats:o.stats,banks:bins.map(b=>({bank:hex(b.bank),used:b.used,items:b.items.map(i=>`${i.name}:${i.data.length}`)})),
    xdata:ext.map(b=>`${b.name}:${b.data.length}`)},null,1));
  writeFileSync(manifest,JSON.stringify(ext.map(b=>b.name)));
  registerXdata(outDir,ext.map(b=>b.name),xdata);
  writeFileSync(stamp,hash);
}
