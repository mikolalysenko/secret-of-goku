// Orbit module data: the Mode 7 globe of the orbital fight, its palettes,
// the seeded starfield and the per-scanline lookup tables.
//
// Sources (one source of truth, no art stored in the repository):
//   engine/world-texture.js   the cartridge's world map (C0:9A00 row RLE),
//                             world tiles (C6:0000) and night palette
//   engine/planet-view.js     planet(): stepped target, hit-site offsets,
//                             four light bands, the 3-pixel rim; stars
//   engine/orbit-camera.js    projectOrbitBackground (parallax depths)
//
// The browser samples the world texture per pixel through an exact sphere
// projection. The cartridge shows the same texture on a Mode 7 plane: the
// world at 1/4 scale (1024 x 1024 texels, one texel = 4 x 4 world pixels),
// each Mode 7 character being the world tile that dominates its 32 x 32
// world-pixel block. Every scanline of the disc samples one texture row
// (the browser's latitude for that line, exactly) and maps the longitude
// linearly across the chord (the browser's asin() is approximated by its
// slope times ORBIT_K; see docs/agents/snes-port/orbit.md).
//
// Outputs (dist/snes/gen/orbit/):
//   globe_vram.bin  32 KiB Mode 7 VRAM image (word = map byte | char byte << 8)
//   globe_pal.bin   4 light levels x 96 colours (CGRAM 32-127)
//   stars.bin       100 stars: x, y, flags (bit0-1 shade, bit2-3 depth, bit7 bright), phase
//   asin.bin        257 words: Mode 7 rows of asin(i/256) (texels)
//   recip.bin       512 words: M7A for a chord of n = 2w+1 pixels
//   defines.asm     constants shared with the module
//   preview-*.png   checks (not shipped)
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writePng,blank} from '../tools/gfx.mjs';

export const ORBIT_K=1.25;            // linear longitude slope (x asin'(0)); 1 = tangent, pi/2 = limb
export const GLOBE_CGRAM=32;          // first CGRAM colour of the globe
export const GLOBE_COLORS=96;         // CGRAM 32-127 (BG palettes 2-7)
const TEXELS_PER_RADIAN=4096/(2*Math.PI)/4;  // 162.97: longitude, world px / 4
const ROWS_PER_RADIAN=4096/Math.PI/4;        // 325.95: latitude rows / radian
// planet(): the strike site sits on the upper-right limb.
const HIT_X=.62,HIT_Y=-.69,HIT_Z=Math.sqrt(1-HIT_X*HIT_X-HIT_Y*HIT_Y);
export const LON_OFFSET=Math.atan2(HIT_X,HIT_Z)*4096/(2*Math.PI);  // 670.7 world px
export const LAT_OFFSET=-Math.asin(HIT_Y)*4096/Math.PI;           // 993.0 world px

const rgb=(r,g,b)=>r|(g<<5)|(b<<10);
const ch=(c,s)=>(c>>s)&31;

export function decodeWorld(rom){
  const tiles=new Uint8Array(512*512);
  for(let y=0;y<512;y++){
    const bank=6+((rom[0x67fc0+(y>>3)]>>(y&7))&1);
    let at=(bank<<16)+(rom[0x68000+y*2]|rom[0x68001+y*2]<<8),x=0;
    while(x<512){
      const op=rom[at++],count=op<0xc0?1:op-0xbf,value=op<0xc0?op:rom[at++];
      if(x+count>512||value>=240)throw Error('invalid world row');
      tiles.fill(value,y*512+x,y*512+x+count);x+=count;
    }
  }
  const index=(t,px,py)=>{const p=(py&7)*8+(px&7);return (rom[0x60000+t*32+(p>>1)]>>((p&1)*4))&15;};
  const palette=t=>(rom[0x67d80+(t>>1)]>>((t&1)*4))&15;
  const color=(t,i,night=true)=>{const at=(night?0x6483e:0x67dfe)+(i?palette(t)*30+i*2:0);return (rom[at]|rom[at+1]<<8)&0x7fff;};
  return {tiles,index,palette,color};
}

// The world tile that dominates each 4x4 block (ties: first in a
// centre-out scan), one Mode 7 map cell per block.
export function globeMap(world){
  const order=[[2,2],[1,2],[2,1],[1,1],[3,2],[2,3],[3,1],[1,3],[3,3],[0,2],[2,0],[0,1],[1,0],[0,3],[3,0],[0,0]];
  const map=new Uint8Array(128*128);
  for(let j=0;j<128;j++)for(let i=0;i<128;i++){
    const count=new Map();let best=-1,bn=0;
    for(const[u,v]of order){const t=world.tiles[(j*4+v)*512+i*4+u];const n=(count.get(t)??0)+1;count.set(t,n);if(n>bn){bn=n;best=t;}}
    map[j*128+i]=best;
  }
  return map;
}

