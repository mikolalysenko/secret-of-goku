import {cinematicMap} from './cinematic-map.js';
import {collateralBeat,civilianPose} from './frieza-cinematic.js';
import {radioPixels} from './native-radio.js';
import {createNativeCombustion} from './native-combustion.js';
import {cinematicRuin} from './cinematic-ruins.js';
export function createCollateralView(snes,{put,line,disc,rgb}){
 const maps=new Map(),cards=new Map(),ruins=new Map(),art={};let combustion=null;
 const ready=Promise.all((typeof Image==='undefined'?[]:['npcs','rabite']).map(async name=>{
  const img=new Image(),url=new URL(`../assets/sprites/${name}.png`,import.meta.url);url.search=new URL(import.meta.url).search;img.src=url;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data,pixels=new Uint16Array(c.width*c.height);
  for(let i=0;i<pixels.length;i++)if(data[i*4+3]>127)pixels[i]=rgb(data[i*4]>>3,data[i*4+1]>>3,data[i*4+2]>>3);art[name]={width:c.width,pixels};
 }));
 function blit(sheet,sx,sy,w,h,x,y,flip=false){if(!sheet)return;for(let py=0;py<h;py++)for(let px=0;px<w;px++){const c=sheet.pixels[(sy+py)*sheet.width+sx+(flip?w-1-px:px)];if(c)put(x+px,y+py,c);}}
 return{ready,draw(state){
  const beat=collateralBeat(state.age);if(!beat)return false;
  const {shot:s,age:t}=beat;let map=maps.get(s.map);if(!map){map=cinematicMap(snes.cart.data,s.map);maps.set(s.map,map);}
  let ruined=ruins.get(s.map);if(!ruined){ruined=cinematicRuin(map,s);ruins.set(s.map,ruined);}
  combustion??=createNativeCombustion(snes.cart.data);
  const dt=t-s.hit,pan=Math.min(12,Math.floor(t/24)),cx=s.x+pan,cy=s.y;
  const hitX=s.blast[0]-pan,hitY=s.blast[1],shake=dt>=0&&dt<12?(dt%4<2?-2:2):0;
  const red=t>85&&(t<110||t>130&&t<155)?5:t>155?2:0;
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
   let c=((dt>=0?ruined.pixels:map.pixels)[(y+cy)*map.width+x+cx]||1)-1;
   if(red)c=Math.min(31,(c&31)+red)|(Math.floor((c>>5&31)*.78)<<5)|(Math.floor((c>>10&31)*.82)<<10);
   put(x+shake,y,1+c);
  }
  // These source frames have uneven spacing. Explicit crop origins exclude
  // the partial neighbouring bodies produced by treating the sheet as a grid.
  const peopleFrames=[{up:[302,326,350,375],left:[403,428,450,472],down:[501,523,547,572],y:194},
   {up:[399,421,446,471],left:[302,325,347,369],down:[502,527,551,574],y:242}];
  s.people.forEach((route,i)=>{
   const p=civilianPose(route,t,i),frames=peopleFrames[i%2],direction=p.direction==='right'?'left':p.direction,frame=p.walking?Math.floor(t/6)%4:1;
   blit(art.npcs,frames[direction][frame],frames.y,24,40,p.x-pan-12,p.y-36,p.direction==='right');
  });
  if(s.rabite&&dt<0){const hop=t<100?Math.abs((t%36)-18)>>2:0;blit(art.rabite,4+(Math.floor(t/12)%2)*29,117,25,25,hitX-12,hitY-19-hop);}
  // Show a growing shadow / light for a full second before the arrival.
  if(t>=s.hit-50&&dt<0){const r=3+(50+dt)*.32;for(let i=0;i<48;i++){const a=i*Math.PI/24;put(hitX+Math.cos(a)*r,hitY+Math.sin(a)*r*.45,rgb(29,6,19));}}
  if(dt>=-12&&dt<13){
   const u=Math.min(1,(dt+12)/12),endX=-60+(hitX+60)*u,endY=-90+(hitY+90)*u;
   for(let w=-9;w<=9;w++)line(-60+w,-90,endX+w,endY,Math.abs(w)<4?rgb(31,30,31):rgb(25,5,27));
  }
  if(dt>=0){
   // Original Exploder cells expand in staggered, outward bursts. Only
   // exact OBJ flips/quarter turns; every color and pixel comes from ROM.
   for(let i=0;i<9;i++){
    const age=dt-i*3;if(age<0||age>=42)continue;
    const a=i*2.39996,spread=i?10+Math.min(age,14)*1.4:0;
    combustion('burst',Math.floor(age/6),hitX+Math.cos(a)*spread+shake,hitY+Math.sin(a)*spread*.65,put,{flip:!!(i&1),turn:i%4});
   }
   // A handful of roof fragments cut from the original map pixels.
   for(let i=0;i<16;i++){
    const a=i*2.39996,speed=.45+i%4*.22,x=hitX+Math.cos(a)*dt*speed,y=hitY+Math.sin(a)*dt*.35-dt*1.2+dt*dt*.018;
    if(dt<55)for(let py=-2;py<=2;py++)for(let px=-3;px<=3;px++)if(Math.abs(px)+Math.abs(py)<5){const c=map.pixels[(s.y+s.blast[1]+i%3*8+py)*map.width+s.x+s.blast[0]+i%5*6+px];if(c)put(x+px+shake,y+py,c);}
   }
   if(dt>9){
    for(const p of ruined.sites){const age=(dt+p.seed*3)%53;
     combustion('burst',Math.floor(age/7),p.x-cx+shake,p.y-cy-5,put,{flip:!!(p.seed&1)});
     // A few fireball embers fly to either side, rather than making every
     // fire a diagonal streak. Small intact frames keep the SNES pixel scale.
     if(age<24&&p.seed%2===0)combustion('ember',Math.floor(age/8),p.x-cx+(p.seed%3-1)*Math.floor(age/2),p.y-cy-age,put,{turn:p.seed%4});
    }
   }
  }
  // Leave the opening view unobstructed; react only after the impact.
  const text=dt>30?s.text:null;
  if(text){let card=cards.get(text);if(!card){card=radioPixels(snes.cart.data,text);cards.set(text,card);}for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=card[y*240+x];if(c)put(x+8,y+4,c);}}
  // Hold on the aftermath before the next cut.
  return true;
 }};
}
