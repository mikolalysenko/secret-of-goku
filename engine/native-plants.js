// Original USA native cut-map pipeline. Destruction changes the live collision
// grid and queues the original tilemap/DMA redraw, including BG2 obstacles.
// No ROM patches, graphics bytes, direct VRAM writes or forced CPU calls.
// Traced C1:D293..D429; C0:C7C3 consumes the redraw queue; C0:B565 drains SFX.
import {palaceBraziers, brazierPart} from './palace-braziers.js';
export function createNativePlants(snes,{canCut=null,onCut=null,sceneryReplacement=null,demolitionPlan=null,demolishes=policy=>policy==='super-beam'}={}){
 const cpu=snes.cpu,priorCycle=cpu.cycle,r=snes.ram;
 const read16=a=>r[a]|r[a+1]<<8;
 let queue=[],lastFrame=-1,done=[],cleared=new Map(),cutMap=null;
 const ground=()=>canCut?canCut():r[0xe4]===1&&r[0xe5]===1&&r[0xd0]===0&&(r[0xec]&0xfe)===0&&(r[0xed]&0x40)===0&&r[0x2c]===0;
 const layer=()=>r[0xe00b]&0x80?1:0;
 const objectPolicy=policy=>['objects','beam','super-beam'].includes(policy);
 const brazierPolicy=policy=>policy==='super-beam'||policy==='beam'&&[269,276,312,313,314].includes(read16(0xdc));
 // The palace braziers are complete 2x3 native BG1 objects. Removing their
 // transparent base reveals the existing BG2 floor/rug; no replacement art
 // is synthesized. Match all six cells before accepting a grazing beam hit.
 function brazierReplacement(tile){
  const rom=snes.cart?.data,map=read16(0xdc);if(!rom||map>=512||tile.layer!==0)return null;
  const at=0x87000+map*2,header=0x80000+(rom[at]|rom[at+1]<<8);
  return (rom[header+2]&127)===23&&tile.code===0&&brazierPart(tile.tile)>=0?186:null;
 }
 function brazierGroup(tile){
  if(brazierReplacement(tile)===null)return null;
  for(const pattern of palaceBraziers){const index=pattern.indexOf(tile.tile);if(index<0)continue;
   const x=tile.tx-index%2,y=tile.ty-Math.floor(index/2),cells=pattern.map((id,i)=>metadata(x+i%2,y+Math.floor(i/2),0));
   if(cells.every((cell,i)=>cell&&cell.tile===pattern[i]&&cell.code===0))return cells.map(cell=>({...cell,brazier:{x,y}}));
  }
  return null;
 }
 const metadata=(tx,ty,l=layer())=>{
  if(!Number.isInteger(tx)||!Number.isInteger(ty)||tx<0||tx>=128||ty<0||ty>=128||!(l===0||l===1))return null;
  const address=0x10000+l*0x4000+ty*128+tx,tile=r[address],descriptor=0x1b800+l*0x400+tile*4;
  return{tx,ty,layer:l,address,tile,descriptor,flags:r[descriptor],behavior:r[descriptor+1],code:r[descriptor+2],replacement:r[descriptor+3],kind:r[descriptor+2]&15};
 };
 const eligible=(tile,policy)=>{
  if(!tile||(tile.code&0xf0)!==0xc0||tile.tile===tile.replacement)return false;
  if(policy==='all-native')return tile.kind<=11;
  if(objectPolicy(policy)){
   if(tile.kind>11)return false;
   // Native axe rocks, stalagmites, plants and staged barriers all name
   // their next tile. Reject cycles: rotating scenery needs a verified
   // replacement from sceneryReplacement instead of endlessly toggling.
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
  // Plants: native sword/axe bushes, and tall-grass C1->0. Do not rotate
  // C1 carved heads (tileset1 tiles171/172) as though they were grass.
  return tile.kind===8||(tile.kind===1&&tile.replacement===0);
 };
 const breakable=(tile,policy)=>{
  if(eligible(tile,policy)){
   if(!objectPolicy(policy))return tile;
   // One Saiyan strike clears every damage stage of an axe/sword obstacle.
   // Eligibility has already rejected cycles and non-destructible switches.
   const descriptors=tile.descriptor-tile.tile*4;let replacement=tile.replacement;
   while((r[descriptors+replacement*4+2]&0xf0)===0xc0)replacement=r[descriptors+replacement*4+3];
   return{...tile,replacement};
  }
  const replacement=objectPolicy(policy)&&tile?(sceneryReplacement?.(tile)??(brazierPolicy(policy)?brazierReplacement(tile):null)):null;
  return Number.isInteger(replacement)&&replacement>=0&&replacement<256&&replacement!==tile.tile?{...tile,replacement,kind:8}:null;
 };
 function enqueueTiles(tiles,{policy='plants',attack={}}={}){
  if(!ground())return[];
  const map=read16(0xdc),added=[];
  const expanded=[];
  for(const t of tiles){
   const tile=metadata(t.tx,t.ty,t.layer??layer());
   if(brazierPolicy(policy)&&tile&&brazierReplacement(tile)!==null)expanded.push(...(brazierGroup(tile)??[]));
   else expanded.push(t);
  }
  for(const t of expanded){const item=breakable(metadata(t.tx,t.ty,t.layer??layer()),policy);
   if(!item||queue.some(q=>q.map===map&&q.address===item.address))continue;
   if(queue.length>=128)break;
   const queued={...item,...(t.brazier?{brazier:t.brazier}:{}),map,frame:snes.frames,policy};queue.push(queued);added.push(queued);
  }
  if(demolitionPlan&&demolishes(policy)){
   const unused=tiles.filter(t=>!queue.some(q=>q.map===map&&q.tx===t.tx&&q.ty===t.ty&&q.layer===(t.layer??layer())));
   for(const item of demolitionPlan(unused,attack)){
    if(queue.length>=128)break;
    if(queue.some(q=>q.map===map&&q.address===item.address))continue;
    const queued={...item,map,frame:snes.frames,policy};if(!queuedTile(queued))continue;queue.push(queued);added.push(queued);
   }
  }
  return added;
 }
 function queuedTile(item){
  const now=metadata(item.tx,item.ty,item.layer);
  if(!item.demolition){const next=breakable(now,item.policy);return next&&{...next,...(item.brazier?{brazier:item.brazier}:{})};}
  if(!now||now.tile!==item.tile||now.flags!==item.flags||now.behavior!==item.behavior||now.code!==0||item.code!==0||now.flags&8||now.behavior&0xd0||!Number.isInteger(item.replacement)||item.replacement<0||item.replacement>191)return null;
  // A scene may have rebuilt the room between impact and this DMA slot.
  // Its original two floors must still exist; never replay an obsolete hole.
  if(!item.witnesses?.length||item.witnesses.some(w=>r[w.address]!==w.tile||r[w.descriptor]!==w.flags||r[w.descriptor+1]!==w.behavior||r[w.descriptor+2]!==w.code))return null;
  return{...now,replacement:item.replacement,kind:8,demolition:true,dungeon:item.dungeon,witnesses:item.witnesses};
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
  return enqueueTiles(tiles,{policy,attack:{dx,dy}});
 }
 cpu.cycle=function(){
  const boundary=(this.r[1]===0||this.r[1]===0xc0)&&this.br[4]===0xc7c3&&this.cyclesLeft===0;
  if(boundary&&(queue.length||cleared.size)&&lastFrame!==snes.frames&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)){
   const map=read16(0xdc);
   if(cutMap!==map){cleared.clear();cutMap=map;}
   queue=queue.filter(item=>item.map===map&&snes.frames-item.frame<90);
   const signature=[0xe2,0x30,0xa5,0x2e].every((v,i)=>snes.cart?.data[0xc7c3+i]===v);
   if(!ground())queue=[];
   else if(signature&&r[0x82]===0&&r[0x2e]===0){
    // A beam may smash scenery and activate a native layout switch at once.
    // Reapply matching broken objects after that same-room rebuild, through
    // the normal redraw queue. A changed descriptor/layout is never forced
    // to an obsolete replacement, and leaving the map keeps native respawn.
    for(const item of cleared.values()){
     if(queue.length>=128)break;
     const policy=item.policy??'objects',now=item.demolition?queuedTile(item):breakable(metadata(item.tx,item.ty,item.layer),policy);
     const sameTile=now&&(now.tile===item.tile||brazierPolicy(policy)&&brazierPart(item.tile)>=0&&brazierPart(now.tile)===brazierPart(item.tile));
     if(sameTile&&now.flags===item.flags&&now.behavior===item.behavior&&now.code===item.code&&now.replacement===item.replacement&&!queue.some(q=>q.address===item.address))queue.push({...item,...now,policy,frame:snes.frames,replay:true});
    }
    while(queue.length){
     const first=queue.shift(),now=queuedTile(first);
     if(!now||now.tile!==first.tile)continue;
     const group=[first],rest=[];for(const item of queue)(item.layer===first.layer&&item.ty===first.ty&&!!item.replay===!!first.replay?group:rest).push(item);queue=rest;
     const changed=[];
     for(const item of group){
      const cur=queuedTile(item);if(!cur||cur.tile!==item.tile)continue;r[cur.address]=cur.replacement;changed.push(cur);
      if(objectPolicy(item.policy)&&(cur.demolition||(cur.flags&7)===3||cur.flags&8||brazierPolicy(item.policy)&&brazierReplacement(cur)!==null))cleared.set(cur.address,{...cur,map,policy:item.policy});
     }
     if(!changed.length)continue;
     const scrollY=read16(first.layer?0xae:0xaa),mapHeight=read16(0xc2),worldY=first.ty*16+8;
     let screenY=worldY-scrollY;if(screenY<0)screenY+=mapHeight;
     // Original buffer has 256 scanlines. Offscreen changes need no upload:
     // the native scroll loader fetches our updated map bytes on arrival.
     const visible=screenY>=0&&screenY<240;
     if(visible){r[0x82]=first.layer?0x80:1;r[0x83]=screenY&255;}
     const sound=changed.find(item=>item.replacement!==0xc1);
     if(!first.replay&&sound&&visible&&(r[0x95]&0x80)===0){
      r[0x95]=(0xd8+sound.kind)&255;
      const sx=Math.max(0,Math.min(255,sound.tx*16+8-read16(sound.layer?0xac:0xa8))),pan=(sx&0xf0)|(sx>>4);
      r[0x118]=sx&0xf0;r[0x119]=pan;
     }
     lastFrame=snes.frames;const result={map,frame:snes.frames,tiles:changed,visible,screenY,replayed:!!first.replay};done.push(result);if(done.length>16)done.shift();if(!first.replay)onCut?.(result);break;
    }
   }
  }
  return priorCycle.call(this);
 };
 cpu.registerBreakpoints?.(cpu.cycle,priorCycle,[[0,0xc7c3]]);
 return{beam,enqueueTiles,metadata,eligible,wasCleared:(tx,ty,l=layer())=>cutMap===read16(0xdc)&&cleared.has(0x10000+l*0x4000+ty*128+tx),snapshot:()=>({queue:structuredClone(queue),lastFrame,done:structuredClone(done),cleared:structuredClone([...cleared.values()]),cutMap}),restore(state){queue=state?.queue||[];lastFrame=state?.lastFrame??-1;done=state?.done||[];cleared=new Map((state?.cleared??[]).map(t=>[t.address,t]));cutMap=state?.cutMap??null;},clear(){queue=[];},dispose(){cpu.cycle=priorCycle;queue=[];cleared.clear();},get pending(){return queue.length;},get completed(){return done;}};
}
