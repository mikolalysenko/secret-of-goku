import {sweptDistance,pixelStep} from './frieza-combat.js';
import {orbitIntroFrames} from './frieza-cinematic.js';

// Screen-space combat above the globe. These coordinates never enter SNES
// actor/camera/map RAM: the native party waits on its valid Fortress tile.
export const orbitTargets=[
 {name:'moon',x:220,y:36,r:16,color:[19,21,25]},
 {name:'outer planet',x:38,y:30,r:12,color:[28,13,5]},
 {name:'distant planetoid',x:219,y:108,r:9,color:[12,22,18]},
];
export function newOrbit(target){return{kind:'frieza-orbit',age:0,intro:orbitIntroFrames,target,hero:{x:156,y:155},shots:[],beam:null,ricochets:[],destroyed:[],impacts:[],charge:0,cooldown:0,teleport:0,punch:0,sequence:0,collateral:null,nextCollateral:360,camera:{x:95,y:154,r:104,longitude:target.x,latitude:target.y,moving:0}};}
export function ricochet(space,x,y,dx,dy,owner='goku'){
 // Most missed shots vanish into empty space. A rare redirected shot earns
 // its own readable beat; targets exist for six seconds before any can die.
 let index=-1,best=.86;const directionLength=Math.hypot(dx,dy)||1;
 if(space.age>=(space.nextCollateral??360)&&!space.collateral)orbitTargets.forEach((t,i)=>{if(space.destroyed.includes(i))return;const n=Math.hypot(t.x-x,t.y-y)||1,d=((t.x-x)*dx+(t.y-y)*dy)/(n*directionLength);if(d>best){best=d;index=i;}});
 space.sequence++;
 const path={x,y,dx,dy,owner,age:0,target:index,bent:false};space.ricochets.push(path);
 if(index>=0){space.collateral={target:index,age:0,x,y,owner};space.nextCollateral=space.age+600;}
 if(space.ricochets.length>8)space.ricochets.shift();return path;
}
export function tickOrbit(space,boss,{hurt,damage,sound,shake}){
 space.age++;if(space.cooldown)space.cooldown--;if(space.teleport)space.teleport--;if(space.punch)space.punch--;
 space.camera??={x:95,y:154,r:104,longitude:space.target.x,latitude:space.target.y,moving:0};
 const cam=space.camera;cam.longitude=(cam.longitude+2)&4095;
 if(!space.clash&&space.age%4===0){const target=space.beam?68:cam.moving?84:104;cam.r+=Math.sign(target-cam.r);cam.x+=Math.sign(95-Math.round((space.hero.x-128)/5)-cam.x);cam.y+=Math.sign(154-Math.round((space.hero.y-112)/8)-cam.y);}
 if(cam.moving)cam.moving--;
 if(space.intro){space.intro--;return;}
 if(space.clash)return;
 for(const p of space.shots){
  const ox=p.x,oy=p.y;pixelStep(p,p.dx,p.dy,7);p.age++;
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
   if(p.kind!=='laser'&&p.age<330&&a>0&&d<width+10){p.age=999;ricochet(space,p.x,p.y,beam.dx,beam.dy,'clash');sound('deflect');shake(4);}
  }
  if(beam.age>=beam.max)space.beam=null;
 }
 for(const p of space.ricochets){
  p.age++;
 }
 space.ricochets=space.ricochets.filter(p=>p.age<45);
 if(space.collateral){
  const c=space.collateral;c.age++;
  // Two seconds to track the travelling spell, then a separate impact and
  // aftermath. Never several explosions or decorative trails at once.
  if(c.age===120){const t=orbitTargets[c.target];space.destroyed.push(c.target);space.impacts.push({x:t.x,y:t.y,r:t.r,age:0,target:c.target});sound('fortressBreak');shake(7);}
  if(c.age>=255)space.collateral=null;
 }
 for(const p of space.impacts)p.age++;
 space.impacts=space.impacts.filter(p=>p.age<170);
}
export function steerOrbit(space,input){
 let dx=Number(!!(input&128))-Number(!!(input&64)),dy=Number(!!(input&32))-Number(!!(input&16));
 const n=Math.hypot(dx,dy)||1,speed=space.charge?1:input&256?6:3;
 pixelStep(space.hero,dx/n,dy/n,speed);
 space.hero.x=Math.max(14,Math.min(242,space.hero.x));
 space.hero.y=Math.max(20,Math.min(184,space.hero.y));
 if((dx||dy)&&space.camera){const c=space.camera;c.longitude=(c.longitude+dx*speed*4)&4095;c.latitude=Math.max(256,Math.min(3840,c.latitude+dy*speed*2));c.moving=8;}
 return !!(dx||dy);
}
