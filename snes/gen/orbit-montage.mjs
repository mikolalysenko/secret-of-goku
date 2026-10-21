// Orbit module: the second surge's cosmic montage (frieza-cinematic.js
// cosmicShots; frieza-collateral-view.js, cinematic-map.js, cinematic-ruins.js
// for the four town shots).
//
// Town shots are built from the game's own map data, as cinematic-map.js
// reads it (map pieces, metatiles, the tileset and palettes of the map),
// over the view the browser shows: map x s.x - 8 .. s.x + 271 (the 12-pixel
// pan and a 2-pixel shake), y s.y .. s.y + 223. Layer 0 becomes BG1 and
// layer 1 BG2, entry for entry (tile, palette 1-7, priority, flips; palette
// 0 tiles are transparent there, as in the browser), so the cartridge's two
// layers compose exactly as the browser's four passes. The tiles are the
// tileset's own, renumbered (identical ones shared). The ruin
// (cinematic-ruins.js) is an overlay: the 8x8 blocks it changes become
// tiles of their own on BG1 (in the map palette that holds their colours),
// with BG2 cleared there. The generator renders its BG layers back and
// checks them against cinematicMap / cinematicRuin pixel for pixel.
//
// BG map columns 0-33 hold map x s.x + 8c, column 63 the column left of it
// (x s.x - 8); rows 0-27 hold y s.y + 8r. Stored compactly per layer: 28
// rows of columns 0-31 (screen 0), then columns 32, 33 and 63 (28 each).
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeTile,readPng} from '../tools/gfx.mjs';

const hex4=v=>'$'+(v&0xffff).toString(16).toUpperCase().padStart(4,'0');
// The box of sprite offsets [dx, dy] as montage.asm's lists keep it: min x,
// max x, min y, max y, each + 128 (bytes).
const box=pts=>{if(!pts.length)return[0,0,0,0];
  for(const[x,y]of pts)if(x<-128||x>127||y<-128||y>127)throw Error(`orbit-montage: sprite offset ${x},${y}`);
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return[Math.min(...xs)+128,Math.max(...xs)+128,Math.min(...ys)+128,Math.max(...ys)+128];};
export const VIEW_COLS=35,VIEW_ROWS=28;

// cinematic-map.js cinematicMap, keeping what the cartridge needs: the
// metatile entries of both layers and the tileset (8-bit pixel values).
export function townSource(rom,id,{decodeMapPiece,decodeMetatiles}){
  const word=a=>rom[a]|rom[a+1]<<8,long=a=>word(a)|rom[a+2]<<16;
  const header=0x80000+word(0x87000+id*2),set=rom[header+2]&63;
  const metatiles=decodeMetatiles(rom.subarray(long(0xb4000+set*3),long(0xb4003+set*3))).metatiles;
  const pieces=[];let layer=0,width=0,height=0;
  for(let a=0x80000+word(0x85000+id*2),end=0x80000+word(0x85002+id*2);a<end;){
    if(rom[a]>=254){layer=rom[a++]===255?1:0;continue;}
    const flag=rom[a],min=rom[a+1]>>4,max=rom[a+1]&15,part=rom[a+2]|(rom[a+3]&1)<<8|(rom[a+4]&1)<<9;
    const bank=part<0xa3?13:part<0x206?14:part<0x300?15:12,at=bank*65536+word(0xd0004+part*2);
    const p=decodeMapPiece(rom.subarray(at));p.x=rom[a+3]>>1;p.y=rom[a+4]>>1;p.layer=layer;
    const value=flag===0x10?6:0;if(value>=min&&value<=max)pieces.push(p);
    width=Math.max(width,p.x+p.width);height=Math.max(height,p.y+p.height);a+=5;
  }
  const layers=[new Int16Array(width*height).fill(-1),new Int16Array(width*height).fill(-1)];
  for(const p of pieces)for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)layers[p.layer][(p.y+y)*width+p.x+x]=p.tiles[y*p.width+x]+(rom[header+2]&(p.layer?128:64)?192:0);
  const gfx=[],gfxId=rom[header]&63;
  const tile=(at,bpp=4,fill=0)=>{
    const out=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++){let c=fill;for(let p=0;p<bpp;p++)c|=(rom[at+(bpp===3&&p===2?16+y:(p>>1)*16+y*2+(p&1))]>>(7-x)&1)<<p;out[y*8+x]=c;}return out;
  };
  for(let a=0xc0000+word(0xce27e+gfxId*2),end=0xc0000+word(0xce280+gfxId*2);a<end;a+=3){
    const n=word(a),mode=n>>>13,bpp=mode===6?4:mode>=4?3:2,fill=bpp===2?((mode&2)?4:0)|((mode&1)?8:0):bpp===3&&(mode&1)?8:0;
    for(let i=0;i<=rom[a+2];i++)gfx.push(tile(long(0xce270+(bpp-2)*3)+((n&8191)+i)*bpp*8,bpp,fill));
  }
  for(let g=0;g<8;g++)for(let i=0;i<4;i++)gfx[864+g*4+i]=tile(0x1c8000+(rom[0x80441+rom[0x80400+gfxId]*2+g]&63)*512+i*32);
  const palBase=0xc8000+(rom[header+1]&127)*210;
  const palettes=[];for(let p=1;p<=7;p++){const pal=[0];for(let c=1;c<16;c++)pal.push(word(palBase+(p-1)*30+(c-1)*2)&0x7fff);palettes.push(pal);}
  return {width,height,layers,metatiles,gfx,palettes};
}

