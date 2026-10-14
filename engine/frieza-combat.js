// Deterministic projectiles: discs turn at a limited angular speed, so a
// flying player can circle behind their owner and let momentum do the rest.
export const FRIEZA_HP=96000;
export function homingStep(disc,target,turn=.035){
 const wanted=Math.atan2(target.y-disc.y,target.x-disc.x),delta=Math.atan2(Math.sin(wanted-disc.angle),Math.cos(wanted-disc.angle));
 disc.angle+=Math.max(-turn,Math.min(turn,delta));disc.x+=Math.cos(disc.angle)*disc.speed;disc.y+=Math.sin(disc.angle)*disc.speed;disc.age++;
}
export function sweptDistance(x,y,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
export function discContact(disc,player,boss){
 // Once armed, either combatant can be hit. Test the full step so fast
 // projectiles cannot tunnel through a target between rendered frames.
 const distance=p=>sweptDistance(p.x,p.y,disc.previousX??disc.x,disc.previousY??disc.y,disc.x,disc.y);
 if(disc.age>40&&distance(boss)<18)return 'frieza';
 if(disc.age>10&&distance(player)<12)return 'goku';
 return null;
}
