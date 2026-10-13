// Local flight uses the live native collision layers. Low plants/rocks may be
// crossed; room walls, map edges, layer changes and script triggers stay native.
// Flags 1 and 2 are terrain heights, not walls (C1:BE15). Height 3 is solid.
const scenery={0:new Set([130,139,141,159]),2:new Set([130,131])};
// Forest rock-bank faces. These can only be flown across when usable terrain
// exists on BOTH sides of a short span; the same art also borders map voids.
const forestBanks=new Set([1,2,4,6,9,14,17,18,19,20,22,23,25,30,31,33,34,35,36,38,39,46,47,49,50,51,52,54,55,58,59,60,61,62,63,65,66,67,68,70,71,72,73,74,75,76,77,78,79,80,81,83,84,86,87,88,89,90,91,94,96,97,135,137,158,159,174,175]);
// C0:D359 dispatches 2x stair guidance and 3x currents/conveyors. These
// modify walking velocity; they are floors, not collision or event triggers.
const movementFloor=code=>(code&0xf0)===0x20||(code&0xf0)===0x30;
export function createNativeLocalFlight(snes,{active=()=>false,speed=6,phase=false}={}){
 const c=snes.cpu,r=snes.ram,priorCycle=c.cycle,word=a=>r[a]|r[a+1]<<8;
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
 function lowObstacle(t){
  if(!t)return false;
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
  const at=header();if(at===null||t.code!==0)return false;
  const flags=snes.cart.data[at+2],tileset=flags&63,metatile=t.tile+((flags&(t.layer?128:64))?192:0);
  if(tileset===2&&t.layer===0&&forestBanks.has(metatile)&&Number.isInteger(t.tx)&&Number.isInteger(t.ty)){
   const shore=(dx,dy)=>{
    for(let n=1;n<=3;n++){
     const next=tileAt((t.tx+dx*n)*16+8,(t.ty+dy*n)*16+8,t.layer);
     if(!next||next.behavior&0x10)return false;
     if(clear(next,0,true))return true;
     if(next.code!==0||!forestBanks.has(next.tile+((flags&64)?192:0)))return false;
    }
    return false;
   };
   if(shore(-1,0)&&shore(1,0)||shore(0,-1)&&shore(0,1))return true;
  }
  // Village flowers and two-cell shrubs are on BG2. Their BG1 placeholder
  // is solid grass (187/188), shared with tall trees. Inspect the paired art
  // cell so flowers can be crossed without opening the forest or house walls.
  if(tileset===0&&t.layer===0&&[187,188].includes(t.tile)&&Number.isInteger(t.tx)&&Number.isInteger(t.ty)){
   const foreground=r[0x14000+t.ty*128+t.tx]+((flags&128)?192:0);
   if([272,273,274,275,276,277,278,288,289,290,291,292,293,294].includes(foreground))return true;
  }
  return scenery[tileset]?.has(metatile)??false;
 }
 function clear(t,terrain=r[0xe00b]&3,air=false){
  if(!t||t.flags&8)return false;
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
 let changed=0,phased=0,limited=0,recovered=0,anchor=null;
 c.cycle=function(){
  const pc=this.br[4];
  // Keep native animation/terrain updates, but airborne Goku does not wade
  // against a current or follow the stairs' forced walking axis. Charging on
  // foot still uses the original terrain behavior.
  if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&pc===0xd359&&word(0x10)===0&&phasing()&&eligible()&&movementFloor(r[0xe048]))this.br[4]=0xd38e;
  if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&(pc===0xd651||pc===0xd778)&&word(0x10)===0&&eligible()){
   const x=word(0xe002),y=word(0xe004);
   if(pc===0xd651){
    const diagonal=!!(r[0x1e]&0x7f)&&!!(r[0x1f]&0x7f),configured=typeof speed==='function'?speed():speed,velocity=Math.max(1,Math.min(8,Math.round(configured*(diagonal?Math.SQRT1_2:1)))),{width,height}=bounds();
    for(const [at,pos,limit]of[[0x1e,x,width],[0x1f,y,height]])if(r[at]&0x7f){
     const v=r[at]&0x80?-Math.min(velocity,Math.max(0,pos-8)):Math.min(velocity,Math.max(0,limit-8-pos));r[at]=packed(v);
    }
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
  if(!ground())return;
  const map=word(0xdc),x=word(0xe002),y=word(0xe004),l=layer();
  if(anchor?.map!==map)anchor=null;
  if(canLand(x,y,l)){anchor={map,x,y,layer:l,terrain:r[0xe00b]};return;}
  if(!phasing()||!eligible())return;
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
  if(safe){for(const[a,v]of[[0xe002,safe.x],[0xe004,safe.y]]){r[a]=v&255;r[a+1]=v>>8;}r[0xe006]=r[0xe007]=0;if(safe.terrain!==undefined)r[0xe00b]=safe.terrain;recovered++;}
 }
 return{canLand,canFly,canFloat,lowObstacle,tileAt,bounds,settle,snapshot:()=>({anchor}),restore:s=>{anchor=s?.anchor??null;},get changed(){return changed},get phased(){return phased},get limited(){return limited},get recovered(){return recovered},dispose(){c.cycle=priorCycle;}};
}
