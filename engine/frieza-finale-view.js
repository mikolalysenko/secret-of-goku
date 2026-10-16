import {clashTiming,victoryTiming,clashLines,clashSurge,descentPose,ease} from './frieza-finale.js';
import {drawBossVictory,bossVictoryTiming,bossVictoryWhite} from './boss-victory.js';
import {drawBeamDetonation} from './beam-detonation.js';

// Tiny, whole-pixel fighters establish the scale. The counter and its blast
// occupy most of the picture; their shared axis never jumps between shots.
export function createFinaleView(mod,{put,line,disc,rgb,ray,character,frieza,panel,flash,fx}){
 const blue=[rgb(3,7,23),rgb(4,17,31),rgb(16,27,31),rgb(31,31,31)];
 const purple=[rgb(13,1,19),rgb(25,3,24),rgb(31,14,29),rgb(31,27,31)];
 return function draw(o,b){
  const c=o.clash,a=c.age,h=o.hero,g=mod.spriteLayer.atlas.ssj;
  const dx=b.x-h.x,dy=b.y-h.y,n=Math.hypot(dx,dy)||1,ux=dx/n,uy=dy/n;
  const point=t=>({x:h.x+dx*t,y:h.y+dy*t});
  let goku={...h,size:16,column:34,row:2},text=clashLines[c.phase];
  if(c.phase==='gather'){
   fx.aura(b.x,b.y,a,{tone:'pink',seed:5});frieza(4,b.x,b.y+10);
   if(a>60)fx.charge(b.x-8,b.y+4,(a-60)/72,{pink:true});
  }else if(c.phase==='charge'){
   fx.aura(b.x,b.y,a,{tone:'pink',seed:5});frieza(2,b.x,b.y+10);fx.charge(b.x-8,b.y+4,1,{pink:true});
   if(o.charge){goku.column=18;fx.aura(h.x,h.y,a);const hand=window.GokuAnimationData.forms.ssj.sockets[18][goku.row];fx.charge(h.x+(hand[0]-16)/2,h.y+(hand[1]-16)/2,o.charge/45);}
   if(a>240)text=null;
  }else if(c.phase==='launch'){
   goku.column=20;frieza(2,b.x,b.y+10);
   const t=ease(a/clashTiming.contact),front=point(.43*t),enemyFront=point(1-.57*t);
   ray(h.x,h.y,front.x,front.y,27,blue,a);
   ray(b.x,b.y,enemyFront.x,enemyFront.y,30,purple,a);
   if(a===clashTiming.contact)flash(.35);
  }else if(c.phase==='struggle'){
   const surge=clashSurge(c);
   if(surge)fx.aura(b.x,b.y,a,{tone:'pink',seed:5});
   goku.column=20;frieza(2,b.x,b.y+10);
   const p=point(c.shown??c.pressure),pulse=(a>>3)%3,power=surge?Math.min(3,1+(surge.age>>3),Math.ceil((90-surge.age)/12)):0;
   ray(h.x,h.y,p.x,p.y,28+pulse,blue,a);ray(b.x,b.y,p.x,p.y,35-pulse+power*4,purple,a);
   fx.stamp('impact-spark',a>>2,p.x,p.y);fx.stamp('gold-spark',a>>2,p.x+8,p.y-8,2);
   if(surge&&surge.age<4)flash((4-surge.age)*.045);
   if(a>100)text=surge?.text??null;
  }else if(c.phase==='recoil'){
   frieza(3,b.x,b.y+10);const p=point(Math.max(0,.12-a/100));
   if(a<32){ray(b.x,b.y,p.x,p.y,34*(1-a/40),purple,a);fx.burst(h.x,h.y,a);}
   goku.column=33;goku.x-=Math.round(6*Math.sin(Math.PI*Math.min(1,a/90)));
  }else if(c.phase==='win'){
   text=null;
   if(a<victoryTiming.beamEnd){
    goku.column=20;
    const grow=ease(a/65),tail=1-ease((a-victoryTiming.beamFade)/(victoryTiming.beamEnd-victoryTiming.beamFade));
    const length=n+grow*260,width=(30+grow*15)*tail;
    ray(h.x,h.y,h.x+ux*length,h.y+uy*length,width,blue,a);
    if(a<victoryTiming.impact)fx.stamp('impact-spark',a>>2,b.x,b.y);
   }
   const t=a-victoryTiming.impact;
   if(t<bossVictoryTiming.vanish)frieza(6,b.x+((t>0&&t%6<3)?1:0),b.y+10,{death:t});
   // Recover the stolen pouch visibly before returning. Its contents stay
   // quest-owned and are restored only by the arrival event on the ground.
   if(a>=victoryTiming.reward&&a<victoryTiming.acquire){const u=ease((a-victoryTiming.reward)/(victoryTiming.acquire-victoryTiming.reward)),p=point(1-u);
    disc(p.x,p.y,3,rgb(15,8,2));disc(p.x,p.y-1,2,rgb(29,20,7));line(p.x-1,p.y-4,p.x+1,p.y-4,rgb(31,29,15));}
   if(a>=victoryTiming.quiet&&a<victoryTiming.descent)text=clashLines.aftermath;
   if(a>=victoryTiming.descent){
    goku={...descentPose(o),column:34,row:0};
    // The enlarging globe communicates descent. A pale cloud fade joins
    // the native Fortress deck and its feet-first landing animation.
   }
  }
  character(g,{x:goku.column*32,y:32+goku.row*32,w:32,h:32},goku.x,goku.y,goku.size);
  if(c.phase==='win'){
   const deathAge=a-victoryTiming.impact;
   drawBeamDetonation(mod.snes.cart.data,b.x,b.y,deathAge,put);
   drawBossVictory(b.x,b.y,deathAge,{put,disc},mod.snes.cart.data);
   // Wash the whole scene, including Goku, and hold it through the final
   // explosion. Only then can the pouch and native fanfare follow.
   const white=bossVictoryWhite(deathAge);if(white)flash(white,true);
  }
  if(text)panel(text);
  if(c.phase==='win'&&a>victoryTiming.return-24)flash(ease((a-victoryTiming.return+24)/24));
 };
}
