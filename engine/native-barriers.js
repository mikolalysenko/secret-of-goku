// Factual gate rectangles come from the original map-piece placements and
// tile triggers. Progress is applied by native events and the map rebuild;
// no collision holes are drawn into walls or persisted as arbitrary tiles.
export const kiBarriers=[
  {id:'haunted-forest',map:29,rect:[224,288,32,32],flag:0x5e,min:1,event:0x1ef},
  {id:'haunted-forest-bridge',map:30,rect:[224,368,64,80],flag:0x5f,min:3,event:0x6da},
  {id:'witch-castle',map:300,rect:[128,240,48,80],flag:0x17,min:2,event:0x8c},
  {id:'northtown-castle',map:82,rect:[304,528,32,32],flag:0x34,min:4,event:0x8d},
  {id:'gold-tower',map:116,rect:[240,392,32,24],flag:0x37,min:1,event:0x8e},
];
// Native F-prefix hit tiles encode an event in the descriptor. These are
// the retail axe gate, crystal/door switches and palace puzzle switches.
// Whip posts (6F8) use the separate flight crossing adapter, never this path.
export const barrierTileEvents=new Map([
  [0x1ec,0x1ef],[0x1af,0x1af],[0x52d,0x52d],
  [0x6f0,0x6f0],[0x6ec,0x6ec],[0x4c0,0x4c0],
  [0x565,0x56b],[0x566,0x56b],[0x567,0x56b],[0x568,0x56b],
  [0x599,0x599],[0x59a,0x59a],
]);
// Pressure plates use per-location trigger metatiles instead of F hit codes.
// These events only operate their local switches/gates. Doorways, trap drops,
// boss entry scenes and conversations are deliberately not ranged targets.
export const barrierFloorEvents=new Map([
  [0x6e9,0x6f1],[0x6ea,0x6f2],
  ...[0x6f0,0x6f1,0x6f2,0x6f3,0x430,0x431,0x432,0x433,0x434,0x435,0x436,
    0x660,0x663,0x664,0x665,0x667,0x6b0,0x6b1,0x6b2,0x6b3,0x6b4,0x6b5,0x22c,0x22d,
    0x1e8,0x51f,0x528,0x54f,0x550,0x551,0x6cc,0x6cd,0x6cf,
    0x4c1,0x4c2,0x4c3,0x4c4].map(id=>[id,id]),
  [0x662,0x663],[0x666,0x667],
]);
export function floorTileEvent(mod,tile){
  if(!tile||(tile.behavior&0x80)===0||tile.tile<mod.read8(0x4d))return null;
  const rom=mod.snes.cart?.data,map=mod.read16(0xdc);if(!rom||map>=511)return null;
  const word=a=>rom[a]|rom[a+1]<<8,start=0x80000+word(0x84000+map*2),end=0x80000+word(0x84002+map*2);
  // C0:B642-B66F: $4D already accounts for BF/BE special tiles; only the
  // optional walk-on entry is added. The native loader numbers both layers.
  const at=start+2*(tile.tile-mod.read8(0x4d)+((mod.read8(0xb8)&4)?1:0));
  return at>=start&&at+1<end?word(at):null;
}
export function beamTouchesBarrier(beam,barrier){
  if((beam.strength??0)<.85)return false;
  const[x,y,w,h]=barrier.rect,cx=x+w/2,cy=y+h/2,ox=cx-beam.x,oy=cy-beam.y;
  const along=ox*beam.dx+oy*beam.dy,across=Math.abs(ox*beam.dy-oy*beam.dx);
  const forward=Math.abs(beam.dx)*w/2+Math.abs(beam.dy)*h/2,side=Math.abs(beam.dy)*w/2+Math.abs(beam.dx)*h/2;
  return along>=0&&along<=Math.min(640,beam.length)+forward&&across<=beam.width+side;
}
export function createNativeBarriers(mod){
  let pending=null,completed=[];
  function nativeTile(attack){
    const h=mod.localFlightHook;if(!h||!mod.plants)return null;
    const {width,height}=h.bounds(),length=Math.min(640,attack.length),pad=attack.width+8;
    const x1=attack.x+attack.dx*length,y1=attack.y+attack.dy*length,candidates=[];
    for(let ty=Math.max(0,Math.floor((Math.min(attack.y,y1)-pad)/16));ty<Math.min(height/16,Math.ceil((Math.max(attack.y,y1)+pad)/16));ty++)
    for(let tx=Math.max(0,Math.floor((Math.min(attack.x,x1)-pad)/16));tx<Math.min(width/16,Math.ceil((Math.max(attack.x,x1)+pad)/16));tx++){
      const tile=mod.plants.metadata(tx,ty);
      const hitTile=(tile.code&0xf0)===0xf0,source=hitTile?tile.replacement*16+(tile.code&15):floorTileEvent(mod,tile),event=(hitTile?barrierTileEvents:barrierFloorEvents).get(source);
      if(!event)continue;
      // The Grand Palace sequence owns these buttons only at stage three.
      // Smash its four-button combination once; do not advance later scenes.
      if(source>=0x565&&source<=0x568&&mod.read8(0xcf42)!==3)continue;
      const candidate={id:`tile-${tile.layer}-${tx}-${ty}-${source}`,event,rect:[tx*16,ty*16,16,16],tile};
      if(beamTouchesBarrier(attack,candidate))candidates.push(candidate);
    }
    candidates.sort((a,b)=>Math.hypot(a.rect[0]-attack.x,a.rect[1]-attack.y)-Math.hypot(b.rect[0]-attack.x,b.rect[1]-attack.y));
    return candidates[0]??null;
  }
  function hit(beam){
    if(pending||!mod.canAttack||(beam.strength??0)<.85||beam.barrierHit)return false;
    const map=mod.read16(0xdc),barrier=kiBarriers.find(b=>b.map===map&&mod.read8(0xcf00+b.flag)<b.min&&beamTouchesBarrier(beam,b))??nativeTile(beam);
    if(!barrier)return false;
    beam.barrierHit=true;
    pending={id:barrier.id,map,event:barrier.event,frame:mod.frame,tile:barrier.tile};mod.playSound('impact');mod.feedback?.pulse(12);
    const[x,y,w,h]=barrier.rect;for(let i=0;i<6;i++)mod.effects.push({kind:'impact',x:x+(i%3+.5)*w/3,y:y+(Math.floor(i/3)+.5)*h/2,dx:1,dy:0,life:20,max:20,super:false});
    return true;
  }
  return{
    beam:hit,
    punch(attack){return hit({...attack,length:28,width:9,strength:1});},
    tick(){
      if(!pending)return;
      const barrier=kiBarriers.find(b=>b.id===pending.id);
      if(barrier&&mod.read8(0xcf00+barrier.flag)>=barrier.min){pending=null;return;}
      if(pending.tile){const {tx,ty,layer,tile}=pending.tile;if(mod.plants.metadata(tx,ty,layer).tile!==tile){pending=null;return;}}
      if(pending.map!==mod.read16(0xdc)){pending=null;return;}
      if(mod.frame-pending.frame>=26&&mod.story.request(pending.event)){completed.push(pending.id);pending=null;}
    },
    get status(){return{pending,completed:[...completed]};},
    snapshot(){return structuredClone({pending,completed});},
    restore(s){pending=s?.pending??null;completed=s?.completed?.slice()||[];},
  };
}
