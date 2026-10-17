// Ending module data generator: King Kai's planet, globes, explosion
// fragments, Shenron's vista, wish flight, departure and cards.
// Pictures are produced with the browser engine's own code or the same
// formulas (engine/kai-planet.js, planet-view.js, planet-fragments.js,
// mana-tree-vista.js, wish-flight.js, native-radio.js), then converted to
// SNES tiles. Output: dist/snes/gen/ending/ending_data.asm (+ .bin files).
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
const VERSION=3;
// Data banks for the ending (lower halves): its own data bank and the spare
// code banks' lower halves assigned by the integrator.
export const DATA_BANKS=[0xE9,0xEC,0xED,0xEE,0xEF];

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
  // Palette 7: index 1-4 star shades, 5-9 the radio card colours.
  const cardColors=[0x0000,0x2c00,0x5250,0x739c,0x7fff];
  const pal7=[0,...[0,1,2,3].map(s=>sp.starColor(s)-1),...cardColors];while(pal7.length<16)pal7.push(0);
  o.table('ending_space_pal7','dw',pal7);
  // Stars (BG2, transparent between).
  const stars=sp.starList(),starIdx=new Uint8Array(256*224);
  for(const s of stars)starIdx[s.y*256+s.x]=1+s.shade;
  const st=encodeIndexTiles(starIdx,256,224,{tileBase:0});
  o.blob('space_star_tiles',st.tiles);o.blob('space_star_map',u16bytes(st.map));
  const S=st.tileCount;o.def('ENDING_STAR_TILES',S);
  // Bright stars twinkle (planet-view sky): x, y, phase.
  o.table('ending_twinkle','db',stars.filter(s=>s.bright).flatMap(s=>[s.x,s.y,s.phase,1+s.shade]));
  o.def('ENDING_TWINKLES',stars.filter(s=>s.bright).length);
  // Night globe with the fracture's crack tiles kept unique and index 15
  // free for the crack colour.
  const night=sp.planetSurface(rom,{night:true});
  const fr=sp.brickFracture(night,{candidates:60,maxTiles:496});
  const crackPx=new Set();for(const p of fr.pieces)for(const i of p.edge)crackPx.add(i);
  const crackTiles=new Set([...crackPx].map(i=>((i/256|0)>>3)*32+((i%256)>>3)));
  const nightImg=surfaceToImage(night,256,224);
  const ng=makeBgFitTiles(nightImg,{tileBase:S,colors:14,unique:crackTiles});
  o.blob('space_night_tiles',ng.tiles);o.blob('space_night_map',u16bytes(ng.map));
  o.table('ending_space_night_pal','dw',ng.palettes.flat().map(c=>c&0x7fff));
  o.def('ENDING_NIGHT_TILES',ng.tileCount);
  // Crack events: per age (browser reach = age*1.9), each globe tile row
  // whose crack mask grows gets its final words (base | mask in all planes).
  const ageOf=i=>{const d=Math.hypot(i%256-sp.VIEW.x,(i/256|0)-sp.VIEW.y);return Math.floor(d/1.9)+1;};
  const rowMask=new Map();
  for(const i of crackPx){
    const x=i%256,y=i/256|0,a=ageOf(i);if(a>47)continue;
    const t=(y>>3)*32+(x>>3),key=t*8+(y&7);
    if(!rowMask.has(key))rowMask.set(key,[]);rowMask.get(key).push([a,0x80>>(x&7)]);
  }
  const events=Array.from({length:49},()=>[]);
  for(const [key,list] of rowMask){
    const t=key>>3,r=key&7,tid=ng.tileIds[t],base=ng.tiles.subarray(tid*32,tid*32+32);
    list.sort((p,q)=>p[0]-q[0]);let m=0;
    for(let k=0;k<list.length;k++){
      m|=list[k][1];
      if(k+1<list.length&&list[k+1][0]===list[k][0])continue;
      const addr=SPACE_BG_BASE+(S+tid)*16+r;
      const w01=(base[r*2]|m)|((base[r*2+1]|m)<<8),w23=(base[16+r*2]|m)|((base[16+r*2+1]|m)<<8);
      events[list[k][0]].push(addr,w01,w23);
    }
  }
  const evIndex=[];let evWords=[];
  for(let a=0;a<49;a++){evIndex.push(evWords.length*2);evWords=evWords.concat(events[a]);}
  evIndex.push(evWords.length*2);
  o.blob('space_crack_events',u16bytes(Uint16Array.from(evWords)));
  o.table('ending_crack_index','dw',evIndex);
  o.stats.crack={pixels:crackPx.size,events:evWords.length/3,bytes:evWords.length*2};
  // Day globe (departure and a doomed planet without Frieza's crisis).
  const dayImg=surfaceToImage(sp.planetSurface(rom,{night:false}),256,224);
  const dg=makeBgFitTiles(dayImg,{tileBase:S,colors:15});
  o.blob('space_day_tiles',dg.tiles);o.blob('space_day_map',u16bytes(dg.map));
  o.table('ending_space_day_pal','dw',dg.palettes.flat().map(c=>c&0x7fff));
  o.def('ENDING_DAY_TILES',dg.tileCount);
  // GAME OVER card (boss-rush-death: radio window at (8,80)), after the night globe.
  const cardPx=radioPixels(rom,'          GAME OVER\n\n      The planet is gone.'),cardIdx=new Uint8Array(256*224);
  for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=cardPx[y*240+x];if(c)cardIdx[(y+80)*256+x+8]=5+cardColors.indexOf(c-1);}
  const cd=encodeIndexTiles(cardIdx,256,224,{tileBase:S+ng.tileCount,priority:1});
  o.blob('space_card_tiles',cd.tiles);o.blob('space_card_map',u16bytes(cd.map));
  o.def('ENDING_CARD_TILES_GO',cd.tileCount);
  if(S+ng.tileCount+cd.tileCount>512)throw Error('space BG tiles exceed 512');
  // Fragments: four OBJ palettes (4-7): colours 1-13, 15 = edge (animated).
  const P=4,groups=fr.pieces.map(p=>{const h=new Map();for(const i of p.pixels)if(!p.edge.has(i)){const c=night[i]-1;h.set(c,(h.get(c)??0)+1);}return h;});
  const fit=fitGroupPalettes(groups,{P,colors:13});
  const fragPal=[],hot=[];
  for(let k=0;k<P;k++){
    const pal=fit.palettes[k]??[0];let r=0,g=0,b=0,n=0;
    fr.pieces.forEach((p,j)=>{if(fit.assign[j]!==k)return;for(const i of p.edge){const c=night[i]-1;r+=c&31;g+=c>>5&31;b+=c>>10&31;n++;}});
    const avg=n?(Math.round(r/n)|(Math.round(g/n)<<5)|(Math.round(b/n)<<10)):0;
    const row=[0,...pal.slice(0,13)];while(row.length<15)row.push(0);row.push(avg);fragPal.push(...row.slice(0,16));
    const cl=v=>Math.min(31,v);hot.push(cl((avg&31)+26)|(cl((avg>>5&31)+12)<<5)|(cl((avg>>10&31)+2)<<10));
  }
  o.table('ending_frag_pal','dw',fragPal);o.table('ending_frag_hot','dw',hot);
  // Edge colour per drift frame t = 0..48 for each fragment palette: the
  // browser adds (26,12,2) * heat (heat = 1 - t/48) to the edge pixels.
  const edgeRamp=[];
  for(let t=0;t<=48;t++)for(let k=0;k<P;k++){const cool=fragPal[k*16+15],h=1-t/48,cl=v=>Math.min(31,Math.round(v));
    edgeRamp.push(cl((cool&31)+26*h)|(cl((cool>>5&31)+12*h)<<5)|(cl((cool>>10&31)+2*h)<<10));}
  o.table('ending_frag_edge','dw',edgeRamp);
  // Escape teleport lines (planet-view escape): x = 170 + 2i, colour
  // blue[i % 3] -> BG palette 1 indices 1-3; plane bytes per tile column
  // x = 168..199 (BG1 tile columns 21-24).
  const curtain=[];for(let col=0;col<4;col++){let p0=0,p1=0;for(let i=0;i<12;i++){const x=170+2*i-(168+col*8);if(x<0||x>7)continue;const c=1+i%3;if(c&1)p0|=0x80>>x;if(c&2)p1|=0x80>>x;}curtain.push(p0,p1);}
  o.table('ending_curtain_planes','db',curtain);
  o.table('ending_blue','dw',sp.BLUE.map(c=>c-1));
  // Unit circle (7-bit) and the shock ring's y-squash (planet-view: radius
  // * .42): k = round(dy / .42) per screen line offset.
  o.table('ending_unit_circle','db',Array.from({length:256},(_,j)=>Math.round(Math.sqrt(Math.max(0,1-(j/256)**2))*127)));
  // OBJ allocation in the 16x32 tile grid (OBJ base $0000): 32x32 blocks,
  // then 16x16 cells, then four spark cells.
  const used=new Uint8Array(16*32),vram=new Uint8Array(512*32);
  const alloc=size=>{const n=size/8;for(let r=0;r+n<=32;r+=n)for(let c=0;c+n<=16;c+=n){let free=true;for(let y=0;y<n&&free;y++)for(let x=0;x<n;x++)if(used[(r+y)*16+c+x]){free=false;break;}if(!free)continue;for(let y=0;y<n;y++)for(let x=0;x<n;x++)used[(r+y)*16+c+x]=1;return r*16+c;}throw Error('OBJ VRAM full');};
  const putTile=(tile,px)=>vram.set(gfx.encodeTile(px,8,0,0,4),tile*32);
  // Spark cells: a fixed 8x2 strip at tile rows 30-31 (cells 0-3 in the
  // scene's 16x16 cell layout; the escape reuses it for Goku's quad).
  const SPARK_TILE=30*16;
  for(let y=30;y<32;y++)for(let x=0;x<8;x++)used[y*16+x]=1;
  const sprites=[];const order=fr.pieces.map((p,j)=>j).sort((a,b)=>fr.pieces[b].sprites[0].size-fr.pieces[a].sprites[0].size);
  const pieceRows=[];
  fr.pieces.forEach((p,j)=>{
    const pal=fit.palettes[fit.assign[j]]??[0];
    pieceRows[j]={x:p.left,y:p.top,ux:Math.round(p.dx*127),uy:Math.round(p.dy*127),speed:Math.round(p.speed*16),pal:4+Math.max(0,fit.assign[j])};
    p.index=new Map();for(const i of p.pixels)p.index.set(i,p.edge.has(i)?15:1+nearestIn(pal.slice(0,13),night[i]-1));
  });
  for(const j of order){
    const p=fr.pieces[j];
    for(const s of p.sprites){
      const tile=alloc(s.size),n=s.size/8;
      for(let ty=0;ty<n;ty++)for(let tx=0;tx<n;tx++){
        const px=new Uint8Array(64);
        for(let y=0;y<8;y++)for(let x=0;x<8;x++){const gx=p.left+s.x+tx*8+x,gy=p.top+s.y+ty*8+y;px[y*8+x]=gx<256&&gy<224?(p.index.get(gy*256+gx)??0):0;}
        putTile(tile+ty*16+tx,px);
      }
      sprites.push({piece:j,dx:s.x,dy:s.y,size:s.size,tile});
    }
  }
  const sparkTile=[0,1,2,3].map(f=>SPARK_TILE+f*2);
  const gold=effects['gold-spark'],sparkPal=quantizeSurfaces(gold.map(cell=>cell));
  gold.forEach((cell,f)=>{const ix=sparkPal.index[f];for(let ty=0;ty<2;ty++)for(let tx=0;tx<2;tx++){const px=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)px[y*8+x]=ix[(ty*8+y)*16+tx*8+x];putTile(sparkTile[f]+ty*16+tx,px);}});
  o.table('ending_spark_pal','dw',sparkPal.palette);
  o.table('ending_spark_tiles','dw',sparkTile);
  o.def('ENDING_SPARK_TILE',SPARK_TILE);
  let top=0;for(let t=0;t<512;t++)if(used[t])top=t+1;
  const objRows=Math.ceil(top/16);
  o.blob('space_obj',vram.slice(0,objRows*16*32));
  o.def('ENDING_SPACE_OBJ_BYTES',objRows*16*32);
  o.def('ENDING_FRAG_PIECES',fr.pieces.length);o.def('ENDING_FRAG_SPRITES',sprites.length);
  o.table('ending_frag_pieces','db',pieceRows.flatMap(r=>[r.x&255,r.x>>8&255,r.y&255,r.y>>8&255,r.ux&255,r.uy&255,r.speed,r.pal]));
  o.table('ending_frag_sprites','db',sprites.flatMap(s=>[s.piece,s.dx,s.dy,s.size===32?2:0,s.tile&255,s.tile>>8]));
  o.table('ending_frag_q16','dw',Array.from({length:256},(_,t)=>Math.round(.003*t*t*16)));
  // Sparks (planet-view explodingPlanet): angle i*2.39996, distance
  // 20 + t*(.65 + (i%5)*.17).
  o.table('ending_sparks','db',Array.from({length:18},(_,i)=>{const a=i*2.39996;return [Math.round(Math.cos(a)*127)&255,Math.round(Math.sin(a)*127)&255,Math.round((.65+(i%5)*.17)*16),0];}).flat());
  o.stats.space={stars:S,night:ng.tileCount,day:dg.tileCount,card:cd.tileCount,pieces:fr.pieces.length,sprites:sprites.length,objTiles:top,load:fr.load};
}
// makeBgFit for a full picture with the space conventions: palettes 1-6.
function makeBgFitTiles(img,{tileBase,colors,unique=null}){
  const bg=bgPicture(img,{maxPalettes:6,paletteBase:1,tileBase,fit:true,colors,unique});
  return {tiles:bg.tiles,tileCount:bg.tileCount,map:bg.map,palettes:bg.palettes,tileIds:bg.tileIds};
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
  for(const f of ['snes/gen/ending.mjs','snes/gen/ending-art.mjs','snes/gen/ending-space.mjs','engine/planet-view.js','engine/planet-fragments.js','engine/native-effects.js','snes/tools/gfx.mjs','assets/sprites/kai-planet.png','assets/sprites/kai-npcs.png','engine/kai-planet.js','engine/native-radio.js'])
    h.update(readFileSync(join(repo,f)));
  h.update(rom);
  return h.digest('hex');
}

export async function generate({rom,repo,outDir}){
  const hash=inputsHash(repo,rom),stamp=join(outDir,'stamp.txt');
  if(existsSync(stamp)&&readFileSync(stamp,'utf8')===hash&&existsSync(join(outDir,'ending_data.asm')))return;
  const o=new Out();o.stats={};
  fadeTables(o);
  await kaiAssets(o,{rom,repo});
  await spaceAssets(o,{rom,repo});
  const bins=pack(o);
  mkdirSync(outDir,{recursive:true});
  const asm=['; Generated by snes/gen/ending.mjs. Do not edit.'];
  asm.push(...o.lines.filter(l=>l.startsWith('!')));
  for(const b of o.blobs)asm.push(`!ENDING_${b.name.toUpperCase()}_SIZE = $${hex(b.data.length,4)}`);
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
  writeFileSync(join(outDir,'stats.json'),JSON.stringify({stats:o.stats,banks:bins.map(b=>({bank:hex(b.bank),used:b.used,items:b.items.map(i=>`${i.name}:${i.data.length}`)}))},null,1));
  writeFileSync(stamp,hash);
}
