// Browser references for the orbit tests, from the browser's own modules and
// formulas: engine/world-texture.js (texture), planet-view.js planet() and
// sky() (globe, rim, light bands, stars), engine/orbit-camera.js (parallax).
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writePng,blank} from '../../tools/gfx.mjs';
import {decodePlanetTexture} from '../../../engine/world-texture.js';
import {projectOrbitBackground} from '../../../engine/orbit-camera.js';
import {starList,starDepth,starColor} from '../../gen/orbit.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
let texture=null;
function tex(){
  if(!texture){let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));if(rom.length%0x8000===512)rom=rom.slice(512);texture=decodePlanetTexture(rom);}
  return texture;
}
const rgb=(r,g,b)=>r|(g<<5)|(b<<10);
export const SKY=rgb(0,0,2),BLUE=[rgb(4,7,20),rgb(6,17,30)];

// planet-view.js planet() into a 256x224 surface (0 = empty); classes:
// 1 disc, 2 rim.
export function planetSurface(camera,{night=true,flatLight=0}={}){
  const t=tex(),globe=new Uint16Array(256*224),cls=new Uint8Array(256*224);
  const target={x:Math.round(camera.lon/8)*8,y:Math.round(camera.lat/8)*8};
  const cx=Math.round(camera.x),cy=Math.round(camera.y),r=Math.round(camera.r),hitX=.62,hitY=-.69,hitZ=Math.sqrt(1-hitX*hitX-hitY*hitY);
  const lon=target.x/4096*Math.PI*2-Math.atan2(hitX,hitZ),lat=target.y/4096*Math.PI-Math.asin(hitY);
  for(let y=Math.max(0,cy-r-3);y<=Math.min(223,cy+r+3);y++)for(let x=Math.max(0,cx-r-3);x<=Math.min(255,cx+r+3);x++){
    const nx=(x-cx)/r,ny=(y-cy)/r,d=nx*nx+ny*ny;if(d>1.07)continue;
    let color;
    if(d>1){color=BLUE[d<1.035?1:0];cls[y*256+x]=2;}
    else{
      const z=Math.sqrt(1-d),wx=(lon+Math.atan2(nx,z))*4096/(Math.PI*2),wy=(lat+Math.asin(ny))*4096/Math.PI;
      const raw=t.sample(wx,wy,night),light=flatLight||Math.max(1,Math.min(4,Math.round((.35+z*.65-nx*.16-ny*.18)*4)));
      const shade=c=>(c*light)>>2;
      color=shade(raw&31)|(shade(raw>>5&31)<<5)|(shade(raw>>10&31)<<10);cls[y*256+x]=1;
    }
    globe[y*256+x]=color+1;
  }
  return {globe,cls};
}

// sky(): stars through projectOrbitBackground (camera with travel 0 unless given).
export function skyStars(camera,age=0){
  const out=[];
  for(const star of starList()){
    const point=camera?projectOrbitBackground({x:camera.x,y:camera.y,r:camera.r,travelX:camera.travelX??0,travelY:camera.travelY??0},star,starDepth(star)):star;
    const x=((point.x%256)+256)%256,y=((point.y%224)+224)%224;
    const twinkle=star.bright&&(age+star.phase)%240<9;
    out.push({x,y,color:starColor(star.shade),twinkle});
  }
  return out;
}

export function renderSpace(camera,{flatLight=0}={}){
  const px=new Uint16Array(256*224).fill(SKY);
  for(const s of skyStars(camera,camera.age??0)){
    const put=(x,y)=>{if(x>=0&&x<256&&y>=0&&y<224)px[y*256+x]=s.color;};
    put(s.x,s.y);if(s.twinkle){put(s.x-1,s.y);put(s.x+1,s.y);put(s.x,s.y-1);put(s.x,s.y+1);}
  }
  const {globe,cls}=planetSurface(camera,{flatLight});
  for(let i=0;i<globe.length;i++)if(globe[i])px[i]=globe[i]-1;
  const img=blank(256,224);
  for(let i=0;i<px.length;i++){const c=px[i];img.data[i*4]=(c&31)*255/31|0;img.data[i*4+1]=(c>>5&31)*255/31|0;img.data[i*4+2]=(c>>10&31)*255/31|0;img.data[i*4+3]=255;}
  return {px,cls,img,png:writePng(img)};
}

// Compare a Mesen screenshot with a reference (lines < maxLine). meanError
// is the mean absolute channel difference (0-1); edgeMismatch the share of
// pixels whose class (space / rim / disc) differs, judged from colour on
// the shot (rim blue, sky, anything else = disc) and geometry on the ref.
export function compareShots(shot,ref,{maxLine=224}={}){
  let err=0,n=0,mis=0,m=0;
  const H=Math.min(maxLine,shot.height,224);
  for(let y=0;y<H;y++)for(let x=0;x<256;x++){
    const i=(y*shot.width+x)*4,r=shot.data[i]>>3,g=shot.data[i+1]>>3,b=shot.data[i+2]>>3;
    const c=ref.px[y*256+x];
    err+=(Math.abs(r-(c&31))+Math.abs(g-(c>>5&31))+Math.abs(b-(c>>10&31)))/93;n++;
    const k=ref.cls[y*256+x];
    const shotCls=(r===6&&g===17&&b===30)?2:(r===0&&g===0&&b===2)?0:(r<=11&&g<=13&&b<=20&&b-r>=5)?-1:1;
    if(shotCls<0)continue;      // a star pixel: ignore
    m++;if(shotCls!==k&&!(k===2&&shotCls===2))mis++;
  }
  return {meanError:+(err/n).toFixed(4),edgeMismatch:+(mis/m).toFixed(4)};
}
