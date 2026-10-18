import {decodeEffectFrame} from './native-effects.js';
import {combustionCells,combustionFrames} from './native-combustion-data.js';

export function createNativeCombustion(rom){
 const cells=combustionCells.map(frame=>{
  const {rgba}=decodeEffectFrame(rom,frame),pixels=new Uint16Array(256);
  for(let i=0;i<256;i++)if(rgba[i*4+3])pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  return pixels;
 });
 // Per cell and flip, its opaque pixels in drawing order (rows, then
 // columns) as px | py << 4 | color << 8, built on first use.
 const opaque=new Map();
 const opaquePixels=(cell,flipX,flipY)=>{
  const key=cell*4+(flipX?2:0)+(flipY?1:0);let list=opaque.get(key);
  if(!list){
   const out=[];
   for(let py=0;py<16;py++)for(let px=0;px<16;px++){const color=cells[cell][(flipY?15-py:py)*16+(flipX?15-px:px)];if(color)out.push(px|py<<4|color<<8);}
   list=Int32Array.from(out);opaque.set(key,list);
  }
  return list;
 };
 return function draw(kind,frame,x,y,put,{flip=false,turn=0}={}){
  x=Math.round(x);y=Math.round(y);
  const frames=combustionFrames[kind],parts=frames?.[Math.floor(frame)];if(!parts)return;
  for(const p of parts){
   const list=opaquePixels(p.cell,p.flipX,p.flipY);
   for(let i=0;i<list.length;i++){
    const e=list[i],px=e&15,py=e>>4&15,color=e>>>8;
    const u=(p.x+px)*(flip?-1:1),v=p.y+py;
    put(x+(turn===1?-v:turn===2?-u:turn===3?v:u),y+(turn===1?u:turn===2?-v:turn===3?-u:v),color);
   }
  }
 };
}
