import {sweptDistance} from './frieza-combat.js';
import {projectOrbitBackground,wrapOrbitBackground} from './orbit-camera.js';
import {orbitVectors} from './orbit-pixels.js';

export const orbitTargets=[
 {name:'moon',x:220,y:36,r:16,depth:5,color:[19,21,25]},
 {name:'outer planet',x:38,y:30,r:12,depth:4,color:[28,13,5]},
 {name:'distant planetoid',x:219,y:108,r:9,depth:3,color:[12,22,18]},
];
export function orbitTarget(space,index,camera=space.camera,copy){
 const t=orbitTargets[index];
 copy??=space.collateral?.target===index?space.collateral.copy:undefined;
 return{...t,...wrapOrbitBackground(projectOrbitBackground(camera??{x:95,y:154,r:104},t,t.depth),copy)};
}
export function orbitBodyColor(index,x,y){
 const t=orbitTargets[index],d=(x*x+y*y)/t.r**2;
 if(d>1)return 0;
 const crater=(x*13+y*17+index*7)%19<2?1:0,shade=Math.max(1,Math.min(4,Math.round(2+2*(1-d)-x/t.r-y/t.r)-crater));
 const [r,g,b]=t.color.map(c=>Math.floor(c*shade/4));return 1+r+(g<<5)+(b<<10);
}

