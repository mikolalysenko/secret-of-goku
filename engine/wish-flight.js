import {decodePlanetTexture} from './world-texture.js';
import {orbitVectors} from './orbit-pixels.js';
import {createOrbitEffects} from './orbit-effects.js';

export const wishFlightTiming={rise:60,apex:240,scatter:300,settle:420,end:480};
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const headings=[8,10,12,14,0,3,5];
// Whole-pixel poses shared by the picture, sound cues and checkpoint tests.
// The seven stars are held together long enough to read before scattering.
export function wishFlightPose(age){
 const t=wishFlightTiming,u=ease((age-t.rise)/(t.apex-t.rise)),away=Math.max(0,age-t.scatter);
 const y=Math.round(192-136*u),radius=away?12+away*3:Math.round(28-u*16);
 return{horizon:Math.round(70+u*72),dragonY:Math.round(66-u*150),dragonSize:Math.round(72-u*24),
  balls:headings.map((h,i)=>{const [dx,dy]=orbitVectors[h];return{x:128+((dx*radius)>>8),y:y+((dy*radius)>>8),size:away?Math.max(4,12-(away>>4)*2):12,index:i};}),
  dragon:age<t.apex,departed:age>=t.settle,flash:age>=t.scatter&&age<t.scatter+4?(t.scatter+4-age)/8:0};
}
export function createWishFlight(snes,mod,{put,rgb,blit}){
 let world=null;const fx=createOrbitEffects(snes,mod,put);
 const stars=Array.from({length:86},(_,i)=>{let n=Math.imul(i+137,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return{x:(n>>>0)%256,y:(n>>>8)%160,shade:(n>>>20)&3};});
 return function draw(age,dragon){
  world??=decodePlanetTexture(snes.cart.data);
  const pose=wishFlightPose(age),horizon=pose.horizon;
  // Interpolate the camera's fixed-point matrix, not entire heading jumps.
  // The final picture and sprite positions still resolve to SNES pixels.
  const turn=ease((age-180)/240)*3,index=Math.floor(turn),blend=turn-index;
  const a=orbitVectors[12+index],b=orbitVectors[Math.min(15,13+index)];
  const vx=Math.round(a[0]+(b[0]-a[0])*blend),vy=Math.round(a[1]+(b[1]-a[1])*blend);
  const originX=snes.cart.data[0x67a80+198*2]*16,originY=snes.cart.data[0x67a81+198*2]*16;
  // A scanline-scaled floor, using the cartridge's own NIGHT world palette.
  // No Mode 7 register/HDMA writes survive this separate picture surface.
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
   let color=rgb(0,1+(y>>6),4+(y>>5));
   if(y>horizon){
    const z=Math.floor(20000/(y-horizon+6)),side=Math.floor((x-128)*z/164),travel=Math.round(age*.75);
    color=1+world.sample(originX+((vx*(z+travel)-vy*side)>>8),originY+((vy*(z+travel)+vx*side)>>8),true);
   }
   put(x,y,color);
  }
  for(const s of stars){const x=((s.x-Math.floor(age/12)+256)%256),y=(s.y+Math.floor(age/18))%160;if(y<horizon-3)put(x,y,rgb(10+s.shade*3,13+s.shade*3,20+s.shade*3));}
  if(pose.dragon&&dragon){const w=pose.dragonSize;blit(dragon,128-(w>>1),pose.dragonY,w,Math.round(w*140/128));}
  if(!pose.departed)for(const p of pose.balls){
   if(age>=wishFlightTiming.scatter){
    const [dx,dy]=orbitVectors[headings[p.index]];
    for(let j=1;j<=3;j++)fx.stamp('gold-spark',(age>>2)+j,p.x-((dx*j*7)>>8),p.y-((dy*j*7)>>8));
   }
   mod.kiArt?.draw('dragon',p.index,p.x,p.y,p.size,put);
  }
  if(age>=wishFlightTiming.scatter&&age<wishFlightTiming.scatter+30)fx.stamp('gold-spark',Math.floor((age-wishFlightTiming.scatter)/3),128,56);
  return pose.flash;
 };
}