// One town shot: tiles, BG1/BG2 maps, palettes and the ruin overlay.
export function townShot(src,shot,map,ruined){
  const flip=(px,h,v)=>{const o=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)o[y*8+x]=px[(v?7-y:y)*8+(h?7-x:x)];return o;};
  const key=px=>Buffer.from(px).toString('base64');
  const tiles=[new Uint8Array(64)],index=new Map([[key(tiles[0]),0]]);
  // A tile's number and the flips that make it from a stored one.
  const place=px=>{
    for(const[h,v]of[[0,0],[1,0],[0,1],[1,1]]){const t=index.get(key(h||v?flip(px,h,v):px));if(t!==undefined)return t|(h<<14)|(v<<15);}
    const t=tiles.length;tiles.push(px);index.set(key(px),t);return t;
  };
  const W=src.width*16,x0=shot.x-8,y0=shot.y;
  // BG column of view column bx (0 = the left extension)
  const bgCol=bx=>bx===0?63:bx-1;
  const maps=[new Uint16Array(64*32),new Uint16Array(64*32)];
  for(let by=0;by<VIEW_ROWS;by++)for(let bx=0;bx<VIEW_COLS;bx++){
    const X=x0+bx*8,Y=y0+by*8,cell=(Y>>4)*src.width+(X>>4),s=((Y>>3)&1)*2+((X>>3)&1);
    for(let layer=0;layer<2;layer++){
      const id=src.layers[layer][cell];if(id<0)continue;
      const n=src.metatiles[id][s],art=src.gfx[n&1023],p=n>>10&7;
      if(!art||!p)continue;                      // (not drawn by the browser)
      // the entry's own flips applied to the art, then shared
      const t=place(flip(art,!!(n&16384),!!(n&32768)));
      maps[layer][by*64+bgCol(bx)]=(t&1023)|(p<<10)|(n&0x2000)|(t&0xC000);
    }
  }
  const intactTiles=tiles.length;
  // The ruin: each changed block as a BG1 tile in the palette holding its
  // colours, or split over BG1 and BG2 (the pixels of one palette in front,
  // the rest behind) when it mixes two; the nearest colours otherwise.
  const ruin=[];let inexact=0;
  const has=(pal,c)=>pal.indexOf(c,1);
  const near=(pal,c)=>{let bi=1,bd=Infinity;for(let i=1;i<16;i++){const d=3*((pal[i]&31)-(c&31))**2+4*((pal[i]>>5&31)-(c>>5&31))**2+2*((pal[i]>>10&31)-(c>>10&31))**2;if(d<bd){bd=d;bi=i;}}return [bi,bd];};
  for(let by=0;by<VIEW_ROWS;by++)for(let bx=0;bx<VIEW_COLS;bx++){
    let changed=false;
    for(let y=0;y<8&&!changed;y++)for(let x=0;x<8;x++){const at=(y0+by*8+y)*W+x0+bx*8+x;if(map.pixels[at]!==ruined.pixels[at]){changed=true;break;}}
    if(!changed)continue;
    const cols=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=ruined.pixels[(y0+by*8+y)*W+x0+bx*8+x];cols.push(c?c-1:-1);}
    let entry=null;
    // one palette
    for(let p=0;p<7&&!entry;p++)if(cols.every(c=>c<0||has(src.palettes[p],c)>0)){
      const px=new Uint8Array(64);cols.forEach((c,i)=>{if(c>=0)px[i]=has(src.palettes[p],c);});
      const t=place(px);entry={bg1:(t&1023)|((p+1)<<10)|(t&0xC000),bg2:0};
    }
    // two palettes: a in front (BG1), b behind (BG2)
    for(let a=0;a<7&&!entry;a++)for(let b=0;b<7&&!entry;b++){
      if(a===b||!cols.every(c=>c<0||has(src.palettes[a],c)>0||has(src.palettes[b],c)>0))continue;
      const fa=new Uint8Array(64),fb=new Uint8Array(64);
      cols.forEach((c,i)=>{if(c<0)return;const k=has(src.palettes[a],c);if(k>0)fa[i]=k;else fb[i]=has(src.palettes[b],c);});
      const ta=place(fa),tb=fb.some(v=>v)?place(fb):0;
      entry={bg1:(ta&1023)|((a+1)<<10)|(ta&0xC000),bg2:tb?(tb&1023)|((b+1)<<10)|(tb&0xC000):0};
    }
    if(!entry){
      let best=null;
      for(let p=0;p<7;p++){let err=0,miss=0;const px=new Uint8Array(64);
        cols.forEach((c,i)=>{if(c<0)return;const[k,d]=near(src.palettes[p],c);px[i]=k;err+=d;if(d)miss++;});
        if(!best||err<best.err)best={p:p+1,px,err,miss};}
      inexact+=best.miss;const t=place(best.px);
      entry={bg1:(t&1023)|(best.p<<10)|(t&0xC000),bg2:0};
    }
    ruin.push({at:by*64+bgCol(bx),...entry});
  }
  return {tiles,intactTiles,maps,ruin,inexact};
}

// The BG layers rendered back (palette entries, priority passes as the PPU:
// BG2 low, BG1 low, BG2 high, BG1 high), for the view at pan 0.
export function renderTown(t,palettes,ruinOn){
  const out=new Uint16Array(VIEW_COLS*8*VIEW_ROWS*8),W=VIEW_COLS*8;
  const maps=t.maps.map(m=>m.slice());
  if(ruinOn)for(const r of t.ruin){maps[0][r.at]=r.bg1;maps[1][r.at]=r.bg2;}
  for(const[layer,prio]of[[1,0],[0,0],[1,1],[0,1]])for(let by=0;by<VIEW_ROWS;by++)for(let bx=0;bx<VIEW_COLS;bx++){
    const e=maps[layer][by*64+(bx===0?63:bx-1)];if(!e)continue;
    if(((e>>13)&1)!==prio)continue;
    const px=t.tiles[e&1023],p=e>>10&7,h=e&16384,v=e&32768;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=px[(v?7-y:y)*8+(h?7-x:x)];if(c)out[(by*8+y)*W+bx*8+x]=1+palettes[p-1][c];}
  }
  return out;
}

