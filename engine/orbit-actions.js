import {orbitFacing} from './orbit-duel.js';

const facing=o=>[0,2,1,3][orbitFacing(o)];
const directions=[[0,1],[1,0],[-1,0],[0,-1]];

// These action clocks live in the orbital checkpoint, separately from the
// native actor waiting on the Fortress. The field and orbit share pose art.
export function startOrbitTeleport(o,sound=()=>{}){
 if(o.action?.kind==='teleport'){o.action.queued=true;return;}
 o.action={kind:'teleport',age:0,duration:12,super:true,facing:facing(o),origin:{...o.hero}};
 o.teleport=18;o.punch=0;o.cooldown=0;sound('teleport');
}

export function startOrbitPunch(o,sound=()=>{}){
 o.combo=o.age<=(o.comboUntil??-1)?((o.combo??-1)+1)%3:0;o.comboUntil=o.age+40;
 o.action={kind:'punch',age:0,duration:8,impact:1,super:true,facing:facing(o),combo:o.combo};
 o.punch=8;o.cooldown=8;sound(o.combo===2?'kickSwing':'swing');
}

export function tickOrbitAction(o,b,{melee=()=>0,sound=()=>{},shake=()=>{}}={}){
 const a=o.action;if(!a)return;
 if(a.hitPause>0){a.hitPause--;return;}
 a.age++;
 if(a.kind==='teleport'){
  if(a.age===4){
   const x=a.origin.x-b.x,y=a.origin.y-b.y,horizontal=Math.abs(x)>=Math.abs(y);
   const dx=horizontal?(x<0?-1:1):0,dy=horizontal?0:(y<0?-1:1);
   o.hero.x=Math.max(14,Math.min(242,Math.round(b.x+dx*22)));
   o.hero.y=Math.max(20,Math.min(184,Math.round(b.y+dy*22)));
   a.facing=dx<0?1:dx>0?2:dy<0?0:3;o.heading=[4,0,8,12][a.facing];
  }
  if(a.age===6)sound('teleportIn');
 }else if(a.kind==='punch'&&a.age===a.impact&&!a.hit){
  a.hit=true;
  const [dx,dy]=directions[a.facing],x=b.x-o.hero.x,y=b.y-o.hero.y;
  if(x*dx+y*dy>=-8&&Math.hypot(x,y)<32&&Math.abs(x*dy-y*dx)<20){
   const damage=melee(550);
   if(damage){a.hitPause=a.combo===2?3:2;sound('friezaImpact');shake(a.combo===2?5:3);}
   // The authored teleport exchange now owns both actors and its own clock.
   if(o.duel){o.action=null;return;}
  }
 }
 if(a.age>=a.duration){
  o.action=null;
  if(a.kind==='teleport'&&a.queued)startOrbitTeleport(o,sound);
 }
}