// Fracture the existing planet pixels into nine unequal pieces. Each keeps
// its actual surface texture and an irregular mask, never a square tile.
const masks=new Map();
export function orbitFragments(index){
 if(masks.has(index))return masks.get(index);
 const t=orbitTargets[index],seeds=[{x:0,y:0},...Array.from({length:8},(_,i)=>{
  const [dx,dy]=orbitVectors[i*2],r=Math.round(t.r*(i%3+5)/8);
  return{x:Math.round(dx*r/256),y:Math.round(dy*r/256)};
 })],parts=seeds.map(()=>[]);
 for(let y=-t.r;y<=t.r;y++)for(let x=-t.r;x<=t.r;x++){
  const color=orbitBodyColor(index,x,y);if(!color)continue;
  let nearest=0,distance=Infinity;
  seeds.forEach((p,i)=>{const d=(x-p.x)**2+(y-p.y)**2;if(d<distance){nearest=i;distance=d;}});
  parts[nearest].push({x,y,color});
 }
 const pieces=parts.map(pixels=>{
  const x=Math.round(pixels.reduce((s,p)=>s+p.x,0)/pixels.length),y=Math.round(pixels.reduce((s,p)=>s+p.y,0)/pixels.length);
  const r=Math.max(...pixels.map(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))));
  const width=2*r+1,colors=new Uint16Array(width*width);
  for(const p of pixels)colors[(p.y-y+r)*width+p.x-x+r]=p.color;
  return{x,y,r,width,colors};
 });
 masks.set(index,pieces);return pieces;
}
const orbitSin=Array.from({length:256},(_,i)=>Math.round(Math.sin(i*Math.PI/128)*256));
export function orbitDebrisPose(space,p,camera=space.camera){
 const from=wrapOrbitBackground(projectOrbitBackground(camera,p,p.depth),p.copy);
 if(p.age<90)return{...from,front:p.age>=36};
 // A tilted ring surrounds the same globe used by the Mode 7 camera.
 // Only sprite positions move; the rock masks use fixed quarter turns.
 const phase=p.phase??0,sin=orbitSin[phase&255]/256,cos=orbitSin[(phase+64)&255]/256;
 const radius=(p.orbitRadius??144)*camera.r/104,scale=camera.r/104;
 const x=camera.x+radius*(cos+sin*.26),y=camera.y+radius*(sin*.43-cos*.45);
 const t=Math.min(1,(p.age-90)/90),u=t*t*(3-2*t);
 return{x:Math.round(from.x+(x-from.x)*u),y:Math.round(from.y+(y-from.y)*u),
  r:Math.max(1,Math.round(from.r+(p.r*scale-from.r)*u)),front:u<1||sin>=0};
}
const exposed=(space,t)=>{
 const c=space.camera;
 return t.x+t.r>=0&&t.x-t.r<256&&t.y+t.r>=0&&t.y-t.r<190&&
  (!c||Math.hypot(t.x-c.x,t.y-c.y)>c.r+t.r/2);
};
export function shatterOrbitBody(space,index,{sound=()=>{},shake=()=>{}}={},owner='goku',copy){
 if(space.destroyed.includes(index))return false;
 const body=orbitTargets[index],at=orbitTarget(space,index,space.camera,copy);
 space.destroyed.push(index);space.impacts.push({x:at.x,y:at.y,r:at.r,age:0,target:index,copy:at.copy});
 space.debris??=[];
 orbitFragments(index).forEach((p,i)=>{
  const [dx,dy]=orbitVectors[(i*2+index*4)&15];
  space.debris.push({target:index,piece:i,x:body.x+p.x,y:body.y+p.y,r:p.r,depth:body.depth,copy:at.copy,
   dx:Math.sign(dx),dy:Math.sign(dy),period:2+i%3,age:0,size:2,spin:i%4,dead:false,
   phase:(i*29+index*47)&255,orbitRadius:128+(i*13+index*31)%52});
 });
 space.grit??=[];
 for(let i=0;i<18;i++){
  const [dx,dy]=orbitVectors[(i*5)&15];
  space.grit.push({target:index,x:body.x,y:body.y,r:1,depth:body.depth,copy:at.copy,age:0,
   dx:Math.sign(dx),dy:Math.sign(dy),period:2+i%4,phase:(i*41+index*59)&255,orbitRadius:120+(i*11+index*29)%72});
 }
 if(space.grit.length>128)space.grit.splice(0,space.grit.length-128);
 if(index===0&&owner!=='frieza'&&!space.moonRemark){
  space.moonRemark=true;space.aside={text:'LUNA:My moon! Goku!\nYou blew it up!',age:-90};
 }
 sound('fortressBreak');shake(7);return true;
}
function breakDebris(space,p,hooks,beam){
 p.dead=true;const at=orbitDebrisPose(space,p);
 (space.dust??=[]).push({...p,dead:false,effectAge:0});
 space.grit??=[];
 for(let i=0;i<3;i++)space.grit.push({...p,r:1,phase:((p.phase??0)+(i-1)*3)&255,orbitRadius:(p.orbitRadius??144)+(i-1)*4,dead:false});
 if(space.grit.length>128)space.grit.splice(0,space.grit.length-128);
 // Blasts chip large rocks into smaller ones. A Kamehameha vaporizes any
 // debris in its lane, giving the player a way to clear the growing field.
 if(!beam&&p.size===2&&p.r>=4&&space.debris.length<72)for(const sign of[-1,1]){
  space.debris.push({...p,x:p.x+sign*3,y:p.y-sign*2,r:Math.max(2,p.r>>1),size:1,
   dx:sign,dy:p.dy||-sign,period:3,warmup:24,phase:((p.phase??0)+sign*2)&255,
   orbitRadius:(p.orbitRadius??144)+sign*3,spin:(p.spin+1)&3,dead:false});
 }
 if(space.debrisSoundAge!==space.age){space.debrisSoundAge=space.age;hooks.sound?.('deflect');}
 return at;
}
export function strikeOrbitScenery(space,x,y,xx,yy,width,hooks={}, {beam=false,owner='goku'}={}){
 const hits=[];
 orbitTargets.forEach((_,index)=>{
  if(space.destroyed.includes(index))return;
  const t=orbitTarget(space,index);
  if(exposed(space,t)&&sweptDistance(t.x,t.y,x,y,xx,yy)<=t.r+width)hits.push({index,t});
 });
 for(const p of space.debris??[]){
  if(p.dead||p.age<60||p.warmup)continue;
  const t=orbitDebrisPose(space,p);
  if(!t.front&&!exposed(space,t))continue;
  if(sweptDistance(t.x,t.y,x,y,xx,yy)<=t.r+width)hits.push({p,t});
 }
 hits.sort((a,b)=>Math.hypot(a.t.x-x,a.t.y-y)-Math.hypot(b.t.x-x,b.t.y-y));
 for(const hit of beam?hits:hits.slice(0,1)){
  if(hit.p)breakDebris(space,hit.p,hooks,beam);
  else shatterOrbitBody(space,hit.index,hooks,owner,hit.t.copy);
 }
 return hits.length>0;
}
export function tickOrbitDebris(space,{damage=()=>{},sound=()=>{},shake=()=>{}}={}){
 if(space.debrisGrace)space.debrisGrace--;
 if(space.aside&&++space.aside.age>=165)space.aside=null;
 space.dust=(space.dust??[]).filter(p=>++p.effectAge<30);
 for(const p of [...(space.debris??[]),...(space.grit??[]),...space.dust]){
  if(p.dead)continue;p.age++;if(p.warmup)p.warmup--;
  if(p.age<90&&(p.age%p.period===0||p.age<24)){p.x+=p.dx;p.y+=p.dy;}
  if(p.age>=90&&p.age%p.period===0)p.phase=((p.phase??0)+1)&255;
  // A whole second of visible, hot rubble precedes collision. Hazards
  // pause with the native ring and never interrupt the final beam contest.
  if(p.effectAge!==undefined||p.r===1||p.age<60||p.warmup||space.clash||space.intro||space.teleport||space.duel||space.debrisGrace)continue;
  const t=orbitDebrisPose(space,p);
  if(!t.front&&!exposed(space,t))continue;
  if(Math.hypot(t.x-space.hero.x,t.y-space.hero.y)<t.r+5){
   space.debrisGrace=60;damage(70);sound('impact');shake(3);
  }
 }
 space.debris=(space.debris??[]).filter(p=>!p.dead);
}