export async function generate({rom,repo,outDir,genDir,xdata}){
  const eng=f=>import(pathToFileURL(join(repo,'engine',f)).href);
  const {collateralShots,civilianPose}=await eng('frieza-cinematic.js');
  const {cinematicMap}=await eng('cinematic-map.js');
  const {cinematicRuin}=await eng('cinematic-ruins.js');
  const codec=await import(pathToFileURL(join(repo,'tools/rom/map-codec.mjs')).href);
  const L=['; Generated by snes/gen/orbit-montage.mjs (do not edit)'];
  const def=(k,v)=>L.push(`!${k} = ${v}`);
  // The bulky tables go to one extended-data blob (!MTT_<NAME>: their long
  // addresses; offsets within it: !MTO_<NAME>); the code area keeps the
  // indexes and the addresses of the other blobs.
  const T={bytes:[],label(n){def(`MTO_${n}`,this.bytes.length);def(`MTT_${n}`,`!XDATA_ORBIT_MT_TABLES+${this.bytes.length}`);},
    dw(...v){for(const x of v)this.bytes.push(x&255,(x>>8)&255);},db(...v){for(const x of v)this.bytes.push(x&255);}};
  def('MT_VIEW_COLS',VIEW_COLS);def('MT_VIEW_ROWS',VIEW_ROWS);
  const report=[],towns=[];
  collateralShots.forEach((shot,k)=>{
    const src=townSource(rom,shot.map,codec),map=cinematicMap(rom,shot.map),ruined=cinematicRuin(map,shot);
    if(src.width*16!==map.width)throw Error(`orbit-montage: ${shot.name} width ${src.width*16} / ${map.width}`);
    const t=townShot(src,shot,map,ruined);
    // the layers rendered back against the browser's own picture
    for(const ruinOn of[false,true]){
      const mine=renderTown(t,src.palettes,ruinOn),ref=ruinOn?ruined.pixels:map.pixels,W=VIEW_COLS*8;let bad=0;
      for(let y=0;y<VIEW_ROWS*8;y++)for(let x=0;x<W;x++){const a=mine[y*W+x],b=ref[(shot.y+y)*map.width+shot.x-8+x];if((a||1)!==(b||1))bad++;}
      if(bad>t.inexact*(ruinOn?1:0))throw Error(`orbit-montage: ${shot.name} ${ruinOn?'ruined':'intact'} differs from the browser in ${bad} pixels`);
    }
    // tiles (4bpp), maps (compact), palettes, the ruin overlay
    const tileBytes=new Uint8Array(t.tiles.length*32);t.tiles.forEach((px,i)=>tileBytes.set(encodeTile(px,8,0,0,4),i*32));
    xdata(`orbit_mt${k}_tiles`,tileBytes);
    const compact=m=>{const v=[];for(let r=0;r<VIEW_ROWS;r++)for(let c=0;c<32;c++)v.push(m[r*64+c]);for(const c of[32,33,63])for(let r=0;r<VIEW_ROWS;r++)v.push(m[r*64+c]);return v;};
    const mapBytes=new Uint8Array([...compact(t.maps[0]),...compact(t.maps[1])].flatMap(v=>[v&255,v>>8]));
    xdata(`orbit_mt${k}_maps`,mapBytes);
    def(`MT${k}_TILES`,t.tiles.length);
    // the town's BG palettes 1-7; the ruin overlay (blocks, then per block
    // the BG map entry offset, its BG1 and BG2 values)
    T.label(`PAL${k}`);for(const p of src.palettes)T.dw(...p);
    // (a 64x32 map is two 32x32 screens: column c of row r at word
    // r * 32 + c, or $400 + r * 32 + c - 32)
    const vword=at=>{const r=at>>6,c=at&63;return c<32?r*32+c:0x400+r*32+c-32;};
    T.label(`RUIN${k}`);T.dw(t.ruin.length);for(const r of t.ruin)T.dw(vword(r.at),r.bg1,r.bg2);
    // The red tints (frieza-collateral-view.js: red 5 during 86-109 and
    // 131-154, 2 from 156): every map colour and the backdrop (0).
    for(const red of[5,2]){
      const tint=c=>Math.min(31,(c&31)+red)|(Math.floor((c>>5&31)*.78)<<5)|(Math.floor((c>>10&31)*.82)<<10);
      T.label(`RED${red}_${k}`);T.dw(tint(0));for(const p of src.palettes)T.dw(...p.map((c,i)=>i?tint(c):0));
    }
    towns.push({shot,k,map,ruined,src,t,bytes:tileBytes.length+mapBytes.length});
    report.push(`${shot.name}: ${t.tiles.length} tiles (${t.intactTiles} intact), ruin ${t.ruin.length} blocks, ${t.inexact} pixels in nearest colours, ${tileBytes.length+mapBytes.length} bytes`);
  });
  // Sprite lists for montage.asm's OAM pass (mt_list8 / mt_list16), in
  // the code area: a count word, the box of the sprites' top lefts (min x,
  // max x, min y, max y, each + 128: bytes), then per sprite dx + 128, dy +
  // 128 (bytes) and its tile | attributes word (an asm expression).
  const S={lines:['orbit_mt_lists:','orbit_mt_l_none:','\tdw 0','\tdb 0,0,0,0'],add(name,entries){
    this.lines.push(`orbit_mt_l_${name}:`,`\tdw ${entries.length}`,'\tdb '+box(entries.map(e=>[e.dx,e.dy])).join(','));
    for(const e of entries)this.lines.push(`\tdb ${e.dx+128},${e.dy+128} : dw ${e.ta}`);
    return `orbit_mt_l_${name}`;}};
  townData({L,T,S,def,xdata,report,towns,repo,civilianPose,shots:collateralShots});
  await emberCells({L,T,S,def,xdata,rom,repo});
  const burstList=await burstLists({L,S,repo});
  await aerialData({L,T,S,def,xdata,rom,repo,genDir,report,burstList});
  L.push(...S.lines);
  // cosmicShots: kind (0 town, 1 aerial), its index, duration (words); the
  // pullback and the end (frieza-cinematic.js pullbackStart, cosmicDuration)
  const {cosmicShots,aerialCuts,pullbackStart,cosmicDuration,collateralStart}=await eng('frieza-cinematic.js');
  def('MT_SHOTS',cosmicShots.length);def('MT_PULLBACK',pullbackStart);def('MT_END',cosmicDuration);
  if(collateralStart!==72)throw Error('orbit-montage: collateralStart');
  L.push('; cosmicShots: kind (0 town, 1 aerial), index, duration (words)','orbit_mt_shots:');
  for(const s of cosmicShots){const town=collateralShots.indexOf(s),aerial=aerialCuts.indexOf(s);L.push(`\tdw ${town>=0?0:1},${town>=0?town:aerial},${s.duration}`);}
  // the towns' extended data and tables, by town
  const X=(k,name)=>`!XDATA_ORBIT_MT${k}_${name}`;
  L.push('; per town: tiles (address, bank, bytes, -), maps, cells (address, bank, bytes), people, laser (address, bank)');
  L.push('orbit_mt_tiles_at:');for(const{k}of towns)L.push(`\tdw (${X(k,'TILES')})&$FFFF,(${X(k,'TILES')})>>16,${X(k,'TILES')}_SIZE,0`);
  L.push('orbit_mt_maps_at:');for(const{k}of towns)L.push(`\tdw (${X(k,'MAPS')})&$FFFF,(${X(k,'MAPS')})>>16`);
  L.push('orbit_mt_cells_at:');for(const{k}of towns)L.push(`\tdw (${X(k,'CELLS')})&$FFFF,(${X(k,'CELLS')})>>16,${X(k,'CELLS')}_SIZE,0`);
  L.push('orbit_mt_people_at:');for(const{k,shot}of towns)L.push(shot.people.length?`\tdw (${X(k,'PEOPLE')})&$FFFF,(${X(k,'PEOPLE')})>>16`:'\tdw 0,0');
  L.push('orbit_mt_laser_at:');for(const{k}of towns)L.push(`\tdw (${X(k,'LASER')})&$FFFF,(${X(k,'LASER')})>>16`);
  // per town: its tables' offsets in the blob
  for(const[name,label]of[['laser_ptrs','LASERPTR'],['fires_at','FIRES'],['pal_at','PAL'],['red5_at','RED5_'],['red2_at','RED2_'],['fragpal_at','FRAGPAL'],['ruin_at','RUIN']])
    L.push(`orbit_mt_${name}:`,'\tdw '+towns.map(({k})=>`!MTO_${label}${k}`).join(','));
  xdata('orbit_mt_tables',Uint8Array.from(T.bytes));
  report.push(`tables: ${T.bytes.length} bytes`);
  // BG3: the transparent tile ($17E) and the laser's solid one ($17F, colour
  // 1), 2bpp; the map fills: the laser's entry (tile $17F, palette 3,
  // priority) and the caption map's empty one
  L.push('orbit_mt_bg3tiles:','\tdb '+Array(16).fill(0).join(','),'\tdb '+Array.from({length:16},(_,i)=>i&1?0:255).join(','));
  L.push('orbit_mt_fill:','\tdb $7F,$2D,$7E,$01');
  L.push('orbit_mt_zero:','\tdw 0');
  // BG3 palette 3: the laser's purple (colour 1)
  L.push('orbit_mt_laserpal:','\tdw 0,'+hex4(25|(5<<5)|(27<<10))+',0,0');
  // defines first (the scene's code, assembled before the tables, uses them)
  const defs=L.filter(l=>l.startsWith('!')),rest=L.filter(l=>!l.startsWith('!'));
  writeFileSync(join(outDir,'defines.asm'),['; Generated by snes/gen/orbit-montage.mjs (do not edit)',...defs].join('\n')+'\n');
  writeFileSync(join(outDir,'montage.asm'),rest.join('\n')+'\n');
  writeFileSync(join(outDir,'report.txt'),report.join('\n')+'\n');
}

