import {orbitHeading,orbitStep,orbitVector} from './orbit-pixels.js';

export const orbitAttackPattern=['beam','laser','beam','disc','beam','laser','orb'];
export function orbitAim(o){return orbitVector(o.heading??12);}
export function orbitFacing(o){const h=(o.heading??12)&15;return h<2||h>=14?2:h<6?0:h<10?1:3;}
export function orbitDefense(o,b){
 if(b.dodgeCooldown)b.dodgeCooldown--;
 if(b.evade){
  orbitStep(b,b.evade.heading,6);
  b.x=Math.max(20,Math.min(236,b.x));b.y=Math.max(24,Math.min(176,b.y));
  if(!--b.evade.frames)b.evade=null;
  return true;
 }
 if(b.dodgeCooldown||b.warning||b.stun||b.dash||o.duel||o.clash||o.intro)return false;
 const threats=[...o.shots];
 if(o.charge>=28)threats.push({...o.hero,...orbitAim(o),charging:true});
 const threat=threats.find(p=>{
  const x=b.x-p.x,y=b.y-p.y,along=x*p.dx+y*p.dy,across=Math.abs(x*p.dy-y*p.dx);
  return along>12&&along<(p.charging?240:90)&&across<20;
 });
 if(!threat)return false;
 const heading=orbitHeading(threat.dx,threat.dy),choices=[(heading+4)&15,(heading+12)&15];
 choices.sort((a,c)=>{
  const score=h=>{const v=orbitVector(h),x=b.x+v.dx*42,y=b.y+v.dy*42;return Math.min(x-20,236-x,y-24,176-y);};
  return score(c)-score(a);
 });
 b.evade={heading:choices[0],frames:7};b.dodgeCooldown=105;b.windup=0;
 return true;
}
const exchangeSites=[[196,68],[64,136],[170,144],[106,64]];
export function beginOrbitExchange(o,b){
 if(o.duel||o.duelCooldown||o.clash)return false;
 o.duel={age:0};o.charge=0;o.shots=[];b.shots=[];b.warning=null;b.dash=0;b.windup=0;b.evade=null;b.guard=0;
 return true;
}
export function tickOrbitExchange(o,b,{hurt,sound=()=>{},shake=()=>{}}){
 const d=o.duel;if(!d)return false;d.age++;
 const phase=(d.age-1)%18,index=Math.floor((d.age-1)/18),[x,y]=exchangeSites[index];
 if(phase===0){
  const side=index&1?-1:1;
  o.hero.x=x-18*side;o.hero.y=y;b.x=x+18*side;b.y=y;o.heading=side>0?0:8;
  o.teleport=6;b.blink=6;o.punch=0;sound('teleport');
  // The shared orbital camera turns with the exchange; both star planes
  // and distant bodies travel with the globe rather than staying pinned.
  const c=o.camera;c.travelX=(c.travelX??0)+128;c.longitude=(c.longitude+128)&4095;c.moving=8;
 }
 if(phase===7){o.punch=7;hurt(index===3?900:450);sound('friezaImpact');shake(index===3?9:5);}
 if(d.age>=72){
  o.duel=null;o.duelCooldown=180;b.dodgeCooldown=90;b.clock=65;b.guard=0;
  b.x=Math.max(24,Math.min(232,b.x+48));o.hero.x=Math.max(24,o.hero.x-28);
 }
 return true;
}
