// Shenron's vista for the ending generator (shenron-ending.js treeVista and
// blits, mana-tree-vista.js, ki-art.js, orbit-effects.js stamp).
//
// BG2: the cartridge's own picture plane behind the Tree (map 236 layer 1,
// as cinematic-map.js draws it) from x = 24 and row 40, 33 tile columns in a
// 64x32 map, intact and ruined (the Tree is restored by the wish). BG1: the
// cliff in front (layer 0) from row 144, priority tiles, so Shenron (OBJ
// priority 2) rises between the two. Both are rebuilt exactly from the
// rendered planes: every aligned 8x8 block is one native tile in one native
// palette (BG palettes 1-7 = the map's palettes, the backdrop = its sky).
// Sprites: Shenron (72x79 nearest-sampled from shenron.png, 16x16 cells in
// two palettes), the eight Balls at size 12, the gold sparks and a fallout
// flake.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gfx,imageToSurface,quantizeSurfaces,fitGroupPalettes,nearestIn,objCell,u16bytes} from './ending-art.mjs';

export const VISTA={bgX:24,bgY:40,bgCols:33,bgRows:29,fgY:144,fgRows:30};
// OBJ cells (16x16; cell c at tile (c >> 3) * 32 + (c & 7) * 2): Balls
// 0-7, sparks 8-11, the flake 12, Shenron from 13; Goku's four cells (queued
// at run time) start at the next row of cells after the uploaded image.
export const CELL={ball:0,spark:8,flake:12,dragon:13};
export const FLAKE=21|(24<<5)|(17<<10);

// Ki-art frames of a sheet (ki-art.js createKiArt): the opaque bounding box
// of each of cols x rows equal cells.
export function kiFrames(surface,width,height,cols,rows){
  const frames=[];
  for(let i=0;i<cols*rows;i++){
    const x0=Math.round(i%cols*width/cols),x1=Math.round((i%cols+1)*width/cols),y0=Math.round(Math.floor(i/cols)*height/rows),y1=Math.round((Math.floor(i/cols)+1)*height/rows);
    let x=x1,y=y1,right=x0,bottom=y0;
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(surface[yy*width+xx]){x=Math.min(x,xx);right=Math.max(right,xx);y=Math.min(y,yy);bottom=Math.max(bottom,yy);}
    frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  return frames;
}
// kiArt.draw(key, frame, x, y, size): the frame scaled to `size` (its long
// side), top-left at (x - floor(w/2), y - floor(h/2)) once put() rounds.
// Returns a 16x16 surface centred on (8, 8).
export function kiCell(surface,width,f,size){
  const w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h)),out=new Uint16Array(256);
  const ox=8-Math.floor(w/2),oy=8-Math.floor(h/2);
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const c=surface[(f.y+Math.floor(yy*f.h/h))*width+f.x+Math.floor(xx*f.w/w)];
    if(c&&ox+xx>=0&&ox+xx<16&&oy+yy>=0&&oy+yy<16)out[(oy+yy)*16+ox+xx]=c;
  }
  return out;
}
// shenron-ending blit(dragon, x, y, w, h): nearest sampling of the whole
// picture (every pixel with alpha > 0 is opaque).
export function dragonPicture(repo,w=72,h=79){
  const img=gfx.readPng(join(repo,'assets/sprites/shenron.png')),src=imageToSurface(img,1);
  const out=new Uint16Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+x]=src[Math.floor(y*img.height/h)*img.width+Math.floor(x*img.width/w)];
  return out;
}