// The fires' embers (native-combustion.js 'ember' frames 0-2) at quarter
// turns 0 and 1 (2 and 3 are their flips both ways): six 16x16 cells in
// the town's OBJ palette 5 with the warning ring's colour, laid out for
// tiles $000-$00B / $010-$01B, and each turn's top left relative to the
// ember's point.
async function emberCells({L,T,S,def,xdata,rom,repo}){
  const {createNativeCombustion}=await import(pathToFileURL(join(repo,'engine/native-combustion.js')).href);
  const draw=createNativeCombustion(rom);
  const render=(frame,turn)=>{const px=new Map();draw('ember',frame,0,0,(x,y,c)=>px.set(x+','+y,c),{turn});return px;};
  // each turn's box: the cell's 16x16 positions transformed (part at -8, -8)
  const box=turn=>{let x0=Infinity,y0=Infinity;for(let py=0;py<16;py++)for(let qx=0;qx<16;qx++){const u=-8+qx,v=-8+py;const x=turn===1?-v:turn===2?-u:turn===3?v:u,y=turn===1?u:turn===2?-v:turn===3?-u:v;x0=Math.min(x0,x);y0=Math.min(y0,y);}return[x0,y0];};
  const ring=29|(6<<5)|(19<<10),cols=[ring],cells=[];
  for(const turn of[0,1])for(let f=0;f<3;f++){const px=render(f,turn),[x0,y0]=box(turn),img=new Int32Array(256).fill(-1);
    for(const[k,c]of px){const[x,y]=k.split(',').map(Number);img[(y-y0)*16+x-x0]=c-1;if(!cols.includes(c-1))cols.push(c-1);}
    cells.push(img);}
  // turns 2 and 3 are turns 0 and 1 flipped both ways
  for(const[turn,base]of[[2,0],[3,1]])for(let f=0;f<3;f++){const px=render(f,turn),[x0,y0]=box(turn),ref=cells[base*3+f];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){const c=px.get((x0+x)+','+(y0+y)),want=ref[(15-y)*16+15-x];if((c===undefined?-1:c-1)!==want)throw Error('orbit-montage: ember turn '+turn+' is not a flip');}}
  if(cols.length>15)throw Error('orbit-montage: ember colours '+cols.length);
  const pal=[0,...cols];
  const tile=(img,tx,ty)=>{const idx=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=img[(ty*8+y)*16+tx*8+x];if(c>=0)idx[y*8+x]=pal.indexOf(c);}return encodeTile(idx,8,0,0,4);};
  // rows: the six cells' tops, then their bottoms
  const bytes=[];
  for(const ty of[0,1])for(let c=0;c<6;c++)for(const tx of[0,1])bytes.push(...tile(cells[c],tx,ty));
  xdata('orbit_mt_embers',Uint8Array.from(bytes));
  const tileOf=[0x000,0x002,0x004,0x006,0x008,0x00A];
  // OBJ palette 5 (the ring's colour first)
  T.label('RINGPAL');T.dw(...pal,...Array(16-pal.length).fill(0));
  // An ember's list per frame (0-2) and quarter turn (turns 1 and 3 the
  // turned cells, 2 and 3 flipped both ways): its cell's top left from the
  // point; per age (0-23) and turn (age * 4 + turn) the list
  const names=[];
  for(let f=0;f<3;f++)for(let u=0;u<4;u++){const[dx,dy]=box(u);
    names[f*4+u]=S.add(`e${f}_${u}`,[{dx,dy,ta:hex4(tileOf[(u&1)*3+f]|(5<<9)|0x3000|(u>=2?0xC000:0))}]);}
  L.push('orbit_mt_ember_l:');
  for(let age=0;age<24;age++)L.push('\tdw '+[0,1,2,3].map(u=>names[Math.floor(age/8)*4+u]).join(','));
}

// The Exploder's burst frames (native-combustion.js 'burst' 0-6, the
// orbit's resident cells: orbit-fx.mjs) as lists per frame and mirroring
// (bit 0 x, bit 1 y: a mirrored part's top left at -x - 15, its flip
// toggled); per fire age (0-52: frame age / 7, mirror seed & 1; frame 7
// none) and per burst and age after the hit (burst i, age 0-41: frame age
// / 6; mirroring: flip i & 1, quarter turns 2 and 3 both ways, 1 and 3
// drawn as 0 and 2) the list.
async function burstLists({L,S,repo}){
  const {combustionFrames}=await import(pathToFileURL(join(repo,'engine/native-combustion-data.js')).href);
  const name=[];
  // (a frame filling a 32x32 square is orbit-fx's composite: its quarters
  // are 16x16 cells with the parts' flips drawn in)
  const {burstSquare}=await import('./orbit-fx.mjs');
  combustionFrames.burst.forEach((parts,f)=>{const sq=burstSquare(parts);for(let m=0;m<4;m++)name[f*4+m]=S.add(`b${f}_${m}`,parts.map(p=>{
    const q=sq?((p.x|0)-sq.x)/16+((p.y|0)-sq.y)/8:0;
    const fx=(sq?0:p.flipX?1:0)^(m&1),fy=(sq?0:p.flipY?1:0)^(m>>1&1);
    const cell=sq?`!OFX_COMBC_${f}_${q}`:`!OFX_COMB_${p.cell}`;
    return {dx:m&1?-p.x-15:p.x,dy:m&2?-p.y-15:p.y,ta:`${cell}|(!OFX_PAL_FIRE<<9)|$3000|${hex4((fx<<14)|(fy<<15))}`};}));});
  const list=(f,m)=>f<combustionFrames.burst.length?name[f*4+m]:'orbit_mt_l_none';
  L.push('orbit_mt_fire_l:');
  for(let age=0;age<53;age++)L.push(`\tdw ${list(Math.floor(age/7),0)},${list(Math.floor(age/7),1)}`);
  L.push('orbit_mt_burst_l:');
  for(let i=0;i<9;i++){const m=((i%4)>=2?3:0)^(i&1),row=[];for(let age=0;age<42;age++)row.push(list(Math.floor(age/6),m));
    for(let a=0;a<42;a+=14)L.push('\tdw '+row.slice(a,a+14).join(','));}
  L.push('orbit_mt_burst_row:','\tdw '+Array.from({length:9},(_,i)=>i*84).join(','));
  return list;
}