// k-means on RGB555 colours weighted by use.
function reduce(hist,n){
  const colors=[...hist.entries()];
  if(colors.length<=n)return {centers:colors.map(([c])=>c),assign:new Map(colors.map(([c])=>[c,c]))};
  colors.sort((a,b)=>b[1]-a[1]);
  const d=(a,b)=>3*(ch(a,0)-ch(b,0))**2+4*(ch(a,5)-ch(b,5))**2+2*(ch(a,10)-ch(b,10))**2;
  let centers=[colors[0][0]];
  while(centers.length<n){let best=null,bd=-1;for(const[c,w]of colors){let m=Infinity;for(const k of centers)m=Math.min(m,d(c,k));const s=m*Math.sqrt(w);if(s>bd){bd=s;best=c;}}centers.push(best);}
  for(let it=0;it<10;it++){
    const acc=centers.map(()=>[0,0,0,0]);
    for(const[c,w]of colors){let bi=0,bd=Infinity;centers.forEach((k,i)=>{const e=d(c,k);if(e<bd){bd=e;bi=i;}});acc[bi][0]+=ch(c,0)*w;acc[bi][1]+=ch(c,5)*w;acc[bi][2]+=ch(c,10)*w;acc[bi][3]+=w;}
    centers=acc.map((a,i)=>a[3]?rgb(Math.round(a[0]/a[3]),Math.round(a[1]/a[3]),Math.round(a[2]/a[3])):centers[i]);
  }
  const assign=new Map();
  for(const[c]of colors){let bi=0,bd=Infinity;centers.forEach((k,i)=>{const e=d(c,k);if(e<bd){bd=e;bi=i;}});assign.set(c,centers[bi]);}
  return {centers,assign};
}

export function globeTexture(rom){
  const world=decodeWorld(rom),map=globeMap(world);
  const used=[...new Set(map)].sort((a,b)=>a-b);
  if(used.length>256)throw Error(`globe needs ${used.length} Mode 7 characters`);
  const freq=new Map();for(const t of map)freq.set(t,(freq.get(t)??0)+1);
  const hist=new Map();
  for(const t of used)for(let p=0;p<64;p++){const c=world.color(t,world.index(t,p&7,p>>3));hist.set(c,(hist.get(c)??0)+freq.get(t));}
  const {centers,assign}=reduce(hist,GLOBE_COLORS);
  const slot=new Map(centers.map((c,i)=>[c,GLOBE_CGRAM+i]));
  const charOf=new Map(used.map((t,i)=>[t,i]));
  const vram=new Uint8Array(0x8000);
  for(let w=0;w<0x4000;w++)vram[w*2]=charOf.get(map[w]);
  used.forEach((t,c)=>{for(let p=0;p<64;p++)vram[(c*64+p)*2+1]=slot.get(assign.get(world.color(t,world.index(t,p&7,p>>3))));});
  const palettes=[1,2,3,4].map(light=>Array.from({length:GLOBE_COLORS},(_,i)=>{const c=centers[i]??0,s=v=>(v*light)>>2;return rgb(s(ch(c,0)),s(ch(c,5)),s(ch(c,10)));}));
  return {vram,palettes,chars:used.length,colors:centers.length,map,world};
}

// planet-view.js stars: a fixed seed, independent coordinates.
export function starList(){
  let seed=0x53a19e27;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},result=[];
  while(result.length<100){
    const x=Math.floor(random()*256),y=Math.floor(random()*224);
    if(result.some(s=>Math.abs(s.x-x)+Math.abs(s.y-y)<4))continue;
    result.push({x,y,shade:Math.floor(random()*4),phase:Math.floor(random()*240),bright:random()<.05});
  }
  return result;
}
// planet-view.js sky(): depth = bright ? 3 : 1 + (shade & 1); colour by shade.
export const starDepth=s=>s.bright?3:1+(s.shade&1);
export const starColor=shade=>rgb(5+shade*2,7+shade*2,11+shade*3);

const words=a=>{const b=new Uint8Array(a.length*2);a.forEach((v,i)=>{b[i*2]=v&255;b[i*2+1]=(v>>8)&255;});return b;};

export function asinRows(){return Array.from({length:257},(_,i)=>Math.round(ROWS_PER_RADIAN*Math.asin(i/256)));}

