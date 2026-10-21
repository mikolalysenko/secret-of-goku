// Orbit module sprites: Goku and Frieza at the orbit's scales.
//
// Sources (single source of truth):
//   assets/sprites/ssj.png, goku.png   Goku's sheets (32 px header, 32x32 cells);
//                                      colours quantised with the goku
//                                      module's own palettes (its manifest)
//   assets/sprites/frieza-full-power.png  Frieza's muscular sheet, prepared by
//                                      the browser's own prepareFriezaSprite
//                                      (engine/frieza-sprite.js)
// Scales follow engine/frieza-orbit-view.js character() (2:1 sampling of the
// 32x32 cell, sizes rounded to 8; the death fall to 4) and drawFriezaSprite
// ({tiny}: every second pixel of the 48x48 cell, flipped by sampling the
// mirrored columns, as the browser does).
//
// Outputs (dist/snes/gen/orbit-sprites/):
//   sprites.bin   4bpp OBJ tiles (bank FA upper half)
//   sprites.asm   cell defines (ROM offsets)
//   palettes.asm  Goku's (goku module) and Frieza's OBJ palettes
//   preview.png   every cell (not shipped)
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {readPng,encodeTile,writePng,blank} from '../tools/gfx.mjs';

export const SPRITE_BANK=0xFA,SPRITE_BASE=0x8000;
const W5=c=>[c&31,(c>>5)&31,(c>>10)&31];
const dist=(a,b)=>{const[x,y,z]=W5(a),[p,q,r]=W5(b);return 3*(x-p)**2+4*(y-q)**2+2*(z-r)**2;};

// Goku's orbit poses (frieza-orbit-view.js gokuFrame, frieza-finale-view.js,
// planet-view.js cosmicBattle): columns of the Super Saiyan sheet, rows
// 0 down, 1 left, 2 right, 3 up.
export const GOKU_POSES={idle:34,fly0:36,fly1:37,fly2:38,fly3:39,charge:18,focus:21,beam:20,punch:12,kick:16,recoil:33};
export const POSE_IDS=Object.fromEntries(Object.keys(GOKU_POSES).map((k,i)=>[k,i]));

