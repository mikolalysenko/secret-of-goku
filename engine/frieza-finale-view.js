import {clashTiming,victoryTiming,clashLines,descentPose,ease} from './frieza-finale.js';

// Tiny, whole-pixel fighters establish the scale. The counter and its blast
// occupy most of the picture; their shared axis never jumps between shots.
export function createFinaleView(mod,{put,line,disc,rgb,ray,death,character,frieza,panel,flash,fx}){
 const blue=[rgb(3,7,23),rgb(4,17,31),rgb(16,27,31),rgb(31,31,31)];
 const purple=[rgb(13,1,19),rgb(25,3,24),rgb(31,14,29),rgb(31,27,31)];
 return function draw(o,b){
  const c=o.clash,a=c.age,h=o.hero,g=mod.spriteLayer.atlas.ssj;
  const dx=b.x-h.x,dy=b.y-h.y,n=Math.hypot(dx,dy)||1,ux=dx/n,uy=dy/n;
  const point=t=>({x:h.x+dx*t,y:h.y+dy*t});
  let goku={...h,size:16,column:34,row:2},text=clashLines[c.phase];
  if(c.phase==='gather'){
   frieza(3,b.x,b.y+10);
   const t=ease(a/clashTiming.gather),p=point(.88);death(p.x,p.y,14+54*t,a);
  }else if(c.phase==='charge'){
   frieza(3,b.x,b.y+10);const p=point(.84);
   death(p.x,p.y,64,a);
   if(o.charge){goku.column=18;fx.aura(h.x,h.y,a);fx.stamp('charge-orb',Math.min(4,Math.floor(o.charge/10)),h.x+8,h.y);}
   if(a>240)text=null;
  }else if(c.phase==='launch'){
   goku.column=20;frieza(2,b.x,b.y+10);
   const t=ease(a/clashTiming.contact),front=point(.43*t),ball=point(.84-(.84-.43)*t);
   ray(h.x,h.y,front.x,front.y,27,blue,a);
   ray(b.x,b.y,ball.x,ball.y,30,purple,a);death(ball.x,ball.y,72,a);
   if(a===clashTiming.contact)flash(.35);
  }else if(c.phase==='struggle'){
   goku.column=20;frieza(2,b.x,b.y+10);
   const p=point(c.shown??c.pressure),pulse=(a>>3)%3;
   ray(h.x,h.y,p.x,p.y,28+pulse,blue,a);ray(b.x,b.y,p.x,p.y,35-pulse,purple,a);
   death(p.x,p.y,76,a);
   if(a>100)text=null;
  }else if(c.phase==='recoil'){
   frieza(3,b.x,b.y+10);const p=point(Math.max(0,.12-a/100));
   if(a<32){ray(b.x,b.y,p.x,p.y,34*(1-a/40),purple,a);death(h.x,h.y,54,a);}
   goku.column=33;goku.x-=Math.round(6*Math.sin(Math.PI*Math.min(1,a/90)));
  }else if(c.phase==='win'){
   text=null;
   if(a<victoryTiming.beamEnd){
    goku.column=20;
    if(a<victoryTiming.impact)frieza(6,b.x,b.y+10);
    const grow=ease(a/65),tail=1-ease((a-victoryTiming.beamFade)/(victoryTiming.beamEnd-victoryTiming.beamFade));
    const length=n+grow*260,width=(30+grow*15)*tail;
    ray(h.x,h.y,h.x+ux*length,h.y+uy*length,width,blue,a);
    if(a<victoryTiming.impact){const p=point(1+a/180);death(p.x,p.y,Math.max(4,70*(1-a/victoryTiming.impact)),a);}
   }
   const t=a-victoryTiming.impact;
   if(t>=0&&t<210){
    // A single engulfing detonation. Frieza has no sliced/disc pose and
    // never reappears on the deck after this blast.
    fx.burst(b.x,b.y,t,{large:true});if(t>=38)fx.burst(b.x-8,b.y+8,t-38,{large:true});
    if(t<6)flash((1-t/6)*.7);
   }
   // Recover the stolen pouch visibly before returning. Its contents stay
   // quest-owned and are restored only by the arrival event on the ground.
   if(a>=215&&a<320){const u=ease((a-215)/105),p=point(1-u);
    disc(p.x,p.y,3,rgb(15,8,2));disc(p.x,p.y-1,2,rgb(29,20,7));line(p.x-1,p.y-4,p.x+1,p.y-4,rgb(31,29,15));}
   if(a>=victoryTiming.quiet&&a<victoryTiming.descent)text=clashLines.aftermath;
   if(a>=victoryTiming.descent){
    goku={...descentPose(o),column:34,row:0};
    // The enlarging globe communicates descent. A pale cloud fade joins
    // the native Fortress deck and its feet-first landing animation.
   }
  }
  character(g,{x:goku.column*32,y:32+goku.row*32,w:32,h:32},goku.x,goku.y,goku.size);
  if(text)panel(text);
  if(c.phase==='win'&&a>victoryTiming.return-24)flash(ease((a-victoryTiming.return+24)/24));
 };
}
