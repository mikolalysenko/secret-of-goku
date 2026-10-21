// Orbit module effects: the space fight's own OBJ cells, palettes, burst
// parts and Death Ball frames.
//
// Single source of truth: the original spell cells in the verified ROM, read
// through the browser's own decoders (engine/native-effects.js with
// native-effects.json, native-combustion-data.js, death-ball-art.js) and
// recoloured / resampled exactly as engine/orbit-effects.js does at load time
// (pinkColor, charge, fingerCharge, disc). No art is stored in the repository.
//
// The orbit cannot share the effects library's cache (orbit-effects.js uses
// sixteen headings, many simultaneous bursts and Death Balls of its own), so
// the scene keeps these cells resident in OBJ VRAM it owns while it shows:
//   tiles $080-$0FF (rows 8-15): large slots L8/L9 (left half of rows 8-11,
//     dynamic), dynamic small cells $088 (Goku) and $08A (Death Ball 16),
//     resident small cells in the rest
//   tiles $100-$13F and $180-$1BF: resident small cells
//   tiles $008-$00F and $028-$02F (beside the dynamic Frieza and Death Ball
//     cells of rows 0-3): resident small cells (the finale's gold sparks,
//     the pouch)
//
// Outputs (dist/snes/gen/orbit-fx/):
//   vram_a.bin  OBJ tiles $080-$0FF (VRAM words $6800-$6FFF)
//   vram_b.bin  OBJ tiles $100-$13F ($7000-$73FF)
//   vram_c.bin  OBJ tiles $180-$1BF ($7800-$7BFF)
//   vram_d.bin  OBJ tiles $000-$03F ($6000-$63FF; the dynamic cells' tiles
//               stay zero until they are streamed)
//   death.bin   Death Ball frames: 12 x 32x32 (512 bytes, 4 rows of 4
//               tiles), then 12 x 16x16 (128 bytes, 2 rows of 2 tiles)
//   extended data orbit_death_big: the second surge's pullback's Death
//               Balls (planet-view.js cosmicBattle: 64 and 48 px, the
//               pictures it shows): 32 index bytes (per picture, frame or
//               12 + frame at 48 px, its slot or $FF), then per slot a 64x64
//               picture (the 48 px ball in the top left) of four 32x32
//               cells (top left, top right, bottom left, bottom right; 512
//               bytes each, 4 rows of 4 tiles)
//   extended data orbit_beam_c1a / _c1b / _c2: beam band pictures (below)
//   band.bin    the finale's beam-band BG tiles (4bpp, 45): clear, solid
//               outer (colour 1), solid inner (2), then the clear/outer
//               edges x + 2y = c for c = 1-21 and the outer/inner ones;
//               turned half round they give the other two; bands.asm lays
//               the bands above the globe on BG1/BG2 with them
//   fx.asm      tile and palette defines, palettes, burst parts and offsets,
//               beam band colours
//   preview.png every cell (not shipped)
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeTile,writePng,blank} from '../tools/gfx.mjs';
import {starColor} from './orbit.mjs';

const luma=c=>{c--;return(c&31)*3+(c>>5&31)*6+(c>>10&31);};
const rgb=([r,g,b])=>1+r+(g<<5)+(b<<10);
const hex4=v=>'$'+(v&0xffff).toString(16).padStart(4,'0');
const hex2=v=>'$'+(v&0xff).toString(16).padStart(2,'0');

// OBJ palettes the scene owns while it shows (1 = Goku, 2-3 = HUD).
export const ORBIT_FX_PAL={FIRE:0,BLUE:4,PINK:5,FRIEZA:6,GOLD:7};
// Resident small-cell slots (16x16: tiles t, t+1, t+16, t+17).
const SLOTS=[0x08C,0x08E,0x0A8,0x0AA,0x0AC,0x0AE,
  ...[0x0C0,0x0E0,0x100,0x120,0x180,0x1A0].flatMap(r=>[0,2,4,6,8,10,12,14].map(c=>r+c)),
  0x008,0x00A,0x00C,0x00E,0x028,0x02A,0x02C,0x02E];
