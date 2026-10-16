// Death Ball staging over 1F04's sinking-continent flyby. Whole-pixel,
// screen-space poses so the picture, sounds and tests share one timeline.
export const deathBallTiming={arrive:48,grow:64,full:330,throw:360,impact:404,announce:470,leave:440,done:560};
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
const hover=a=>Math.round(Math.sin(a*Math.PI/48)*2);
const hand={dx:2,dy:-50};   // Above his raised hand, from the sprite's feet anchor.
const rest={x:184,y:58},impact={x:96,y:196},sky={x:150,y:-40};

export function friezaFlybyPose(age){
 const t=deathBallTiming;
 if(age<t.arrive){const u=ease(age/t.arrive);return{x:Math.round(300-124*u),y:Math.round(-20+82*u),frame:0,visible:true};}
 if(age>=t.leave){
  // Back toward the Fortress, climbing out of the top of the picture.
  const u=clamp((age-t.leave)/110)**2;
  return{x:Math.round(rest.x+120*u),y:Math.round(rest.y-130*u),frame:0,visible:u<1};
 }
 const charging=age<t.throw;
 return{x:rest.x,y:rest.y+hover(age),frame:charging?(age<t.grow+12?0:age<t.grow+24?2:3):age<t.throw+8?3:2,visible:true};
}
export function deathBallFlybyPose(age){
 const t=deathBallTiming;
 if(age<t.grow||age>=t.impact)return{visible:false};
 const frame=Math.floor(age/8);
 if(age<t.throw){
  // Swells far past the edges of the screen: the planet-sized Death Ball.
  // It sits on his raised hand while small, then keeps filling the sky
  // downward from the top of the picture until it dwarfs the horizon.
  const u=ease((age-t.grow)/(t.full-t.grow)),size=2*Math.round((16+264*u)/2);
  const onHand=rest.y+hand.dy-size/2,center=Math.max(onHand,sky.y);
  return{x:Math.round(rest.x+hand.dx+(sky.x-rest.x-hand.dx)*u),y:Math.round(center+hover(age)),size,frame,visible:true};
 }
 // Hurled down and away into the continent; it shrinks into the distance.
 const u=clamp((age-t.throw)/(t.impact-t.throw))**2,start=sky;
 const size=2*Math.round((280-256*u)/2);
 return{x:Math.round(start.x+(impact.x-start.x)*u),y:Math.round(start.y+(impact.y-start.y)*u),size,frame,visible:true};
}
