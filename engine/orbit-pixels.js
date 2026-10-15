// Sixteen fixed headings, in signed 8.8 units. Actors commit whole pixels;
// no continuously rotating angle or fractional sprite position is saved.
export const orbitVectors=[
 [256,0],[229,114],[181,181],[114,229],[0,256],[-114,229],[-181,181],[-229,114],
 [-256,0],[-229,-114],[-181,-181],[-114,-229],[0,-256],[114,-229],[181,-181],[229,-114],
];
export function orbitHeading(dx,dy){
 let best=-Infinity,heading=0;
 for(let i=0;i<16;i++){const[x,y]=orbitVectors[i],dot=dx*x+dy*y;if(dot>best){best=dot;heading=i;}}
 return heading;
}
export function orbitVector(heading){const[x,y]=orbitVectors[heading&15];return{dx:x/256,dy:y/256,heading:heading&15};}
export function orbitStep(body,heading,speed){
 const[x,y]=orbitVectors[heading&15];
 body.x=Math.round(body.x)+Math.round(x*speed/256);body.y=Math.round(body.y)+Math.round(y*speed/256);
}
export function orbitProjectile(shot,target){
 // Convert the heading once when restoring an older orbital checkpoint.
 shot.heading??=orbitHeading(Math.cos(shot.angle??0),Math.sin(shot.angle??0));delete shot.angle;
 if(target&&shot.age%12===0){
  const desired=orbitHeading(target.x-shot.x,target.y-shot.y),delta=((desired-shot.heading+24)&15)-8;
  shot.heading=(shot.heading+Math.sign(delta)+16)&15;
 }
 orbitStep(shot,shot.heading,shot.speed);shot.age++;
}
export function orbitRush(boss){
 const to=boss.nodes[boss.node],dx=to.x-boss.x,dy=to.y-boss.y;
 if(Math.hypot(dx,dy)<=8){boss.x=Math.round(to.x);boss.y=Math.round(to.y);boss.dash=0;return;}
 orbitStep(boss,orbitHeading(dx,dy),7);boss.dash++;
}
