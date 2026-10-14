// Dungeon membership and collision/art classifications, not extracted maps.
// Geometry always comes from the user's cartridge and the live native layout.
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
export const dungeonGroups=[
 {id:'water',name:'Water Palace and Undine',maps:[109,135,136,137,139,140,142,143,275,277,278]},
 {id:'pandora',name:'Pandora Ruins',maps:range(160,167)},
 {id:'gaia',name:'Gaia\u2019s Navel',maps:[25,73,284,285,286,287,288,289,290,295]},
 {id:'witch',name:'Haunted Forest and Elinee\u2019s Castle',maps:[28,29,30,31,38,196,...range(300,306),308,309,310,343,344]},
 {id:'earth',name:'Earth Palace',maps:[269,276,291,312,313,314]},
 {id:'kilroy',name:'Kilroy\u2019s Ship',maps:[311,315,316,317]},
 {id:'wind',name:'Wind Palace',maps:[47,60,273]},
 {id:'matango',name:'Matango Cave',maps:[134,307,320,321,322,323,325]},
 {id:'ice',name:'Ice Palace',maps:[75,...range(352,365)]},
 {id:'sandship',name:'Sandship',maps:[98,99,270,271,318,319,324,339,340]},
 {id:'fire',name:'Fire Palace',maps:[90,240,241,...range(326,331),...range(345,349)]},
 {id:'empire',name:'Empire Sewers and Castle',maps:[20,82,100,...range(377,391)]},
 {id:'northtown',name:'Northtown Ruins',maps:[21,...range(400,410)]},
 {id:'light',name:'Light Palace',maps:[111,116,117,118,119,120]},
 {id:'jehk',name:'Jehk\u2019s Trials and Mandala Temple',maps:[17,18,62,65,66,72]},
 {id:'shade',name:'Shade Palace',maps:[61,...range(367,375),489]},
 {id:'moon',name:'Moon Palace',maps:[32,33,34,35,48,350,351]},
 {id:'tasnica',name:'Tasnica Castle',maps:[24,26,36,37,51,121]},
 {id:'undersea',name:'Lost Continent and Subway',maps:[42,43,44,45,46,71,195,238,432,433,434,435,436,495]},
 {id:'grand',name:'Grand Palace',maps:[237,...range(412,426),428,430,431]},
 {id:'pure',name:'Pure Land',maps:[...range(198,221),225,226,227,...range(229,236),444,445,446]},
 {id:'fortress',name:'Mana Fortress',maps:[244,245,246,248,249,250,251,253,255,488]},
];
export const dungeonFor=map=>dungeonGroups.find(d=>d.maps.includes(map))??null;
// These maps are moving cutscene scenery or affine boss pictures, not the
// field collision grid. Their ferry/boss handlers retain ownership.
export const dungeonSpecialScenes=new Map([[33,'moving ferry'],[34,'moving ferry'],[253,'Mana Beast arena'],[488,'Dread Slime arena'],[489,'Lime Slime arena']]);
const sets=entries=>Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,new Set(v)]));
// Empty air, downward platform faces, cave ledges and lava. These must form
// a finite corridor between real floors; their use at an exterior stays solid.
export const dungeonAirTiles=sets({
 10:[...range(0,18),20,32,33,34,41,61,78,79,94,95,98,99,107,108,109,113,114,115,117,121,122,125,154],
 15:[73,83,85,88,89,90,105,106,115,140,148,151,152,168,185,188],
 21:[0,14,15,35,49,50,51,52,65,66,67,68,70,71,72],
 23:[0,6,22,38,54,63,187],
});
const blankZero=new Set([8,9,10,12,14,15,17,18,19,20,21,22,23,26,27,30,31]);
const wallTilesets=new Set([1,2,3,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,26,27,30,31]);