export async function vistaAssets(o,{rom,repo,engine}){
  const {createManaTreeVista}=await engine(repo,'mana-tree-vista.js');
  const {createNativeEffects}=await engine(repo,'native-effects.js');
  const draw=createManaTreeVista(rom);
  const word=a=>rom[a]|rom[a+1]<<8;
  const header=0x80000+word(0x87000+236*2),palAt=0xc8000+(rom[header+1]&127)*210;
  const sky=word(palAt+101*2)&0x7fff;
  const pal=[];for(let p=1;p<=7;p++){const row=[];for(let c=1;c<=15;c++)row.push(word(palAt+(p-1)*30+(c-1)*2)&0x7fff);pal.push(row);}
  // A plane region through the engine's own draw (256x224 windows).
  const region=(opts,x0,y0,w,h)=>{
    const out=new Uint16Array(w*h);
    for(let wy=0;wy<h;wy+=224)for(let wx=0;wx<w;wx+=256){
      const ox=Math.min(wx,w-256),oy=Math.min(wy,h-224);
      draw((x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)out[(oy+y)*w+ox+x]=c;},{...opts,x:x0+ox,y:y0+oy});
    }
    return out;
  };
  // Exact tiles: each aligned block's colours all come from one palette.
  const tiles=[],keys=new Map();
  const empty=new Uint8Array(64);tiles.push(empty);keys.set(empty.join(','),0);
  const flip=(px,h,v)=>px.map((_,i)=>{const x=i&7,y=i>>3;return px[(v?7-y:y)*8+(h?7-x:x)];});
  function encode(surf,w,h,{clearSky,priority}){
    const cols=w>>3,rows=h>>3,words=new Uint16Array(cols*rows);
    for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){
      const px=new Uint8Array(64),seen=new Set();
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=surf[(ty*8+y)*w+tx*8+x];if(c&&!(clearSky&&c-1===sky))seen.add(c-1);}
      let p=0;
      if(seen.size){p=pal.findIndex(row=>[...seen].every(c=>row.includes(c)))+1;if(!p)throw Error(`vista tile ${tx},${ty}: no single native palette`);}
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=surf[(ty*8+y)*w+tx*8+x];if(c&&!(clearSky&&c-1===sky))px[y*8+x]=1+pal[p-1].indexOf(c-1);}
      let id=-1,hv=0;
      for(const [k,[fh,fv]] of [[0,[0,0]],[1,[1,0]],[2,[0,1]],[3,[1,1]]]){const key=flip(px,fh,fv).join(',');if(keys.has(key)){id=keys.get(key);hv=k;break;}}
      if(id<0){id=tiles.length;tiles.push(px);keys.set(px.join(','),id);hv=0;}
      words[ty*cols+tx]=id?(id|(p<<10)|((hv&1)?0x4000:0)|((hv&2)?0x8000:0)|(priority?0x2000:0)):0;
    }
    return {words,cols,rows};
  }
  const V=VISTA,bgW=V.bgCols*8,bgH=V.bgRows*8,fgH=V.fgRows*8;
  const bgRuins=encode(region({destroyed:true},V.bgX,V.bgY,bgW,bgH),bgW,bgH,{clearSky:true,priority:0});
  const bgWhole=encode(region({destroyed:false},V.bgX,V.bgY,bgW,bgH),bgW,bgH,{clearSky:true,priority:0});
  const fg=encode(region({foreground:true},0,V.fgY,256,fgH),256,fgH,{clearSky:false,priority:1});
  // Maps: BG2 64x32 (two 32x32 screens), BG1 32x32; tile numbers from 0.
  const map64=e=>{const m=new Uint16Array(2048);for(let y=0;y<e.rows;y++)for(let x=0;x<e.cols;x++)m[(x>>5)*1024+y*32+(x&31)]=e.words[y*e.cols+x];return m;};
  const map32=e=>{const m=new Uint16Array(1024);for(let y=0;y<e.rows;y++)for(let x=0;x<e.cols;x++)m[y*32+x]=e.words[y*e.cols+x];return m;};
  const ruins=map64(bgRuins),whole=map64(bgWhole);
  let lo=-1,hi=-1;for(let i=0;i<2048;i++)if(ruins[i]!==whole[i]){if(lo<0)lo=i;hi=i;}
  if(lo<0)throw Error('vista: the ruined and whole Tree are the same');
  o.blob('vista_bg2_map',u16bytes(ruins));
  o.blob('vista_bg2_whole',u16bytes(whole.slice(lo,hi+1)));
  o.def('ENDING_VISTA_WHOLE_AT',lo);o.def('ENDING_VISTA_WHOLE_WORDS',hi-lo+1);
  o.blob('vista_bg1_map',u16bytes(map32(fg)));
  const bgTiles=new Uint8Array(tiles.length*32);tiles.forEach((px,i)=>bgTiles.set(gfx.encodeTile(px,8,0,0,4),i*32));
  o.blob('vista_bg_tiles',bgTiles);
  o.table('ending_vista_bg_pal','dw',[sky,...pal.flatMap(row=>[0,...row])]);   // colour 0, then palettes 1-7
  // Sprites.
  const dragon=dragonPicture(repo),DW=72,DH=79;
  const cells=[];
  for(let cy=0;cy<5;cy++)for(let cx=0;cx<5;cx++){
    const s=new Uint16Array(256);let any=false;
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){const sx=cx*16+x,sy=cy*16+y;if(sx<DW&&sy<DH){const c=dragon[sy*DW+sx];if(c){s[y*16+x]=c;any=true;}}}
    if(any)cells.push({cx,cy,s});
  }
  const groups=cells.map(c=>{const h=new Map();for(const v of c.s)if(v)h.set(v-1,(h.get(v-1)??0)+1);return h;});
  const fit=fitGroupPalettes(groups,{P:2,colors:15});
  const dragonPal=[0,1].map(k=>{const p=[0,...(fit.palettes[k]??[])];while(p.length<16)p.push(0);return p.slice(0,16);});
  const sheet=gfx.readPng(join(repo,'assets/sprites/dragon-balls.png')),bs=imageToSurface(sheet,128);
  const frames=kiFrames(bs,sheet.width,sheet.height,4,2);
  const ballSurf=frames.map(f=>kiCell(bs,sheet.width,f,12));
  const flake=new Uint16Array(256);flake[0]=1+FLAKE;
  const ballQ=quantizeSurfaces([...ballSurf,flake],15,[FLAKE]);
  const effects=createNativeEffects(rom,JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8')));
  const gold=effects['gold-spark'],sparkQ=quantizeSurfaces(gold);
  const cellCount=CELL.dragon+cells.length,rowsOfCells=Math.ceil(cellCount/8);
  if(rowsOfCells+1>12)throw Error('vista OBJ cells reach the BG1 map at $1800');
  o.def('ENDING_VISTA_GOKU_CELL',rowsOfCells*8);
  const vram=new Uint8Array(rowsOfCells*0x400);
  const putCell=(c,ix)=>{const b=objCell(ix,16,0,0,16),base=((c>>3)*0x200+(c&7)*0x20)*2;vram.set(b.subarray(0,64),base);vram.set(b.subarray(64,128),base+0x200);};
  ballQ.index.slice(0,8).forEach((ix,i)=>putCell(CELL.ball+i,ix));
  putCell(CELL.flake,ballQ.index[8]);
  sparkQ.index.forEach((ix,i)=>putCell(CELL.spark+i,ix));
  const oam=[];
  cells.forEach((c,i)=>{
    const p=fit.assign[i],ix=new Uint8Array(256);
    for(let k=0;k<256;k++)if(c.s[k])ix[k]=1+nearestIn(fit.palettes[p],c.s[k]-1);
    const cell=CELL.dragon+i;putCell(cell,ix);
    // x (92 + 16 column), dy, OAM word (OBJ palette 0/1, priority 2)
    oam.push((92+c.cx*16)|((c.cy*16)<<8),(((cell>>3)*32+(cell&7)*2)|(p<<9)|0x2000)&0xffff);
  });
  o.blob('vista_obj',vram);
  o.def('ENDING_VISTA_DRAGON_CELLS',cells.length);
  o.table('ending_vista_dragon_oam','dw',oam);
  o.table('ending_vista_dragon_pal','dw',dragonPal.flat());
  o.table('ending_vista_ball_pal','dw',ballQ.palette);
  o.table('ending_vista_spark_pal','dw',sparkQ.palette);
  o.def('ENDING_VISTA_SPARKS',gold.length);
  // The seven Balls around (128, 184) (x 28, y 12), at scroll 0: cell top-left.
  const ring=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7-Math.PI/2;ring.push(Math.round(128+Math.cos(a)*28)-8,Math.round(184+Math.sin(a)*12)-8);}
  o.table('ending_vista_ring','dw',ring.map(v=>v&0xffff));
  // Shenron's rise (dragon: rise = max(0, 1 - age/96)) per age 0..96:
  // his y (66 + round(160 rise^2)) and the scroll (round(8 (1 - rise^2))).
  const rise=[];for(let a=0;a<=96;a++){const r=Math.max(0,1-a/96);rise.push(66+Math.round(160*r*r),Math.round(8*(1-r*r)));}
  o.table('ending_vista_rise','dw',rise);
  o.stats.vista={bgTiles:tiles.length,wholeSpan:[lo,hi],dragonCells:cells.length,objBytes:vram.length};
}
