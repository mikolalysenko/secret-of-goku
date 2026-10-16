import {dragonBallPalaces} from './dragon-quest.js';
import {worldAim,worldDelta} from './world-ki.js';
import {radioPixels} from './native-radio.js';

// Native world takeoff entries: entrances, not interior-room placeholders.
export const radarPalaces=[
 {map:136,hint:'Visit Luka and the seed.'},
 {map:25,hint:"Below Gaia's Navel. Gnome."},
 {map:47,hint:'Beyond the Sprite Village.'},
 {map:90,hint:'West of Kakkara. Go inside.'},
 {map:113,hint:'Gold City tower. Go up.'},
 {map:61,hint:'Cave west of Mandala.'},
 {map:95,hint:'Fly across the starry sea.'},
];
const route=[0,1,2,3,5,4,6];
export function radarTarget(rom,quest,{fortressDestroyed=false,fortress={x:0,y:0},frieza=null}={}){
 if(frieza?.needsTree)return{id:'mana-tree',name:'Mana Tree / Pure Land',hint:'Chase Frieza. Save the Tree.',x:rom[0x67a80+198*2]*16,y:rom[0x67a81+198*2]*16};
 const index=route.find(i=>!(quest.mask&(1<<i)));
 if(index!==undefined){const {map,hint}=radarPalaces[index];return{id:index,name:`${dragonBallPalaces[index]} Palace`,hint,x:rom[0x67a80+map*2]*16,y:rom[0x67a81+map*2]*16};}
 if(frieza?.stolen)return{id:'frieza',name:'Frieza / Fortress',hint:'Keep eighth. Confront him.',...fortress};
 if(frieza?.eligible)return{id:'dryad',name:'Tree Palace',hint:'See Dryad before the wish.',x:rom[0x67a80+195*2]*16,y:rom[0x67a81+195*2]*16};
 if(quest.wished)return null;
 if(quest.seedMask===127&&frieza?.stage==='dormant')return{id:'dryad',name:'Tree Palace',hint:'See Dryad before the wish.',x:rom[0x67a80+195*2]*16,y:rom[0x67a81+195*2]*16};
 return{id:'finale',name:fortressDestroyed?'Mana Beast':'Mana Fortress',hint:'All seven! Time to fix this.',...fortress};
}
export function radarBearing(origin,heading,target){
 const aim=worldAim(origin,heading,target),distance=Math.hypot(worldDelta(target.x,origin.x),worldDelta(target.y,origin.y));
 const angle=Math.atan2(aim.across,aim.along);
 return{...aim,distance,angle,guide:distance<100?'LAND HERE':Math.abs(angle)<.2?'AHEAD':Math.abs(angle)>2.7?'TURN AROUND':angle<0?'LEFT':'RIGHT'};
}
export function createDragonRadar(snes,mod){
 const p=snes.ppu,previous=p.getColor,word=a=>snes.ram[a]|snes.ram[a+1]<<8;
 let frame=-1,visible=false,target=null,bearing=null,panel=null,panelKey='',dial=null;
 function update(){
  frame=mod.frame;
  visible=mod.options.enabled&&mod.gokuActive&&mod.worldFlight&&!p.forcedBlank&&!(snes.ram[0xfe]&0xc0)&&!(snes.ram[0xe2]&1)&&!snes.ram[0x8c]&&!mod.flight?.docking&&!mod.radio?.status.visible&&!mod.charging&&!mod.worldKi?.status.shot&&!mod.worldKi?.status.explosion;
  if(!visible)return;
  const quest=mod.quest.status;
  target=radarTarget(snes.cart.data,quest,{frieza:mod.frieza?.status,fortressDestroyed:mod.worldKi?.status.fortressDestroyed,fortress:{x:word(0x128),y:word(0x12a)}});
  if(!target){visible=false;return;}
  bearing=radarBearing({x:word(0xfa)&4095,y:word(0xfc)&4095},word(0xf6),target);
  const text=`RADAR ${quest.stolen?'8TH BALL':`${quest.count}/7`}  ${bearing.guide}\nNext: ${target.name}\n${mod.frieza?.crisisActive?'CORE: 5 MINUTES REMAIN':target.hint}`;
  if(text!==panelKey){panelKey=text;panel=radioPixels(snes.cart.data,text);}
  dial=new Uint16Array(48*48);
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<48&&y>=0&&y<48)dial[y*48+x]=c+1;};
  // Pixel-stepped rings, a sweep and a blinking dot use SNES RGB555 colors.
  for(let y=0;y<48;y++)for(let x=0;x<48;x++){
   const d=Math.hypot(x-24,y-24);
   if(d<23)put(x,y,d>=21?0x739c:0x0440);
   if(d<20&&(Math.abs(d-10)<.6||x===24||y===24))put(x,y,0x1102);
  }
  const sweep=mod.frame*.045;
  for(let d=1;d<20;d++)put(24+Math.sin(sweep)*d,24-Math.cos(sweep)*d,0x2284);
  const radius=Math.min(18,bearing.distance/50),x=24+Math.sin(bearing.angle)*radius,y=24-Math.cos(bearing.angle)*radius;
  if(mod.frame%30<22)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)put(x+dx,y+dy,0x03ff);
  put(24,24,0x7fff);put(24,4,0x7fff);
 }
 p.getColor=function(sub,x,y){
  const color=previous.call(this,sub,x,y);
  if(sub||!mod.worldFlight||!(x>=8&&x<56&&y>=8&&y<56||x>=8&&x<248&&y>=152&&y<216))return color;
  if(frame!==mod.frame)update();if(!visible)return color;
  const pixel=y<56?dial[(y-8)*48+x-8]:panel[(y-152)*240+x-8];
  return pixel?[pixel-1,4,0x86]:color;
 };
 const overlayLine=new Uint16Array(256);
 p.registerLineHook?.('getColor',p.getColor,previous,(ppu,line)=>{
  if(!mod.worldFlight||!(line>=8&&line<56||line>=152&&line<216))return true;
  if(frame!==mod.frame)update();return !visible;
 },(ppu,line,plan)=>{
  if(plan.overlay)return false;
  overlayLine.fill(0);
  if(line<56)for(let x=8;x<56;x++)overlayLine[x]=dial[(line-8)*48+x-8];
  else for(let x=8;x<248;x++)overlayLine[x]=panel[(line-152)*240+x-8];
  plan.overlay=overlayLine;return true;
 });
 return{get status(){update();return{visible,target,bearing};},dispose(){p.getColor=previous;}};
}
