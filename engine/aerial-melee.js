import {cosmicBeat} from './frieza-cinematic.js';
import {drawFriezaSprite} from './frieza-sprite.js';
import {createOrbitEffects} from './orbit-effects.js';

// Original world-flight cloud strips: C6:2000 4bpp tiles, native BG1 assembly.
// This is address/layout metadata, not extracted cartridge graphics.
const cloudRows=[[17,18,19,20,21,21,22,48,49,50,51,52,53,54,55],[33,34,35,36,66,67,65,64,65,66,67,68,69,70,0]];
export function nativeCloud(rom){
 const pixels=new Uint8Array(120*16);
 cloudRows.forEach((row,ty)=>row.forEach((id,tx)=>{
  if(!id)return;const at=0x62000+id*32;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   let color=0;for(let plane=0;plane<4;plane++)color|=((rom[at+(plane>>1)*16+y*2+(plane&1)]>>(7-x))&1)<<plane;
   pixels[(ty*8+y)*120+tx*8+x]=color;
  }
 }));return pixels;
}
const positions=[[106,100],[190,64],[58,154],[154,122],[78,66],[198,148],[116,82],[66,118]];
export function aerialMeleePose(shot,age){
 const end=shot.impact-30,active=age>=30&&age<end,t=Math.max(0,age-30);
 // A held establishment, then progressively shorter teleport/impact beats.
 const beat=t<60?20:t<120?14:shot.intensity?8:10;
 const index=t<60?Math.floor(t/20):t<120?3+Math.floor((t-60)/14):7+Math.floor((t-120)/beat);
 const phase=(t<60?t:t<120?t-60:t-120)%beat,[x,y]=positions[index%positions.length];
 return{active,index,phase,beat,x,y,hit:active&&phase===5,teleport:active&&phase===0,explode:age===shot.impact,cloudSpeed:age<60?2:age<120?4:shot.intensity?9:6};
}
export function createAerialMeleeView(snes,mod,{put,rgb,flash}){
 let clouds=null;const fx=createOrbitEffects(snes,mod,put);
 const color=Array.from({length:16},(_,i)=>rgb(Math.min(31,12+i),Math.min(31,16+i),Math.min(31,22+(i>>1))));
 function goku(column,row,x,y,ghost=false){
  const a=mod.spriteLayer.atlas.ssj;if(!a)return;
  for(let py=0;py<32;py++)for(let px=0;px<32;px++){
   const c=a.pixels[(32+row*32+py)*a.width+column*32+px];if(c&&(!ghost||(px+py)%3===0))put(x+px-16,y+py-16,c);
  }
 }
 return function draw(state){
  const beat=cosmicBeat(state.age);if(beat?.shot.kind!=='aerial')return false;
  const {shot,age}=beat,p=aerialMeleePose(shot,age),blast=age-shot.impact;
  clouds??=nativeCloud(snes.cart.data);
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){const band=y>>5;put(x,y,rgb(3+band,5+band,12+band));}
  // Two tiled cloud planes: all integer scroll and exact 1x/2x source pixels.
  // Integrate speed by segment so acceleration never jumps the cloud origin.
  const travel=Math.min(age,60)*2+Math.max(0,Math.min(age-60,60))*4+Math.max(0,age-120)*(shot.intensity?9:6);
  for(let layer=0;layer<2;layer++)for(let i=0;i<6;i++){
   const scale=layer+1,scroll=Math.floor(travel/(layer?1:3)),left=((i*97-scroll)%416+416)%416-160,top=((i*47+layer*23+Math.floor(travel/(layer?7:16)))%256)-32;
   for(let y=0;y<16*scale;y++)for(let x=0;x<120*scale;x++){
    const c=clouds[Math.floor(y/scale)*120+Math.floor(x/scale)];if(c)put(left+x,top+y,color[c]);
   }
  }
  if(age<30){goku(34,2,68,128);drawFriezaSprite(mod.frieza.portraitAtlas,4,190,102,put,{flip:true});}
  else if(p.active){
   const side=p.index&1?-1:1,attack=p.phase>=4&&p.phase<=8,kick=p.index%3===2;
   if(p.phase<3){fx.stamp('impact-spark',p.phase,p.x-18*side,p.y);fx.stamp('gold-spark',p.phase,p.x+18*side,p.y);}
   else{
    const column=attack?(kick?16:12):34;
    goku(column,side>0?2:1,p.x-18*side,p.y);
    drawFriezaSprite(mod.frieza.portraitAtlas,attack?(p.index&1?5:6):4,p.x+18*side,p.y+19,put,{flip:side>0});
    if(attack){fx.stamp('impact-spark',p.phase-4,p.x,p.y);if(p.phase===5)flash(.16);}
   }
  }else if(blast<0){
   const t=age-(shot.impact-30),gap=Math.max(10,60-t*2);
   fx.aura(128-gap,112,age,{height:32});fx.aura(128+gap,112,age,{height:40,tone:'pink',seed:5});
   goku(12,2,128-gap,112);drawFriezaSprite(mod.frieza.portraitAtlas,5,128+gap,131,put,{flip:true});
  }else{
   // One escalating detonation, then a visible cloud-filled aftermath.
   fx.burst(128,112,blast,{large:true});
   if(shot.intensity)for(let i=0;i<4;i++)if(blast>=10+i*5)fx.burst(128+(i&1?1:-1)*(28+i*10),112+(i<2?-1:1)*22,blast-10-i*5,{large:true});
   if(blast<4)flash((1-blast/4)*.8);
   if(blast>42){goku(36+((age>>2)&3),3,112,112-(blast-42)*5);drawFriezaSprite(mod.frieza.portraitAtlas,5,150,136-(blast-42)*5,put,{flip:true});}
  }
  return true;
 };
}
