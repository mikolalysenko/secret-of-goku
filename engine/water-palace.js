import {box,call,jump} from './story-events.js';

// The plate scene assumes the player is below the stairs. Flight can instead
// reach Jema from either bank: walk the existing actors from their real
// positions, open the same bridge, then run the explanation exactly once.
export function waterPalaceApproach(hero,jema){
 const route=(actor,from,points)=>{
  const steps=[],speed=actor<=3?2:1;let x=from.x,y=from.y;
  for(const [tx,ty]of points)for(const axis of['x','y']){
   let delta=Math.round(((axis==='x'?tx:ty)-(axis==='x'?x:y))/speed);
   while(delta){const step=Math.sign(delta)*Math.min(60,Math.abs(delta));steps.push([0x32,actor,(axis==='x'?step>0?0x80:0xc0:step>0?0x40:0)+Math.abs(step)]);delta-=step;if(axis==='x')x+=step*speed;else y+=step*speed;}
  }
  return steps;
 };
 // Jema keeps the cartridge's two stair walks and right turn. The native
 // stair/slope code supplies the final few pixels of his approach to Luka.
 const guide=[[0x32,jema.index+1,0x3c],[0x32,jema.index+1,0x3c],[0x32,jema.index+1,0xae]],
  // Follow the same dry stair as Jema. Walking straight toward Luka from
  // the far bank stops against the pool's north wall after a flight bypass.
  follow=route(0,hero,hero.y>324?[[216,hero.y],[216,308],[280,308]]:[[280,hero.y],[280,308]]),walk=[];
 // Jema walks at the native NPC speed, half the hero's. Let him clear the
 // stair before following, so actor collision cannot shorten either walk.
 for(const step of[...guide,...follow])walk.push(...step,8);
 return[...box('JEMA:You flew over?\nCome with me. Luka\nis just ahead.'),
  0x29,0xa6,...call(0x791),...call(0x78c),0x0a,0x29,1,
  ...walk,0x2d,8,0x32,jema.index+1,0,0x32,0,0,8,
  0x30,0xa6,0,0x0a,0x30,0x11,8,0x2a,1,0x09,...jump(0x4e9),0];
}