const BEAM_C2_R1=28;                 // class 2's pictures in ROM: radii 2-28
const REGIONS=[{name:'vram_a',first:0x080,count:128},{name:'vram_b',first:0x100,count:64},{name:'vram_c',first:0x180,count:64},{name:'vram_d',first:0x000,count:64}];

export async function generate({rom,repo,outDir,xdata}){
  const eng=f=>import(pathToFileURL(join(repo,'engine',f)).href);
  const {createNativeEffects,decodeEffectFrame}=await eng('native-effects.js');
  const {combustionCells,combustionFrames}=await eng('native-combustion-data.js');
  const {friezaKiPalette}=await eng('ki-aura.js');
  const {createDeathBallArt}=await eng('death-ball-art.js');
  const {orbitVectors}=await eng('orbit-pixels.js');
  const manifest=JSON.parse(readFileSync(join(repo,'engine/native-effects.json'),'utf8'));
  const groups=createNativeEffects(rom,manifest);
  const pink=c=>friezaKiPalette[Math.min(4,Math.floor(luma(c)*4/310))];
  const decode=frame=>{const {rgba}=decodeEffectFrame(rom,frame),px=new Uint16Array(256);
    for(let i=0;i<256;i++)if(rgba[i*4+3])px[i]=1+((rgba[i*4]>>3)|((rgba[i*4+1]>>3)<<5)|((rgba[i*4+2]>>3)<<10));return px;};

  // --- cells (16x16, pixels 0 or 1+BGR555) ----------------------------------
  const cells=[];
  const add=(name,cls,px)=>{cells.push({name,cls,px});};
  // Exploder burst cells (native-combustion.js), the ones burst frames 0-6 use.
  const burstCells=[...new Set(combustionFrames.burst.flat().map(p=>p.cell))].sort((a,b)=>a-b);
  for(const c of burstCells)add(`comb_${c}`,'FIRE',decode(combustionCells[c]));
  // Blue: ki shots and ricochets (charge-orb), sparks, Goku's hand charge
  // (charge(): the charge-orb cell sampled 2:1 into 8x8, centred).
  const small=(src,f=c=>c)=>{const px=new Uint16Array(256);for(let py=0;py<8;py++)for(let qx=0;qx<8;qx++){const c=src[py*32+qx*2];if(c)px[(py+4)*16+qx+4]=f(c);}return px;};
  groups['charge-orb'].forEach((p,f)=>add(`orb_${f}`,'BLUE',p));
  groups['impact-spark'].forEach((p,f)=>add(`spark_${f}`,'BLUE',p));
  groups['charge-orb'].forEach((p,f)=>add(`charge_${f}`,'BLUE',small(p)));
  // Pink: Frieza's beam origin, his beam warning (pink charge), finger
  // glint (charge-orb frames 0-1 at 2:1) and Death Discs (gold-charge-orb[4]
  // 20x6, tilts 0, +1, -1; two cells from x-16, y-8).
  add('porb_4','PINK',groups['charge-orb'][4].map(c=>c?pink(c):0));
  groups['charge-orb'].forEach((p,f)=>add(`pcharge_${f}`,'PINK',small(p,pink)));
  for(let f=0;f<2;f++)add(`finger_${f}`,'PINK',small(groups['charge-orb'][f],pink));
  const discSrc=groups['gold-charge-orb'][4];
  for(const[tilt,label]of[[0,'0'],[1,'p'],[-1,'m']]){
    const canvas=new Uint16Array(32*16);
    for(let py=0;py<6;py++)for(let px=0;px<20;px++){
      const c=discSrc[Math.floor((py+.5)*16/6)*16+Math.floor(px*16/20)];if(!c)continue;
      const x=px-10+16,y=py-3+((px-10)>>2)*tilt+8;if(x>=0&&x<32&&y>=0&&y<16)canvas[y*32+x]=pink(c);
    }
    for(let q=0;q<2;q++){const p=new Uint16Array(256);for(let y=0;y<16;y++)for(let x=0;x<16;x++)p[y*16+x]=canvas[y*32+q*16+x];add(`disc_${label}${q}`,'PINK',p);}
  }
  // Gold: Frieza's ricochets and distant shots (gold-charge-orb 0-1), the
  // beam struggle's gold sparks (gold-spark 0-3), the recovered pouch
  // (frieza-finale-view.js: two discs and a line around the centre).
  for(let f=0;f<2;f++)add(`gorb_${f}`,'GOLD',groups['gold-charge-orb'][f]);
  groups['gold-spark'].forEach((p,f)=>add(`gspark_${f}`,'GOLD',p));
  {
    const px=new Uint16Array(256),disc=(cx,cy,r,c)=>{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)px[(cy+y)*16+cx+x]=c;};
    disc(8,8,3,rgb([15,8,2]));disc(8,7,2,rgb([29,20,7]));for(let x=7;x<=9;x++)px[4*16+x]=rgb([31,29,15]);
    add('pouch','GOLD',px);
  }
  if(cells.length>SLOTS.length)throw Error(`orbit-fx: ${cells.length} cells for ${SLOTS.length} slots`);

  // Death Balls (death-ball-art.js, violet): 32 px and 16 px, 12 frames.
  const deathArt=createDeathBallArt(rom),death={32:[],16:[]};
  for(const size of[32,16])for(let f=0;f<12;f++){
    const px=new Uint16Array(size*size);deathArt(f,size>>1,size>>1,size,(x,y,c)=>{if(x>=0&&y>=0&&x<size&&y<size)px[y*size+x]=c;});
    death[size].push(px);
  }

  // --- palettes ----------------------------------------------------------------
  const colorsOf=(list)=>[...new Set(list.flatMap(p=>[...p]))].filter(Boolean).sort((a,b)=>luma(a)-luma(b));
  const pal={};
  pal.FIRE=[0,...colorsOf(cells.filter(c=>c.cls==='FIRE').map(c=>c.px))];
  // BLUE: 1 spare, 2-3 the beam band (outer, inner; animated), then the cells.
  pal.BLUE=[0,0,0,0,...colorsOf(cells.filter(c=>c.cls==='BLUE').map(c=>c.px))];
  // PINK: 1 white (laser core), 2-3 Frieza's beam band, the ki ramp, violet.
  const violet=colorsOf([...death[32],...death[16]]);
  pal.PINK=[0,rgb([31,31,31]),0,0,...friezaKiPalette,...violet.filter(c=>!friezaKiPalette.includes(c))];
  for(const c of colorsOf(cells.filter(c=>c.cls==='PINK').map(c=>c.px)))if(!pal.PINK.includes(c))throw Error('orbit-fx: pink cell colour outside the ki ramp');
  // GOLD: 1-4 the star shades (star_tiles.bin uses indices 1-4), then gold.
  pal.GOLD=[0,...[0,1,2,3].map(s=>1+starColor(s)),...colorsOf(cells.filter(c=>c.cls==='GOLD').map(c=>c.px))];
  for(const[k,p]of Object.entries(pal))if(p.length>16)throw Error(`orbit-fx: palette ${k} needs ${p.length-1} colours`);
  const indexOf=(cls,c)=>{if(!c)return 0;const i=pal[cls].indexOf(c,cls==='BLUE'||cls==='PINK'?4:1);if(i<0)throw Error(`orbit-fx: colour ${c-1} not in ${cls}`);return i;};

  // --- VRAM images -------------------------------------------------------------
  const images=REGIONS.map(r=>({...r,bytes:new Uint8Array(r.count*32)}));
  const putTile=(tile,bytes)=>{const r=images.find(r=>tile>=r.first&&tile<r.first+r.count);if(!r)throw Error('orbit-fx: tile outside the regions');r.bytes.set(bytes,(tile-r.first)*32);};
  cells.forEach((cell,i)=>{
    const idx=Uint8Array.from(cell.px,c=>indexOf(cell.cls,c));cell.tile=SLOTS[i];
    putTile(cell.tile,encodeTile(idx,16,0,0));putTile(cell.tile+1,encodeTile(idx,16,8,0));
    putTile(cell.tile+16,encodeTile(idx,16,0,8));putTile(cell.tile+17,encodeTile(idx,16,8,8));
  });
  for(const r of images)writeFileSync(join(outDir,r.name+'.bin'),r.bytes);
  const deathBytes=[];
  for(const size of[32,16])for(const px of death[size]){
    const idx=Uint8Array.from(px,c=>indexOf('PINK',c));
    for(let ty=0;ty<size;ty+=8)for(let tx=0;tx<size;tx+=8)deathBytes.push(...encodeTile(idx,size,tx,ty));
  }
  writeFileSync(join(outDir,'death.bin'),Uint8Array.from(deathBytes));
  // The pullback's Death Balls (cosmicBattle draws kiArt 'death' at
  // round(29 r / 104 / 16) * 16 px: the battle art at 64 and 48 here, 32
  // from death.bin; orbit-finale.mjs pullbackFrames): the pictures it
  // shows on the screen, each as four 32x32 cells sent a cell at a time
  // (pull.asm).
  {
    const {pullbackFrames,pullBallPicture}=await import('./orbit-finale.mjs');
    const shown=[...new Set((await pullbackFrames(repo)).filter(f=>f.ball?.on&&f.ball.size!==32).map(f=>pullBallPicture(f.ball)))].sort((a,b)=>a-b);
    const index=new Array(32).fill(255),bytes=[];
    shown.forEach((pic,slot)=>{
      const size=pic<12?64:48,px=new Uint16Array(64*64);
      deathArt(pic%12,size>>1,size>>1,size,(x,y,c)=>{if(x>=0&&y>=0&&x<64&&y<64)px[y*64+x]=c;});
      const idx=Uint8Array.from(px,c=>indexOf('PINK',c));
      for(const[cx,cy]of[[0,0],[1,0],[0,1],[1,1]])
        for(let ty=0;ty<4;ty++)for(let tx=0;tx<4;tx++)bytes.push(...encodeTile(idx,64,cx*32+tx*8,cy*32+ty*8));
      index[pic]=slot;
    });
    xdata('orbit_death_big',Uint8Array.from([...index,...bytes]));
  }
  // Beam-band tiles (orbit-effects.js beam: outer quarters in colour 1, the
  // inner half in colour 2; edges of slope -1/2, the 26.6-degree heading
  // of the beam struggle).
  {
    const band=[],tile=f=>{const idx=new Uint8Array(64);for(let y=0;y<8;y++)for(let x=0;x<8;x++)idx[y*8+x]=f(x+2*y);band.push(...encodeTile(idx,8,0,0));};
    tile(()=>0);tile(()=>1);tile(()=>2);
    for(let c=1;c<=21;c++)tile(d=>d<c?0:1);
    for(let c=1;c<=21;c++)tile(d=>d<c?1:2);
    writeFileSync(join(outDir,'band.bin'),Uint8Array.from(band));
  }

  // --- tables ------------------------------------------------------------------
  // Burst frames (native-combustion.js draw, kind 'burst'): per frame a count,
  // then per part the cell's tile (word), x, y (signed bytes relative to the
  // anchor at turn 0) and flags (bit 0 flipX, bit 1 flipY).
  const tileOf=name=>{const c=cells.find(c=>c.name===name);if(!c)throw Error('orbit-fx: no cell '+name);return c.tile;};
  const L=['; Generated by snes/gen/orbit-fx.mjs - do not edit.'];
  for(const[k,v]of Object.entries(ORBIT_FX_PAL))L.push(`!OFX_PAL_${k} = ${v}`);
  for(const c of cells)L.push(`!OFX_${c.name.toUpperCase()} = $${c.tile.toString(16).padStart(3,'0')}`);
  L.push(`!OFX_CELLS = ${cells.length}`);
  const data=['; Generated by snes/gen/orbit-fx.mjs - do not edit.'];
  // Palettes 0 (FIRE) and 4-7 (BLUE, PINK, FRIEZA filled by the scene, GOLD).
  const row=p=>{const r=p.map(c=>c?c-1:0);while(r.length<16)r.push(0);return '\tdw '+r.map(hex4).join(',');};
  data.push('orbit_fx_pal_fire:',row(pal.FIRE),'orbit_fx_pal_blue:',row(pal.BLUE),'orbit_fx_pal_pink:',row(pal.PINK),'orbit_fx_pal_gold:',row(pal.GOLD));
  // (orbit-sprites.mjs lays palettes 0-1 and 6-7 out in CGRAM order beside
  // its own Goku and Frieza palettes: one DMA each)
  const words16=p=>{const r=p.map(c=>c?c-1:0);while(r.length<16)r.push(0);return r;};
  writeFileSync(join(outDir,'palettes.json'),JSON.stringify({fire:words16(pal.FIRE),gold:words16(pal.GOLD),blue:words16(pal.BLUE)}));
  // Beam band colours (beam-body rows 6 and 7 of frames 0 and 1): blue as
  // drawn, pink through pinkColor (Frieza's beams and lasers).
  const body=groups['beam-body'];
  const band=(f,row)=>body[f][row*16];
  data.push('orbit_fx_band_blue:','\tdw '+[band(0,6),band(0,7),band(1,6),band(1,7)].map(c=>hex4(c-1)).join(','));
  data.push('orbit_fx_band_pink:','\tdw '+[band(0,6),band(0,7),band(1,6),band(1,7)].map(c=>hex4(pink(c)-1)).join(','));
  // Bursts.
  const ptr=[],parts=[];
  for(const frame of combustionFrames.burst){
    ptr.push(parts.length);parts.push(frame.length);
    for(const p of frame){const t=tileOf(`comb_${p.cell}`);parts.push(t&255,t>>8,p.x&255,p.y&255,(p.flipX?1:0)|(p.flipY?2:0));}
  }
  data.push('orbit_fx_burst_ptr:','\tdw '+ptr.map(v=>'orbit_fx_burst_parts+'+v).join(','));
  data.push('orbit_fx_burst_parts:');
  for(let i=0;i<parts.length;i+=16)data.push('\tdb '+parts.slice(i,i+16).map(hex2).join(','));
  // fx.burst offsets: sub-burst i (1-8) at age t (0-41): heading (i*6)&15,
  // radius 8 + min(24, t): ((v * radius) >> 8) per axis.
  const off=[];
  for(let i=1;i<9;i++)for(let t=0;t<42;t++){const[vx,vy]=orbitVectors[(i*6)&15],r=8+Math.min(24,t);off.push((vx*r)>>8&255,(vy*r)>>8&255);}
  data.push('orbit_fx_burst_off:');
  for(let i=0;i<off.length;i+=16)data.push('\tdb '+off.slice(i,i+16).map(hex2).join(','));
  // Beam bands (orbit-effects.js beam): 32x32 cells generated at run time
  // along the beam. Five heading classes (|vx|, |vy| of orbitVectors 0-4);
  // headings 5-15 mirror them. Per class: vx, vy, vx div vy, vx mod vy
  // (row steps of the exact floor DDA), the first cell's top left relative
  // to the origin (centred on the axis, half a period out), the period
  // along the beam, the stacking step between parallel chains, the
  // across value V (x 256) of the first cell's top left and its change per
  // chain, and the across spacing and half extent of a cell (x 256).
  const classes=[0,1,2,3,4].map(k=>{
    const[vx,vy]=orbitVectors[k],P=[[32,0],[32,16],[32,32],[16,32],[0,32]][k],S=[[0,32],[0,32],[32,0],[32,0],[32,0]][k];
    const A=[Math.round(P[0]/2)-16,Math.round(P[1]/2)-16];
    return{vx,vy,qi:vy?Math.floor(vx/vy):0,rr:vy?vx%vy:0,A,P,S,V0:-A[0]*vy+A[1]*vx,Vs:-S[0]*vy+S[1]*vx,
      across:Math.abs(-S[0]*vy+S[1]*vx),half:16*(vx+vy)};
  });
  // Class 1's pictures (headings 1, 7, 9, 15: the beam struggle's rays,
  // which change radius every few frames) are made here instead, by the
  // same rule beam.asm applies: the cell of chain j at A0 + j * S, V =
  // -ox vy + oy vx, outer for floor(V / 256) in [-R, R] (colour 2), inner
  // in [((R + 2) >> 1) - R, ((3R + 3) >> 1) - R - 1] (colour 3); radii 2-48
  // (even), chains 0-2, 512 bytes each (4 rows of 4 tiles), in two blobs:
  // chains 0-1 by radius, then chain 2 by radius. Class 2's too (headings
  // 2, 6, 10, 14) for radii 2-28, by radius then chain: the second surge's
  // pullback's beam (heading 14) changes radius every frame or two while
  // it swells and fades, and the fight's diagonal beams take them as well.
  {
    const pic=(c,R,j)=>{
      const iLo=((R+2)>>1)-R,iHi=((3*R+3)>>1)-R-1,idx=new Uint8Array(32*32);
      for(let py=0;py<32;py++)for(let px=0;px<32;px++){
        const ox=c.A[0]+j*c.S[0]+px,oy=c.A[1]+j*c.S[1]+py,v=Math.floor((-ox*c.vy+oy*c.vx)/256);
        if(v>=-R&&v<=R)idx[py*32+px]=v>=iLo&&v<=iHi?3:2;
      }
      const bytes=[];for(let ty=0;ty<4;ty++)for(let tx=0;tx<4;tx++)bytes.push(...encodeTile(idx,32,tx*8,ty*8));
      return bytes;
    };
    const pics=[[],[]],c2=[];
    for(let R=2;R<=48;R+=2)for(let j=0;j<3;j++)pics[j<2?0:1].push(...pic(classes[1],R,j));
    for(let R=2;R<=BEAM_C2_R1;R+=2)for(let j=0;j<3;j++)c2.push(...pic(classes[2],R,j));
    xdata('orbit_beam_c1a',Uint8Array.from(pics[0]));
    xdata('orbit_beam_c1b',Uint8Array.from(pics[1]));
    xdata('orbit_beam_c2',Uint8Array.from(c2));
    L.push(`!OFX_BEAM_C2_R1 = ${BEAM_C2_R1}`);
  }
  data.push('; beam classes: vx, vy, qi, rr, A0x, A0y, Px, Py, Sx, Sy, V0, Vstep, across, half (words)','orbit_fx_beam_class:');
  for(const c of classes)data.push('\tdw '+[c.vx,c.vy,c.qi,c.rr,c.A[0],c.A[1],c.P[0],c.P[1],c.S[0],c.S[1],c.V0,c.Vs,c.across,c.half].map(hex4).join(','));
  // heading -> class | sx < 0 (bit 8) | sy < 0 (bit 9)
  data.push('orbit_fx_beam_heading:','\tdw '+orbitVectors.map(([x,y])=>{const k=[0,1,2,3,4].find(k=>Math.abs(x)===orbitVectors[k][0]&&Math.abs(y)===orbitVectors[k][1]);return k|(x<0?0x100:0)|(y<0?0x200:0);}).map(hex4).join(','));
  // 32-pixel row masks, a byte per 8-pixel tile (bit 7 = left): pixels >= x
  // and pixels <= x, x = 0-31.
  const from=[],to=[];
  for(let x=0;x<32;x++)for(let t=0;t<4;t++){
    from.push(x<=8*t?0xff:x>=8*t+8?0:(0xff>>(x-8*t))&0xff);
    to.push(x>=8*t+7?0xff:x<8*t?0:(0xff<<(7-(x-8*t)))&0xff);
  }
  data.push('orbit_fx_mask_from:');for(let i=0;i<from.length;i+=16)data.push('\tdb '+from.slice(i,i+16).map(hex2).join(','));
  data.push('orbit_fx_mask_to:');for(let i=0;i<to.length;i+=16)data.push('\tdb '+to.slice(i,i+16).map(hex2).join(','));
  writeFileSync(join(outDir,'defines.asm'),L.join('\n')+'\n');
  writeFileSync(join(outDir,'data.asm'),data.join('\n')+'\n');

  // Preview.
  const all=[...cells,...death[32].map((px,i)=>({name:'d32_'+i,cls:'PINK',px,size:32})),...death[16].map((px,i)=>({name:'d16_'+i,cls:'PINK',px,size:16}))];
  const cols=12,cw=36,prev=blank(cols*cw,Math.ceil(all.length/cols)*cw);
  all.forEach((c,k)=>{const size=c.size??16;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const v=c.px[y*size+x];if(!v)continue;
    const X=(k%cols)*cw+x,Y=Math.floor(k/cols)*cw+y,d=(Y*prev.width+X)*4,col=v-1;
    prev.data[d]=(col&31)*255/31;prev.data[d+1]=((col>>5)&31)*255/31;prev.data[d+2]=((col>>10)&31)*255/31;prev.data[d+3]=255;}});
  writeFileSync(join(outDir,'preview.png'),writePng(prev));
}
