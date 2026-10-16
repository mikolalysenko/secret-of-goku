import {sweptDistance,pixelStep} from './frieza-combat.js';
import {orbitIntroFrames} from './frieza-cinematic.js';
import {orbitHeading} from './orbit-pixels.js';
import {orbitTargets as backdropTargets,strikeOrbitScenery,shatterOrbitBody,tickOrbitDebris} from './orbit-debris.js';
export {orbitTarget} from './orbit-debris.js';
export const orbitTargets=backdropTargets;

// Screen-space combat above the globe. These coordinates never enter SNES
// actor/camera/map RAM: the native party waits on its valid Fortress tile.
export function newOrbit(target){return{kind:'frieza-orbit',age:0,intro:orbitIntroFrames,target,hero:{x:156,y:155},heading:12,shots:[],beam:null,ricochets:[],destroyed:[],impacts:[],hits:[],debris:[],dust:[],grit:[],debrisGrace:0,moonRemark:false,aside:null,charge:0,cooldown:0,teleport:0,punch:0,sequence:0,collateral:null,camera:{x:95,y:154,r:104,longitude:target.x,latitude:target.y,moving:0,travelX:0,travelY:0}};}
export function ricochet(space,x,y,dx,dy,owner='goku'){
 // The shot continues along its actual direction. Scenery uses the same
 // collision lane as the visible spell, with no hidden ten-second gate.
 space.sequence++;
 const path={x,y,dx,dy,owner,age:0,target:-1,bent:false};space.ricochets.push(path);
 if(space.ricochets.length>8)space.ricochets.shift();return path;
}
export function tickOrbit(space,boss,{hurt,damage,sound,shake}){
 const hooks={damage,sound,shake};
 space.age++;if(space.cooldown)space.cooldown--;if(space.teleport)space.teleport--;if(space.punch)space.punch--;
 if(space.duelCooldown)space.duelCooldown--;if(boss.blink)boss.blink--;
 space.hits=(space.hits??[]).filter(p=>++p.age<54);
 space.camera??={x:95,y:154,r:104,longitude:space.target.x,latitude:space.target.y,moving:0};
 const cam=space.camera;cam.longitude=(cam.longitude+2)&4095;cam.travelX=(cam.travelX??0)+2;cam.travelY??=0;
 if(!space.clash&&space.age%4===0){const target=space.beam?68:cam.moving?84:104;cam.r+=Math.sign(target-cam.r);cam.x+=Math.sign(95-Math.round((space.hero.x-128)/5)-cam.x);cam.y+=Math.sign(154-Math.round((space.hero.y-112)/8)-cam.y);}
 if(cam.moving)cam.moving--;
 tickOrbitDebris(space,hooks);
 if(space.intro){space.intro--;return;}
 if(space.clash)return;
 for(const p of space.shots){
  const ox=p.x,oy=p.y;pixelStep(p,p.dx,p.dy,7);p.age++;
  if(sweptDistance(boss.x,boss.y,ox,oy,p.x,p.y)<12){hurt(240);p.age=99;sound('friezaImpact');}
  if(p.age<31&&strikeOrbitScenery(space,ox,oy,p.x,p.y,3,hooks))p.age=99;
  if(p.age===30)ricochet(space,p.x,p.y,p.dx,p.dy);
 }
 space.shots=space.shots.filter(p=>p.age<31);
 const beam=space.beam;
 if(beam){
  beam.age++;const width=beam.width*Math.min(1,beam.age/6,(beam.max-beam.age)/10);
  const along=(boss.x-beam.x)*beam.dx+(boss.y-beam.y)*beam.dy,across=Math.abs((boss.x-beam.x)*beam.dy-(boss.y-beam.y)*beam.dx);
  if(along>0&&across<width+7&&beam.age%6===0){hurt(beam.damage);sound('friezaImpact');}
  if(width>0)strikeOrbitScenery(space,beam.x,beam.y,beam.x+beam.dx*350,beam.y+beam.dy*350,width,hooks,{beam:true});
  // A real collision with a Death Ball deflects it and turns it into a
  // distant shot. It cannot still hit Goku after the visible counter.
  for(const p of boss.shots){
   const a=(p.x-beam.x)*beam.dx+(p.y-beam.y)*beam.dy,d=Math.abs((p.x-beam.x)*beam.dy-(p.y-beam.y)*beam.dx);
   if(!['laser','beam'].includes(p.kind)&&p.age<330&&a>0&&d<width+10){p.age=999;ricochet(space,p.x,p.y,beam.dx,beam.dy,'clash');sound('deflect');shake(4);}
  }
  if(beam.age>=beam.max)space.beam=null;
 }
 for(const p of space.ricochets){
  p.age++;
  const d=(p.age-1)*12;
  if(strikeOrbitScenery(space,p.x+p.dx*d,p.y+p.dy*d,p.x+p.dx*(d+12),p.y+p.dy*(d+12),2,hooks,{owner:p.owner}))p.age=45;
 }
 space.ricochets=space.ricochets.filter(p=>p.age<45);
 for(const p of boss.shots){
  if(p.age>=330)continue;
  if(p.kind==='beam'||p.kind==='laser'){
   const length=p.kind==='beam'?Math.min(360,p.age*30):350;
   if(p.age<30)strikeOrbitScenery(space,p.x,p.y,p.x+p.dx*length,p.y+p.dy*length,p.kind==='beam'?12:2,hooks,{beam:true,owner:'frieza'});
  }else if(p.kind==='orb'&&p.previousX!==undefined&&strikeOrbitScenery(space,p.previousX,p.previousY,p.x,p.y,12,hooks,{owner:'frieza'}))p.age=999;
 }
 if(space.collateral){
  const c=space.collateral;c.age++;
  // Finish a distant shot already in flight in an older checkpoint.
  if(c.age===120)shatterOrbitBody(space,c.target,hooks,c.owner,c.copy);
  if(c.age>=255)space.collateral=null;
 }
 for(const p of space.impacts)p.age++;
 space.impacts=space.impacts.filter(p=>p.age<170);
}
export function steerOrbit(space,input){
 let dx=Number(!!(input&128))-Number(!!(input&64)),dy=Number(!!(input&32))-Number(!!(input&16));
 if(dx||dy)space.heading=orbitHeading(dx,dy);
 const n=Math.hypot(dx,dy)||1,speed=space.charge?1:input&256?6:3;
 pixelStep(space.hero,dx/n,dy/n,speed);
 space.hero.x=Math.max(14,Math.min(242,space.hero.x));
 space.hero.y=Math.max(20,Math.min(184,space.hero.y));
 if((dx||dy)&&space.camera){const c=space.camera,latitude=Math.max(256,Math.min(3840,c.latitude+dy*speed*2));c.longitude=(c.longitude+dx*speed*4)&4095;c.travelX=(c.travelX??0)+dx*speed*4;c.travelY=(c.travelY??0)+latitude-c.latitude;c.latitude=latitude;c.moving=8;}
 return !!(dx||dy);
}
