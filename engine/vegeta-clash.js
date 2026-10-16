// A real counter-shot initiates the clash. A parallel, crossing or already
// passed beam cannot pull Goku into it. All visible motion is whole pixels.
export const trainingClashTiming={lock:36,focus:48,minimum:240,limit:660,release:84};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function opposingBeams(player,geometry,enemy){
 if(!geometry||!enemy||player.dx*enemy.dx+player.dy*enemy.dy>-.99)return false;
 const dx=enemy.x-player.x,dy=enemy.y-player.y,along=dx*player.dx+dy*player.dy;
 const across=Math.abs(dx*player.dy-dy*player.dx);
 return along>16&&along<=geometry.length+enemy.length&&across<=Math.min(20,geometry.halfWidth+enemy.halfWidth);
}
export function createTrainingClash(player,enemy,hero,boss,tier){
 return{phase:'lock',age:0,total:0,pressure:.5,shown:.5,lastButtons:0,lastTap:-6,taps:0,tier,
  hero:{...hero},boss:{...boss},dx:player.dx,dy:player.dy,super:!!player.super,
  from:{x:player.x,y:player.y},to:{x:enemy.x,y:enemy.y},result:null};
}
export function mashTrainingClash(c,buttons){
 const held=buttons&(1|(1<<17)),fresh=held&~c.lastButtons;c.lastButtons=held;
 if(c.phase!=='struggle'||!fresh||c.age-c.lastTap<5)return false;
 c.lastTap=c.age;c.taps++;c.pressure=clamp(c.pressure+.05,0,1);return true;
}
export function tickTrainingClash(c){
 c.age++;c.total++;
 if(c.phase==='lock'&&c.age>=trainingClashTiming.lock){c.phase='focus';c.age=0;return'focus';}
 if(c.phase==='focus'&&c.age>=trainingClashTiming.focus){c.phase='struggle';c.age=0;c.lastTap=-6;return'struggle';}
 if(c.phase==='struggle'){
  const surge=c.age===100||c.age===220||c.age===340;
  c.pressure=clamp(c.pressure-(c.tier?.0025:.002)-Math.min(.001,c.age/500000)-(surge?.10:0),0,1);
  const target=c.age<trainingClashTiming.minimum?Math.min(.87,c.pressure):c.pressure;
  c.shown=clamp(c.shown+clamp(target-c.shown,-.012,.012),0,1);
  const won=c.age>=trainingClashTiming.minimum&&c.shown>=.96,lost=c.shown<=.04,timeout=c.age>=trainingClashTiming.limit;
  if(won||lost||timeout){c.result=won||timeout&&c.shown>=.5?'win':'lose';c.phase='release';c.age=0;return c.result;}
  if(surge)return'surge';
 }
 if(c.phase==='release'){
  c.shown=clamp(c.shown+(c.result==='win'?.025:-.025),0,1);
  if(c.age>=trainingClashTiming.release)return'done';
 }
 return null;
}
export function trainingClashPoint(c){
 return{x:Math.round(c.from.x+(c.to.x-c.from.x)*c.shown),y:Math.round(c.from.y+(c.to.y-c.from.y)*c.shown)};
}

// Lucent Beam, Lucid Barrier and the native impact cells supply the energy
// texture. Large opening waves compress into one white-hot core and a ball
// at their contact; pressure moves that ball, rather than a separate meter.
export function drawTrainingClash(layer,c,camera){
 const age=c.age,point=trainingClashPoint(c),x=point.x-camera.cameraX,y=point.y-camera.cameraY;
 const blue=[0x5ca4,0x7e25,0x7fb1,0x8000],gold=[0x0110,0x01be,0x37ff,0x8000],purple=[0x540d,0x6d3c,0x7e60,0x8000];
 const enemy=c.tier?gold:purple,phase=c.total>>2;
 const focused=c.phase==='lock'?0:c.phase==='focus'?Math.min(1,age/trainingClashTiming.focus):1;
 const width=Math.round(54-42*focused),pulse=(phase&1)*2;
 const release=c.phase==='release',tail=release?clamp(1-(age-30)/54,0,1):1;
 // Each wave starts at its saved firing hand and ends at the collision
 // ball. Pressure changes its length, never extending behind the fighter.
 const wave=(origin,dx,dy,halfWidth,palette)=>{
  const length=(point.x-origin.x)*dx+(point.y-origin.y)*dy;
  if(length>0&&tail>0)layer.giantBeam(origin.x-camera.cameraX,origin.y-camera.cameraY,dx,dy,length,Math.round(halfWidth*tail),phase,{taper:36,palette});
 };
 wave(c.from,c.dx,c.dy,width+pulse,blue);
 wave(c.to,-c.dx,-c.dy,width+2-pulse,enemy);
 if(tail>0){
  const radius=Math.round((c.phase==='lock'?18+age/3:30+((phase&3)===0?2:0))*tail);
  for(let py=-radius;py<=radius;py++)for(let px=-radius;px<=radius;px++){
   const d=px*px+py*py;if(d>radius*radius)continue;
   const rim=radius-Math.sqrt(d),color=rim<2?blue[0]:rim<5?enemy[1]:rim<9?blue[2]:0x8000;
   layer.pixel(x+px,y+py,color,true);
  }
  for(let i=0;i<4;i++){
   const[dx,dy]=[[1,0],[0,1],[-1,0],[0,-1]][i];
   layer.stamp(i&1?'gold-arc':'aura-arc',phase+i,x+dx*(radius-4),y+dy*(radius-4),dx,dy);
  }
  layer.stamp('impact-spark',phase,x,y);
 }
}