// The aerial cuts (aerial-melee.js): the world-flight cloud strip
// (nativeCloud) at 1x and 2x as BG tiles and one shared 64x32 map (rows 0-3
// the 2x strip, 4-5 the 1x strip, 6-7 and 8-9 the 2x layer's copies 5 and
// 0 where they share lines, the rest empty: per line HDMA scroll places one
// copy, or that pair, per BG); the gradient on BG3; the palettes in CGRAM order with
// their pale flashes (planet-view.js flash: toward (28, 30, 31)); per
// frame of each cut a draw record (the fighters, the sparks, the flash,
// the cues, the clouds' travel); fx.burst's places and lists (large: nine
// sub-bursts four frames apart).
async function aerialData({L,T,S,def,xdata,rom,repo,genDir,report,burstList}){
  const {nativeCloud,aerialMeleePose}=await import(pathToFileURL(join(repo,'engine/aerial-melee.js')).href);
  const {aerialCuts}=await import(pathToFileURL(join(repo,'engine/frieza-cinematic.js')).href);
  const {orbitVectors}=await import(pathToFileURL(join(repo,'engine/orbit-pixels.js')).href);
  const {friezaFull,AERIAL_GOKU}=await import(pathToFileURL(join(repo,'snes/gen/orbit-sprites.mjs')).href);
  const strip=nativeCloud(rom);
  const flip=(px,h,v)=>{const o=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)o[y*8+x]=px[(v?7-y:y)*8+(h?7-x:x)];return o;};
  const key=px=>Buffer.from(px).toString('base64');
  const tiles=[new Uint8Array(64)],index=new Map([[key(tiles[0]),0]]);
  const place=px=>{
    if(px.every(v=>!v))return 0;
    for(const[h,v]of[[0,0],[1,0],[0,1],[1,1]]){const t=index.get(key(h||v?flip(px,h,v):px));if(t!==undefined)return t|(h<<14)|(v<<15);}
    const t=tiles.length;tiles.push(px);index.set(key(px),t);return t;
  };
  const entry=t=>t?(t&1023)|(2<<10)|(t&0xC000):0;     // BG palette 2, priority 0
  // map rows 0-9 of both screens (column c of row r at r * 64 + c here)
  const map=new Uint16Array(64*10);
  const strip2=(x,y)=>x>=0&&x<240&&y>=0&&y<32?strip[(y>>1)*120+(x>>1)]:0;
  const image=(row,rows,cols,at)=>{for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){const px=new Uint8Array(64);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)px[y*8+x]=at(tx*8+x,ty*8+y);
    map[(row+ty)*64+tx]=entry(place(px));}};
  image(0,4,30,(x,y)=>strip2(x,y));                                 // 2x
  image(4,2,15,(x,y)=>strip[y*120+x]);                              // 1x
  // The 2x layer's copies 5 and 0 share 11 lines (copy 0's top 21 below
  // copy 5's, copy 5 in front): their pixels there with copy 0 at x 0 and
  // copy 5 at 69 (their places but for s = scroll mod 416 in 1-69), or copy
  // 5 at 0 and copy 0's first 69 columns at 347 (s in 1-69: copy 0 shows
  // no more of itself, at 187 or right of it)
  image(6,2,39,(x,y)=>y<11?strip2(x-69,21+y)||strip2(x,y):0);
  image(8,2,52,(x,y)=>y<11?strip2(x,21+y)||(x>=347?strip2(x-347,y):0):0);
  if(tiles.length>512)throw Error('orbit-montage: cloud tiles '+tiles.length);
  // the tiles from BG tile 0, BG3's solid tile (colour 1) after them
  const tileBytes=new Uint8Array(tiles.length*32);tiles.forEach((px,i)=>tileBytes.set(encodeTile(px,8,0,0,4),i*32));
  xdata('orbit_mta_tiles',tileBytes);
  // The Mode 7 image's 512-byte chunks (VRAM words c * $100) a cut leaves
  // alone: past its tiles, beside its map ($2000-$27FF) and BG3's ($3000-
  // $33FF). The second cut sends them ahead for the pullback's load
  // (montage.asm mt_preload).
  {
    const used=[[0,tileBytes.length/2],[0x2000,0x2800],[0x3000,0x3400]],free=[];
    for(let c=0;c<64;c++){const a=c*0x100,b=a+0x100;if(!used.some(([u0,u1])=>a<u1&&b>u0))free.push(c);}
    L.push('orbit_mt_m7pre:','\tdw '+free.join(','));def('MT_M7PRE_N',free.length);
  }
  // (in VRAM order: screen 0's rows 0-9, then screen 1's)
  T.label('MAPA');for(const sc of[0,1])for(let r=0;r<10;r++)T.dw(...map.slice(r*64+sc*32,r*64+sc*32+32));
  // BG3's map: the gradient's bands (row r in palette min(6, r / 4)) of the
  // laser's solid tile ($17F, colour 1), priority 0 (below everything)
  T.label('AGRAD');for(let r=0;r<32;r++)T.dw(...Array(32).fill(0x17F|(Math.min(6,r>>2)<<10)));
  // CGRAM in the order the vblank sends it: 0-27 (the backdrop and BG3
  // palettes 0-6: the gradient's bands in colour 1), 32-47 (the clouds,
  // BG palette 2), 128-159 (OBJ fire, Goku), 192-207 (OBJ blue), 224-255
  // (OBJ Frieza, gold); then the same pale at the flash levels 1-5
  const rgb=(r,g,b)=>r|(g<<5)|(b<<10);
  const grad=[];for(let p=0;p<7;p++)grad.push(p?0:rgb(3,5,12),rgb(3+p,5+p,12+p),0,0);
  const cloud=[0];for(let c=1;c<16;c++)cloud.push(rgb(Math.min(31,12+c),Math.min(31,16+c),Math.min(31,22+(c>>1))));
  const fx=JSON.parse(readFileSync(join(genDir,'orbit-fx/palettes.json'),'utf8'));
  const gokuPal=JSON.parse(readFileSync(join(genDir,'goku/manifest.json'),'utf8')).palettes[1];
  const {friezaPalette}=await friezaFull(repo);
  const pad16=a=>{const r=a.slice(0,16);while(r.length<16)r.push(0);return r;};
  const base=[...grad,...cloud,...pad16(fx.fire),...pad16(gokuPal),...pad16(fx.blue),...pad16(friezaPalette),...pad16(fx.gold)];
  if(base.length!==124)throw Error('orbit-montage: aerial palette '+base.length);
  // the flash levels: 1 the hits' 0.16, 2-5 the explosion's (1 - blast / 4) .8
  const alphas=[0,.16,...[0,1,2,3].map(b=>(1-b/4)*.8)];
  const pale=(c,a)=>{const mix=(n,t)=>Math.round(n+(t-n)*a);return mix(c&31,28)|(mix(c>>5&31,30)<<5)|(mix(c>>10&31,31)<<10);};
  T.label('APAL');for(const a of alphas)T.dw(...base.map(c=>a?pale(c,a):c));
  def('MTA_PAL_BYTES',base.length*2);
  // Records: per frame of a cut (20 bytes): flags (bit 0 Goku, 1 Frieza, 2
  // teleport cue, 3 impact cue, 4 power burst, 5 Fortress break), the flash
  // level, Goku's cell, Frieza's (frame 4/5/6 x flipped), Goku's top left,
  // Frieza's top left (words), two sparks (kind: 1-6 impact-spark frames,
  // 7-10 gold-spark; 0 none; the first in front) and their top lefts
  // (bytes), the clouds' travel (word).
  const gokuCell=(column,row)=>{const i=AERIAL_GOKU.findIndex(([c,r])=>c===column&&r===row);if(i<0)throw Error(`orbit-montage: no Goku cell ${column},${row}`);return i;};
  const flashLevel=a=>{const i=alphas.indexOf(a);if(i<0)throw Error('orbit-montage: flash '+a);return i;};
  const word=v=>[v&255,(v>>8)&255];
  const rec=[],first=[];
  aerialCuts.forEach((shot,k)=>{
    first.push(rec.length/20);
    for(let age=0;age<shot.duration;age++){
      const p=aerialMeleePose(shot,age),blast=age-shot.impact;
      let goku=null,frieza=null,sparks=[],flash=0;
      if(age<30){goku={cell:gokuCell(34,2),x:68,y:128};frieza={frame:4,flip:true,x:190,y:102};}
      else if(p.active){
        const side=p.index&1?-1:1,attack=p.phase>=4&&p.phase<=8,kick=p.index%3===2;
        // (drawn in this order: the last in front)
        if(p.phase<3)sparks=[{kind:1+p.phase%6,x:p.x-18*side,y:p.y},{kind:7+p.phase%4,x:p.x+18*side,y:p.y}];
        else{
          goku={cell:gokuCell(attack?(kick?16:12):34,side>0?2:1),x:p.x-18*side,y:p.y};
          frieza={frame:attack?(p.index&1?5:6):4,flip:side>0,x:p.x+18*side,y:p.y+19};
          if(attack){sparks=[{kind:1+(p.phase-4)%6,x:p.x,y:p.y}];if(p.phase===5)flash=.16;}
        }
      }else if(blast<0){
        const t=age-(shot.impact-30),gap=Math.max(10,60-t*2);
        goku={cell:gokuCell(12,2),x:128-gap,y:112};frieza={frame:5,flip:true,x:128+gap,y:131};
      }else{
        if(blast<4)flash=(1-blast/4)*.8;
        if(blast>42){goku={cell:gokuCell(36+((age>>2)&3),3),x:112,y:112-(blast-42)*5};frieza={frame:5,flip:true,x:150,y:136-(blast-42)*5};}
      }
      const flags=(goku?1:0)|(frieza?2:0)|(p.teleport?4:0)|(p.hit?8:0)|(p.explode?16:0)|(age===shot.impact+18?32:0);
      const travel=Math.min(age,60)*2+Math.max(0,Math.min(age-60,60))*4+Math.max(0,age-120)*(shot.intensity?9:6);
      const s=[...sparks].reverse();       // front first
      for(const sp of s)if(sp.x-8<0||sp.x-8>255||sp.y-8<0||sp.y-8>255)throw Error('orbit-montage: spark place');
      rec.push(flags,flashLevel(flash),goku?goku.cell:0,frieza?(frieza.frame-4)*2+(frieza.flip?1:0):0,
        ...word(goku?goku.x-16:0),...word(goku?goku.y-16:0),...word(frieza?frieza.x-24:0),...word(frieza?frieza.y-44:0),
        s[0]?.kind??0,s[1]?.kind??0,s[0]?s[0].x-8:0,s[0]?s[0].y-8:0,s[1]?s[1].x-8:0,s[1]?s[1].y-8:0,...word(travel));
    }
    report.push(`aerial ${k}: ${shot.duration} frames, impact ${shot.impact}`);
  });
  xdata('orbit_mta_rec',Uint8Array.from(rec));
  report.push(`aerial records: ${rec.length} bytes`);
  def('MTA_REC',20);
  report.push(`aerial clouds: ${tiles.length} tiles`);
  // fx.burst (large): sub-burst i at age - 4 i (0-41), its place
  // ((v * radius) >> 8, v = orbitVectors[(i * 6) & 15], radius 8 + min(24,
  // t), none for i = 0) + 128 (bytes) and its list (frame t / 6; turn i & 3,
  // flip i & 1)
  const places=[];
  for(let i=0;i<9;i++)for(let t=0;t<42;t++){const[vx,vy]=orbitVectors[(i*6)&15],radius=i?8+Math.min(24,t):0;places.push(((vx*radius)>>8)+128,((vy*radius)>>8)+128);}
  T.label('ABURST_OFF');T.db(...places);
  L.push('orbit_mt_aburst_l:');
  for(let i=0;i<9;i++){const m=((i&3)>=2?3:0)^(i&1),row=[];for(let t=0;t<42;t++)row.push(burstList(Math.floor(t/6),m));
    for(let a=0;a<42;a+=14)L.push('\tdw '+row.slice(a,a+14).join(','));}
  // per cut: its first record, duration, impact, intensity
  L.push('orbit_mt_aerial_at:');
  aerialCuts.forEach((shot,k)=>L.push(`\tdw ${first[k]},${shot.duration},${shot.impact},${shot.intensity}`));
  // the cells (bank !OSP_BANK): Goku's ten, Frieza's frames 4-6 as drawn and flipped
  L.push('orbit_mt_goku_cell:','\tdw '+AERIAL_GOKU.map(([c,r])=>`!OSP_GOKU_FULL_${c}_${r}`).join(','));
  L.push('orbit_mt_frieza_cell:','\tdw '+[4,5,6].flatMap(f=>[`!OSP_FRIEZA_FULL_${f}`,`!OSP_FRIEZA_FULL_${f}_FLIP`]).join(','));
  // the fighters' sprites from a cell slot's first tile: Frieza 48x48 as a
  // 32x32 and five 16x16 (OBJ palette 6), Goku a 32x32 (palette 1); the
  // second cut's four more bursts (places)
  S.add('fzb',[{dx:0,dy:0,ta:hex4((6<<9)|0x3000)}]);
  S.add('fzs',[[32,0,0x004],[32,16,0x024],[0,32,0x040],[16,32,0x042],[32,32,0x044]].map(([dx,dy,t])=>({dx,dy,ta:hex4(t|(6<<9)|0x3000)})));
  S.add('gk',[{dx:0,dy:0,ta:hex4((1<<9)|0x3000)}]);
  S.add('one',[{dx:0,dy:0,ta:'0'}]);                // (a spark: its tile from the caller)
  L.push('orbit_mt_aextra:','\tdw '+[0,1,2,3].flatMap(i=>[128+(i&1?1:-1)*(28+i*10),112+(i<2?-1:1)*22]).join(','));
  // the sparks: impact-spark frames 0-5 (blue), gold-spark 0-3 (gold)
  L.push('orbit_mt_stamp:','\tdw 0,'+[0,1,2,3,4,5].map(f=>`!OFX_SPARK_${f}|(!OFX_PAL_BLUE<<9)|$3000`).concat([0,1,2,3].map(f=>`!OFX_GSPARK_${f}|(!OFX_PAL_GOLD<<9)|$3000`)).join(','));
}

