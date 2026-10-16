import {orbitHeading,orbitVectors} from './orbit-pixels.js';
import {createNativeCombustion} from './native-combustion.js';
import {combustionCells} from './native-combustion-data.js';
import {drawKiAura,friezaKiPalette} from './ki-aura.js';

// Native spell cells, fixed palettes and integer source sampling. Large
// beams repeat Lucent Beam's strip, like a tiled background effect; sprites
// use exact quarter turns and fixed, precomposed animation sizes.
export function createOrbitEffects(snes,mod,put){
 let combustion=null,firePalette=null;const remaps=new Map(),pinkRemaps=new Map();
 const group=name=>mod.spriteLayer.effects[name]??[];
 function stamp(name,frame,x,y,turn=0,pink=false){
  const frames=group(name),cell=frames[((frame%frames.length)+frames.length)%frames.length];if(!cell)return;
  x=Math.round(x);y=Math.round(y);
  for(let py=0;py<16;py++)for(let px=0;px<16;px++){
   const c=cell[py*16+px];if(!c)continue;const u=px-8,v=py-8;
   put(x+(turn===1?-v:turn===2?-u:turn===3?v:u),y+(turn===1?u:turn===2?-v:turn===3?-u:v),pink?pinkColor(c):c);
  }
 }
 function fireColor(c){
  if(remaps.has(c))return remaps.get(c);
  firePalette??=Array.from({length:5},(_,i)=>{const at=combustionCells[22].palette.romOffset+i*2;return 1+(snes.cart.data[at]|snes.cart.data[at+1]<<8);}).sort((a,b)=>luma(a)-luma(b));
  const colors=[...new Set(group('beam-body').flatMap(f=>[...f]))].filter(Boolean).sort((a,b)=>luma(a)-luma(b));
  colors.forEach((value,i)=>remaps.set(value,firePalette[Math.round(i*4/Math.max(1,colors.length-1))]));
  return remaps.get(c)??c;
 }
 const luma=c=>{c--;return(c&31)*3+(c>>5&31)*6+(c>>10&31);};
 function pinkColor(c){
  if(!pinkRemaps.has(c)){
   pinkRemaps.set(c,friezaKiPalette[Math.min(4,Math.floor(luma(c)*4/310))]);
  }
  return pinkRemaps.get(c);
 }
 function fingerCharge(x,y,age){
  const cell=group('charge-orb')[(age>>3)&1];if(!cell)return;
  x=Math.round(x);y=Math.round(y);
  for(let py=0;py<8;py++)for(let px=0;px<8;px++){
   const c=cell[py*32+px*2];if(c)put(x+px-4,y+py-4,pinkColor(c));
  }
 }
 function charge(x,y,power,{pink=false}={}){
  // At orbital scale a full 16px spell cell obscures the entire fighter.
  // Sample the existing hand charge at 2:1, just like the tiny bodies.
  const cell=group('charge-orb')[Math.max(0,Math.min(4,Math.floor(power*4)))];if(!cell)return;
  x=Math.round(x);y=Math.round(y);
  for(let py=0;py<8;py++)for(let px=0;px<8;px++){
   const c=cell[py*32+px*2];if(c)put(x+px-4,y+py-4,pink?pinkColor(c):c);
  }
 }
 function beam(x,y,xx,yy,width,age=0,hot=false){
  const frames=group('beam-body'),cell=frames[(age>>2)%frames.length];if(!cell||width<1)return;
  x=Math.round(x);y=Math.round(y);xx=Math.round(xx);yy=Math.round(yy);
  const heading=orbitHeading(xx-x,yy-y),[vx,vy]=orbitVectors[heading],length=Math.round(Math.hypot(xx-x,yy-y));
  xx=x+Math.round(vx*length/256);yy=y+Math.round(vy*length/256);
  const pink=hot==='pink',frieza=hot==='frieza',w=pink?1:Math.max(2,Math.round(width/2)*2),reach=Math.min(360,length);
  for(let py=Math.max(0,Math.min(y,yy)-w-3);py<=Math.min(223,Math.max(y,yy)+w+3);py++)
   for(let px=Math.max(0,Math.min(x,xx)-w-3);px<=Math.min(255,Math.max(x,xx)+w+3);px++){
    const ox=px-x,oy=py-y,u=(ox*vx+oy*vy)>>8,v=(-ox*vy+oy*vx)>>8;
    if(u<0||u>reach)continue;
    const radius=pink?1:Math.max(2,Math.floor(w*Math.min(4,1+(u>>3))/4));if(Math.abs(v)>radius)continue;
    const row=6+Math.min(3,Math.floor((v+radius)*4/(2*radius+1))),c=cell[row*16+(u&15)];
    if(c)put(px,py,pink?(v===0?0x8000:pinkColor(c)):frieza?pinkColor(c):hot?fireColor(c):c);
   }
  if(pink)fingerCharge(x,y,age);else stamp(hot&&!frieza?'gold-charge-orb':'charge-orb',4,x,y,0,frieza);
 }
 function burst(x,y,age,{large=false}={}){
  combustion??=createNativeCombustion(snes.cart.data);
  const count=large?9:3;
  for(let i=0;i<count;i++){
   const t=age-i*4;if(t<0||t>=42)continue;
   const[vx,vy]=orbitVectors[(i*6)&15],radius=i?8+Math.min(24,t):0;
   combustion('burst',Math.floor(t/6),Math.round(x)+((vx*radius)>>8),Math.round(y)+((vy*radius)>>8),put,{turn:i&3,flip:!!(i&1)});
  }
 }
 function aura(x,y,age,options){drawKiAura(mod.spriteLayer.effects,x,y,age,put,{height:16,...options});}
 function disc(x,y,age){
  // Four fixed tilts, 20x6 instead of 16x4. Reuse Lucid Barrier's shape
  // with Frieza's pink/white ki palette and whole-pixel source sampling.
  const cell=group('gold-charge-orb')[4];if(!cell)return;
  const tilt=[0,1,0,-1][(age>>3)&3];x=Math.round(x);y=Math.round(y);
  for(let py=0;py<6;py++)for(let px=0;px<20;px++){
   const c=cell[Math.floor((py+.5)*16/6)*16+Math.floor(px*16/20)];if(c)put(x+px-10,y+py-3+((px-10)>>2)*tilt,pinkColor(c));
  }
 }
 return{stamp,beam,burst,aura,charge,disc,fingerCharge,deathBeam:(x,y,xx,yy,age)=>beam(x,y,xx,yy,1,age,'pink')};
}
