// Deterministic projectiles: discs turn at a limited angular speed, so a
// flying player can circle behind their owner and let momentum do the rest.
export const FRIEZA_HP=96000;
const DISC_RADIUS=6;
// Actor/projectile coordinates are whole native pixels. Keep aiming angles
// continuous, but never feed fractional positions into the SNES camera.
export function pixelStep(body,dx,dy,speed){
 body.x=Math.round(body.x)+Math.round(dx*speed);body.y=Math.round(body.y)+Math.round(dy*speed);
}
export function rushStep(boss){
 const to=boss.nodes[boss.node],dx=Math.round(to.x)-Math.round(boss.x),dy=Math.round(to.y)-Math.round(boss.y),d=Math.hypot(dx,dy);
 if(d<=7){boss.x=Math.round(to.x);boss.y=Math.round(to.y);boss.dash=0;return;}
 pixelStep(boss,dx/d,dy/d,7);boss.dash++;
}
export function beamTouchesShot(beam,geometry,shot){
 const radius=shot.kind==='orb'?10:shot.kind==='disc'?DISC_RADIUS:4;
 for(const [x,y]of[[shot.x,shot.y],[shot.previousX??shot.x,shot.previousY??shot.y]]){
  const along=(x-beam.x)*beam.dx+(y-beam.y)*beam.dy,across=Math.abs((x-beam.x)*beam.dy-(y-beam.y)*beam.dx);
  const width=geometry.halfWidth*(geometry.taper?Math.min(1,Math.max(0,along)/geometry.taper):1);
  if(along>=-radius&&along<=geometry.length+radius&&across<=width+radius)return true;
 }
 return false;
}
export function homingStep(disc,target,turn=.035){
 const wanted=Math.atan2(target.y-disc.y,target.x-disc.x),delta=Math.atan2(Math.sin(wanted-disc.angle),Math.cos(wanted-disc.angle));
 disc.angle+=Math.max(-turn,Math.min(turn,delta));pixelStep(disc,Math.cos(disc.angle),Math.sin(disc.angle),disc.speed);disc.age++;
}
export function sweptDistance(x,y,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
export function discContact(disc,player,boss){
 // Once armed, either combatant can be hit. Test the full step so fast
 // projectiles cannot tunnel through a target between rendered frames.
 const distance=p=>sweptDistance(p.x,p.y,disc.previousX??disc.x,disc.previousY??disc.y,disc.x,disc.y);
 if(disc.age>40&&distance(boss)<14+DISC_RADIUS)return 'frieza';
 if(disc.age>10&&distance(player)<8+DISC_RADIUS)return 'goku';
 return null;
}