// Per-radius line tables for the fight's radii (orbit camera 56-104).
// Rows j = -R..R (R = the rim's half height): M7A (longitude scale) and
// M7D, with M7B = M7C = 0 and a constant M7Y = ybase, M7VOFS = ybase + K -
// cy - 1. The PPU then samples texel row ybase + d(j) (K + j) / 256 on
// screen line cy + j (hardware line cy + j + 1), so d(j) = 256 T(j) / (K + j)
// puts the browser's latitude row T(j) = asin(j/r) * 325.95 on every line,
// independent of the centre line and of the latitude. Both tables are read
// by indirect HDMA straight from ROM (K = ROW_K). ww(|j|) = disc | rim half chords
// ($FF: none) for the window builder.
export const ROW_K=256;
export const FIGHT_R0=56,FIGHT_R1=104;
export function rimRows(r){return Math.floor(Math.sqrt(Math.floor(1.07*r*r+1e-9)));}
export function lineTables(r){
  const R=rimRows(r),rr=r*r,r2=Math.floor(1.07*r*r+1e-9),m7a=[],m7d=[],ww=[];
  const recip=chordScale();
  for(let j=-R;j<=R;j++){
    const w=j*j<=rr?Math.floor(Math.sqrt(rr-j*j)):-1;
    m7a.push(w<0?32767:recip[2*w+1]);
    const T=Math.round(ROWS_PER_RADIAN*Math.asin(Math.max(-1,Math.min(1,j/r))));
    const d=Math.round(256*T/(ROW_K+j));
    if(d<-32768||d>32767)throw Error('M7D out of range');
    m7d.push(d&0xffff);
  }
  // (planet() paints only the rows and columns within r + 3 of the centre:
  // from radius 117 on that clips the rim's outer edge)
  for(let a=0;a<=R;a++){
    const w=a*a<=rr?Math.floor(Math.sqrt(rr-a*a)):255;
    let w2=a*a<=r2?Math.floor(Math.sqrt(r2-a*a)):255;
    if(a>r+3)w2=255;else if(w2!==255)w2=Math.min(w2,r+3);
    ww.push(w|(w2<<8));
  }
  return {R,m7a,m7d,ww};
}
// M7A (8.8) for a chord of n = 2w+1 pixels: K * 162.97 texels per radius.
export function chordScale(){return Array.from({length:512},(_,n)=>n?Math.min(32767,Math.round(TEXELS_PER_RADIAN*ORBIT_K*256*2/n)):32767);}