// The town shots' moving parts (frieza-collateral-view.js draw), as tables
// the cartridge steps through: people, the rabite, the warning ring, the
// laser, the Exploder bursts, the roof fragments and the fires.
function townData({L,T,S,def,xdata,report,towns,repo,civilianPose,shots}){
  const word=v=>[v&255,(v>>8)&255];
  const rgb5=(img,x,y)=>{const o=(y*img.width+x)*4;return img.data[o+3]>127?(img.data[o]>>3)|((img.data[o+1]>>3)<<5)|((img.data[o+2]>>3)<<10):-1;};
  // OBJ palettes of the town shots: 1 people A, 2 people B, 3 the rabite
  // (or people A's colours that do not fit palette 1), 4 roof fragments,
  // 5 the warning ring.
  // People (assets/sprites/npcs.png, the browser's crop origins): 24 frames
  // of 24x40, set (i & 1), direction (up, left, down; right = left
  // flipped), walk frame; 15 8x8 tiles each (3 x 5), streamed per person.
  const npcs=readPng(join(repo,'assets/sprites/npcs.png'));
  const frames=[{up:[302,326,350,375],left:[403,428,450,472],down:[501,523,547,572],y:194},{up:[399,421,446,471],left:[302,325,347,369],down:[502,527,551,574],y:242}];
  const dirs=['up','left','down'];
  const crops=[];for(let set=0;set<2;set++)for(const d of dirs)for(let f=0;f<4;f++){const px=[];for(let y=0;y<40;y++)for(let x=0;x<24;x++)px.push(rgb5(npcs,frames[set][d][f]+x,frames[set].y+y));crops.push({set,px});}
  // palettes: each set's colours; a 16th colour goes to palette 3 with a
  // colour no tile of its own shares (else the nearest colour)
  const palFor=[];const objPal=[[0],[0],[0],[0],[0],[0]];
  for(let set=0;set<2;set++){
    const count=new Map();for(const c of crops)if(c.set===set)for(const v of c.px)if(v>=0)count.set(v,(count.get(v)??0)+1);
    const cols=[...count.keys()].sort((a,b)=>count.get(b)-count.get(a));
    const main=cols.slice(0,15),extra=cols.slice(15);
    objPal[1+set]=[0,...main];
    palFor[set]={main,extra};
  }
  if(palFor[1].extra.length)throw Error('orbit-montage: people B need more than 15 colours');
  const tileCols=(px,tx,ty)=>{const s=new Set();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const v=px[(ty*8+y)*24+tx*8+x];if(v>=0)s.add(v);}return s;};
  if(palFor[0].extra.length){
    if(palFor[0].extra.length>1)throw Error('orbit-montage: people A need more than 16 colours');
    const rare=palFor[0].extra[0];
    // a colour of palette 1 that no tile with the rare colour uses
    const withRare=[];for(const c of crops)if(c.set===0)for(let ty=0;ty<5;ty++)for(let tx=0;tx<3;tx++){const s=tileCols(c.px,tx,ty);if(s.has(rare))withRare.push(s);}
    const victim=palFor[0].main.slice().reverse().find(v=>withRare.every(s=>!s.has(v)));
    if(victim===undefined)throw Error('orbit-montage: people A: no colour to swap for the 16th');
    objPal[3]=[0,...palFor[0].main.map(v=>v===victim?rare:v)];
  }
  const cellBytes=[],cellPal=[];
  for(const c of crops){
    for(let ty=0;ty<5;ty++)for(let tx=0;tx<3;tx++){
      const s=tileCols(c.px,tx,ty);let p=1+c.set;
      if(c.set===0&&[...s].some(v=>!objPal[1].includes(v)))p=3;
      const pal=objPal[p],idx=new Uint8Array(64);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const v=c.px[(ty*8+y)*24+tx*8+x];if(v>=0){const i=pal.indexOf(v,1);if(i<1)throw Error('orbit-montage: people colour');idx[y*8+x]=i;}}
      cellBytes.push(...encodeTile(idx,8,0,0,4));cellPal.push(p);
    }
  }
  xdata('orbit_mt_people',Uint8Array.from(cellBytes));
  def('MT_PEOPLE_FRAMES',crops.length);
  // each frame cell's list, as drawn and mirrored (its non-empty tiles:
  // tile i of the person's slot, its palette; the slot's first tile is
  // added at run time); per cell * 2 + mirrored the list
  const empty=b=>b.every(v=>!v);
  const plist=[];
  crops.forEach((c,ci)=>{for(const flip of[0,1]){const e=[];
    for(let i=0;i<15;i++){if(empty(cellBytes.slice((ci*15+i)*32,(ci*15+i)*32+32)))continue;const col=i%3,row=Math.floor(i/3);
      e.push({dx:(flip?2-col:col)*8,dy:row*8,ta:hex4(i|(cellPal[ci*15+i]<<9)|0x3000|(flip?0x4000:0))});}
    plist.push(S.add(`p${ci}_${flip}`,e));}});
  L.push('orbit_mt_people_l:');for(let i=0;i<plist.length;i+=8)L.push('\tdw '+plist.slice(i,i+8).join(','));
  // Each town's people: per frame (shot age) and person, x - 12 (word,
  // before the pan) and y - 36 | frame cell << 8 | flip << 15.
  for(const{shot,k}of towns){
    const people=[];
    for(let t=0;t<shot.duration;t++)shot.people.forEach((route,i)=>{
      const p=civilianPose(route,t,i),dir=p.direction==='right'?'left':p.direction,frame=p.walking?Math.floor(t/6)%4:1;
      const cell=(i%2)*12+dirs.indexOf(dir)*4+frame,y=p.y-36;
      if(y<0||y>255)throw Error('orbit-montage: person y');
      people.push(...word(p.x-12),...word(y|(cell<<8)|(p.direction==='right'?0x8000:0)));
    });
    if(people.length)xdata(`orbit_mt${k}_people`,Uint8Array.from(people));
    def(`MT${k}_PEOPLE`,shot.people.length);
  }
  // The rabite (rabite.png, frames at 4 + 29 f, 117, 25x25): 16 tiles each.
  const rab=readPng(join(repo,'assets/sprites/rabite.png'));
  const rcols=new Set();for(let f=0;f<2;f++)for(let y=0;y<25;y++)for(let x=0;x<25;x++){const v=rgb5(rab,4+f*29+x,117+y);if(v>=0)rcols.add(v);}
  if(rcols.size>15)throw Error('orbit-montage: rabite colours');
  const rpal=[0,...rcols],rab4=[];
  for(let f=0;f<2;f++)for(let ty=0;ty<4;ty++)for(let tx=0;tx<4;tx++){const idx=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const sx=tx*8+x,sy=ty*8+y;if(sx<25&&sy<25){const v=rgb5(rab,4+f*29+sx,117+sy);if(v>=0)idx[y*8+x]=rpal.indexOf(v);}}rab4.push(...encodeTile(idx,8,0,0,4));}
  // The people / rabite palettes (the ring's colour: emberCells).
  const pad=p=>{const r=p.slice();while(r.length<16)r.push(0);return r;};
  // OBJ palettes 1-3 (people A, B, A's 16th colour), the rabite's (3 in its shot)
  T.label('OBJPAL');for(const p of[objPal[1],objPal[2],objPal[3].length>1?objPal[3]:objPal[1]])T.dw(...pad(p));
  T.label('RABPAL');T.dw(...pad(rpal));
  // the rabite's frames (its non-empty tiles at $040 + 16 f + i, palette 3,
  // from the picture's top left); the ring's dot (colour 1 at its top left)
  const rlist=[0,1].map(f=>{const e=[];for(let i=0;i<16;i++)if(!empty(rab4.slice((f*16+i)*32,(f*16+i)*32+32)))e.push({dx:(i&3)*8,dy:(i>>2)*8,ta:hex4((0x040+f*16+i)|(3<<9)|0x3000)});return S.add(`r${f}`,e);});
  L.push('orbit_mt_rabite_l:','\tdw '+rlist.join(','));
  L.push('orbit_mt_dot:','\tdb $80'+',0'.repeat(31));
  // The warning ring, 50 frames before the hit: 48 points round(cos a r),
  // round(sin a r .45) about the hit, r = 3 + (50 + dt) .32, duplicates
  // dropped. Per frame a record as montage.asm's mt_dots reads it: a count
  // (word), the box, then x + 128, y + 128 per point (bytes).
  const dots=pts=>[pts.length&255,pts.length>>8,...box(pts),...pts.flatMap(([x,y])=>[x+128,y+128])];
  const rings=[],ringPtr=[];
  for(let dt=-50;dt<0;dt++){const r=3+(50+dt)*.32,seen=new Set(),pts=[];
    for(let i=0;i<48;i++){const a=i*Math.PI/24,x=Math.round(Math.cos(a)*r),y=Math.round(Math.sin(a)*r*.45),key=x+','+y;if(!seen.has(key)){seen.add(key);pts.push([x,y]);}}
    ringPtr.push(rings.length);rings.push(...dots(pts));}
  T.label('RING_PTR');T.dw(...ringPtr);T.label('RING');T.db(...rings);
  // Exploder bursts after the hit: burst i at age dt - 3i (0-41), frame
  // age / 6, flip i & 1, turn i % 4, at hit + round(cos a spread),
  // round(sin a spread .65), a = 2.39996 i, spread = i ? 10 + min(age, 14)
  // 1.4 : 0 (signed bytes, 9 x 42 x 2).
  // (x + 128, y + 128: bytes, 9 x 42 x 2)
  const bursts=[];
  for(let i=0;i<9;i++)for(let age=0;age<42;age++){const a=i*2.39996,spread=i?10+Math.min(age,14)*1.4:0;bursts.push(Math.round(Math.cos(a)*spread)+128,Math.round(Math.sin(a)*spread*.65)+128);}
  T.label('BURST_OFF');T.db(...bursts);
  // Roof fragments for 55 frames after the hit: per frame a record as the
  // ring's (fragment 15 down to 0, its top left (round(x) - 3, round(y) -
  // 2) about the hit).
  const frags=[],fragPtr=[];
  for(let dt=0;dt<55;dt++){const pts=[];
    for(let i=15;i>=0;i--){const a=i*2.39996,speed=.45+i%4*.22,x=Math.cos(a)*dt*speed,y=Math.sin(a)*dt*.35-dt*1.2+dt*dt*.018;pts.push([Math.round(x)-3,Math.round(y)-2]);}
    fragPtr.push(frags.length);frags.push(...dots(pts));}
  T.label('FRAG_PTR');T.dw(...fragPtr);T.label('FRAG');T.db(...frags);
  // Per town: the fragments' tiles (the intact map's pixels about the
  // blast, a 7x5 diamond each) and their palette; the fire sites; the laser.
  for(const{shot,k,map,ruined}of towns){
    const cols=new Map(),cells=[];
    for(let i=0;i<16;i++){const px=new Int32Array(64).fill(-1);
      for(let py=-2;py<=2;py++)for(let qx=-3;qx<=3;qx++){if(Math.abs(qx)+Math.abs(py)>=5)continue;const c=map.pixels[(shot.y+shot.blast[1]+i%3*8+py)*map.width+shot.x+shot.blast[0]+i%5*6+qx];if(c){px[(py+2)*8+qx+3]=c-1;cols.set(c-1,(cols.get(c-1)??0)+1);}}
      cells.push(px);}
    const pal=[0,...[...cols.keys()].sort((a,b)=>cols.get(b)-cols.get(a)).slice(0,15)];
    const near=c=>{let bi=1,bd=Infinity;for(let i=1;i<pal.length;i++){const d=3*((pal[i]&31)-(c&31))**2+4*((pal[i]>>5&31)-(c>>5&31))**2+2*((pal[i]>>10&31)-(c>>10&31))**2;if(d<bd){bd=d;bi=i;}}return bi;};
    let approx=0;const fb=[];
    for(const px of cells){const idx=new Uint8Array(64);px.forEach((c,i)=>{if(c<0)return;const j=pal.indexOf(c,1);if(j<1)approx++;idx[i]=j>0?j:near(c);});fb.push(...encodeTile(idx,8,0,0,4));}
    const bytes=[...fb,...(shot.rabite?rab4:[])];
    xdata(`orbit_mt${k}_cells`,Uint8Array.from(bytes));
    T.label(`FRAGPAL${k}`);T.dw(...pad(pal));
    // fire sites (cinematic-ruins.js): a count, then per site (words) its
    // view x (x - s.x), the burst's y - 128 (y - s.y - 5 - 128), 3 seed,
    // the mirroring (seed & 1), the ember's drift (seed mod 3 - 1) and its
    // quarter turn (seed & 3; -1: no ember, odd seeds)
    T.label(`FIRES${k}`);T.dw(ruined.sites.length);for(const p of ruined.sites)T.dw(p.x-shot.x,p.y-shot.y-5-128,3*p.seed,p.seed&1,p.seed%3-1,p.seed%2===0?p.seed%4:-1);
    // The laser (dt -12..12): 19 lines (planet-view.js line: steps
    // ceil(max |d|), each point rounded) from (-60 + w, -90) to (end.x +
    // w, end.y), end = (-60, -90) + (hit + (60, 90)) u, u = min(1, (dt +
    // 12) / 12), hit x = blast x - pan; per row 0.. the centre line's run
    // [a, b]: the band is [a - 9, b + 9]; a pixel shows the last line over
    // it (the largest w), so the core (|w| < 4, (31, 30, 31)) is [a - 3,
    // a + 3] and the rest the purple (25, 5, 27). Per row the four window
    // edges (W1 left, right, W2 left, right: clamped), read by HDMA
    // channel 6 indirectly; a dt's rows shared with another's where they
    // are the same; the blob starts with the windows off (left > right).
    const laser=[255,0,255,0],lptr=[],seqs=[];
    for(let dt=-12;dt<13;dt++){
      const t=shot.hit+dt,pan=Math.min(12,Math.floor(t/24)),hitX=shot.blast[0]-pan,hitY=shot.blast[1];
      const u=Math.min(1,(dt+12)/12),ex=-60+(hitX+60)*u,ey=-90+(hitY+90)*u;
      const steps=Math.ceil(Math.max(Math.abs(ex+60),Math.abs(ey+90))),rows=new Map();
      for(let i=0;i<=steps;i++){const x=Math.round(-60+(ex+60)*i/(steps||1)),y=Math.round(-90+(ey+90)*i/(steps||1));if(y<0||y>223)continue;const r=rows.get(y);if(!r)rows.set(y,[x,x]);else{r[0]=Math.min(r[0],x);r[1]=Math.max(r[1],x);}}
      const ys=[...rows.keys()].sort((a,b)=>a-b);
      if(ys.length&&(ys[0]!==0||ys.some((y,i)=>y!==i)))throw Error('orbit-montage: laser rows not contiguous from 0');
      const seq=[];
      for(const y of ys){const[a,b]=rows.get(y);if(a<0||b>255)throw Error(`orbit-montage: laser run ${a}..${b}`);
        seq.push(Math.max(0,a-9),Math.min(255,b+9),Math.max(0,a-3),Math.min(255,a+3));}
      seqs.push(seq);
    }
    // the longest first; a shorter one inside an earlier one (row aligned) shares it
    const where=new Array(seqs.length);
    for(const i of seqs.map((q,i)=>i).sort((a,b)=>seqs[b].length-seqs[a].length)){
      const q=seqs[i];if(!q.length){where[i]=0;continue;}
      let at=-1;
      for(let o=4;o+q.length<=laser.length&&at<0;o+=4){let same=true;for(let j=0;j<q.length;j++)if(laser[o+j]!==q[j]){same=false;break;}if(same)at=o;}
      if(at<0){at=laser.length;laser.push(...q);}
      where[i]=at;
    }
    xdata(`orbit_mt${k}_laser`,Uint8Array.from(laser));
    // the laser per dt -12..12: its first row's offset in the blob, its rows
    T.label(`LASERPTR${k}`);seqs.forEach((q,i)=>T.dw(where[i],q.length/4));
    report.push(`${shot.name}: ${shot.people.length} people, fragments ${approx} pixels in nearest colours, ${ruined.sites.length} fires, laser ${laser.length} bytes`);
  }
  // the town shots in cosmicShots order: blast, hit, duration, people, rabite
  L.push('; towns: blast x, blast y, hit, duration, people, rabite (words)','orbit_mt_towns:');
  for(const{shot}of towns)L.push(`\tdw ${shot.blast[0]},${shot.blast[1]},${shot.hit},${shot.duration},${shot.people.length},${shot.rabite?1:0}`);
}
