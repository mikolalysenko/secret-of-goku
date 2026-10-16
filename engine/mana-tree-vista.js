import {cinematicMap} from './cinematic-map.js';

// Both visits use the cartridge's two independent picture planes. The cliff
// is a foreground object, never a position inferred from the event camera.
export function createManaTreeVista(rom){
 const map=cinematicMap(rom,236,{}, {separateLayers:true}),width=336;
 const word=a=>rom[a]|rom[a+1]<<8,header=0x80000+word(0x87000+236*2);
 const sky=1+word(0xc8000+(rom[header+1]&127)*210+101*2);
 const planes=map.planes.map(plane=>{
  const crop=new Uint16Array(width*544);
  for(let y=0;y<544;y++)crop.set(plane.subarray(y*map.width,y*map.width+width),y*width);
  return crop;
 });
 const ruins=planes[1].slice();
 const tile=(x,y,sx=14,sy=14)=>{
  for(let row=0;row<16;row++){
   const at=(y*16+row)*width+x*16;
   ruins.set(planes[1].subarray((sy*16+row)*width+sx*16,(sy*16+row)*width+sx*16+16),at);
  }
 };
 tile(9,12,16,12);tile(10,12,17,12);
 for(let y=13;y<=16;y++)for(let x=8;x<=(y<15?11:10);x++)if(y!==16||x!==9)tile(x,y);
 return function draw(put,{foreground=false,destroyed=false,x=8,y=104}={}){
  const plane=foreground?planes[0]:destroyed?ruins:planes[1];
  x=Math.round(x);y=Math.round(y);
  for(let py=0;py<224;py++)for(let px=0;px<256;px++){
   const c=plane[(py+y)*width+px+x];
   if(c||!foreground)put(px,py,c||sky);
  }
 };
}
