// Local flight uses the live native collision layers. Low plants/rocks may be
// crossed; room walls, map edges, layer changes and script triggers stay native.
// Flags 1 and 2 are terrain heights, not walls (C1:BE15). Height 3 is solid.
import {createNativeWhipRoutes} from './native-whip-routes.js';
const scenery={0:new Set([130,139,141,159]),2:new Set([130,131]),
 // Haunted Forest flowers and creeping vines, verified against tileset 7.
 // Tall trees, cliff faces, switches and the scripted rose gate are separate.
 7:new Set([112,114,115,116,117,118,119,120,126,127,130,131,132,133,134,135,136,138,142,143])};
// Forest rock-bank faces. These can only be flown across when usable terrain
// exists on BOTH sides of a short span; the same art also borders map voids.
const forestBanks=new Set([1,2,4,6,9,14,17,18,19,20,22,23,25,30,31,32,33,34,35,36,37,38,39,46,47,48,49,50,51,52,53,54,55,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,96,97,135,137,158,159,174,175]);
// Palace platform edges, downward faces and the empty air below them. These
// are shared by Water/Earth/Fire/Shade/Grand Palace, not their upright walls.
const palaceGaps=new Set([0,6,22,38,54,63,187]);
// C0:D359 dispatches 2x stair guidance and 3x currents/conveyors. These
// modify walking velocity; they are floors, not collision or event triggers.
const movementFloor=code=>(code&0xf0)===0x20||(code&0xf0)===0x30;
export function createNativeLocalFlight(snes,{active=()=>false,speed=6,phase=false,onCross=null,onCarry=null}={}){
 const c=snes.cpu,r=snes.ram,priorCycle=c.cycle,word=a=>r[a]|r[a+1]<<8;
 const whipRoutes=createNativeWhipRoutes(snes);
 const ground=()=>[0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0].every((v,i)=>r[0x100+i]===v)&&r[0xd0]===0&&(r[0xec]&0xfe)===0&&r[0x2c]===0&&!(r[0xed]&0x40)&&r[0xff]===0;
 const eligible=()=>active()&&ground()&&(r[0xe000]&1)&&(r[0xe02c]&1)&&!(r[0xe190]&0x70)&&!(r[0xe191]&0xd7)&&!(r[0xe01c]|r[0xe060]|r[0xe00a])&&r[0xe008]===0;
 const phasing=()=>typeof phase==='function'?phase():phase;
 const bounds=()=>({width:Math.min(2048,word(0xc0)),height:Math.min(2048,word(0xc2))});
 const layer=()=>r[0xe00b]&0x80?1:0;
 const header=()=>{const rom=snes.cart?.data,id=word(0xdc);if(!rom||id>511)return null;return 0x80000+(rom[0x87000+id*2]|rom[0x87001+id*2]<<8);};
 const descriptor=(tile,l)=>{const a=0x1b800+l*0x400+tile*4;return{tile,layer:l,flags:r[a],behavior:r[a+1],code:r[a+2],replacement:r[a+3]};};
 const tileAt=(x,y,l=layer())=>{
  const {width,height}=bounds();if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=width||y<0||y>=height||!(l===0||l===1))return null;
  const tx=Math.floor(x/16),ty=Math.floor(y/16),tile=r[0x10000+l*0x4000+ty*128+tx];
  return{tx,ty,...descriptor(tile,l)};
 };
 function ferryGap(t){
  // Karon's two piers occupy one native map, 28 tiles apart. Their six
  // matching deck columns define the flight corridor across the starry sea.
  // Some decorative stars have floor collision: they are still open air,
  // never landing spots. Keep the shore exits and outer void outside it.
  if(!t||word(0xdc)!==32||t.layer!==1||t.tx<24||t.tx>29||t.ty<18||t.ty>43||t.code!==0||t.behavior&0x90||t.flags&8)return false;
  return [17,44].every(y=>{
   const deck=tileAt(t.tx*16+8,y*16+8,1);
   return deck&&deck.code===0&&!(deck.behavior&0x90)&&(deck.flags&15)===2;
  });
 }
 function shipRail(t){
  // The short handrail between the Sandship's two decks, not its outer
  // hull. Both encounter variants share these four original map cells.
  if(!t||![98,99].includes(word(0xdc))||t.layer!==0||t.ty!==9||t.tx<24||t.tx>27||t.tile!==122||t.code!==0)return false;
  return [-1,1].every(dy=>clear(tileAt(t.tx*16+8,(t.ty+dy)*16+8,0),0,true));
 }
 function lowObstacle(t){
  if(!t)return false;
  if(ferryGap(t)||shipRail(t))return true;
  if(whipRoutes.crossable(t))return true;
  const at=header(),flags=at===null?0:snes.cart.data[at+2],tileset=at===null?-1:flags&63,metatile=t.tile+((flags&(t.layer?128:64))?192:0);
  // These small carved heads merely rotate when hit by a native sword.
  // They are scenery, unlike other cyclic C-prefix puzzle switches.
  if(tileset===1&&t.layer===0&&[171,172].includes(metatile)&&t.code===0xc1&&t.replacement===343-t.tile)return true;
  // Native cuttable objects may have several break stages. Follow their
  // replacement chain; switches cycle and must never become fly-throughs.
  if((t.code&0xf0)===0xc0&&(t.code&15)<=11){
   const seen=new Set();let d=t;
   for(let n=0;n<16;n++){
    if(seen.has(d.tile))return false;seen.add(d.tile);
    if((d.code&0xf0)!==0xc0)return d.code===0&&(d.flags&15)!==3&&!(d.flags&8);
    if((d.code&15)>11)return false;d=descriptor(d.replacement,t.layer);
   }
   return false;
  }
  // These original metatiles are short flowers, bushes and a single rock.
  // Decorative scenery has no cut code. Do not classify roofs/trees/cliffs
  // from their shared solid flag. Scope the list to the original tileset.
  if(at===null)return false;
  // Ruins balconies have a one-tile raised floor lip on BG2. The same
  // solid art is not enough to identify a crossing: require real floors
  // at different heights on opposite sides, keeping walls/voids closed.
  if(tileset===9&&t.layer===1&&t.code===0&&metatile===222&&Number.isInteger(t.tx)&&Number.isInteger(t.ty)){
   const shore=(dx,dy)=>{
    for(let n=1;n<=3;n++){
     const next=tileAt((t.tx+dx*n)*16+8,(t.ty+dy*n)*16+8,1);
     if(!next||next.behavior&0x10)return 0;
     if(clear(next,0,true))return next.flags&3;
     if(next.code!==0||next.tile+((flags&128)?192:0)!==222)return 0;
    }
    return 0;
   };
   return [[-1,0,1,0],[0,-1,0,1]].some(([ax,ay,bx,by])=>{
    const a=shore(ax,ay),b=shore(bx,by);return a>0&&a<3&&b>0&&b<3&&a!==b;
   });
  }
  if(tileset===23&&t.layer===0&&t.code===0&&palaceGaps.has(metatile)&&Number.isInteger(t.tx)&&Number.isInteger(t.ty)){
   const shore=(dx,dy)=>{
    for(let n=1;n<=16;n++){
     const next=tileAt((t.tx+dx*n)*16+8,(t.ty+dy*n)*16+8,0);
     if(!next||next.behavior&0x10)return false;
     if(clear(next,0,true))return true;
     if(next.code!==0||!palaceGaps.has(next.tile+((flags&64)?192:0)))return false;
    }
    return false;
   };
   return shore(-1,0)&&shore(1,0)||shore(0,-1)&&shore(0,1);
  }
  // Forest height-transition strips (10-17) are also part of the ledge;
  // walking uses them to change floors. Flight ignores that forced motion.
  const bank=d=>d&&(d.code===0&&forestBanks.has(d.tile+((flags&64)?192:0))||d.code>=0x10&&d.code<=0x17);
  if(tileset===2&&t.layer===0&&bank(t)&&Number.isInteger(t.tx)&&Number.isInteger(t.ty)){
   const shore=(dx,dy)=>{
    const span=word(0xdc)===25?16:5;
    for(let n=1;n<=span;n++){
     const next=tileAt((t.tx+dx*n)*16+8,(t.ty+dy*n)*16+8,t.layer);
     if(!next||next.behavior&0x10)return false;
     if(clear(next,0,true))return true;
     if(!bank(next))return false;
    }
    return false;
   };
   if(shore(-1,0)&&shore(1,0)||shore(0,-1)&&shore(0,1))return true;
  }
  if(t.code!==0)return false;
  // Village flowers and two-cell shrubs are on BG2. Their BG1 placeholder
  // is solid grass (187/188), shared with tall trees. Inspect the paired art
  // cell so flowers can be crossed without opening the forest or house walls.
  if(tileset===0&&t.layer===0&&[187,188].includes(t.tile)&&Number.isInteger(t.tx)&&Number.isInteger(t.ty)){
   const foreground=r[0x14000+t.ty*128+t.tx]+((flags&128)?192:0);
   if([272,273,274,275,276,277,278,288,289,290,291,292,293,294].includes(foreground))return true;
  }
  return scenery[tileset]?.has(metatile)??false;
 }
 function breakScenery(t){
  if(shipRail(t))return 10; // Original upper-deck planks.
  const at=header();if(!t||at===null||t.layer!==0)return null;
  const flags=snes.cart.data[at+2],id=t.tile+((flags&64)?192:0);
  if((flags&63)===1&&[171,172].includes(id)&&t.code===0xc1&&t.replacement===343-t.tile)return 161;
  if(t.code!==0)return null;
  // The vines/flowers have no native cut code; clear them to this tileset's
  // original grass. Do not infer a replacement for buildings or cliff walls.
  return (flags&63)===7&&scenery[7].has(id)?122:null;
 }
 function clear(t,terrain=r[0xe00b]&3,air=false){
  if(!t||t.flags&8)return false;
  if(ferryGap(t))return air;
  const height=t.flags&7;
  if(height===3||(!air&&height>0&&height<3&&(height^terrain)===3))return false;
  // C1->0 is uncut tall grass, which is walkable in the original game.
  return t.code===0||movementFloor(t.code)||(t.code===0xc1&&t.replacement===0);
 }
 function footprint(x,y,l,air,terrain=r[0xe00b]&3){
  const {width,height}=bounds();if(width<16||height<16||x<8||x>width-8||y<8||y>height-8)return false;
  for(const dy of[-4,0,4])for(const dx of[-6,0,6]){
   const t=tileAt(x+dx,y+dy,l);if(!clear(t,terrain,air)&&!(air&&lowObstacle(t)))return false;
  }
  return true;
 }
 const canLand=(x=word(0xe002),y=word(0xe004),l=layer(),terrain=r[0xe00b]&3)=>footprint(x,y,l,false,terrain);
 const canFly=(x,y,l=layer())=>footprint(x,y,l,true);
 const canFloat=(x,y,l=layer())=>canFly(x,y,l)&&!canLand(x,y,l);
 function sweep(x,y,dx,dy){
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  for(let step=1;step<=steps;step++)if(!canFly(x+Math.round(dx*step/steps),y+Math.round(dy*step/steps)))return false;
  return true;
 }
 const signed=v=>(v&0x80)?-(v&0x7f):v,packed=v=>v<0?0x80|(-v):v;
 let changed=0,phased=0,limited=0,recovered=0,npcPasses=0,anchor=null,crossing=null,motionFrame=-1,travel=[0,0];
 c.cycle=function(){
  const pc=this.br[4];
  // Actor contact has already checked interaction scripts at C1:CFE5.
  // Airborne Goku can pass above an NPC without pushing either actor; enemy
  // hits and ground conversations retain their original contact handling.
  if(this.cyclesLeft===0&&(this.r[1]&63)===1&&(pc===0xcfe5||pc===0xd017)&&phasing()&&eligible()){
   const x=this.br[1],y=this.br[2],other=x===0?y:y===0?x:-1;
   if(other>=0x600&&other<0x1800&&(r[0xe000+other]&1)&&r[0xe180+other]>=0x80){this.br[4]=0xcfe4;npcPasses++;}
  }
  // Keep native animation/terrain updates, but airborne Goku does not wade
  // against a current or follow the stairs' forced walking axis. Charging on
  // foot still uses the original terrain behavior.
  if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&pc===0xd359&&word(0x10)===0&&phasing()&&eligible()&&movementFloor(r[0xe048]))this.br[4]=0xd38e;
  if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&(pc===0xd651||pc===0xd778)&&word(0x10)===0&&eligible()){
   const x=word(0xe002),y=word(0xe004);
   if(pc===0xd651){
    // The native main loop can update movement twice in one video frame.
    // Its VRAM streamer only queues one new row/column, so keep total travel
    // below a 16px metatile, including at high speed after a room transition.
    if(motionFrame!==(snes.frames??0)){motionFrame=snes.frames??0;travel=[0,0];}
    const diagonal=!!(r[0x1e]&0x7f)&&!!(r[0x1f]&0x7f),configured=typeof speed==='function'?speed():speed,velocity=Math.max(1,Math.min(8,Math.round(configured*(diagonal?Math.SQRT1_2:1)))),{width,height}=bounds();
    for(const [at,pos,limit]of[[0x1e,x,width],[0x1f,y,height]])if(r[at]&0x7f){
     const allowance=Math.min(velocity,14-travel[at-0x1e]);
     const v=r[at]&0x80?-Math.min(allowance,Math.max(0,pos-8)):Math.min(allowance,Math.max(0,limit-8-pos));r[at]=packed(v);
    }
    travel[0]+=r[0x1e]&0x7f;travel[1]+=r[0x1f]&0x7f;
    if(phasing()){
     const dx=signed(r[0x1e]),dy=signed(r[0x1f]);
     if(!sweep(x,y,dx,dy)){
      // Let the native shaped tiles, stairs and triggers work one pixel at a
      // time. Never give its endpoint-only collision check an 8px leap.
      r[0x1e]=packed(Math.sign(dx));r[0x1f]=packed(Math.sign(dy));limited++;
     }
    }
    changed++;
   }else if(phasing()){
    const dx=signed(r[0x1e]),dy=signed(r[0x1f]);
    if((dx||dy)&&sweep(x,y,dx,dy)&&(canFloat(x,y)||canFloat(x+dx,y+dy))){this.br[4]=0xd7f3;phased++;}
   }
  }
  return priorCycle.call(this);
 };
 function settle(){
  if(!ground()){crossing=null;return;}
  const map=word(0xdc),x=word(0xe002),y=word(0xe004),l=layer();
  if(anchor?.map!==map)anchor=null;
  if(crossing?.map!==map||!crossing?.whip&&(!phasing()||!eligible()))crossing=null;
  // Crossing a ledge can bypass the walking stair that normally changes
  // E00B. Adopt the destination floor only once the entire footprint fits;
  // otherwise releasing flight would leave Goku hovering on clear ground.
  if(phasing()&&eligible()){
   const terrain=tileAt(x,y,l)?.flags&3;
   if((terrain===1||terrain===2)&&terrain!==(r[0xe00b]&3)&&canLand(x,y,l,terrain))r[0xe00b]=(r[0xe00b]&0xfc)|terrain;
  }
  // Track the entire whip corridor, including any walkable lower floor in
  // the middle. Gathering on that temporary floor can strand companions at
  // the next height change; bring them over once Goku reaches either shore.
  const withinWhip=(crossing?.whip||phasing()&&eligible())&&whipRoutes.crossable(tileAt(x,y,l));
  if(withinWhip&&phasing()&&eligible()&&anchor)crossing={...(crossing??anchor),whip:true};
  if(canLand(x,y,l)){
   if(crossing?.whip&&withinWhip)return;
   if(crossing&&crossing.layer===l&&Math.hypot(x-crossing.x,y-crossing.y)>=24)onCross?.({map,from:crossing,to:{x,y,layer:l,terrain:r[0xe00b]}});
   crossing=null;anchor={map,x,y,layer:l,terrain:r[0xe00b]};return;
  }
  if(!phasing()||!eligible())return;
  if(anchor&&canFly(x,y,l))crossing??={...anchor};
  // This crossing is longer than the native party-distance limit. Goku
  // carries CPU followers while over the sea, so the camera and input never
  // tether him to companions stranded on the first pier.
  if(ferryGap(tileAt(x,y,l)))onCarry?.({x,y,layer:l,terrain:r[0xe00b]});
  const {width,height}=bounds(),t=tileAt(x,y,l),outside=x<8||y<8||x>width-8||y>height-8;
  // Recover older checkpoints stranded in a wall/void, or an unexpected
  // native displacement. Prefer the most recent verified landing position.
  const embedded=t&&t.code===0&&(t.flags&7)===3&&!lowObstacle(t);
  if(!outside&&!embedded)return;
  let safe=anchor&&anchor.layer===l&&canLand(anchor.x,anchor.y,l)?anchor:null;
  if(!safe){
   const candidates=[];
   for(let dy=-128;dy<=128;dy+=8)for(let dx=-128;dx<=128;dx+=8){const px=Math.min(width-8,Math.max(8,x))+dx,py=Math.min(height-8,Math.max(8,y))+dy;if(canLand(px,py,l))candidates.push({x:px,y:py,d:dx*dx+dy*dy});}
   safe=candidates.sort((a,b)=>a.d-b.d)[0];
  }
  if(safe){crossing=null;for(const[a,v]of[[0xe002,safe.x],[0xe004,safe.y]]){r[a]=v&255;r[a+1]=v>>8;}r[0xe006]=r[0xe007]=0;if(safe.terrain!==undefined)r[0xe00b]=safe.terrain;recovered++;return{x:safe.x,y:safe.y,layer:l,terrain:r[0xe00b]};}
 }
 return{canLand,canFly,canFloat,lowObstacle,breakScenery,tileAt,bounds,settle,
  get passengers(){
   if(!phasing()||!eligible()||!ferryGap(tileAt(word(0xe002),word(0xe004),layer())))return [];
   return [0xe200,0xe400].filter(base=>(r[base]&1)&&!r[base+0x2c]&&!(r[base+0x0e]&0x80));
  },
  snapshot:()=>({anchor,crossing,motionFrame,travel:[...travel]}),restore:s=>{anchor=s?.anchor??null;crossing=s?.crossing??null;motionFrame=s?.motionFrame??-1;travel=s?.travel?.slice()??[0,0];},get changed(){return changed},get phased(){return phased},get limited(){return limited},get recovered(){return recovered},get npcPasses(){return npcPasses},dispose(){c.cycle=priorCycle;}};
}
