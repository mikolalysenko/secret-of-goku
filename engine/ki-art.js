import {createDeathBallArt} from './death-ball-art.js';
import {createNativeCombustion} from './native-combustion.js';
// Shared native-resolution ki sprites, reused by ground, orbit and endings.
export function createKiArt(snes){
 const sheets=new Map();
 let death=null,cartridge=null,combustion=null,combustionRom=null;
 const ready=Promise.all([['dragon',4,2,'dragon-balls.png']].map(async([key,cols,rows,file])=>{
  const image=new Image(),url=new URL(`../assets/sprites/${file}`,import.meta.url);url.search=new URL(import.meta.url).search;image.src=url.href;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,pixels=new Uint16Array(image.width*image.height);
  for(let i=0;i<pixels.length;i++)if(rgba[i*4+3]>=128)pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  const frames=[];
  for(let i=0;i<cols*rows;i++){
   const x0=Math.round(i%cols*image.width/cols),x1=Math.round((i%cols+1)*image.width/cols),y0=Math.round(Math.floor(i/cols)*image.height/rows),y1=Math.round((Math.floor(i/cols)+1)*image.height/rows);
   let x=x1,y=y1,right=x0,bottom=y0;
   for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pixels[yy*image.width+xx]){x=Math.min(x,xx);right=Math.max(right,xx);y=Math.min(y,yy);bottom=Math.max(bottom,yy);}
   frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  sheets.set(key,{pixels,width:image.width,frames});
 }));
 return{ready,combustion(kind,frame,x,y,put,options){
  const rom=snes?.cart?.data;if(!rom)return;
  if(combustionRom!==rom){combustion=createNativeCombustion(rom);combustionRom=rom;}
  combustion(kind,frame,x,y,put,options);
 },draw(key,frame,x,y,size,put,options){
  if(key==='death'){
   const rom=snes?.cart?.data;if(!rom)return;
   if(cartridge!==rom){death=createDeathBallArt(rom);cartridge=rom;}
   death(frame,x,y,size,put,options);return;
  }
  const a=sheets.get(key);if(!a)return;frame%=a.frames.length;
  const f=a.frames[frame],w=Math.round(size*f.w/Math.max(f.w,f.h)),h=Math.round(size*f.h/Math.max(f.w,f.h));
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const c=a.pixels[(f.y+Math.floor(yy*f.h/h))*a.width+f.x+Math.floor(xx*f.w/w)];if(c)put(x-w/2+xx,y-h/2+yy,c);}
 }};
}