export async function generate({rom,repo,outDir}){
  const g=globeTexture(rom);
  writeFileSync(join(outDir,'globe_vram.bin'),g.vram);
  writeFileSync(join(outDir,'globe_pal.bin'),words(g.palettes.flat()));
  // Stars grouped by parallax depth (1, 2, 3): the cartridge projects one
  // depth at a time with that depth's offsets in registers.
  const stars=starList().map((s,i)=>({...s,i})).sort((a,b)=>starDepth(a)-starDepth(b)||a.i-b.i);
  const sb=new Uint8Array(stars.length*4);
  stars.forEach((s,i)=>{sb[i*4]=s.x;sb[i*4+1]=s.y;sb[i*4+2]=(s.shade&3)|(starDepth(s)<<2)|(s.bright?0x80:0);sb[i*4+3]=s.phase;});
  writeFileSync(join(outDir,'stars.bin'),sb);
  const depthEnd=[1,2,3].map(d=>stars.filter(s=>starDepth(s)<=d).length);
  // Star cells: 16x16 OBJ at even tile columns of one row; dots (shade k,
  // colour index k+1) at tiles 0,2,4,6 and twinkle crosses at 8-14.
  const starTiles=new Uint8Array(32*32);
  const setPixel=(tile,x,y,c)=>{const b=tile*32;for(let p=0;p<4;p++){const at=b+(p>>1)*16+y*2+(p&1);if(c>>p&1)starTiles[at]|=0x80>>x;}};
  for(let k=0;k<4;k++){
    setPixel(k*2,0,0,k+1);
    for(const[x,y]of[[1,1],[0,1],[2,1],[1,0],[1,2]])setPixel(8+k*2,x,y,k+1);
  }
  writeFileSync(join(outDir,'star_tiles.bin'),starTiles);
  writeFileSync(join(outDir,'asin.bin'),words(asinRows()));
  writeFileSync(join(outDir,'recip.bin'),words(chordScale()));
  // Rim (planet-view: nx^2+ny^2 <= 1.07): floor(1.07 r^2) and its integer
  // square root, for r = 0..255.
  const rimSq=Array.from({length:256},(_,r)=>Math.min(65535,Math.floor(1.07*r*r+1e-9)));
  writeFileSync(join(outDir,'rimsq.bin'),words(rimSq));
  writeFileSync(join(outDir,'rimw.bin'),words(rimSq.map(v=>Math.floor(Math.sqrt(v)))));
  // Fight line tables (bank F7): index at $0000, 8 bytes per radius
  // FIGHT_R0..R1: R, M7A block, M7D block, chord block (16-bit offsets).
  const radii=FIGHT_R1-FIGHT_R0+1,bank=new Uint8Array(0x10000);let at=radii*8;
  const put16=(o,v)=>{bank[o]=v&255;bank[o+1]=(v>>8)&255;};
  for(let r=FIGHT_R0;r<=FIGHT_R1;r++){
    const t=lineTables(r),idx=(r-FIGHT_R0)*8;
    put16(idx,t.R);
    for(const[k,arr]of[[2,t.m7a],[4,t.m7d],[6,t.ww]]){
      put16(idx+k,at);arr.forEach(v=>{put16(at,v);at+=2;});
    }
    if(at>0x10000)throw Error('fight line tables exceed bank F7');
  }
  writeFileSync(join(outDir,'fight_lines.bin'),bank.subarray(0,at));
  // engine/orbit-pixels.js: sixteen headings (8.8) and orbitStep's whole
  // pixel steps round(v * speed / 256) for the speeds the fight uses.
  const {orbitVectors}=await import(pathToFileURL(join(repo,'engine/orbit-pixels.js')).href);
  const speeds=[1,2,3,4,5,6,7,12];
  const steps=[];for(const sp of speeds)for(const[x,y]of orbitVectors)steps.push(Math.round(x*sp/256)&255,Math.round(y*sp/256)&255);
  const vec=[];for(const[x,y]of orbitVectors)vec.push(x&0xffff,y&0xffff);
  writeFileSync(join(outDir,'vectors.asm'),['; engine/orbit-pixels.js orbitVectors (8.8) and orbitStep tables',
    'orbit_vectors:','\tdw '+vec.map(v=>'$'+v.toString(16).padStart(4,'0')).join(','),
    ...speeds.map((sp,i)=>`orbit_steps_${sp}:\n\tdb `+steps.slice(i*32,i*32+32).map(v=>'$'+v.toString(16).padStart(2,'0')).join(',')),
    ''].join('\n'));
  const lon=Math.round(LON_OFFSET*16),lat=Math.round(LAT_OFFSET*16);
  writeFileSync(join(outDir,'defines.asm'),[
    '; Generated by snes/gen/orbit.mjs',
    `!ORBIT_GLOBE_CHARS = ${g.chars}`,
    `!ORBIT_GLOBE_COLORS = ${g.colors}`,
    `!ORBIT_GLOBE_CGRAM = ${GLOBE_CGRAM}`,
    `!ORBIT_STARS = ${stars.length}`,
    `!ORBIT_STARS_D1 = ${depthEnd[0]}       ; stars of depth 1 end here (index)`,
    `!ORBIT_STARS_D2 = ${depthEnd[1]}`,
    `!ORBIT_STARS_D3 = ${depthEnd[2]}`,
    `!ORBIT_FIGHT_R0 = ${FIGHT_R0}`,
    `!ORBIT_FIGHT_R1 = ${FIGHT_R1}`,
    `!ORBIT_ROWK = ${ROW_K}`,
    `!ORBIT_LON_OFFSET16 = ${lon}        ; ${LON_OFFSET.toFixed(3)} world px x16`,
    `!ORBIT_LAT_OFFSET16 = ${lat}        ; ${LAT_OFFSET.toFixed(3)} world px x16`,
    `!ORBIT_STAR_COLORS = ${[0,1,2,3].map(starColor).map(c=>'$'+c.toString(16).padStart(4,'0')).join(', ')}`,
    ''].join('\n'));
  // Preview: the 1024x1024 texture at half size.
  const img=blank(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const X=x*2,Y=y*2,c=g.vram[((((Y>>3)*128+(X>>3))&0x3fff)*2)];
    const k=g.vram[((c*64+(Y&7)*8+(X&7))*2)+1],col=g.palettes[3][k-GLOBE_CGRAM]??0,d=(y*512+x)*4;
    img.data[d]=ch(col,0)*255/31|0;img.data[d+1]=ch(col,5)*255/31|0;img.data[d+2]=ch(col,10)*255/31|0;img.data[d+3]=255;
  }
  writeFileSync(join(outDir,'preview-globe-texture.png'),writePng(img));
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const {loadBaseRom}=await import('../build.mjs');
  const g=globeTexture(loadBaseRom());
  console.log('chars',g.chars,'colors',g.colors);
}
