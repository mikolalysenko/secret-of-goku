// Picture agreement between emulators, measured in SNES colours: each PNG
// is decoded back to 15-bit BGR with its emulator's output transfer, then
// pixels are compared exactly. Mesen and snes9x expand 5-bit channels by bit
// replication; bsnes' libretro core applies a 1.5 gamma ramp to the lower
// half of each channel (target-libretro/program.cpp updateVideoPalette), so
// its levels are inverted through the same formula. Sizes differ (hires
// 512 wide, line-doubled 448 high, bsnes' accurate PPU always 512x448), so
// both pictures are sampled on the smaller grid.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const {PNG}=createRequire(resolve(repo,'package.json'))('pngjs');

function bsnesLevels(){
  const lv=[];
  for(let c=0;c<32;c++){
    let v=c<<3|c>>2;
    v=v<<8|v;
    if(v<=32767)v=Math.trunc(32767*Math.pow(v/32767,1.5));
    lv.push(v>>8);
  }
  return lv;
}
const LUTS={};
function lut(kind){
  if(LUTS[kind])return LUTS[kind];
  const t=new Uint8Array(256);
  if(kind==='bsnes'){
    const lv=bsnesLevels();
    for(let x=0;x<256;x++){
      let best=0;
      for(let c=1;c<32;c++)if(Math.abs(lv[c]-x)<Math.abs(lv[best]-x))best=c;
      t[x]=best;
    }
  }else for(let x=0;x<256;x++)t[x]=x>>3;
  return LUTS[kind]=t;
}
// {w,h,px} with px[i] = 15-bit BGR.
export function load15(path,kind){
  const im=PNG.sync.read(readFileSync(path)),l=lut(kind);
  const px=new Uint16Array(im.width*im.height);
  for(let i=0;i<px.length;i++)px[i]=l[im.data[i*4]]|l[im.data[i*4+1]]<<5|l[im.data[i*4+2]]<<10;
  return {w:im.width,h:im.height,px};
}
// Resample to w x h by taking every (src/w)-th pixel.
function grid(img,w,h){
  if(img.w===w&&img.h===h)return img;
  const sx=img.w/w,sy=img.h/h,px=new Uint16Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)px[y*w+x]=img.px[Math.floor(y*sy)*img.w+Math.floor(x*sx)];
  return {w,h,px};
}
export function common(a,b){
  const w=Math.min(a.w,b.w),h=Math.min(a.h,b.h);
  return [grid(a,w,h),grid(b,w,h)];
}
// Share of equal pixels with b shifted down by dy lines (rows outside either
// picture are ignored); tol > 0 accepts channels that differ by up to tol
// 5-bit levels (snes9x's colour math rounds green differently).
const close=(c,d,tol)=>Math.abs((c&31)-(d&31))<=tol&&Math.abs((c>>5&31)-(d>>5&31))<=tol&&Math.abs((c>>10&31)-(d>>10&31))<=tol;
export function agreement(a,b,dy=0,tol=0){
  const [p,q]=common(a,b);
  let same=0,n=0;
  for(let y=0;y<p.h;y++){
    const yb=y-dy;
    if(yb<0||yb>=q.h)continue;
    for(let x=0;x<p.w;x++){
      n++;
      const c=p.px[y*p.w+x],d=q.px[yb*q.w+x];
      if(c===d||(tol&&close(c,d,tol)))same++;
    }
  }
  return n?same/n:0;
}
// Best agreement of a reference against candidate pictures (a frame window,
// each {label, offset, img}) and vertical shifts; ties go to the smallest
// frame offset, then the smallest shift. Returns {best, rows}.
export function bestMatch(ref,cands,dys=[0,-1,1,-2,2,-3,3,-4,4,-5,5,-6,6,-7,7,-8,8]){
  const rows=[];
  let best=null;
  const better=(x,y)=>!y||x.agreement>y.agreement+1e-12||(Math.abs(x.agreement-y.agreement)<=1e-12&&Math.abs(x.offset)<Math.abs(y.offset));
  for(const c of cands){
    let cb=null;
    for(const dy of dys){
      const a=agreement(ref,c.img,dy);
      if(!cb||a>cb.agreement+1e-12)cb={label:c.label,offset:c.offset??0,dy,agreement:a};
    }
    rows.push(cb);
    if(better(cb,best))best=cb;
  }
  return {best,rows};
}
// Reference | candidate | difference (red where colours differ).
export function diffSheet(ref,cand,dy,outPath){
  const [p,q]=common(ref,cand);
  const w=p.w,h=p.h,sheet=new PNG({width:w*3,height:h});
  const rgb=c=>[(c&31)<<3|(c&31)>>2,(c>>5&31)<<3|(c>>5&31)>>2,(c>>10&31)<<3|(c>>10&31)>>2];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const a=p.px[y*w+x],yb=y-dy,b=yb>=0&&yb<h?q.px[yb*w+x]:0;
    const put=(px,c)=>{const o=(y*sheet.width+px)*4;sheet.data[o]=c[0];sheet.data[o+1]=c[1];sheet.data[o+2]=c[2];sheet.data[o+3]=255;};
    put(x,rgb(a));put(w+x,rgb(b));
    const g=rgb(a);
    put(2*w+x,a===b?[g[0]>>2,g[1]>>2,g[2]>>2]:[255,0,0]);
  }
  writeFileSync(outPath,PNG.sync.write(sheet));
}
