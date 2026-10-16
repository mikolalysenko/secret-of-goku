// Cutscene motion is evaluated every frame, then placed on whole SNES
// pixels. Keep the upright hover cell through arrivals/stops: the rush
// sprite is six pixels shorter and used to make his body pop on landing.
import {altarPose} from './frieza-intro.js';
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
const hover=clock=>Math.round(Math.sin(clock*Math.PI/96));
const clock=c=>(c.clock??0)+c.age;
const chargeFrame=age=>age<12?0:age<24?2:3;
const throwFrame=age=>age<8?3:age<28?2:0;
export const treeTiming={arrival:96,settled:144,throw:40,impact:192,departure:120};
export const coreTiming={throw:100,eruption:50,settled:210};
export const fortressCourt={cameraX:152,cameraY:260,x:350,y:400};
const fortressReturn={x:280,y:380};

export function friezaScenePose(c,{cameraX=0,cameraY=0,map=c.map}={}){
 if(c.altar)return altarPose(c,{cameraX,cameraY});
 const {kind,age}=c;
 if(c.court){
  const anchor=['taunt','lift','explode','gold'].includes(kind)?fortressReturn:fortressCourt;
  const arrival=kind==='taunt'?1-ease(age/96):0,leave=kind==='trial-leave'?clamp(age/112)**2:0;
  return{x:Math.round(anchor.x+48*leave-cameraX),
   y:Math.round(anchor.y-180*arrival-300*leave-cameraY+hover(clock(c))),
   frame:kind==='empower'&&age<140||['lift','explode'].includes(kind)?chargeFrame(age):0};
 }
 let x=c.x+40-cameraX,y=c.y-40-cameraY,frame=0;
 if(['reveal','steal','depart','temple-exit','altar-leave','core-charge','core-shot','core-impact','trial-taunt','empower'].includes(kind))y=Math.max(104,Math.min(160,y));
 if(kind.startsWith('core-')||kind==='depart'&&map===195){x=180;y=145;}
 const bob=hover(clock(c));
 if(kind==='reveal'||kind==='core-arrival'){
  const t=ease(age/96);x+=24*(1-t);y-=176*(1-t);y+=bob*t;
 }else if(kind==='depart'||kind==='temple-exit'||kind==='altar-leave'){
  const t=clamp(age/120)**2;x+=64*t;y-=320*t;y+=bob*(1-t);
 }else y+=bob;
 if(['core-charge','empower','lift','explode'].includes(kind))frame=chargeFrame(age);
 if(kind==='core-shot')frame=throwFrame(age);
 if(kind==='victory')frame=7;
 return{x:Math.round(x),y:Math.round(y),frame};
}

export function templeFollowerPose(c,{cameraX=0,cameraY=0},superSaiyan=false){
 const t=clamp((c.age-48)/112)**2,knee=superSaiyan?34:38;
 return{x:Math.round(c.x-cameraX+36*t),y:Math.round(c.y-cameraY-320*t),
  row:3,column:c.age<40?0:c.age<48?knee-1:knee};
}

export function exteriorFollowerPose(c,superSaiyan=false){
 const knee=superSaiyan?34:38,arrival=c.kind==='core-arrival',escape=c.kind==='core-escape';
 const t=arrival?ease(c.age/84):1,launch=escape?Math.max(0,c.age-12):0;
 // Back away from the temple into the lower foreground, looking toward
 // Frieza. Dialogue occupies the top 76px; the hero stays well below it.
 return{x:Math.round(128-16*t),y:Math.round(112+60*t-launch*launch*.05),row:3,
  column:arrival&&c.age<8||escape&&c.age<12?knee-1:knee};
}

export function treeFriezaPose(kind,age,elapsed=age){
 const enter=kind==='tree-arrival'?1-ease(age/treeTiming.arrival):0;
 const leave=kind==='tree-leave'?clamp(age/treeTiming.departure)**2:0;
 return{x:Math.round(182+40*enter+112*leave),
  y:Math.round(126-154*enter-190*leave+hover(elapsed)*(1-enter)*(1-leave)),
  frame:kind==='tree-charge'?chargeFrame(age):kind==='tree-shot'?throwFrame(age):0};
}

export function friezaDeathBallPose(c,p,{tree=false}={}){
 const charge=c.kind.endsWith('charge'),duration=tree?treeTiming.throw:coreTiming.throw;
 const t=charge?0:clamp((c.age-8)/(duration-8))**2;
 const max=tree?32:224,min=tree?16:64;
 const size=charge?min+(max-min)*ease((c.age-24)/(tree?64:120)):max-(tree?0:128)*t;
 const diameter=2*Math.round(size/2),startY=p.y-(tree?42:52+max/2);
 return{x:Math.round(p.x+((tree?150:80)-p.x)*t),
  y:Math.round(charge?p.y-(tree?42:52+diameter/2):startY+((tree?126:320)-startY)*t),
  size:diameter,frame:Math.floor(clock(c)/8),visible:charge||c.age<duration};
}
