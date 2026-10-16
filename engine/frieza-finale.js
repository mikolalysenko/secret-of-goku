// The last counter has its own saved clock. A hit cannot skip the wind-up,
// travelling waves, impact, quiet aftermath, or the trip back to the deck.
import {bossVictoryTiming} from './boss-victory.js';
export const clashTiming={gather:150,charge:108,launch:72,contact:48,struggle:660,recoil:90};
export const clashSurges=[
 {at:150,loss:.08,text:'FRIEZA:Is that all,\nSaiyan?!'},
 {at:330,loss:.12,text:'FRIEZA:I WILL NOT LOSE\nTO A MONKEY!'},
 {at:510,loss:.16,text:'GOKU:Then I will give you\nEVERYTHING I HAVE!'},
];
export function clashSurge(c){const i=clashSurges.findIndex(s=>c.age>=s.at&&c.age<s.at+90);return c.phase==='struggle'&&i>=0?{...clashSurges[i],index:i,age:c.age-clashSurges[i].at}:null;}
export function tapClash(c){
 if(c.phase!=='struggle'||c.age-(c.lastTap??-5)<5)return false;
 c.lastTap=c.age;c.taps=(c.taps??0)+1;
 c.pressure=Math.min(c.age<clashTiming.struggle?.92:1,c.pressure+.036*(clashSurge(c)?.65:1));return true;
}
const reward=96+bossVictoryTiming.vanish+525+60,acquire=reward+105,jingle=acquire+bossVictoryTiming.acquireFrames,quiet=jingle+bossVictoryTiming.jingleFrames,descent=quiet+120;
export const victoryTiming={impact:96,beamFade:168,beamEnd:210,reward,acquire,jingle,quiet,descent,return:descent+240,landed:descent+324};
export const clashLines={
 gather:'FRIEZA:Then disappear!\nYou AND this entire planet!',
 charge:'KING KAI:Quick! Frieza is\ngoing all out! Counter him\nwith a Kamehameha!',
 launch:'GOKU:KA... ME... HA...\nME... HAAAAA!',
 struggle:'GOKU:I WILL NOT LET YOU\nDESTROY THIS WORLD!',
 recoil:'KING KAI:Hold your ground!\nYou can push it back!',
 aftermath:'GOKU:It is over.\nHang on, {2}.\nI am coming back.',
};
export const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const mix=(a,b,t)=>Math.round(a+(b-a)*t);
const wide={x:114,y:164,r:56};
export function beginClash(o,b){
 o.clash={phase:'gather',age:0,pressure:.43,shown:.43,taps:0,from:{hero:{...o.hero},boss:{x:b.x,y:b.y},camera:{...o.camera}}};
 o.shots=[];o.ricochets=[];o.impacts=[];o.collateral=null;o.charge=0;o.beam=null;
 b.shots=[];b.warning=null;b.dash=0;b.windup=0;
}
export function clashCamera(o){
 const c=o.clash,from=c.from?.camera??o.camera,t=c.phase==='gather'?ease(c.age/clashTiming.gather):1;
 const camera={...o.camera,x:mix(from.x,wide.x,t),y:mix(from.y,wide.y,t),r:mix(from.r,wide.r,t)};
 if(c.phase==='win'&&c.age>=victoryTiming.descent){
  const u=ease((c.age-victoryTiming.descent)/(victoryTiming.return-victoryTiming.descent));
  camera.x=mix(wide.x,-15,u);camera.y=mix(wide.y,281,u);camera.r=mix(wide.r,230,u);
 }
 return camera;
}
export function descentPose(o,age=o.clash.age){
 const camera=clashCamera(o),u=ease((age-victoryTiming.descent)/(victoryTiming.return-victoryTiming.descent));
 return{x:mix(o.hero.x,camera.x+.62*camera.r,u),y:mix(o.hero.y,camera.y-.69*camera.r-12,u),size:mix(16,32,u)};
}
export function tickClash(o,b,{sound=()=>{},shake=()=>{},damage=()=>{},cancel=()=>{}}={}){
 const c=o.clash;c.age++;
 if(c.phase==='gather'){
  const t=ease(c.age/110),h=c.from.hero,f=c.from.boss;
  o.hero.x=mix(h.x,28,t);o.hero.y=mix(h.y,136,t);b.x=mix(f.x,204,t);b.y=mix(f.y,48,t);
  if(c.age===40)sound('charged');
  if(c.age>=clashTiming.gather){c.phase='charge';c.age=0;}
 }else if(c.phase==='charge'){
  o.charge=Math.min(45,Math.floor(c.age/2));
  if(c.age===90)sound('charged');
  if(c.age>=clashTiming.charge){c.phase='launch';c.age=0;c.pressure=c.shown=.43;c.taps=0;c.lastTap=-5;o.charge=0;sound('beam');}
 }else if(c.phase==='launch'){
  if(c.age===1)sound('friezaLaser');
  if(c.age===clashTiming.contact){sound('powerBurst');shake(14);}
  if(c.age>=clashTiming.launch){c.phase='struggle';c.age=0;}
 }else if(c.phase==='struggle'){
  // Frieza steadily increases his output, then makes three stronger pushes.
  // Holding a button cannot win, and an early burst of taps cannot bank a
  // victory. Five to six fresh presses/second require sustained effort.
  const surge=clashSurge(c);
  if(surge?.age===0){c.pressure=Math.max(0,c.pressure-surge.loss);sound('friezaBeam');shake(8+surge.index*2);}
  c.pressure=Math.max(0,c.pressure-(.0012+.0014*Math.min(1,c.age/720)));
  const target=c.age<clashTiming.struggle?Math.min(.92,c.pressure):c.pressure;
  c.shown=Math.max(0,Math.min(1,(c.shown??.43)+Math.max(-.006,Math.min(.004,target-(c.shown??.43)))));
  if(c.age>=clashTiming.struggle&&c.shown>=.975){c.phase='win';c.age=0;o.charge=0;cancel();return true;}
  if(c.shown<=.04){damage(420);c.phase='recoil';c.age=0;cancel();sound('friezaImpact');shake(12);}
 }else if(c.phase==='recoil'&&c.age>=clashTiming.recoil){
  c.phase='charge';c.age=0;c.pressure=c.shown=.43;c.taps=0;
 }
 return false;
}
