import {decodeEffectTile} from './native-effects.js';
import {darkForceCells} from './native-dark-force.js';

// Cartridge Dark Force particles supply both the rolling texture and the
// moving sparks. Combat keeps a small violet orb; the planet-killing shot
// is a red sphere assembled at 64px, like a large tiled SNES spell.
export const deathBallSizes=[16,24,32,48,64,80,96,128,160,192,224];
const color=([r,g,b])=>1+r+(g<<5)+(b<<10);
const violet=[[31,20,27],[6,0,9],[14,0,14],[24,1,15],[31,6,16]].map(color);
const fire=[[9,0,3],[16,0,2],[24,1,1],[31,4,0],[31,10,0],[31,19,1],[31,29,10],[20,2,13]].map(color);
const wrap=(n,size)=>(n%size+size)%size;
export function createDeathBallArt(rom){
 const source=darkForceCells.map(frame=>{
  const cell=new Uint8Array(256);
  for(const tile of frame.tiles){const pixels=decodeEffectTile(rom,tile.romOffset);for(let y=0;y<8;y++)cell.set(pixels.subarray(y*8,y*8+8),(tile.y+y)*16+tile.x);}
  return cell;
 });
 const small=Array.from({length:12},(_,frame)=>{
  const cell=new Uint16Array(256),spark=source[frame%3],flow=source[(frame+1)%3];
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
   const sx=frame&4?15-x:x,sy=frame&8?15-y:y;
   const edge=spark[sy*16+sx],r=(2*x-15)**2+(2*y-15)**2;
   if(r<=149){
    const tex=flow[wrap(y+(frame>>1),16)*16+wrap(x+frame,16)];
    cell[y*16+x]=violet[r>120?1:tex===6?0:Math.max(2,tex-6)];
   }else if(edge===6)cell[y*16+x]=violet[0];
  }
  return cell;
 });
 const giant=Array.from({length:12},(_,frame)=>{
  const cell=new Uint16Array(64*64),field=new Uint8Array(48*48);
  // Stagger native clusters rather than stretch one 16px mote across the
  // entire screen. Frame changes move the arcs as well as their hot cores.
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
   const f=source[(frame+row+col)%3],ox=col*12+(row&1)*6,oy=row*12;
   for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const c=f[(row&1?15-y:y)*16+(col&1?15-x:x)];
    if(c===6||c>=9){const at=wrap(oy+y,48)*48+wrap(ox+x,48);field[at]=Math.max(field[at],c===6?3:c-8);}
   }
  }
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const nx=2*x-63,ny=2*y-63,r=nx*nx+ny*ny;
   if(r>57*57)continue;
   const edge=r>55*55,shade=r>50*50?1:ny>32?2:3;
   // A curved whole-pixel texture scroll gives the hot patches motion over
   // the sphere instead of a palette cycle on a fixed picture.
   const u=wrap(x+frame*4+Math.round(ny*ny/160),48),v=wrap(y+Math.round(nx*ny/200),48),t=field[v*48+u];
   cell[y*64+x]=fire[edge?1:t?Math.min(6,3+t)-(r>48*48?1:0):shade];
  }
  // Distinct corona clusters travel outward and expire. Their real native
  // spark cells animate independently from the surface texture.
  const anchors=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for(let i=0;i<anchors.length;i++){
   const phase=(frame+i*3)%12,f=source[phase%3],radius=24+(phase>>2),[dx,dy]=anchors[i];
   const diagonal=dx&&dy?.71:1,cx=32+Math.round(dx*radius*diagonal),cy=32+Math.round(dy*radius*diagonal);
   for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(f[y*16+x]===6){
    const px=cx+(x>>1)-4,py=cy+(y>>1)-4;
    if(px>=0&&py>=0&&px<64&&py<64&&((2*px-63)**2+(2*py-63)**2)>55*55)cell[py*64+px]=fire[phase<8?5:7];
   }
  }
  return cell;
 });
 const cells=new Map();
 function cellAt(frame,size,cinematic){
  const key=`${cinematic}:${frame}:${size}`;if(cells.has(key))return cells.get(key);
  const pixels=new Uint16Array(size*size),resolution=cinematic?64:16,art=(cinematic?giant:small)[frame];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels[y*size+x]=art[Math.floor(y*resolution/size)*resolution+Math.floor(x*resolution/size)];
  if(cells.size>=96)cells.delete(cells.keys().next().value);
  cells.set(key,pixels);return pixels;
 }
 return function draw(frame,x,y,size,put,{cinematic=false}={}){
  size=cinematic?Math.max(16,Math.min(224,2*Math.round(size/2))):deathBallSizes.reduce((best,n)=>Math.abs(n-size)<Math.abs(best-size)?n:best,16);
  const cell=cellAt(wrap(Math.floor(frame),12),size,cinematic),left=Math.round(x)-size/2,top=Math.round(y)-size/2;
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){const c=cell[py*size+px];if(c)put(left+px,top+py,c);}
 };
}
