// Allow a readable character death before the already doomed planet fails.
// All visual clocks are saved; neither phase can be skipped by attack input.
export const bossRushDeathTiming={revert:18,fall:54,fallen:264,fade:300,black:360,planet:408,rupture:576,blast:624,fadeOut:780,gameOver:900};

export function bossRushDeathPose(state){
 const t=bossRushDeathTiming,age=state.age;
 const light=age<t.fade?1:age<t.black?(t.black-age)/(t.black-t.fade):age<t.planet?0:age<t.planet+48?(age-t.planet)/48:age>t.fadeOut?Math.max(0,1-(age-t.fadeOut)/60):1;
 const phase=age<t.fade?'fallen':age<t.black?'fade':age<t.planet?'black':age<t.rupture?'planet':age<t.gameOver?'explode':'gameover';
 if(!state.orbit)return{phase,light,native:age<t.black};
 const camera=state.orbit.deathCamera??state.orbit.camera,from=state.orbit.hero;
 const u=Math.max(0,Math.min(1,(age-t.fall)/(t.fallen-t.fall))),fall=u*u;
 const target={x:Math.round(camera.x+(from.x-camera.x)*.28),y:Math.min(192,Math.round(camera.y+camera.r*.25))};
 const gold=state.gold&&age<t.revert;
 return{phase,light,native:false,camera,gold,visible:age<t.fallen,
  x:Math.round(from.x+(target.x-from.x)*fall),y:Math.round(from.y+(target.y-from.y)*fall),
  size:u<.4?16:u<.7?12:u<.9?8:4,row:1,
  column:age<t.fall?(gold?29:33):48+Math.min(3,Math.floor((age-t.fall)/8))};
}

export function installFinaleDeathGate(snes,mod){
 const cpu=snes?.cpu;if(!cpu)return;
 const cycle=cpu.cycle;
 cpu.cycle=function(){
  // C1:E77B dispatches native events through a JSR. Skip the retail death
  // warp (7FF) and both boss-victory events (42D/42F), returning through its
  // own RTS before PHX. Companions cannot turn Goku's death into a victory.
  // The actor's tumble, ghost palette and reaper OBJs keep running normally.
  if(this.cyclesLeft===0&&(this.r[1]&63)===1&&this.br[4]===0xe77b&&[0x7ff,0x42d,0x42f].includes(this.br[0])&&mod.ending?.defeated&&snes.cart.data[0x1e7c5]===0x60)this.br[4]=0xe7c5;
  return cycle.call(this);
 };
 cpu.registerBreakpoints?.(cpu.cycle,cycle,[[1,0xe77b]]);
}
