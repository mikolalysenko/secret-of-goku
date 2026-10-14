import {sweptDistance} from './frieza-combat.js';

// Screen-space combat above the globe. These coordinates never enter SNES
// actor/camera/map RAM: the native party waits on its valid Fortress tile.
export const orbitTargets=[
 {name:'moon',x:220,y:36,r:16,color:[19,21,25]},
 {name:'outer planet',x:38,y:30,r:12,color:[28,13,5]},
 {name:'distant fleet',x:219,y:108,r:9,color:[12,22,18]},
];
export function newOrbit(target){return{kind:'frieza-orbit',age:0,target,hero:{x:156,y:155},shots:[],beam:null,ricochets:[],destroyed:[],impacts:[],charge:0,cooldown:0,teleport:0,punch:0,sequence:0};}
export function ricochet(space,x,y,dx,dy,owner='goku'){
 const index=space.sequence++%orbitTargets.length,target=orbitTargets[index];
 const path={x,y,dx,dy,owner,age:0,target:index,bent:false};space.ricochets.push(path);
 if(space.ricochets.length>8)space.ricochets.shift();return path;
}
export function tickOrbit(space,boss,{hurt,damage,sound,shake}){
 space.age++;if(space.cooldown)space.cooldown--;if(space.teleport)space.teleport--;if(space.punch)space.punch--;
 for(const p of space.shots){
  const ox=p.x,oy=p.y;p.x+=p.dx*7;p.y+=p.dy*7;p.age++;
  if(sweptDistance(boss.x,boss.y,ox,oy,p.x,p.y)<12){hurt(240);p.age=99;sound('friezaImpact');}
  if(p.age===30)ricochet(space,p.x,p.y,p.dx,p.dy);
 }
 space.shots=space.shots.filter(p=>p.age<31);
 const beam=space.beam;
 if(beam){
  beam.age++;const width=beam.width*Math.min(1,beam.age/6,(beam.max-beam.age)/10);
  const along=(boss.x-beam.x)*beam.dx+(boss.y-beam.y)*beam.dy,across=Math.abs((boss.x-beam.x)*beam.dy-(boss.y-beam.y)*beam.dx);
  if(along>0&&across<width+7&&beam.age%6===0){hurt(beam.damage);sound('friezaImpact');}
  // A real collision with a Death Ball deflects it and turns it into a
  // distant shot. It cannot still hit Goku after the visible counter.
  for(const p of boss.shots){
   const a=(p.x-beam.x)*beam.dx+(p.y-beam.y)*beam.dy,d=Math.abs((p.x-beam.x)*beam.dy-(p.y-beam.y)*beam.dx);
   if(p.kind==='orb'&&p.age<330&&a>0&&d<width+10){p.age=999;ricochet(space,p.x,p.y,beam.dx,beam.dy,'clash');sound('fortressBreak');shake(7);}
  }
  if(beam.age===18)ricochet(space,boss.x,boss.y,beam.dx,beam.dy);
  if(beam.age>=beam.max)space.beam=null;
 }
 for(const p of space.ricochets){
  p.age++;
  if(p.age===25){
   const t=orbitTargets[p.target];
   if(!space.destroyed.includes(p.target)){space.destroyed.push(p.target);space.impacts.push({x:t.x,y:t.y,r:t.r,age:0,target:p.target});sound('fortressBreak');shake(9);}
   p.bent=true;
  }
 }
 space.ricochets=space.ricochets.filter(p=>p.age<70);
 for(const p of space.impacts)p.age++;
 space.impacts=space.impacts.filter(p=>p.age<100);
}
export function steerOrbit(space,input){
 let dx=Number(!!(input&128))-Number(!!(input&64)),dy=Number(!!(input&32))-Number(!!(input&16));
 const n=Math.hypot(dx,dy)||1,speed=space.charge?.85:input&256?4.1:2.3;
 space.hero.x=Math.max(14,Math.min(242,space.hero.x+dx/n*speed));
 space.hero.y=Math.max(20,Math.min(184,space.hero.y+dy/n*speed));
 return !!(dx||dy);
}
