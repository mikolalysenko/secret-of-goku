import {createNativeCombustion} from './native-combustion.js';
import {orbitVectors} from './orbit-pixels.js';

const art=new WeakMap();
export const beamDetonationFrames=132;

// A rolling cluster of original Exploder cells, followed by Fireball
// embers. Stagger the lobes so the blast grows across the screen instead
// of becoming a geometric ring. All motion and sprite turns are integral.
export function beamDetonationParts(age){
 if(age<0||age>=beamDetonationFrames)return[];
 const parts=[];
 for(let i=0;i<21;i++){
  const wave=i===0?0:1+Math.floor((i-1)/7),delay=i===0?0:wave*9+(i*5)%11,t=age-delay;
  if(t<0||t>=42)continue;
  const[vx,vy]=orbitVectors[(i*7+wave*3)&15],radius=i===0?0:wave*13+Math.min(30,t)*(2+(i&1));
  parts.push({kind:'burst',frame:Math.min(6,Math.floor(t/6)),x:(vx*radius)>>8,y:(vy*radius)>>8,
   turn:i&3,flip:!!(i&1),white:age<5});
 }
 // Successive central lobes keep a solid billowing core while the outer
 // cells spread. The blast must not look like a ring with an empty center.
 for(const[i,[x,y]]of[[-8,-6],[12,-4],[-10,12],[8,12]].entries()){
  const t=age-12-i*7;if(t>=0&&t<56)parts.push({kind:'burst',frame:Math.min(6,t>>3),x,y,turn:i,white:false});
 }
 for(let i=0;i<12;i++){
  const t=age-24-i*2;if(t<0||t>=76)continue;
  const[vx,vy]=orbitVectors[(i*5+1)&15],radius=24+Math.floor(t*(i%3+3)/2);
  // The last sparks flicker out like the original spell OBJ particles.
  if(t>56&&((age+i)&1))continue;
  parts.push({kind:'ember',frame:Math.floor(t/5)%3,x:(vx*radius)>>8,y:((vy*radius)>>8)+(t*t>>8),turn:i&3});
 }
 return parts;
}

export function drawBeamDetonation(rom,x,y,age,put){
 const parts=beamDetonationParts(age);if(!parts.length)return;
 if(!art.has(rom))art.set(rom,createNativeCombustion(rom));
 const draw=art.get(rom);x=Math.round(x);y=Math.round(y);
 for(const p of parts)draw(p.kind,p.frame,x+p.x,y+p.y,p.white?(x,y)=>put(x,y,0x8000):put,p);
}
