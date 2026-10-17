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
  out.push('frieza_palettes:');
  for(const p of[normal,red,white,ghost])out.push(...words(p));

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

  // Timings used by the runtime (asserted against the engine's exports).
  const t=intro.introTiming;
  out.push(`!FRIEZA_INTRO_HIT = ${t.hit}`,`!FRIEZA_INTRO_BLACK_END = ${t.blackEnd}`,`!FRIEZA_INTRO_BEAM_END = ${t.beamEnd}`,`!FRIEZA_INTRO_PAN = ${t.pan}`,`!FRIEZA_INTRO_ENTRY = ${t.entry}`);
  const tt=staging.treeTiming,ct=staging.coreTiming;
  out.push(`!FRIEZA_TREE_ARRIVAL = ${tt.arrival}`,`!FRIEZA_TREE_THROW = ${tt.throw}`,`!FRIEZA_CORE_THROW = ${ct.throw}`,`!FRIEZA_CORE_ERUPTION = ${ct.eruption}`);

  writeFileSync(join(outDir,'data.asm'),out.join('\n')+'\n');
  writeFileSync(join(outDir,'catalog.json'),JSON.stringify({art:artBytes.length,frames:frames.map(f=>({id:f.id,n:f.n}))},null,1));
}
