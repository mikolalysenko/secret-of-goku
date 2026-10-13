// Original USA native cut-map pipeline. Destruction changes the live collision
// grid and queues the original tilemap/DMA redraw, including BG2 obstacles.
// No ROM patches, graphics bytes, direct VRAM writes or forced CPU calls.
// Traced C1:D293..D429; C0:C7C3 consumes the redraw queue; C0:B565 drains SFX.
export function createNativePlants(snes,{canCut=null,onCut=null,sceneryReplacement=null}={}){
 const cpu=snes.cpu,priorCycle=cpu.cycle,r=snes.ram;
 const read16=a=>r[a]|r[a+1]<<8;
 let queue=[],lastFrame=-1,done=[];
 const ground=()=>canCut?canCut():r[0xe4]===1&&r[0xe5]===1&&r[0xd0]===0&&(r[0xec]&0xfe)===0&&(r[0xed]&0x40)===0&&r[0x2c]===0;
 const layer=()=>r[0xe00b]&0x80?1:0;
 const metadata=(tx,ty,l=layer())=>{
  if(!Number.isInteger(tx)||!Number.isInteger(ty)||tx<0||tx>=128||ty<0||ty>=128||!(l===0||l===1))return null;
  const address=0x10000+l*0x4000+ty*128+tx,tile=r[address],descriptor=0x1b800+l*0x400+tile*4;
  return{tx,ty,layer:l,address,tile,descriptor,flags:r[descriptor],behavior:r[descriptor+1],code:r[descriptor+2],replacement:r[descriptor+3],kind:r[descriptor+2]&15};
 };
 const eligible=(tile,policy)=>{
  if(!tile||(tile.code&0xf0)!==0xc0||tile.tile===tile.replacement)return false;
  if(policy==='all-native')return tile.kind<=11;
  if(policy==='objects'){
   if(tile.kind>11)return false;
   // Native axe rocks, stalagmites, plants and staged barriers all name
   // their next tile. Reject cycles: C1 switches toggle rather than break.
   const descriptors=tile.descriptor-tile.tile*4,seen=new Set([tile.tile]);
   let next=tile.replacement;
   for(let i=0;i<16;i++){
    if(seen.has(next))return false;seen.add(next);
    const at=descriptors+next*4,code=r[at+2];
    if((code&0xf0)!==0xc0)return true;
    if((code&15)>11)return false;next=r[at+3];
   }
   return false;
  }
  if(policy==='sword')return tile.kind===1||tile.kind===8||tile.kind===11;
  // Plants: native sword/axe bushes, and tall-grass C1->0. Do not toggle
  // C1 switches (tileset1 tiles171/172) as though they were ordinary grass.
  return tile.kind===8||(tile.kind===1&&tile.replacement===0);
 };
 const breakable=(tile,policy)=>{
  if(eligible(tile,policy))return tile;
  const replacement=policy==='objects'&&tile?sceneryReplacement?.(tile):null;
  return Number.isInteger(replacement)&&replacement>=0&&replacement<256&&replacement!==tile.tile?{...tile,replacement,kind:8}:null;
 };
 function enqueueTiles(tiles,{policy='plants'}={}){
  if(!ground())return[];
  const map=read16(0xdc),added=[];
  for(const t of tiles){const item=breakable(metadata(t.tx,t.ty,t.layer??layer()),policy);
   if(!item||queue.some(q=>q.map===map&&q.address===item.address))continue;
   if(queue.length>=128)break;
   const queued={...item,map,frame:snes.frames,policy};queue.push(queued);added.push(queued);
  }
  return added;
 }
 function beam({x,y,dx,dy,length=180,halfWidth=12,taper=0,policy='plants',collisionLayer=layer()}){
  const norm=Math.hypot(dx,dy);if(!norm||![x,y,dx,dy,length,halfWidth].every(Number.isFinite))return[];
  dx/=norm;dy/=norm;length=Math.max(0,Math.min(640,length));halfWidth=Math.max(0,Math.min(80,halfWidth));
  const endX=x+dx*length,endY=y+dy*length,tiles=[];
  const x0=Math.max(0,Math.floor((Math.min(x,endX)-halfWidth-8)/16)),x1=Math.min(127,Math.floor((Math.max(x,endX)+halfWidth+8)/16));
  const y0=Math.max(0,Math.floor((Math.min(y,endY)-halfWidth-8)/16)),y1=Math.min(127,Math.floor((Math.max(y,endY)+halfWidth+8)/16));
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
   const ox=tx*16+8-x,oy=ty*16+8-y,along=ox*dx+oy*dy,across=Math.abs(ox*dy-oy*dx);
   // Rectangle against a conservative tile bounding box; never expand into
   // non-cuttable tiles. Return accepted tiles for visual debris placement.
   const width=halfWidth*(taper?Math.min(1,(Math.max(0,along)+8)/taper):1);
   if(along>=-8&&along<=length+8&&across<=width+8)tiles.push({tx,ty,layer:collisionLayer,along});
  }
  tiles.sort((a,b)=>a.along-b.along||a.ty-b.ty||a.tx-b.tx);
  return enqueueTiles(tiles,{policy});
 }
 cpu.cycle=function(){
  const boundary=(this.r[1]===0||this.r[1]===0xc0)&&this.br[4]===0xc7c3&&this.cyclesLeft===0;
  if(boundary&&queue.length&&lastFrame!==snes.frames&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)){
   const map=read16(0xdc);
   queue=queue.filter(item=>item.map===map&&snes.frames-item.frame<90);
   const signature=[0xe2,0x30,0xa5,0x2e].every((v,i)=>snes.cart?.data[0xc7c3+i]===v);
   if(!ground())queue=[];
   else if(signature&&r[0x82]===0&&r[0x2e]===0){
    while(queue.length){
     const first=queue.shift(),now=breakable(metadata(first.tx,first.ty,first.layer),first.policy);
     if(!now||now.tile!==first.tile)continue;
     const group=[first],rest=[];for(const item of queue)(item.layer===first.layer&&item.ty===first.ty?group:rest).push(item);queue=rest;
     const changed=[];
     for(const item of group){const cur=breakable(metadata(item.tx,item.ty,item.layer),item.policy);if(!cur||cur.tile!==item.tile)continue;r[cur.address]=cur.replacement;changed.push(cur);}
     if(!changed.length)continue;
     const scrollY=read16(first.layer?0xae:0xaa),mapHeight=read16(0xc2),worldY=first.ty*16+8;
     let screenY=worldY-scrollY;if(screenY<0)screenY+=mapHeight;
     // Original buffer has 256 scanlines. Offscreen changes need no upload:
     // the native scroll loader fetches our updated map bytes on arrival.
     const visible=screenY>=0&&screenY<240;
     if(visible){r[0x82]=first.layer?0x80:1;r[0x83]=screenY&255;}
     const sound=changed.find(item=>item.replacement!==0xc1);
     if(sound&&visible&&(r[0x95]&0x80)===0){
      r[0x95]=(0xd8+sound.kind)&255;
      const sx=Math.max(0,Math.min(255,sound.tx*16+8-read16(sound.layer?0xac:0xa8))),pan=(sx&0xf0)|(sx>>4);
      r[0x118]=sx&0xf0;r[0x119]=pan;
     }
     lastFrame=snes.frames;const result={map,frame:snes.frames,tiles:changed,visible,screenY};done.push(result);if(done.length>16)done.shift();onCut?.(result);break;
    }
   }
  }
  return priorCycle.call(this);
 };
 return{beam,enqueueTiles,metadata,eligible,snapshot:()=>({queue:structuredClone(queue),lastFrame,done:structuredClone(done)}),restore(state){queue=state?.queue||[];lastFrame=state?.lastFrame??-1;done=state?.done||[];},clear(){queue=[];},dispose(){cpu.cycle=priorCycle;queue=[];},get pending(){return queue.length;},get completed(){return done;}};
}
