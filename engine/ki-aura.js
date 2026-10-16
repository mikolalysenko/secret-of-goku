// Pixel-sized ki flames, using the cartridge's spell palettes.
// A fixed foot anchor and staggered upward tongues replace orbiting shield
// arcs. Cells are cached like OBJ animation frames; no canvas glow, alpha
// blending, smooth rotation or random per-frame positions are involved.
const atlases=new WeakMap();
const lift=[0,2,4,6,7,5,3,1,0,-1,-1,0];
const sway=[0,0,1,1,1,0,0,-1,-1,-1,0,0];
const luma=c=>{c--;return(c&31)*3+(c>>5&31)*6+(c>>10&31);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// The same magenta/pink ramp as Frieza's finger laser and Death Discs.
export const friezaKiPalette=[[16,1,10],[25,3,17],[31,8,23],[31,19,28],[31,31,31]].map(([r,g,b])=>1+r+(g<<5)+(b<<10));

function cell(height,level,phase){
 const scale=n=>Math.round(n*height/32),power=level/8;
 const tip=(offset)=>lift[(phase+offset)%12];
 const breadth=.7+power*.3,stretch=.76+power*.24;
 const contour=[
  [0,1],[-9,-1],[-16,-8],[-20,-20],[-21+sway[phase],-32-tip(0)],
  [-15,-27],[-14,-42-tip(4)],[-8,-36],[-3+sway[(phase+3)%12],-50-tip(8)],
  [3,-38],[9,-46-tip(2)],[12,-31],[20+sway[(phase+5)%12],-38-tip(6)],
  [18,-24],[22,-27-tip(9)],[19,-12],[12,-3],[5,0]
 ].map(([x,y])=>[scale(x*breadth),scale(y*stretch)]);
 const width=scale(52)|1,rows=scale(64),cx=width>>1,feet=rows-3;
 const mask=new Uint8Array(width*rows),pixels=new Uint8Array(width*rows);
 // Scan-convert the authored flame silhouette on the native pixel grid.
 for(let y=0;y<rows;y++){
  const yy=y-feet,crossings=[];
  for(let i=0,j=contour.length-1;i<contour.length;j=i++){
   const [ax,ay]=contour[j],[bx,by]=contour[i];
   if((ay<=yy&&by>yy)||(by<=yy&&ay>yy))crossings.push(ax+(yy-ay)*(bx-ax)/(by-ay));
  }
  crossings.sort((a,b)=>a-b);
  for(let i=0;i+1<crossings.length;i+=2)for(let x=Math.ceil(crossings[i])+cx;x<=Math.floor(crossings[i+1])+cx;x++)if(x>=0&&x<width)mask[y*width+x]=1;
 }
 const rim=Math.max(1,scale(2)),bright=Math.max(2,scale(4));
 for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
  if(!mask[y*width+x])continue;
  const inside=d=>x>=d&&x+d<width&&y>=d&&y+d<rows&&mask[y*width+x-d]&&mask[y*width+x+d]&&mask[(y-d)*width+x]&&mask[(y+d)*width+x];
  // Fill the whole silhouette behind the body. Cutting out its bounding
  // box leaves a rectangular hole, especially around the head and hands.
  pixels[y*width+x]=!inside(rim)?1:!inside(bright)?3:2;
 }
 // Thin pale tongues climb along the sides. Left and right have different
 // starts, so the energy has a flow instead of a synchronized circular pulse.
 for(let lane=0;lane<4;lane++){
  const rise=(phase*3+lane*11)%36,side=lane&1?1:-1;
  const h=scale(5+rise),x=cx+side*scale((rise<15?12+rise/5:15-(rise-15)/8)*breadth);
  for(let j=0;j<scale(9);j++)for(let dx=0;dx<Math.max(1,scale(j<scale(5)?2:1));dx++){
   const px=x+side*dx,py=feet-h-j;
   if(px>=0&&px<width&&py>=0&&py<rows&&pixels[py*width+px])pixels[py*width+px]=4;
  }
 }
 const result=[];
 for(let y=0;y<rows;y++)for(let x=0;x<width;x++)if(pixels[y*width+x])result.push(x-cx,y-feet,pixels[y*width+x]);
 return Int16Array.from(result);
}

export function drawKiAura(effects,x,y,age,put,{gold=true,tone=gold?'gold':'blue',power=1,height=32,seed=0,clock=age}={}){
 // Ghost-style temporal transparency: alternate complete OBJ silhouettes
 // with the untouched background. No rectangular mask, alpha overlay or
 // spatial checkerboard. The game clock also makes save/replay exact.
 if(power<=0||(Math.floor(clock)&1))return;
 let atlas=atlases.get(effects);
 if(!atlas){
  const palette=name=>[...new Set((effects[name]??[]).flatMap(f=>[...f]))].filter(Boolean).sort((a,b)=>luma(a)-luma(b));
  const blue=palette('charge-orb'),gold=palette('gold-arc');
  if(blue.length<4||gold.length<4)return;
  // Stable native ramps; animation moves the flame, not the palette.
  atlas={cells:new Map(),blue,gold,pink:friezaKiPalette};atlases.set(effects,atlas);
 }
 height=height<=20?16:height>=36?40:32;
 const level=clamp(Math.ceil(power*8),1,8),phase=((Math.floor(age/3)+seed)%12+12)%12;
 const key=`${height}:${level}:${phase}`;
 let frame=atlas.cells.get(key);if(!frame){frame=cell(height,level,phase);atlas.cells.set(key,frame);}
 const palette=atlas[tone]??atlas.blue;
 x=Math.round(x);y=Math.round(y)+Math.floor(height/2)-1;
 // Leave the white core to an actual beam/impact. A held stance uses the
 // quieter part of the native ramp, even on the visible half of the strobe.
 for(let i=0;i<frame.length;i+=3)put(x+frame[i],y+frame[i+1],palette[Math.min(palette.length-2,frame[i+2]-1)]);
}
