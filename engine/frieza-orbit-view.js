import {orbitTargets,orbitTarget} from './frieza-orbit.js';
import {radioPixels} from './native-radio.js';
import {orbitIntroText} from './frieza-cinematic.js';
import {drawFriezaSprite,friezaDeathBeamPose} from './frieza-sprite.js';
import {clashCamera,clashLines} from './frieza-finale.js';
import {createFinaleView} from './frieza-finale-view.js';
import {createOrbitEffects} from './orbit-effects.js';
import {orbitFacing} from './orbit-duel.js';
import {orbitBodyColor,orbitFragments,orbitDebrisPose} from './orbit-debris.js';

export const orbitPrompts=clashLines;

export function createOrbitView(snes,mod,{put,disc,line,spell,rgb,drawPlanet,flash}){
 let prompt='',panel=null;
 const fx=createOrbitEffects(snes,mod,put),characters=new WeakMap();
 const blue=[rgb(3,7,23),rgb(4,17,31),rgb(16,27,31),rgb(31,31,31)],purple=[rgb(13,1,19),rgb(25,3,24),rgb(31,14,29),rgb(31,27,31)];
 function ray(x,y,xx,yy,width,colors,age=0){
  fx.beam(x,y,xx,yy,width,age,colors[0]===purple[0]?'frieza':false);
 }
 function character(a,f,x,y,height,flip=false,falling=false){
  if(!a||!f)return;height=falling?Math.max(4,Math.round(height/4)*4):Math.max(16,Math.round(height/8)*8);const width=height;
  let cache=characters.get(a);if(!cache){cache=new Map();characters.set(a,cache);}
  const key=`${f.x}:${f.y}:${height}:${flip}`;let cell=cache.get(key);
  if(!cell){cell=new Uint16Array(width*height);for(let py=0;py<height;py++)for(let px=0;px<width;px++)cell[py*width+px]=a.pixels[(f.y+Math.floor(py*f.h/height))*a.width+f.x+Math.floor((flip?width-1-px:px)*f.w/width)];cache.set(key,cell);}
  x=Math.round(x)-width/2;y=Math.round(y)-height/2;
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){const c=cell[py*width+px];if(c)put(x+px,y+py,c);}
 }
 function death(x,y,size,age){mod.kiArt?.draw('death',(age>>3)%12,Math.round(x),Math.round(y),Math.max(16,Math.round(size/16)*16),put);}
 function debris(o,cam,foreground){
  for(const p of o.debris??[]){
   if(p.dead)continue;
   const t=orbitDebrisPose(o,p,cam),mask=orbitFragments(p.target)[p.piece];
   if(t.front!==foreground)continue;
   const turn=(p.spin+Math.floor(p.age/24))&3,r=t.r;
   for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
    const u=Math.round(x*mask.r/r),v=Math.round(y*mask.r/r);
    const sx=turn===1?v:turn===2?-u:turn===3?-v:u,sy=turn===1?-u:turn===2?-v:turn===3?u:v;
    let c=mask.colors[(sy+mask.r)*mask.width+sx+mask.r];if(!c)continue;
    if(p.age<48&&((x+y+p.age>>2)&3)===0)c=rgb(31,20,7);
    put(t.x+x,t.y+y,c);
   }
  }
  for(const p of o.grit??[]){
   const t=orbitDebrisPose(o,p,cam);if(t.front!==foreground)continue;
   const color=p.age<48?rgb(27,18,9):rgb(11+p.target*2,12,15-p.target*3);
   put(t.x,t.y,color);if(p.period===2)put(t.x+1,t.y,color);
  }
 }
 function textPanel(text){
  if(prompt!==text||!panel){panel=radioPixels(snes.cart.data,text,snes.ram);prompt=text;}
  for(let y=0;y<64;y++)for(let x=0;x<240;x++){const col=panel[y*240+x];if(col)put(x+8,y+8,col);}
 }
 const finale=createFinaleView(mod,{put,line,disc,rgb,ray,death,character,panel:textPanel,flash,fx,
  frieza:(frame,x,y,options={})=>drawFriezaSprite(mod.frieza.portraitAtlas,frame,x,y,put,{tiny:true,flip:true,...options})});
 return function draw(o,fallen=null){
  const b=mod.frieza.status.boss,age=o.age,h=o.hero,menu=mod.frieza.orbitMenu;
  const cam=fallen?.camera??(o.clash?clashCamera(o):o.camera??{x:95,y:154,r:104,longitude:o.target.x,latitude:o.target.y});
  // Distant bodies remain destroyed for the rest of this battle/checkpoint.
  orbitTargets.forEach((_,index)=>{
   if(o.destroyed.includes(index))return;
   const t=orbitTarget(o,index,cam);
   for(let dy=-t.r;dy<=t.r;dy++)for(let dx=-t.r;dx<=t.r;dx++){
    const c=orbitBodyColor(index,Math.round(dx*orbitTargets[index].r/t.r),Math.round(dy*orbitTargets[index].r/t.r));
    if(c)put(t.x+dx,t.y+dy,c);
   }
  });
  for(const p of o.impacts){const t=orbitTarget(o,p.target,cam,p.copy);fx.burst(t.x,t.y,p.age,{large:true});}
  debris(o,cam,false);
  drawPlanet({x:cam.longitude,y:cam.latitude},true,0,cam);
  // Ejected rocks reach the orbital combat plane before their collisions
  // arm. Their positions and zoom still follow the shared scenery camera.
  debris(o,cam,true);
  for(const p of o.dust??[]){const t=orbitDebrisPose(o,p,cam);fx.stamp('impact-spark',p.effectAge>>2,t.x,t.y);}
  if(fallen){
   // The opponent watches while Goku loses his gold hair and drops toward
   // the surface. Freeze attacks and keep the last camera throughout the fall.
   drawFriezaSprite(mod.frieza.portraitAtlas,4,b.x,b.y+10,put,{tiny:true,flip:b.x>h.x});
   if(fallen.visible)character(mod.spriteLayer.atlas[fallen.gold?'ssj':'goku'],{x:fallen.column*32,y:32+fallen.row*32,w:32,h:32},fallen.x,fallen.y,fallen.size,false,true);
   return;
  }
  if(o.clash){finale(o,b);return;}
  for(const r of o.ricochets){
   if(r.target>=0)continue;
   const distance=r.age*12;
   if(r.age<28)fx.stamp(r.owner==='frieza'?'gold-charge-orb':'charge-orb',0,r.x+r.dx*distance,r.y+r.dy*distance);
  }
  if(o.collateral){const c=o.collateral,t=orbitTarget(o,c.target,cam,c.copy);
   // A visible travelling spell earns the distant impact. No target reticle
   // or detached beam is painted over a body before it explodes.
   if(c.age<120){const u=c.age/120,x=Math.round(c.x+(t.x-c.x)*u),y=Math.round(c.y+(t.y-c.y)*u);
    fx.stamp(c.owner==='frieza'?'gold-charge-orb':'charge-orb',c.age<72?1:0,x,y);}
  }
  const g=mod.spriteLayer.atlas.ssj;
  // The sheet has a 32px header. These are the same audited facing rows and
  // charge/release/flight cells as the field renderer, sampled exactly 2:1.
  const focused=mod.action?.kind==='focus'&&!o.beam;
  const gokuFrame={x:(o.charge?18:focused?21:o.beam||o.clash?.phase==='struggle'?20:o.punch?(o.duel&&o.duel.age>54?16:12):cam.moving?36+Math.floor(age/5)%4:34)*32,y:32+orbitFacing(o)*32,w:32,h:32};
  // Only the menu's miniature moves to its safe UI anchor. The saved hero,
  // scenery, opponent and projectiles stay at their paused battle positions.
  if(!menu&&o.charge)fx.aura(h.x,h.y,age,{power:Math.min(1,o.charge/45)});
  else if(!menu&&focused)fx.aura(h.x,h.y,age,{power:.25+.45*mod.powerCharge/96});
  if(menu)character(g,{x:0,y:32,w:32,h:32},menu.x,menu.y,16);
  else if(!o.teleport||o.teleport<7)character(g,gokuFrame,h.x,h.y,16);
  if(!menu&&o.teleport>6)fx.stamp('impact-spark',Math.floor((12-o.teleport)/2),h.x,h.y);
  const a=mod.frieza.portraitAtlas,pointer=friezaDeathBeamPose(b),frame=pointer?2:o.clash?.phase==='win'?7:b.hurt?6:b.warning||o.clash?3:b.dash||b.evade||o.duel?5:4;
  if(b.warning?.kind==='beam')fx.aura(b.x,b.y,age,{tone:'pink',seed:5});
  if(!b.blink)drawFriezaSprite(a,frame,b.x,b.y+10,put,{tiny:true,flip:pointer?.flip??b.x>h.x});
  else fx.stamp('impact-spark',6-b.blink,b.x,b.y);
  if(!menu&&o.charge){const hand=window.GokuAnimationData.forms.ssj.sockets[18][orbitFacing(o)];fx.charge(h.x+(hand[0]-16)/2,h.y+(hand[1]-16)/2,o.charge/45);}
  if(o.beam){const v=o.beam,w=v.width*Math.min(1,v.age/6,(v.max-v.age)/10);ray(v.x,v.y,v.x+v.dx*350,v.y+v.dy*350,w,blue,age);}
  for(const p of o.shots)fx.stamp('charge-orb',1,p.x,p.y);
  for(const p of b.shots){
   if(p.age>=330)continue;
   if(p.kind==='beam'){const length=Math.min(360,p.age*30),w=12*Math.min(1,p.age/6,(42-p.age)/8);ray(p.x,p.y,p.x+p.dx*length,p.y+p.dy*length,w,purple,age);}
   else if(p.kind==='laser'){if(p.age<16)fx.deathBeam(p.x,p.y,p.x+p.dx*350,p.y+p.dy*350,p.age);}
   else if(p.kind==='orb')death(p.x,p.y,32,p.age);
   else fx.disc(p.x,p.y,p.age);
  }
  if(b.warning){const w=b.warning;if(w.kind==='orb')death(b.x,b.y-10,16+16*Math.floor(w.age*2/w.wait),age);else if(w.kind==='beam'){fx.charge(b.x-8,b.y+4,w.age/w.wait,{pink:true});}else if(w.kind==='laser')fx.fingerCharge(pointer.finger.x,pointer.finger.y,age);else fx.disc(b.x,b.y-9,age);}
  for(const hit of o.hits??[]){fx.burst(hit.x,hit.y,hit.age);if(hit.age<3)fx.stamp('impact-spark',hit.age,hit.x,hit.y);}
  if(o.intro){const text=orbitIntroText(o.intro);if(text)textPanel(text);}
  else if(o.aside?.age>=0&&!menu)textPanel(o.aside.text);
 };
}