// A sprite sheet as the browser's sprite layer loads it (sprite-layer.js load).
export function atlas(repo,name){
  const img=readPng(join(repo,'assets/sprites',name+'.png'));
  const pixels=new Uint16Array(img.width*img.height);
  for(let i=0;i<pixels.length;i++)if(img.data[i*4+3])pixels[i]=1+((img.data[i*4]>>3)|((img.data[i*4+1]>>3)<<5)|((img.data[i*4+2]>>3)<<10));
  return {pixels,width:img.width,height:img.height};
}
// frieza.js loadAtlas: eight frames on a 4x2 grid, cropped to their pixels.
export function friezaSheet(repo,name){
  const img=readPng(join(repo,'assets/sprites',name+'.png'));
  const pixels=new Uint16Array(img.width*img.height),frames=[];
  for(let i=0;i<pixels.length;i++)if(img.data[i*4+3]>=128)pixels[i]=1+(img.data[i*4]>>3)+((img.data[i*4+1]>>3)<<5)+((img.data[i*4+2]>>3)<<10);
  for(let i=0;i<8;i++){
    const x0=Math.round(i%4*img.width/4),x1=Math.round((i%4+1)*img.width/4),y0=Math.round((i>>2)*img.height/2),y1=Math.round(((i>>2)+1)*img.height/2);
    let left=x1,right=x0,top=y1,bottom=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[y*img.width+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    frames.push({x:left,y:top,w:right-left+1,h:bottom-top+1});
  }
  return {pixels,width:img.width,frames};
}
const quantize=(px,pal)=>{
  const out=new Uint8Array(px.length),cache=new Map();
  for(let i=0;i<px.length;i++){const v=px[i];if(!v)continue;const c=v-1;let k=cache.get(c);
    if(k===undefined){let bd=Infinity;k=1;for(let j=1;j<16;j++){const d=dist(c,pal[j]);if(d<bd){bd=d;k=j;}}cache.set(c,k);}out[i]=k;}
  return out;
};
// character(): a size x size picture of a 32x32 cell, floor(p * 32 / size).
function scaled(a,column,row,size){
  const out=new Uint16Array(size*size);
  for(let py=0;py<size;py++)for(let px=0;px<size;px++)out[py*size+px]=a.pixels[(32+row*32+Math.floor(py*32/size))*a.width+column*32+Math.floor(px*32/size)];
  return out;
}

// Frieza's full-power sheet as the browser prepares it (prepareFriezaSprite)
// and the OBJ palette of its colours (orbit-montage.mjs reads it too).
export async function friezaFull(repo){
  const {prepareFriezaSprite}=await import(pathToFileURL(join(repo,'engine/frieza-sprite.js')).href);
  const frieza=prepareFriezaSprite(friezaSheet(repo,'frieza-full-power'));
  const friezaPalette=[0,...(()=>{const set=[];for(const cell of frieza.cells)for(const c of cell)if(c&&!set.includes(c-1))set.push(c-1);if(set.length>15)throw Error('Frieza needs more than 15 colours');while(set.length<15)set.push(0);return set;})()];
  return {frieza,friezaPalette};
}

// The aerial melee's Goku cells (aerial-melee.js goku(): column, row of the
// Super Saiyan sheet at native size), in the order orbit-montage.mjs numbers them.
export const AERIAL_GOKU=[[34,1],[34,2],[12,1],[12,2],[16,1],[16,2],[36,3],[37,3],[38,3],[39,3]];

export async function generate({rom,repo,outDir,genDir}){
  const gokuManifest=JSON.parse(readFileSync(join(genDir,'goku/manifest.json'),'utf8'));
  const [basePal,ssjPal]=gokuManifest.palettes;
  const ssj=atlas(repo,'ssj'),goku=atlas(repo,'goku');
  const {frieza,friezaPalette}=await friezaFull(repo);

  const bytes=[];const cells=[];
  // A w x h index image (w, h multiples of 8) as row-major 8x8 tiles.
  const addImage=(idx,w,h)=>{const at=bytes.length;for(let ty=0;ty<h;ty+=8)for(let tx=0;tx<w;tx+=8)bytes.push(...encodeTile(idx,w,tx,ty,4));return at;};
  const cell=(name,idx,w,h,extra={})=>{const off=addImage(idx,w,h);cells.push({name,off,w,h,...extra});return off;};

  // Goku, 16x16, Super Saiyan: poses x rows.
  for(const[pose,column]of Object.entries(GOKU_POSES))for(let row=0;row<4;row++)
    cell(`goku_${pose}_${row}`,quantize(scaled(ssj,column,row,16),ssjPal),16,16);
  // Ring-menu preview (orbit-menu.js: front idle cell 0).
  cell('goku_menu',quantize(scaled(ssj,0,0,16),ssjPal),16,16);
  // Descent (frieza-finale-view.js descentPose: 16 -> 32 px, front flight cell).
  for(const size of[24,32]){const img=new Uint8Array(32*32),q=quantize(scaled(ssj,34,0,size),ssjPal);for(let y=0;y<size;y++)for(let x=0;x<size;x++)img[y*32+x]=q[y*size+x];cell(`goku_descent_${size}`,img,32,32);}
  // Orbital death fall (boss-rush-death.js): gold 29 then base 33, 48-51 on
  // row 1, shrinking 16 -> 12 -> 8 -> 4 (falling sizes round to 4).
  cell('goku_fall_gold',quantize(scaled(ssj,29,1,16),ssjPal),16,16,{pal:'ssj'});
  cell('goku_fall_33',quantize(scaled(goku,33,1,16),basePal),16,16,{pal:'base'});
  for(const column of[48,49,50,51])cell(`goku_fall_${column}`,quantize(scaled(goku,column,1,16),basePal),16,16,{pal:'base'});
  for(const size of[12,8,4]){const img=new Uint8Array(16*16),q=quantize(scaled(goku,51,1,size),basePal);for(let y=0;y<size;y++)for(let x=0;x<size;x++)img[y*16+x]=q[y*size+x];cell(`goku_fall_51_${size}`,img,16,16,{pal:'base'});}
  // Aerial melee, native size (aerial-melee.js goku()).
  for(const[column,row]of AERIAL_GOKU){
    const px=new Uint16Array(1024);for(let y=0;y<32;y++)for(let x=0;x<32;x++)px[y*32+x]=ssj.pixels[(32+row*32+y)*ssj.width+column*32+x];
    cell(`goku_full_${column}_${row}`,quantize(px,ssjPal),32,32);
  }
  // Frieza, tiny (24x24 at the top left of a 32x32 OBJ), both orientations.
  const fidx=c=>{const i=friezaPalette.indexOf(c-1);return c?i:0;};
  for(let f=0;f<8;f++)for(const flip of[false,true]){
    const img=new Uint8Array(32*32),c=frieza.cells[f];
    for(let py=0;py<24;py++)for(let px=0;px<24;px++)img[py*32+px]=fidx(c[py*2*48+(flip?47-px*2:px*2)]);
    cell(`frieza_${f}${flip?'_flip':''}`,img,32,32);
  }
  // Frieza, full size (aerial melee): frames 4, 5, 6, both orientations, 48x48.
  for(const f of[4,5,6])for(const flip of[false,true]){
    const img=new Uint8Array(48*48),c=frieza.cells[f];
    for(let py=0;py<48;py++)for(let px=0;px<48;px++)img[py*48+px]=fidx(c[py*48+(flip?47-px:px)]);
    cell(`frieza_full_${f}${flip?'_flip':''}`,img,48,48);
  }
  if(bytes.length>0x8000)throw Error(`orbit sprites need ${bytes.length} bytes (bank FA upper half holds 32 KiB)`);
  writeFileSync(join(outDir,'sprites.bin'),Uint8Array.from(bytes));
  const words=a=>'\tdw '+a.map(v=>'$'+(v&0xffff).toString(16).padStart(4,'0')).join(',');
  const lines=['; Generated by snes/gen/orbit-sprites.mjs',`!OSP_BANK = $${SPRITE_BANK.toString(16)}`,`!OSP_BASE = $${SPRITE_BASE.toString(16)}`];
  for(const c of cells)lines.push(`!OSP_${c.name.toUpperCase()} = $${(SPRITE_BASE+c.off).toString(16)}`);
  lines.push(`!OSP_POSES = ${Object.keys(GOKU_POSES).length}`);
  for(const[k,i]of Object.entries(POSE_IDS))lines.push(`!OPOSE_${k.toUpperCase()} = ${i}`);
  writeFileSync(join(outDir,'sprites.asm'),lines.join('\n')+'\n');
  // frieza-orbit-view.js: the charge glows at his hands, h + round((socket -
  // 16) / 2), from the Super Saiyan charge cell's sockets (column 18, rows 0-3).
  const context={window:{}};vm.runInNewContext(readFileSync(join(repo,'engine/goku-animation-data.js'),'utf8'),context);
  const hand=context.window.GokuAnimationData.forms.ssj.sockets[GOKU_POSES.charge].flatMap(([x,y])=>[Math.round((x-16)/2),Math.round((y-16)/2)]);
  // OBJ palettes 0-1 (fire, Goku) and 6-7 (Frieza, gold) in CGRAM order,
  // so the scene's vblank sends each pair with one DMA (fire and gold from
  // orbit-fx.mjs, which runs first)
  const fx=JSON.parse(readFileSync(join(genDir,'orbit-fx/palettes.json'),'utf8'));
  const pad16=a=>{const r=[...a];while(r.length<16)r.push(0);if(r.length>16)throw Error('orbit-sprites: palette over 16 colours');return r;};
  writeFileSync(join(outDir,'palettes.asm'),['; Generated by snes/gen/orbit-sprites.mjs',
    'orbit_obj_pals_01:',words(pad16(fx.fire)),'orbit_pal_goku_ssj:',words(pad16(ssjPal)),
    'orbit_obj_pals_01b:',words(pad16(fx.fire)),words(pad16(basePal)),
    'orbit_obj_pals_67:','orbit_pal_frieza:',words(pad16(friezaPalette)),words(pad16(fx.gold)),
    'orbit_pal_goku_base:',words(basePal),
    'orbit_charge_hand:','\tdb '+hand.map(v=>'$'+(v&255).toString(16).padStart(2,'0')).join(','),''].join('\n'));
  // Preview.
  const cols=16,cw=48,prev=blank(cols*cw,Math.ceil(cells.length/cols)*cw);
  cells.forEach((c,k)=>{const pal=c.name.startsWith('frieza')?friezaPalette:c.pal==='base'?basePal:ssjPal;
    for(let ty=0;ty<c.h/8;ty++)for(let tx=0;tx<c.w/8;tx++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const t=c.off+(ty*(c.w/8)+tx)*32;let v=0;for(let p=0;p<4;p++)v|=((bytes[t+(p>>1)*16+y*2+(p&1)]>>(7-x))&1)<<p;
      if(!v)continue;const col=pal[v],X=(k%cols)*cw+tx*8+x,Y=Math.floor(k/cols)*cw+ty*8+y,d=(Y*prev.width+X)*4;
      prev.data[d]=(col&31)*255/31;prev.data[d+1]=((col>>5)&31)*255/31;prev.data[d+2]=((col>>10)&31)*255/31;prev.data[d+3]=255;}});
  writeFileSync(join(outDir,'preview.png'),writePng(prev));
}
