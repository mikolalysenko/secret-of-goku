// Frieza module data for the cartridge (docs/agents/snes-port/frieza.md).
//
// Single source of truth: the browser mod's sprite sheets
// (assets/sprites/frieza.png, frieza-full-power.png) prepared exactly as
// engine/frieza.js loadAtlas() + engine/frieza-sprite.js prepareFriezaSprite()
// do, and the staging/timing functions of engine/frieza-staging.js,
// frieza-intro.js, frieza-flyby.js, boss-victory.js and boss-rush-death.js,
// evaluated here into tables.
//
// Outputs (dist/snes/gen/frieza/):
//   art.bin       OBJ tiles of every Frieza frame (bank $F0 lower half)
//   data.asm      frame descriptors, palettes, pose/motion tables, timings
//   preview.png   every frame as the cartridge draws it (not shipped)
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPng,encodeTile,writePng,blank} from '../tools/gfx.mjs';

export const ART_BANK=0xF0;          // lower half $F0:0000-7FFF
const ART_LIMIT=0x8000;

const hex=(v,w=2)=>'$'+(v>>>0).toString(16).toUpperCase().padStart(w,'0');
const rgb555=(r,g,b)=>r|(g<<5)|(b<<10);

// engine/frieza.js loadAtlas(): 0 = transparent, else 1 + RGB555 (alpha >= 128),
// eight frames in a 4 x 2 grid with their opaque bounding boxes.
function loadAtlas(path){
  const img=readPng(path),pixels=new Uint16Array(img.width*img.height),frames=[];
  for(let i=0;i<pixels.length;i++)if(img.data[i*4+3]>=128)pixels[i]=1+(img.data[i*4]>>3)+((img.data[i*4+1]>>3)<<5)+((img.data[i*4+2]>>3)<<10);
  for(let i=0;i<8;i++){
    const x0=Math.round(i%4*img.width/4),x1=Math.round((i%4+1)*img.width/4),y0=Math.round((i>>2)*img.height/2),y1=Math.round(((i>>2)+1)*img.height/2);
    let left=x1,right=x0,top=y1,bottom=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[y*img.width+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    frames.push({x:left,y:top,w:right-left+1,h:bottom-top+1});
  }
  return {pixels,width:img.width,frames};
}

// Cover the opaque pixels of an index image with 16x16 boxes (free
// placement, boxes may hang outside the image). Several greedy strategies;
// the smallest cover wins.
function cover(idx,w,h){
  const at=(x,y)=>x>=0&&y>=0&&x<w&&y<h?idx[y*w+x]:0;
  const rowAny=(y,x0,x1)=>{for(let x=x0;x<x1;x++)if(at(x,y))return true;return false;};
  const colAny=(x,y0,y1)=>{for(let y=y0;y<y1;y++)if(at(x,y))return true;return false;};
  const strategies=[];
  // Row bands from the top (and from the bottom), greedy columns inside.
  for(const fromBottom of[false,true]){
    const boxes=[];
    if(!fromBottom){
      let y=0;
      while(y<h){
        while(y<h&&!rowAny(y,0,w))y++;
        if(y>=h)break;
        let x=0;
        while(x<w){while(x<w&&!colAny(x,y,y+16))x++;if(x>=w)break;boxes.push([x,y]);x+=16;}
        y+=16;
      }
    }else{
      let y=h-1;
      while(y>=0){
        while(y>=0&&!rowAny(y,0,w))y--;
        if(y<0)break;
        const top=y-15;
        let x=0;
        while(x<w){while(x<w&&!colAny(x,top,y+1))x++;if(x>=w)break;boxes.push([x,top]);x+=16;}
        y-=16;
      }
    }
    strategies.push(boxes);
  }
  // Column bands from the left, greedy rows inside.
  {
    const boxes=[];let x=0;
    while(x<w){
      while(x<w&&!colAny(x,0,h))x++;
      if(x>=w)break;
      let y=0;
      while(y<h){while(y<h&&!rowAny(y,x,x+16))y++;if(y>=h)break;boxes.push([x,y]);y+=16;}
      x+=16;
    }
    strategies.push(boxes);
  }
  strategies.sort((a,b)=>a.length-b.length);
  const boxes=strategies[0];
  // Every opaque pixel must be covered.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(at(x,y)&&!boxes.some(([bx,by])=>x>=bx&&x<bx+16&&y>=by&&y<by+16))throw Error('frieza gen: cover misses a pixel');
  return boxes;
}

export async function generate({repo,outDir}){
  const eng=f=>import(pathToFileURL(join(repo,'engine',f)).href);
  const sprite=await eng('frieza-sprite.js');
  const staging=await eng('frieza-staging.js');
  const intro=await eng('frieza-intro.js');

  // The fixed 15-colour palette prepareFriezaSprite() snaps every pixel to.
  const src=(await import('node:fs')).readFileSync(join(repo,'engine/frieza-sprite.js'),'utf8');
  const palMatch=src.match(/const palette=(\[\[[^;]*\]\]);/);
  if(!palMatch)throw Error('frieza gen: palette literal not found in frieza-sprite.js');
  const palette=JSON.parse(palMatch[1]);
  if(palette.length!==15)throw Error('frieza gen: expected 15 palette colours');
  const palValues=palette.map(([r,g,b])=>1+rgb555(r,g,b));
  const indexOf=v=>{if(!v)return 0;const i=palValues.indexOf(v);if(i<0)throw Error('frieza gen: colour outside the palette');return i+1;};

  const atlases=['frieza','frieza-full-power'].map(name=>sprite.prepareFriezaSprite(loadAtlas(join(repo,'assets/sprites',name+'.png'))));

  // ---------------------------------------------------------------------
  // Frames: atlas (0 normal, 1 full power) x size (0 = 48 px, 1 = tiny 24 px)
  // x frame 0-7. Id = atlas<<4 | size<<3 | frame. Pieces are 16x16 OBJ; the
  // anchor is drawFriezaSprite's (x, y): 48 px cells span (x-24, y-44),
  // tiny ones (x-12, y-22). Tile data per frame: the top halves (2 tiles)
  // of every piece, then the bottom halves, so a frame uploads into a
  // buffer's two tile rows with two DMAs.
  const art=[],frames=[];
  const preview=blank(8*56,4*56);
  for(let a=0;a<2;a++)for(let size=0;size<2;size++)for(let f=0;f<8;f++){
    const cell=atlases[a].cells[f],W=size?24:48;
    const idx=new Uint8Array(W*W);
    for(let y=0;y<W;y++)for(let x=0;x<W;x++)idx[y*W+x]=indexOf(size?cell[y*2*48+x*2]:cell[y*48+x]);
    // drawFriezaSprite(tiny) samples cell[py*2*48 + px*2]: check the reading.
    const boxes=cover(idx,W,W);
    if(boxes.length>8)throw Error(`frieza gen: frame ${a}/${size}/${f} needs ${boxes.length} pieces (max 8)`);
    const pad=new Uint8Array(80*80);
    for(let y=0;y<W;y++)for(let x=0;x<W;x++)pad[(y+16)*80+x+16]=idx[y*W+x];
    const top=[],bottom=[];
    for(const[bx,by]of boxes){
      top.push(encodeTile(pad,80,bx+16,by+16),encodeTile(pad,80,bx+24,by+16));
      bottom.push(encodeTile(pad,80,bx+16,by+24),encodeTile(pad,80,bx+24,by+24));
    }
    const offset=art.reduce((n,b)=>n+b.length,0);
    for(const t of[...top,...bottom])art.push(t);
    const half=W>>1,lift=size?22:44;
    frames.push({id:(a<<4)|(size<<3)|f,offset,n:boxes.length,pieces:boxes.map(([bx,by])=>[bx-half,by-lift])});
    // Preview: draw the pieces back from the encoded tiles' source indices.
    const px=(f%8)*56+4,py=(a*2+size)*56+4;
    for(const[bx,by]of boxes)for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const v=pad[(by+16+y)*80+bx+16+x];if(!v)continue;
      const c=palette[v-1],d=((py+by+y+(size?11:0))*preview.width+px+bx+x+(size?12:0))*4;
      if(d<0||d>=preview.data.length)continue;
      preview.data[d]=c[0]*255/31|0;preview.data[d+1]=c[1]*255/31|0;preview.data[d+2]=c[2]*255/31|0;preview.data[d+3]=255;
    }
  }
  const artBytes=Uint8Array.from(art.flatMap(t=>[...t]));
  if(artBytes.length>ART_LIMIT)throw Error(`frieza gen: art ${artBytes.length} bytes exceeds the bank half`);
  writeFileSync(join(outDir,'art.bin'),artBytes);
  writeFileSync(join(outDir,'preview.png'),writePng(preview));

  const out=['; Generated by snes/gen/frieza.mjs. Do not edit.'];
  const words=list=>{const lines=[];for(let i=0;i<list.length;i+=16)lines.push('\tdw '+list.slice(i,i+16).map(v=>hex(v&0xFFFF,4)).join(','));return lines;};
  const bytes=list=>{const lines=[];for(let i=0;i<list.length;i+=16)lines.push('\tdb '+list.slice(i,i+16).map(v=>hex(v&0xFF)).join(','));return lines;};

  // Frame descriptors: dw art offset (in bank !FRIEZA_ART_BANK), db pieces,
  // then pieces x (db dx, dy) signed, relative to the anchor.
  out.push(`!FRIEZA_ART_BANK = ${hex(ART_BANK)}`);
  out.push(`!FRIEZA_ART_SIZE = ${artBytes.length}`);
  out.push('frieza_frame_table:');
  frames.sort((x,y)=>x.id-y.id);
  for(const fr of frames)out.push(`\tdw frieza_frame_${fr.id}`);
  for(const fr of frames){
    out.push(`frieza_frame_${fr.id}:`);
    out.push(`\tdw ${hex(fr.offset,4)}`);
    out.push(`\tdb ${fr.n}`);
    out.push(...bytes(fr.pieces.flat()));
  }

  // Palettes (BGR555, 16 entries, entry 0 transparent): normal, the boss
  // death flashes of boss-victory.js bossDeathColor() (red phases 0-1,
  // white phases 2-3), and the afterimage ghost colour of drawFriezaSprite.
  const {bossDeathColor}=await eng('boss-victory.js');
  const pal=values=>[0,...values.map(v=>v&0x8000?0x7FFF:(v-1)&0x7FFF)];
  const normal=pal(palValues);
  const red=pal(palValues.map(v=>bossDeathColor(v,0)));
  const white=pal(palValues.map(v=>bossDeathColor(v,16)));
  const ghost=pal(palValues.map(()=>1+10+(7<<5)+(18<<10)));
  // the Emperor's hit silhouette (frieza-intro.js): white, pink at 13-14
  const silhouette=[0,...Array(15).fill(0x7FFF)],silhouettePink=[0,...Array(15).fill(rgb555(31,8,23))];
  out.push('frieza_palettes:');
  for(const p of[normal,red,white,ghost,silhouette,silhouettePink])out.push(...words(p));

  // hover(): Math.round(Math.sin(clock*PI/96)), period 192.
  const hover=[];for(let c=0;c<192;c++)hover.push(Math.round(Math.sin(c*Math.PI/96))|0);
  out.push('frieza_hover_table:',...bytes(hover));

  // Motion tables. Each entry: dw dx, dy (whole pixels, as the browser rounds)
  // and db bob weight (1 when the hover bob applies at this age). Tables
  // clamp at their last entry.
  const motion=(name,len,fn)=>{
    const dx=[],dy=[],w=[];
    for(let age=0;age<len;age++){const m=fn(age);dx.push(m.x);dy.push(m.y);w.push(m.w??0);}
    out.push(`!FRIEZA_${name}_LEN = ${len}`);
    out.push(`frieza_${name.toLowerCase()}_dx:`,...words(dx));
    out.push(`frieza_${name.toLowerCase()}_dy:`,...words(dy));
    out.push(`frieza_${name.toLowerCase()}_w:`,...bytes(w));
  };
  const clamp=n=>Math.max(0,Math.min(1,n));
  const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  // Court (fortressCourt / fortressReturn anchors, absolute map pixels).
  const court=(kind,age)=>staging.friezaScenePose({kind,age,court:true,clock:-age},{cameraX:0,cameraY:0});
  motion('COURT_TAUNT',97,age=>({...court('taunt',age),w:1}));
  motion('COURT_LEAVE',113,age=>({...court('trial-leave',age),w:1}));
  // Arrivals (reveal / core-arrival): offsets from (x+40, y-40); bob weight t.
  motion('ARRIVE',97,age=>{const t=ease(age/96);return{x:Math.round(24*(1-t)),y:Math.round(-176*(1-t)),w:t>=.5?1:0};});
  // Departures (depart / temple-exit / altar-leave): bob weight 1-t.
  motion('DEPART',121,age=>{const t=clamp(age/120)**2;return{x:Math.round(64*t),y:Math.round(-320*t),w:t<.5?1:0};});
  // Altar (frieza-intro.js altarPose), absolute map pixels around (228,132).
  const altar={x:228,y:132,cameraX:0,cameraY:0};
  motion('ALTAR_REVEAL',301,age=>intro.altarPose({kind:'reveal',age,altar},{cameraX:0,cameraY:0}));
  motion('ALTAR_LEAVE',121,age=>intro.altarPose({kind:'altar-leave',age,altar},{cameraX:0,cameraY:0}));
  // Cross-check the court anchors against the engine's exported constants.
  if(staging.fortressCourt.x!==350||staging.fortressCourt.y!==400)throw Error('frieza gen: fortressCourt moved');

  // Fight geometry. Angles are 16-bit (65536 per turn, 0 = right, 16384 =
  // down). Step tables: round(cos(a)*s), round(sin(a)*s) for 256 directions
  // and s = 3, 4, 7 (frieza-combat.js pixelStep / rushStep), as JS rounds.
  const speeds=[3,4,7];
  const cos=[],sin=[];
  for(const s of speeds)for(let i=0;i<256;i++){const a=i*Math.PI*2/256;cos.push(Math.round(Math.cos(a)*s));sin.push(Math.round(Math.sin(a)*s));}
  out.push('frieza_cos_table:',...bytes(cos),'frieza_sin_table:',...bytes(sin));
  // atan(t) for t = i/256, i = 0-256, in angle units.
  const atan=[];for(let i=0;i<=256;i++)atan.push(Math.round(Math.atan(i/256)*65536/(Math.PI*2)));
  out.push('frieza_atan_table:',...words(atan));
  // orbit-pixels.js: sixteen headings; orbitHeading() for each of 256 angle
  // bins (evaluated at the bin centre) and the vectors themselves.
  const op=await eng('orbit-pixels.js');
  const heading=[];for(let i=0;i<256;i++){const a=(i+.5)*Math.PI*2/256;heading.push(op.orbitHeading(Math.cos(a)*1000,Math.sin(a)*1000));}
  out.push('frieza_heading_table:',...bytes(heading));
  out.push('frieza_orbit_vectors:',...words(op.orbitVectors.flat()));
  // Large bursts (orbit-effects.js burst large): burst i (0-8) at radius r
  // (0-32) sits at ((v * r) >> 8) along orbitVectors[(i * 6) & 15].
  {
    const off=[];
    for(let i=0;i<9;i++)for(let r=0;r<=32;r++){const [vx,vy]=op.orbitVectors[(i*6)&15];off.push((vx*r)>>8,(vy*r)>>8);}
    out.push('frieza_lb_offsets:',...bytes(off));
    // victory bursts (boss-victory.js): burst i (0-11) at orbitVectors[(i*7)&15] * (12 + i%4*5) >> 8
    const vb=[];
    for(let i=0;i<12;i++){const [vx,vy]=op.orbitVectors[(i*7)&15],d=12+i%4*5;vb.push((vx*d)>>8,(vy*d)>>8);}
    out.push('frieza_victory_offsets:',...words(vb));
  }
  // Broken floor (frieza-arena.js ruinMask / frieza.js scarColor): a hole
  // cell's pixels depend only on which of its four neighbours are holes,
  // and each 8x8 quadrant only on the two neighbours it touches, so 16 BG
  // tiles cover every case: quadrant q (0 TL, 1 TR, 2 BL, 3 BR) x the two
  // neighbour bits (vertical << 1 | horizontal). The chip pattern depends
  // on the position modulo 8 only; the cloud, speckle and sparkle patterns
  // use the cell's local coordinates. Colour indices: 1-3 the cloud phases
  // (rotated every 24 frames at run time), 4 speckle, 5 the dark wall, 6
  // the edge, 7 the edge sparkle.
  {
    const holeTiles=[];
    for(let q=0;q<4;q++)for(let nb=0;nb<4;nb++){
      const left=!(q&1),top=!(q&2);
      const horiz=nb&1,vert=nb>>1;          // the touching neighbour is a hole
      const inside=(x,y)=>{
        if(x<0)return left&&horiz;if(x>15)return !left&&horiz;
        if(y<0)return top&&vert;if(y>15)return !top&&vert;
        return true;
      };
      const idx=new Uint8Array(64);
      for(let py=0;py<8;py++)for(let px=0;px<8;px++){
        const lx=(q&1)*8+px,ly=(q>>1)*8+py;
        let edge=6;
        for(let n=1;n<6;n++)if(!inside(lx-n,ly)||!inside(lx+n,ly)||!inside(lx,ly-n)||!inside(lx,ly+n)){edge=n;break;}
        const chip=((lx*13+ly*7)&7)===0?1:0;
        const value=edge<=1+chip?3:edge<=4?2:1;
        let c;
        if(value===1)c=(lx*37+ly*19)%211===0?4:1+(Math.floor(lx/9)+Math.floor(ly/6))%3;
        else if(value===2)c=5;
        else c=(lx+ly)%11===0?7:6;
        idx[py*8+px]=c;
      }
      holeTiles.push(encodeTile(idx,8,0,0));
    }
    const holeBytes=Uint8Array.from(holeTiles.flatMap(t=>[...t]));
    out.push('frieza_hole_tiles:',...bytes([...holeBytes]));
    // cloud phases (2+k, 1, 5+k), speckle, wall, edge, sparkle
    const holeColors=[rgb555(2,1,5),rgb555(3,1,6),rgb555(4,1,7),0x316b,0x0842,0x31a8,0x3296];
    out.push('frieza_hole_colors:',...words(holeColors));
    // the collapsed deck (fortress-collapse.js scarColor): 1 -> $0425, 2 -> $0849, 3 -> $14CD with $2674 sparkles
    out.push('frieza_collapse_hole_colors:',...words([0x0425,0x0425,0x0425,0x0425,0x0849,0x14cd,0x2674]));
  }
  // The Death Ball on the deck (frieza-staging.js friezaDeathBallPose,
  // core-charge / core-shot), on whole pixels as the browser places it.
  // Charge: the diameter by age (the y follows his pose at run time).
  // Shot: x, diameter and y for the three hover bobs of the throw pose.
  {
    const charge=[];
    for(let a=0;a<=144;a++)charge.push(staging.friezaDeathBallPose({kind:'core-charge',age:a,clock:0},{x:180,y:145}).size);
    const shotX=[],shotSize=[],shotY=[[],[],[]];
    let len=0;
    for(let a=0;;a++){
      const p=staging.friezaDeathBallPose({kind:'core-shot',age:a,clock:0},{x:180,y:145});
      if(!p.visible){len=a;break;}
      shotX.push(p.x);shotSize.push(p.size);
      for(let b=-1;b<=1;b++)shotY[b+1].push(staging.friezaDeathBallPose({kind:'core-shot',age:a,clock:0},{x:180,y:145+b}).y);
    }
    if(Math.max(...charge,...shotSize)>255||Math.max(...shotX)>255||Math.min(...shotX)<0)throw Error('frieza gen: core Death Ball out of byte range');
    out.push('frieza_core_charge_size:',...bytes(charge));
    out.push(`!FRIEZA_CORE_SHOT_LEN = ${len}`);
    out.push('frieza_core_shot_x:',...bytes(shotX),'frieza_core_shot_size:',...bytes(shotSize));
    out.push('frieza_core_shot_y0:',...words(shotY[0]),'frieza_core_shot_y1:',...words(shotY[1]),'frieza_core_shot_y2:',...words(shotY[2]));
  }
  // The Dragon Balls (ki-art.js 'dragon': assets/sprites/dragon-balls.png,
  // 4 x 2 frames cropped to their opaque boxes, nearest-sampled to `size`):
  // the seven at 11 px rising from the pouch (steal) and the eighth at
  // 18 px (eighth). Colours are reduced to 15 per palette (seven balls
  // share one, the eighth has its own) by median cut over the sampled
  // pixels. Each ball sits at the top-left of its 16 x 16 cell (the eighth
  // spans four cells); the drawn anchor is x - floor(w / 2), y - floor(h / 2)
  // as layer.pixel rounds x - w / 2 + xx.
  {
    const img=readPng(join(repo,'assets/sprites/dragon-balls.png'));
    const W=img.width,H=img.height,pix=new Uint16Array(W*H);
    for(let i=0;i<W*H;i++)if(img.data[i*4+3]>=128)pix[i]=1+(img.data[i*4]>>3)+((img.data[i*4+1]>>3)<<5)+((img.data[i*4+2]>>3)<<10);
    const frames=[];
    for(let i=0;i<8;i++){
      const x0=Math.round(i%4*W/4),x1=Math.round((i%4+1)*W/4),y0=Math.round(Math.floor(i/4)*H/2),y1=Math.round((Math.floor(i/4)+1)*H/2);
      let x=x1,y=y1,right=x0,bottom=y0;
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pix[yy*W+xx]){x=Math.min(x,xx);right=Math.max(right,xx);y=Math.min(y,yy);bottom=Math.max(bottom,yy);}
      frames.push({x,y,w:right-x+1,h:bottom-y+1});
    }
    const sample=(i,size)=>{
      const f=frames[i],w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h)),px=[];
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)px.push(pix[(f.y+Math.floor(yy*f.h/h))*W+f.x+Math.floor(xx*f.w/w)]);
      return {w,h,px};
    };
    // Median cut to 15 colours (deterministic), then nearest colour.
    const quantize=colors=>{
      const rgb=c=>[(c-1)&31,((c-1)>>5)&31,((c-1)>>10)&31];
      let boxes=[colors.filter(Boolean).map(rgb)];
      while(boxes.length<15){
        let best=-1,axis=0,range=-1;
        boxes.forEach((b,bi)=>{if(b.length<2)return;for(let a=0;a<3;a++){const v=b.map(p=>p[a]),r=Math.max(...v)-Math.min(...v);if(r>range){range=r;best=bi;axis=a;}}});
        if(best<0||range<=0)break;
        const b=boxes[best].slice().sort((p,q)=>p[axis]-q[axis]||p[0]-q[0]||p[1]-q[1]||p[2]-q[2]),mid=b.length>>1;
        boxes.splice(best,1,b.slice(0,mid),b.slice(mid));
      }
      const pal=boxes.map(b=>[0,1,2].map(a=>Math.round(b.reduce((s,p)=>s+p[a],0)/b.length)));
      const index=c=>{if(!c)return 0;const p=rgb(c);let bi=0,bd=1e9;pal.forEach((q,i)=>{const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;if(d<bd){bd=d;bi=i;}});return bi+1;};
      return {pal:[0,...pal.map(([r,g,b])=>rgb555(r,g,b))].concat(Array(15-pal.length).fill(0)),index};
    };
    // the four 8x8 tiles (TL, TR, BL, BR) of the 16x16 cell at (cx, cy)
    const cellTiles=(idx,w,cx,cy)=>[[0,0],[8,0],[0,8],[8,8]].map(([tx,ty])=>encodeTile(idx,w,cx+tx,cy+ty));
    const seven=[0,1,2,3,4,5,6].map(i=>sample(i,11)),eighth=sample(7,18);
    const q7=quantize(seven.flatMap(s=>s.px)),q8=quantize(eighth.px);
    // seven cells: tops (TL, TR of each) then bottoms (BL, BR of each)
    const tops=[],bottoms=[];
    for(const s of seven){
      const idx=new Uint8Array(16*16);
      for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)idx[y*16+x]=q7.index(s.px[y*s.w+x]);
      const t=cellTiles(idx,16,0,0);tops.push(t[0],t[1]);bottoms.push(t[2],t[3]);
    }
    const idx8=new Uint8Array(32*32);
    for(let y=0;y<eighth.h;y++)for(let x=0;x<eighth.w;x++)idx8[y*32+x]=q8.index(eighth.px[y*eighth.w+x]);
    const tops8=[],bottoms8=[];
    for(const [cx,cy] of [[0,0],[16,0],[0,16],[16,16]]){const t=cellTiles(idx8,32,cx,cy);tops8.push(t[0],t[1]);bottoms8.push(t[2],t[3]);}
    const flat=list=>[...Uint8Array.from(list.flatMap(t=>[...t]))];
    out.push('frieza_balls_top:',...bytes(flat(tops)),'frieza_balls_bottom:',...bytes(flat(bottoms)));
    out.push('frieza_ball8_top:',...bytes(flat(tops8)),'frieza_ball8_bottom:',...bytes(flat(bottoms8)));
    out.push('frieza_balls_palette:',...words(q7.pal),'frieza_ball8_palette:',...words(q8.pal));
    out.push(`!FRIEZA_BALL_W = ${seven[0].w}`,`!FRIEZA_BALL_H = ${seven[0].h}`,`!FRIEZA_BALL8_W = ${eighth.w}`,`!FRIEZA_BALL8_H = ${eighth.h}`);
    // steal: offsets (1/256 px) of each ball around the straight rise, by age
    // (cos(a) * 18 * spread, sin(a) * 14 * spread, spread = sin(pi * t), t = age / 60)
    const ox=[],oy=[];
    for(let i=0;i<7;i++)for(let a=0;a<64;a++){
      const t=Math.min(1,a/60),ang=i*Math.PI*2/7,spread=Math.sin(t*Math.PI);
      ox.push(Math.round(Math.cos(ang)*18*spread*256));oy.push(Math.round(Math.sin(ang)*14*spread*256));
    }
    out.push('frieza_steal_ox:',...words(ox),'frieza_steal_oy:',...words(oy));
  }

  // frieza-combat.js constants
  const combat=await eng('frieza-combat.js');
  out.push(`!FRIEZA_HP = ${combat.FRIEZA_HP}`);

  // Timings used by the runtime (asserted against the engine's exports).
  const t=intro.introTiming;
  out.push(`!FRIEZA_INTRO_HIT = ${t.hit}`,`!FRIEZA_INTRO_BLACK_END = ${t.blackEnd}`,`!FRIEZA_INTRO_BEAM_END = ${t.beamEnd}`,`!FRIEZA_INTRO_PAN = ${t.pan}`,`!FRIEZA_INTRO_ENTRY = ${t.entry}`);
  const tt=staging.treeTiming,ct=staging.coreTiming;
  out.push(`!FRIEZA_TREE_ARRIVAL = ${tt.arrival}`,`!FRIEZA_TREE_THROW = ${tt.throw}`,`!FRIEZA_CORE_THROW = ${ct.throw}`,`!FRIEZA_CORE_ERUPTION = ${ct.eruption}`);

  writeFileSync(join(outDir,'data.asm'),out.join('\n')+'\n');
  writeFileSync(join(outDir,'catalog.json'),JSON.stringify({art:artBytes.length,frames:frames.map(f=>({id:f.id,n:f.n}))},null,1));
}
