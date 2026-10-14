import {orbitTargets} from './frieza-orbit.js';
import {radioPixels} from './native-radio.js';

export const orbitPrompts={
 charge:'KING KAI:CHARGE YOUR WAVE!\nHold L and Y, then release!',
 struggle:'GOKU:YOU WILL NOT WIN!\nMASH PUNCH!  PUSH HIM BACK!',
};

export function createOrbitView(snes,mod,{put,disc,line,spell,rgb,drawPlanet}){
 let prompt='',panel=null;
 const blue=[rgb(3,7,23),rgb(4,17,31),rgb(16,27,31),rgb(31,31,31)],purple=[rgb(13,1,19),rgb(25,3,24),rgb(31,14,29),rgb(31,27,31)];
 function ray(x,y,xx,yy,width,colors,age=0){
  const dx=xx-x,dy=yy-y,n=Math.hypot(dx,dy)||1,ux=dx/n,uy=dy/n;
  for(let py=Math.max(0,Math.floor(Math.min(y,yy)-width));py<Math.min(224,Math.max(y,yy)+width);py++)
   for(let px=Math.max(0,Math.floor(Math.min(x,xx)-width));px<Math.min(256,Math.max(x,xx)+width);px++){
    const along=(px-x)*ux+(py-y)*uy,d=Math.abs((px-x)*uy-(py-y)*ux),r=width*Math.min(1,.25+along/22);
    if(along<0||along>n||d>r)continue;const edge=r-d;put(px,py,colors[edge<2?0:edge<4?1:edge<6?2:3]);
   }
  for(let i=0;i<4;i++){const t=((age*3+i*29)%100)/100;spell('lightning',i+(age>>2),x+dx*t+Math.sin(age+i)*width,y+dy*t);}
 }
 function character(a,f,x,y,height,flip=false){
  if(!a||!f)return;const width=Math.round(height*f.w/f.h);
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){const c=a.pixels[(f.y+Math.floor(py*f.h/height))*a.width+f.x+Math.floor((flip?width-1-px:px)*f.w/width)];if(c)put(x-width/2+px,y-height/2+py,c);}
 }
 function death(x,y,size,age){mod.kiArt?.draw('death',(age>>3)%6,x,y,size,put);}
 return function draw(o){
  const b=mod.frieza.status.boss,age=o.age,h=o.hero;
  drawPlanet({...o.target,x:(o.target.x+Math.floor(age/4)*2)%4096},true);
  // Distant bodies remain destroyed for the rest of this battle/checkpoint.
  orbitTargets.forEach((t,index)=>{
   if(o.destroyed.includes(index))return;
   if(index===2){for(let i=0;i<5;i++){const x=t.x+(i%3-1)*9,y=t.y+Math.floor(i/3)*7;line(x-4,y,x+4,y,rgb(10,18,19));line(x,y-3,x,y+2,rgb(22,27,26));put(x+2,y+2,rgb(3,16,29));}return;}
   for(let dy=-t.r;dy<=t.r;dy++)for(let dx=-t.r;dx<=t.r;dx++){
    const d=(dx*dx+dy*dy)/t.r**2;if(d>1)continue;const light=.32+.68*Math.sqrt(1-d)-dx/t.r*.19-dy/t.r*.15;
    const crater=(dx*13+dy*17+index*7)%19<2?.72:1;put(t.x+dx,t.y+dy,rgb(...t.color.map(c=>Math.min(31,Math.max(0,Math.floor(c*light*crater))))));
   }
  });
  for(const r of o.ricochets){
   const target=orbitTargets[r.target],t=Math.min(1,r.age/25),colors=r.owner==='frieza'?purple:blue;
   const endX=r.x+(target.x-r.x)*t,endY=r.y+(target.y-r.y)*t;
   if(r.age<38)ray(r.x,r.y,endX,endY,Math.max(1,7*(1-r.age/45)),colors,age);
   if(r.bent){const distance=(r.age-25)*11;ray(target.x,target.y,target.x+(target.x>128?1:-1)*distance,target.y-distance*.65,Math.max(1,9*(1-(r.age-25)/45)),colors,age);}
  }
  for(const p of o.impacts){
   const radius=p.r+p.age*.9;
   for(let i=0;i<72;i++){const a=i*Math.PI/36;put(p.x+Math.cos(a)*radius,p.y+Math.sin(a)*radius*.6,p.age<20?blue[3]:blue[1]);}
   for(let i=0;i<20;i++){const a=i*2.39996,d=p.age*(.25+i%6*.11);if(p.age<40)spell('impact-spark',i+(p.age>>2),p.x+Math.cos(a)*d,p.y+Math.sin(a)*d);else if(i%2)disc(p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,1,rgb(14,8,19));}
  }
  const g=mod.spriteLayer.atlas.ssj,gokuFrame={x:(o.charge?18:o.beam||o.clash?.phase==='struggle'?19:o.punch?8:34)*32,y:(o.charge||o.beam||o.punch||o.clash?.phase==='struggle'?(b.x<h.x?1:2):4)*32,w:32,h:32};
  if(!o.teleport||o.teleport<7)character(g,gokuFrame,h.x,h.y,16);
  if(o.teleport)for(let i=0;i<6;i++)line(h.x-7+i*3,h.y-11,h.x-7+i*3,h.y+10,blue[2]);
  const a=mod.frieza.portraitAtlas,frame=o.clash?.phase==='win'?7:b.hurt?6:b.warning||o.clash?3:b.dash?5:4;
  if(o.clash?.phase!=='win'||o.clash.age<40)character(a,a?.frames[frame],b.x,b.y,18,b.x<h.x);
  if(o.charge){const size=6+o.charge*.2;spell('charge-orb',Math.min(4,Math.floor(o.charge/10)),h.x+(b.x>h.x?7:-7),h.y);for(let i=0;i<3;i++)spell('gold-arc',(age>>2)+i,h.x+Math.cos(age*.2+i*2)*size,h.y+Math.sin(age*.2+i*2)*size);}
  if(o.beam){const v=o.beam,w=v.width*Math.min(1,v.age/6,(v.max-v.age)/10);ray(v.x,v.y,v.x+v.dx*350,v.y+v.dy*350,w,blue,age);}
  for(const p of o.shots){line(p.x-p.dx*9,p.y-p.dy*9,p.x,p.y,blue[1]);disc(p.x,p.y,3,blue[2]);disc(p.x,p.y,1,blue[3]);}
  for(const p of b.shots){
   if(p.kind==='orb')death(p.x,p.y,34,p.age);
   else{for(let dx=-10;dx<=10;dx++){put(p.x+dx,p.y+Math.sin(p.age*.2)*dx*.3,rgb(31,31,21));put(p.x+dx,p.y+1+Math.sin(p.age*.2)*dx*.3,rgb(30,6,26));}}
  }
  if(b.warning){const w=b.warning;if(w.kind==='orb')death(b.x,b.y-10,12+w.age/w.wait*25,age);else line(b.x-12,b.y-9,b.x+12,b.y-9,purple[3]);}
  const c=o.clash;
  if(c){
   if(c.phase==='charge'){death(b.x-18,b.y+17,46+Math.sin(age*.2)*3,age);}
   else if(c.phase==='struggle'){
    const x=h.x+(b.x-h.x)*c.pressure,y=h.y+(b.y-h.y)*c.pressure;
    ray(h.x,h.y,x,y,22,blue,age);ray(b.x,b.y,x,y,27,purple,age);death(x,y,48,age);
    for(let i=0;i<8;i++)spell('lightning',(age>>2)+i,x+Math.cos(age*.3+i)*22,y+Math.sin(age*.3+i)*22);
   }else if(c.phase==='win'&&c.age<70){death(b.x+c.age*2,b.y-c.age*1.5,Math.max(4,52-c.age*.5),age);for(let i=0;i<6;i++)spell('impact-spark',(age>>2)+i,b.x+Math.cos(i)*c.age*.5,b.y+Math.sin(i)*c.age*.5);}
   const text=orbitPrompts[c.phase];
   if(text){if(prompt!==text){prompt=text;panel=radioPixels(snes.cart.data,text);}for(let y=0;y<64;y++)for(let x=0;x<240;x++){const col=panel[y*240+x];if(col)put(x+8,y+157,col);}}
  }
 };
}
