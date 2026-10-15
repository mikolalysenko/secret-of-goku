// The last counter has its own saved clock. A hit cannot skip the wind-up,
// travelling waves, impact, quiet aftermath, or the trip back to the deck.
export const clashTiming={gather:150,launch:72,contact:48,struggle:180,recoil:90};
export const victoryTiming={impact:96,beamFade:168,beamEnd:210,quiet:270,descent:390,return:630,landed:714};
export const clashLines={
 gather:'FRIEZA:Then disappear!\nYou AND this entire planet!',
 charge:'KING KAI:Quick! Frieza is\ngoing all out! Counter him\nwith a Kamehameha!',
 launch:'GOKU:KA... ME... HA...\nME... HAAAAA!',
 struggle:'GOKU:I WILL NOT LET YOU\nDESTROY THIS WORLD!',
 recoil:'KING KAI:Hold your ground!\nYou can push it back!',
 aftermath:'GOKU:It is over.\nHang on, Popoi.\nI am coming back.',
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
  if(c.age===40)sound('friezaOrb');
  if(c.age>=clashTiming.gather){c.phase='charge';c.age=0;}
 }else if(c.phase==='charge'){
  if(c.age>900&&c.age%300===0)damage(120);
 }else if(c.phase==='launch'){
  if(c.age===clashTiming.contact){sound('powerBurst');shake(14);}
  if(c.age>=clashTiming.launch){c.phase='struggle';c.age=0;}
 }else if(c.phase==='struggle'){
  c.pressure=Math.max(0,c.pressure-.0017);
  // Mashing moves the junction, not an instantaneous win/camera cut. Even
  // rapid tapping gets a visible three-second struggle before breakthrough.
  const target=c.age<clashTiming.struggle?Math.min(.9,c.pressure):c.pressure;
  c.shown=Math.max(0,Math.min(1,(c.shown??.43)+Math.max(-.005,Math.min(.005,target-(c.shown??.43)))));
  if(c.age%90===0)sound('friezaOrb');
  if(c.shown>=.99){c.phase='win';c.age=0;o.charge=0;cancel();return true;}
  if(c.shown<=.04){damage(420);c.phase='recoil';c.age=0;cancel();sound('friezaImpact');shake(12);}
 }else if(c.phase==='recoil'&&c.age>=clashTiming.recoil){
  c.phase='charge';c.age=0;c.pressure=c.shown=.43;c.taps=0;
 }
 return false;
}
