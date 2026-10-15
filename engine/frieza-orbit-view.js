import {orbitTargets} from './frieza-orbit.js';
import {radioPixels} from './native-radio.js';
import {orbitIntroFrames,orbitIntroLines} from './frieza-cinematic.js';
import {drawFriezaSprite} from './frieza-sprite.js';
import {clashCamera,clashLines} from './frieza-finale.js';
import {createFinaleView} from './frieza-finale-view.js';
import {createOrbitEffects} from './orbit-effects.js';

export const orbitPrompts=clashLines;

export function createOrbitView(snes,mod,{put,disc,line,spell,rgb,drawPlanet,flash}){
 let prompt='',panel=null;
 const fx=createOrbitEffects(snes,mod,put),characters=new WeakMap();
 const blue=[rgb(3,7,23),rgb(4,17,31),rgb(16,27,31),rgb(31,31,31)],purple=[rgb(13,1,19),rgb(25,3,24),rgb(31,14,29),rgb(31,27,31)];
 function ray(x,y,xx,yy,width,colors,age=0){
  fx.beam(x,y,xx,yy,width,age,colors[0]===purple[0]);
 }
 function character(a,f,x,y,height,flip=false){
  if(!a||!f)return;height=Math.max(16,Math.round(height/8)*8);const width=height;
  let cache=characters.get(a);if(!cache){cache=new Map();characters.set(a,cache);}
  const key=`${f.x}:${f.y}:${height}:${flip}`;let cell=cache.get(key);
  if(!cell){cell=new Uint16Array(width*height);for(let py=0;py<height;py++)for(let px=0;px<width;px++)cell[py*width+px]=a.pixels[(f.y+Math.floor(py*f.h/height))*a.width+f.x+Math.floor((flip?width-1-px:px)*f.w/width)];cache.set(key,cell);}
  x=Math.round(x)-width/2;y=Math.round(y)-height/2;
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){const c=cell[py*width+px];if(c)put(x+px,y+py,c);}
 }
 function death(x,y,size,age){mod.kiArt?.draw('death',(age>>3)%6,Math.round(x),Math.round(y),Math.max(16,Math.round(size/16)*16),put);}
 function textPanel(text){
  if(prompt!==text||!panel){panel=radioPixels(snes.cart.data,text);prompt=text;}
  for(let y=0;y<64;y++)for(let x=0;x<240;x++){const col=panel[y*240+x];if(col)put(x+8,y+157,col);}
 }
 const finale=createFinaleView(mod,{put,line,disc,rgb,ray,death,character,panel:textPanel,flash,fx,
  frieza:(frame,x,y)=>drawFriezaSprite(mod.frieza.portraitAtlas,frame,x,y,put,{tiny:true,flip:true})});
 return function draw(o){
  const b=mod.frieza.status.boss,age=o.age,h=o.hero;
  const cam=o.clash?clashCamera(o):o.camera??{x:95,y:154,r:104,longitude:o.target.x,latitude:o.target.y};
  drawPlanet({x:cam.longitude,y:cam.latitude},true,0,cam);
  if(o.clash){finale(o,b);return;}
  // Distant bodies remain destroyed for the rest of this battle/checkpoint.
  orbitTargets.forEach((t,index)=>{
   if(o.destroyed.includes(index))return;
   for(let dy=-t.r;dy<=t.r;dy++)for(let dx=-t.r;dx<=t.r;dx++){
    const d=(dx*dx+dy*dy)/t.r**2;if(d>1)continue;
    const crater=(dx*13+dy*17+index*7)%19<2?1:0,shade=Math.max(1,Math.min(4,Math.round(2+2*(1-d)-dx/t.r-dy/t.r)-crater));
    put(t.x+dx,t.y+dy,rgb(...t.color.map(c=>Math.floor(c*shade/4))));
   }
  });
  for(const r of o.ricochets){
   if(r.target>=0)continue;
   const distance=r.age*12;
   if(r.age<28)fx.stamp(r.owner==='frieza'?'gold-charge-orb':'charge-orb',0,r.x+r.dx*distance,r.y+r.dy*distance);
  }
  if(o.collateral){const c=o.collateral,t=orbitTargets[c.target];
   // A visible travelling spell earns the distant impact. No target reticle
   // or detached beam is painted over a body before it explodes.
   if(c.age<120){const u=c.age/120,x=Math.round(c.x+(t.x-c.x)*u),y=Math.round(c.y+(t.y-c.y)*u);
    fx.stamp(c.owner==='frieza'?'gold-charge-orb':'charge-orb',c.age<72?1:0,x,y);}
  }
  for(const p of o.impacts){
   fx.burst(p.x,p.y,p.age,{large:true});
  }
  const g=mod.spriteLayer.atlas.ssj,attacking=o.charge||o.beam||o.punch||o.clash?.phase==='struggle';
  // The sheet has a 32px header. These are the same audited facing rows and
  // charge/release/flight cells as the field renderer, sampled exactly 2:1.
  const gokuFrame={x:(o.charge?18:o.beam||o.clash?.phase==='struggle'?20:o.punch?8:cam.moving?36+Math.floor(age/5)%4:34)*32,y:32+(attacking?(b.x<h.x?1:2):3)*32,w:32,h:32};
  if(!o.teleport||o.teleport<7)character(g,gokuFrame,h.x,h.y,16);
  if(o.teleport>6)fx.stamp('impact-spark',Math.floor((12-o.teleport)/2),h.x,h.y);
  const a=mod.frieza.portraitAtlas,frame=o.clash?.phase==='win'?7:b.hurt?6:b.warning||o.clash?3:b.dash?5:4;
  if(o.clash?.phase!=='win'||o.clash.age<40)drawFriezaSprite(a,frame,b.x,b.y+10,put,{tiny:true,flip:b.x<h.x});
  if(o.charge){fx.aura(h.x,h.y,age);fx.stamp('charge-orb',Math.min(4,Math.floor(o.charge/10)),h.x+(b.x>h.x?7:-7),h.y);}
  if(o.beam){const v=o.beam,w=v.width*Math.min(1,v.age/6,(v.max-v.age)/10);ray(v.x,v.y,v.x+v.dx*350,v.y+v.dy*350,w,blue,age);}
  for(const p of o.shots)fx.stamp('charge-orb',1,p.x,p.y);
  for(const p of b.shots){
   if(p.age>=330)continue;
   if(p.kind==='laser'){if(p.age<14)ray(p.x,p.y,p.x+p.dx*350,p.y+p.dy*350,p.age<8?3:1,purple,age);}
   else if(p.kind==='orb')death(p.x,p.y,32,p.age);
   else fx.disc(p.x,p.y,p.age);
  }
  if(b.warning){const w=b.warning;if(w.kind==='orb')death(b.x,b.y-10,16+16*Math.floor(w.age*2/w.wait),age);else if(w.kind==='laser')fx.stamp('gold-charge-orb',Math.floor(w.age/12)%2,b.x,b.y-5);else fx.disc(b.x,b.y-9,age);}
  if(o.intro)textPanel(orbitIntroLines[Math.min(1,Math.floor((orbitIntroFrames-o.intro)/120))]);
 };
}
