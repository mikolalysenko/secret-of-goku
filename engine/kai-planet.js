// Ending scenery and a small autonomous NPC. Its RNG and walk clock belong
// to the checkpoint, so restoring a conversation also restores Bubbles.
export const kaiActors={kai:{x:116,y:139},goku:{x:151,y:162}};
export function newKaiScene(){return{seed:0x4b4149,bubbles:{x:86,y:160,target:null,wait:40,direction:'down',step:0,walking:false}};}
function random(scene){scene.seed=(Math.imul(scene.seed,1664525)+1013904223)>>>0;return scene.seed/4294967296;}
export function onKaiLawn(x,y){return((x-128)/56)**2+((y-145)/35)**2<1&&Object.values(kaiActors).every(a=>Math.hypot(x-a.x,y-a.y)>14);}
export function tickKaiScene(scene){
 const b=scene.bubbles;b.walking=false;
 if(b.wait>0){b.wait--;return;}
 if(!b.target){
  for(let i=0;i<32;i++){
   const a=random(scene)*Math.PI*2,r=Math.sqrt(random(scene)),x=128+Math.cos(a)*52*r,y=145+Math.sin(a)*31*r;
   if(Math.hypot(x-b.x,y-b.y)<12)continue;
   // Do not plan a route through either speaker's feet.
   if(!Array.from({length:16},(_,j)=>onKaiLawn(b.x+(x-b.x)*(j+1)/16,b.y+(y-b.y)*(j+1)/16)).every(Boolean))continue;
   b.target={x,y};break;
  }
  if(!b.target){b.wait=20;return;}
 }
 const dx=b.target.x-b.x,dy=b.target.y-b.y,d=Math.hypot(dx,dy);
 if(d<.5){b.target=null;b.wait=35+Math.floor(random(scene)*100);return;}
 b.x+=dx/d*.42;b.y+=dy/d*.42;b.walking=true;b.step++;
 b.direction=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
}

export function createKaiArt(){
 let background=null,sprites=null;
 const ready=Promise.all(['kai-planet.png','kai-npcs.png'].map(async(file,index)=>{
  const image=new Image(),url=new URL(`../assets/sprites/${file}`,import.meta.url);url.search=new URL(import.meta.url).search;image.src=url.href;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=index?image.width:256;canvas.height=index?image.height:224;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,pixels=new Uint16Array(canvas.width*canvas.height);
  for(let i=0;i<pixels.length;i++)if(!index||rgba[i*4+3]>=128)pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  if(!index){background=pixels;return;}
  const frames=[];
  for(let i=0;i<16;i++){
   // Kai's boots extend a few source pixels below his row. Include them
   // in Kai's cells and exclude those pixels from Bubbles' first row.
   const x0=Math.round(i%4*canvas.width/4),x1=Math.round((i%4+1)*canvas.width/4),y0=Math.round((i>>2)*canvas.height/4)+(i>=4&&i<8?32:0),y1=Math.round(((i>>2)+1)*canvas.height/4)+(i<4?16:0);
   let x=x1,y=y1,right=x0,bottom=y0;
   for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(pixels[yy*canvas.width+xx]){x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
   frames.push({x,y,w:right-x+1,h:bottom-y+1});
  }
  sprites={pixels,width:canvas.width,frames,scale:[32/Math.max(...frames.slice(0,4).map(f=>f.h)),22/Math.max(...frames.slice(4).map(f=>f.h))]};
 }));
 return{ready,backdrop(surface){if(background)surface.set(background);},npc(frame,x,y,put,flip=false){
  if(!sprites)return;const a=sprites,f=a.frames[frame],scale=a.scale[frame<4?0:1],w=Math.round(f.w*scale),h=Math.round(f.h*scale);
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
   const c=a.pixels[(f.y+Math.floor(yy*f.h/h))*a.width+f.x+Math.floor((flip?w-1-xx:xx)*f.w/w)];if(c)put(x-Math.floor(w/2)+xx,y-h+yy,c);
  }
 }};
}