export function createDungeonGeometry(snes){
 const r=snes.ram,word=a=>r[a]|r[a+1]<<8;
 let cache=null,cacheFrame=-1,contextFrame=-1,floorFrame=-1,airCache=new Map(),floorCache=new Map();
 function context(){
  const rom=snes.cart?.data,map=word(0xdc),group=dungeonFor(map);
  if(!rom||rom.length<0x100000||!group||dungeonSpecialScenes.has(map))return null;
  const at=0x80000+(rom[0x87000+map*2]|rom[0x87001+map*2]<<8),flags=rom[at+2],tileset=flags&63;
  if(!wallTilesets.has(tileset))return null;
  const start=0x80000+(rom[0x85000+map*2]|rom[0x85001+map*2]<<8),end=0x80000+(rom[0x85002+map*2]|rom[0x85003+map*2]<<8);
  const width=Math.min(128,word(0xc0)>>4),height=Math.min(128,word(0xc2)>>4);
  if(cache&&contextFrame===snes.frames&&cache.rom===rom&&cache.map===map&&cache.flags===flags&&cache.width===width&&cache.height===height)return cache;
  // A map refresh may change its pieces without changing its map number.
  let signature=`${map}:${flags}:${width}:${height}`,layer=0;const pieces=[];
  for(let p=start;p<end;){
   const flag=rom[p];if(flag>=254){layer=flag===255?1:0;p++;continue;}
   if(p+4>=end)return null;
   const value=r[0xcf00+flag],min=rom[p+1]>>4,max=rom[p+1]&15;
   signature+=`:${value}`;
   if(value>=min&&value<=max){
    const id=rom[p+2]|(rom[p+3]&1)<<8|(rom[p+4]&1)<<9,bank=id<0xa3?0xd:id<0x206?0xe:id<0x300?0xf:0xc;
    const address=(bank<<16)+(rom[0xd0004+id*2]|rom[0xd0005+id*2]<<8);
    pieces.push({layer,x:rom[p+3]>>1,y:rom[p+4]>>1,w:(rom[address]>>1)+1,h:(rom[address+1]>>1)+1});
   }p+=5;
  }
  contextFrame=snes.frames;
  if(cache?.signature===signature&&cache.rom===rom)return cache;
  const placed=[new Uint8Array(16384),new Uint8Array(16384)];
  for(const p of pieces)for(let y=p.y;y<Math.min(height,p.y+p.h);y++)for(let x=p.x;x<Math.min(width,p.x+p.w);x++)placed[p.layer][y*128+x]=1;
  airCache.clear();floorCache.clear();cache={map,group,tileset,flags,width,height,placed,signature,rom};return cache;
 }
 function tile(tx,ty,l,ctx=context()){
  if(!ctx||tx<1||ty<1||tx>=ctx.width-1||ty>=ctx.height-1||!ctx.placed[l]?.[ty*128+tx])return null;
  const address=0x10000+l*0x4000+ty*128+tx,id=r[address],descriptor=0x1b800+l*0x400+id*4;
  return{tx,ty,layer:l,address,tile:id,descriptor,flags:r[descriptor],behavior:r[descriptor+1],code:r[descriptor+2],replacement:r[descriptor+3],kind:8};
 }
 // 40 marks the special BF/BE trigger tiles even without the ordinary 80
 // per-location event bit. They include whip pads and cave entrances.
 const ordinary=t=>t&&!(t.flags&8)&&!(t.behavior&0xd0)&&t.code===0;
 const metatile=(t,c)=>t.tile+((c.flags&(t.layer?128:64))?192:0);
 // Palace window recesses have walkable height-0 descriptors, but their
 // art is brick/arch trim. Treating two windows as opposing floors copied
 // their bricks across a blasted wall and admitted routes through the roof.
 const falsePalaceFloor=new Set([58,74,80,81,82,90,91]);
 const floor=(t,c)=>ordinary(t)&&(t.flags&7)<3&&!(metatile(t,c)===0&&blankZero.has(c.tileset))&&
  !(c.tileset===23&&t.layer===0&&falsePalaceFloor.has(metatile(t,c)));
 const protectedCell=(t,c)=>c.map===139&&t.ty>=59&&t.ty<=65&&t.tx>=12&&t.tx<=21&&(t.tx<16||t.tx>17);
 const airMaterial=(t,c)=>t&&!protectedCell(t,c)&&!(t.flags&8)&&!(t.behavior&0xd0)&&
  (t.code===0&&dungeonAirTiles[c.tileset]?.has(metatile(t,c))||c.tileset===10&&t.code>=0x10&&t.code<=0x17);
 function span(t,dx,dy,accept,limit,c){
  const ends=[],cells=[t];
  for(const sign of[-1,1]){
   let found=null;
   for(let n=1;n<=limit;n++){
    const next=tile(t.tx+dx*n*sign,t.ty+dy*n*sign,t.layer,c);if(!next)break;
    if(floor(next,c)&&!airMaterial(next,c)){found=next;break;}
    if(!accept(next,c))break;cells.push(next);
   }
   if(!found)return null;ends.push(found);
  }
  return{ends,cells};
 }
 function airRoute(t){
  const c=context();if(!c||!airMaterial(t,c)||!tile(t.tx,t.ty,t.layer,c))return false;
  if(cacheFrame!==snes.frames){airCache.clear();cacheFrame=snes.frames;}
  const key=t.layer*16384+t.ty*128+t.tx;if(airCache.has(key))return airCache.get(key);
  const accepted=span(t,1,0,airMaterial,48,c)||span(t,0,1,airMaterial,48,c);airCache.set(key,accepted);return accepted;
 }
 const wall=(t,c)=>ordinary(t)&&(t.flags&7)===3&&!airMaterial(t,c)&&!protectedCell(t,c);
 function floorSample(origin,c){
  // A walkable platform lip may contain a railing or the top of a wall.
  // Prefer a nearby patch surrounded by floor, so demolition does not tile
  // that decorative edge across the new passage. Stay on the incoming floor.
  if(floorFrame!==snes.frames){floorCache.clear();floorFrame=snes.frames;}
  if(floorCache.has(origin.address))return floorCache.get(origin.address);
  const other=1-origin.layer,back=tile(origin.tx,origin.ty,other,c),queue=[origin],seen=new Set([origin.address]);
  const same=t=>floor(t,c)&&!airMaterial(t,c)&&(t.flags&3)===(origin.flags&3);
  const score=t=>{
   let n=t.flags&0x60?-9:0;
   for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(same(tile(t.tx+x,t.ty+y,t.layer,c)))n++;
   return n;
  };
  let best=origin,quality=score(origin);
  for(let i=0;i<queue.length;i++){
   const t=queue[i],paired=tile(t.tx,t.ty,other,c),q=score(t);
   if(q>quality&&!!paired===!!back&&(!paired||ordinary(paired))){best=t;quality=q;}
   if(quality===9)break;
   for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){
    const next=tile(t.tx+dx,t.ty+dy,t.layer,c);
    if(!next||seen.has(next.address)||Math.abs(next.tx-origin.tx)+Math.abs(next.ty-origin.ty)>4||!same(next))continue;
    seen.add(next.address);queue.push(next);
   }
  }
  floorCache.set(origin.address,best);return best;
 }
 function breach(t,{dx=0,dy=0}={}){
  const c=context();if(!c||!wall(t,c)||!tile(t.tx,t.ty,t.layer,c))return null;
  const axes=Math.abs(dx)>Math.abs(dy)?[[1,0]]:Math.abs(dy)>0?[[0,1]]:[[1,0],[0,1]];
  for(const[ax,ay]of axes){
   const path=span(t,ax,ay,wall,10,c);if(!path||path.cells.length>10)continue;
   const[a,b]=path.ends;if((a.flags&3)!==(b.flags&3))continue;
   // Use the floor on the incoming side, including its other visual layer.
   // Both layers must be ordinary scenery: never erase a trigger, doorway,
   // whip post or the second level of an overpass.
   const incoming=(ax?dx:dy)>=0?a:b,source=floorSample(incoming,c),other=1-t.layer,back=tile(source.tx,source.ty,other,c);
   if(back&&!ordinary(back))continue;
   const edits=[];let safe=true;
   for(const cell of path.cells){
    const overlay=tile(cell.tx,cell.ty,other,c);
    if(overlay&&!ordinary(overlay)||!!overlay!==!!back){safe=false;break;}
    const witnesses=[a,b,source,...(back?[back]:[])].map(v=>({address:v.address,tile:v.tile,descriptor:v.descriptor,flags:v.flags,behavior:v.behavior,code:v.code}));
    edits.push({...cell,replacement:source.tile,demolition:true,dungeon:c.group.id,witnesses});
    if(overlay&&overlay.tile!==back.tile)edits.push({...overlay,replacement:back.tile,demolition:true,dungeon:c.group.id,witnesses});
   }
   if(safe)return{...path,edits,group:c.group,source};
  }
  return null;
 }
 function demolish(tiles,attack={}){
  const edits=new Map();for(const point of tiles){const t=tile(point.tx,point.ty,point.layer??(r[0xe00b]&128?1:0)),plan=t&&breach(t,attack);if(plan)for(const edit of plan.edits)edits.set(edit.address,edit);}
  return[...edits.values()];
 }
 return{context,tile,floor,air:t=>!!airRoute(t),airRoute,breach,demolish,invalidate(){cache=null;airCache.clear();floorCache.clear();cacheFrame=contextFrame=floorFrame=-1;}};
}
