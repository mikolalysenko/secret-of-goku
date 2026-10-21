// Browser references for the cosmic montage (the second surge's cinematic):
// the browser's own frieza-collateral-view.js draws a town shot, and
// aerial-melee.js an aerial cut, into a 256x224 surface (the town over the
// sky planet-view.js's cosmicBattle paints first; the aerial cut paints
// every pixel). The people's and the rabite's art (assets/sprites/npcs.png,
// rabite.png) reach the collateral view through a small Image / canvas
// stand-in reading the PNGs; the aerial cut's sprite layer is built as the
// browser builds it (sprite-layer.js for the Super Saiyan sheet,
// native-effects.js for the sparks, bursts and auras, frieza-sprite.js's
// prepared full-power sheet), and its flash is planet-view.js's.
//   const ref=await montageRef(); ref.town(surgeAge) / ref.aerial(surgeAge) -> {px, png}
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

// Image / canvas stand-ins: decode() reads the PNG the src names; the 2d
// context hands its pixels back through getImageData.
function installImage(){
  if(globalThis.Image?.montageRef)return;
  class Img{static montageRef=true;set src(v){this._src=String(v);}get src(){return this._src;}
    decode(){const u=new URL(this._src);u.search='';const p=readPng(fileURLToPath(u));this.width=p.width;this.height=p.height;this.png=p;return Promise.resolve();}}
  globalThis.Image=Img;
  globalThis.document={createElement:()=>{const c={width:0,height:0,img:null,getContext:()=>({drawImage(img){c.img=img;},getImageData:(x,y,w,h)=>({data:c.img.png.data})})};return c;}};
}

export async function montageRef(){
  installImage();
  let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  if(rom.length%0x8000===512)rom=rom.slice(512);
  const {createCollateralView}=await import(resolve(repo,'engine/frieza-collateral-view.js'));
  const {createAerialMeleeView}=await import(resolve(repo,'engine/aerial-melee.js'));
  const {createNativeEffects}=await import(resolve(repo,'engine/native-effects.js'));
  const {atlas,friezaFull}=await import(resolve(repo,'snes/gen/orbit-sprites.mjs'));
  const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
  let surface=new Uint16Array(256*224);
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(c>0&&x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
  const line=(x,y,xx,yy,c)=>{const steps=Math.ceil(Math.max(Math.abs(xx-x),Math.abs(yy-y)));for(let i=0;i<=steps;i++)put(x+(xx-x)*i/(steps||1),y+(yy-y)*i/(steps||1),c);};
  const disc=(x,y,r,c)=>{for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)put(x+xx,y+yy,c);};
  // planet-view.js flash (not native): every pixel toward (28, 30, 31)
  const pale=(color,alpha)=>{const c=color-1,mix=(n,t)=>Math.round(n+(t-n)*alpha);return rgb(mix(c&31,28),mix(c>>5&31,30),mix(c>>10&31,31));};
  const flash=alpha=>{for(let i=0;i<surface.length;i++)surface[i]=pale(surface[i],alpha);};
  const view=createCollateralView({cart:{data:rom}},{put,line,disc,rgb});
  await view.ready;
  const effects=createNativeEffects(rom,JSON.parse(readFileSync(resolve(repo,'engine/native-effects.json'),'utf8')));
  const {frieza}=await friezaFull(repo);
  const mod={spriteLayer:{atlas:{ssj:atlas(repo,'ssj')},effects},frieza:{portraitAtlas:frieza}};
  const aerial=createAerialMeleeView({cart:{data:rom}},mod,{put,rgb,flash});
  const picture=()=>{
    const px=Uint16Array.from(surface,v=>v?v-1:0);
    const img=blank(256,224);
    for(let i=0;i<px.length;i++){const c=px[i];img.data[i*4]=(c&31)*255/31|0;img.data[i*4+1]=(c>>5&31)*255/31|0;img.data[i*4+2]=(c>>10&31)*255/31|0;img.data[i*4+3]=255;}
    return {px,png:writePng(img)};
  };
  return {
    // a town shot at surge age `age` (null outside the town shots)
    town(age){
      surface=new Uint16Array(256*224).fill(rgb(0,0,2));
      if(!view.draw({age}))return null;
      return picture();
    },
    // an aerial cut at surge age `age` (null outside them)
    aerial(age){
      surface=new Uint16Array(256*224);
      if(!aerial({age}))return null;
      return picture();
    },
  };
}

// The share of pixels of a Mesen screenshot equal to the reference (RGB555),
// the rows given only.
export function matchShare(shot,ref,{y0=0,y1=224}={}){
  let same=0,n=0;
  for(let y=y0;y<y1;y++)for(let x=0;x<256;x++){
    const i=(y*shot.width+x)*4,r=shot.data[i]>>3,g=shot.data[i+1]>>3,b=shot.data[i+2]>>3,c=ref.px[y*256+x];
    n++;if(r===(c&31)&&g===(c>>5&31)&&b===(c>>10&31))same++;
  }
  return same/n;
}
