// A native whip route is a pad, a post four tiles away and usable ground
// beyond both ends. Only that narrow corridor becomes airspace: the same
// pit/cliff metatiles elsewhere still bound the map.
import {floorTileEvent} from './native-barriers.js';

export function createNativeWhipRoutes(snes){
 const r=snes.ram,word=a=>r[a]|r[a+1]<<8;
 const mod={snes,read8:a=>r[a],read16:word};
 function tileAt(tx,ty,layer){
  if(tx<0||ty<0||tx>=Math.min(128,word(0xc0)/16)||ty>=Math.min(128,word(0xc2)/16))return null;
  const tile=r[0x10000+layer*0x4000+ty*128+tx],a=0x1b800+layer*0x400+tile*4;
  return{tx,ty,layer,tile,flags:r[a],behavior:r[a+1],code:r[a+2],replacement:r[a+3]};
 }
 const post=t=>t?.code===0xf8&&t.replacement===0x6f;
 function pad(t){
  if(!t||t.code!==0||(t.flags&7)>2||t.flags&8)return false;
  // Special-tile mode one assigns BF to the whip pad without an ordinary
  // per-location trigger. Other special modes must not inherit that meaning.
  return (r[0xb8]&3)===1&&t.tile===0xbf&&t.behavior===0x46||floorTileEvent(mod,t)===0x6d8;
 }
 const shore=t=>t&&t.code===0&&(t.flags&7)<3&&!(t.flags&8)&&!(t.behavior&0x90);
 function span(p,dx,dy){
  if(!shore(tileAt(p.tx-dx,p.ty-dy,p.layer))||!shore(tileAt(p.tx+dx*5,p.ty+dy*5,p.layer)))return false;
  for(let n=1;n<4;n++){
   const t=tileAt(p.tx+dx*n,p.ty+dy*n,p.layer);
   if(!t||t.code!==0||t.flags&8||t.behavior&0x90)return false;
  }
  return true;
 }
 function route(p,dx,dy){
  if(!pad(p)||!span(p,dx,dy))return false;
  const end=tileAt(p.tx+dx*4,p.ty+dy*4,p.layer);
  if(post(end))return true;
  // Shade and Grand Palace each omit one post on a paired return lane.
  // Require its actual pad, clear destination and a complete adjacent
  // reverse crossing; an isolated pad cannot open arbitrary cliff faces.
  if(!shore(end))return false;
  return [-1,1].some(side=>{
   const back=tileAt(end.tx-dy*side,end.ty+dx*side,p.layer),anchor=tileAt(p.tx-dy*side,p.ty+dx*side,p.layer);
   return pad(back)&&post(anchor)&&span(back,-dx,-dy);
  });
 }
 function crossable(t){
  if(!t||!Number.isInteger(t.tx)||!Number.isInteger(t.ty)||t.code!==0&&!post(t))return false;
  for(const [dx,dy]of[[0,-1],[0,1],[-1,0],[1,0]])for(let n=0;n<=4;n++){
   if(route(tileAt(t.tx-dx*n,t.ty-dy*n,t.layer),dx,dy))return true;
  }
  return false;
 }
 return{pad,route,crossable};
}
