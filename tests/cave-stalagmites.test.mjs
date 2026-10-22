import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readMap,readTileset} from '../tools/rom/rom.mjs';
import {caveStalagmites,stalagmiteLatches,stalagmiteTileset,stalagmiteAt} from '../engine/cave-stalagmites.js';
import {createNativePlants} from '../engine/native-plants.js';
import {createNativeLocalFlight} from '../engine/native-local-flight.js';

let rom=new Uint8Array(readFileSync('rom/secret-of-mana-us.sfc'));if(rom.length%0x8000===512)rom=rom.slice(512);
const word=a=>rom[a]|rom[a+1]<<8;
const tileset=readTileset(rom,stalagmiteTileset);
// Static descriptor (C0:B0000 collision types): flags, behaviour, code, replacement.
const desc=meta=>Array.from(rom.subarray(0xb0000+tileset.collision[meta]*4,0xb0004+tileset.collision[meta]*4));
// BG1 walkability as the native collision treats it: heights 1/2 exclusive,
// 0 meets both, 1x transition strips change floors. Walk-on tiles
// (behaviour bit 7, the doors the loader numbers as triggers) are exits.
function regions(map,over=new Map()){
 const {width:W,height:H,layers}=map.composite,id=new Int32Array(W*H).fill(-1),exits=[];
 const cell=i=>{const t=over.get(i)??layers.background[i];if(t===null)return null;const[f,b,c]=desc(t);return(f&7)===3||f&8?null:{h:f&7,trans:c>=0x10&&c<=0x17,exit:!!(b&0x80)};};
 let n=0;
 for(let s=0;s<W*H;s++){if(id[s]>=0||!cell(s))continue;const q=[s];id[s]=n;exits[n]=0;
  while(q.length){const i=q.pop(),a=cell(i);if(a.exit)exits[n]++;
   for(const j of[i%W?i-1:-1,i%W<W-1?i+1:-1,i-W,i+W]){if(j<0||j>=W*H||id[j]>=0)continue;const b=cell(j);if(b&&(a.h===b.h||!a.h||!b.h||a.trans||b.trans)){id[j]=n;q.push(j);}}}
  n++;}
 return{id,exits};
}

test('every decorative cave stalagmite matches the cartridge, its floor and a closed neighbourhood',()=>{
 for(const o of caveStalagmites){
  const map=readMap(rom,o.map),{width:W,layers}=map.composite,label=`map ${o.map} ${JSON.stringify(o.cells[0])}`;
  assert.equal(map.header.tileset16,stalagmiteTileset,label);assert.equal(map.header.layer1UsesForegroundTiles,false,'BG1 tile ids are metatiles');
  const cells=new Set(o.cells.map(([x,y])=>y*W+x));
  for(const[x,y,tile]of o.cells){
   assert.equal(layers.background[y*W+x],tile,`${label}: retail tile at ${x},${y}`);
   assert.ok([105,106,121,122].includes(tile),`${label}: a stalagmite spire or base`);
   assert.equal(desc(tile)[2],0,'no native cut code');
   // The base layout places it; story pieces are not scenery. (A story piece
   // may still cover a cell later, like the plaza's pit: the runtime checks
   // each cell's retail tile.)
   const top=map.pieces.filter(p=>p.layer==='background'&&p.visibility.min===0&&x>=p.x&&x<p.x+p.width&&y>=p.y&&y<p.y+p.height).at(-1);
   assert.ok(o.latch||top.visibility.flag===0&&top.visibility.min===0&&top.visibility.max===15,`${label}: unconditional piece`);
  }
  const floor=desc(o.floor);
  assert.ok(floor[2]===0&&(floor[0]&7)!==3&&!(floor[0]&8)&&!(floor[1]&0x80),`${label}: plain walkable floor`);
  // The spire variant names the floor the stalagmite stands on (105 on
  // height 2, 106 on height 1); one leaning into a cliff has no such floor.
  for(const[,,tile]of o.cells)if(tile===105||tile===106)assert.equal(desc(tile)[0]&7,floor[0]&7,`${label}: spire on this floor`);
  assert.equal(caveStalagmites.filter(p=>p.map===o.map).flatMap(p=>p.cells).filter(([x,y])=>cells.has(y*W+x)).length,cells.size,'objects never share a cell');
  if(o.latch){
   // The retail game's own opened layout: the gated piece covers exactly
   // these cells with this floor, and the loader record is the one read.
   const at=0x80000+o.record;assert.ok(at>=0x80000+word(0x85000+o.map*2)&&at<0x80000+word(0x85002+o.map*2),'record in this map');
   const piece=map.pieces.find(p=>p.x===rom[at+3]>>1&&p.y===rom[at+4]>>1&&p.visibility.flag===rom[at]);
   assert.ok(piece&&piece.width*piece.height===cells.size,'the gated piece covers the object');
   for(let i=0;i<piece.tiles.length;i++){assert.ok(cells.has((piece.y+(i/piece.width|0))*W+piece.x+i%piece.width));assert.equal(piece.tiles[i],o.floor,'opened floor');}
   assert.equal(rom[at],0x14,'gated by CF14');assert.equal(rom[at+1]>>4,7,'opened natively at CF14 7');
  }else{
   // Every walkable neighbour is plain floor of the same height (no
   // transition strip, trigger or other height) and nothing new connects.
   for(const i of cells)for(const j of[i-1,i+1,i-W,i+W]){
    if(cells.has(j))continue;const t=layers.background[j],[f,b,c]=desc(t);if((f&7)===3||f&8)continue;
    assert.ok(c===0&&!(b&0x80)&&(f&7)===(floor[0]&7),`${label}: neighbour ${j%W},${j/W|0} tile ${t}`);
   }
  }
  const before=regions(map),touched=new Set();
  for(const i of cells)for(const j of[i-1,i+1,i-W,i+W])if(!cells.has(j)&&before.id[j]>=0)touched.add(before.id[j]);
  if(o.latch){
   // Watts's shortcut joins the forge (door to the village) and the stairs (door to map 288).
   assert.equal(touched.size,2,label);for(const r of touched)assert.ok(before.exits[r]>0,'both sides have their own door');
  }else assert.equal(touched.size,1,`${label}: a local obstacle, no new route`);
 }
 assert.deepEqual(stalagmiteLatches.map(o=>[o.map,o.latch,o.record]),[[294,'watts-shortcut',0x79f9]]);
});

// A live-like machine for one map: the cartridge's own composite grid and
// collision descriptors (tiles below the trigger ids are static).
function machine(id,flags={}){
 const map=readMap(rom,id,'',flags),{width:W,height:H,layers}=map.composite,ram=new Uint8Array(0x20000),cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=layers.background[y*W+x];if(t!==null)ram[0x10000+y*128+x]=t;}
 for(let t=0;t<192;t++)ram.set(desc(t),0x1b800+t*4);
 ram[0xdc]=id&255;ram[0xdd]=id>>8;ram[0xc0]=(W*16)&255;ram[0xc1]=W*16>>8;ram[0xc2]=(H*16)&255;ram[0xc3]=H*16>>8;
 const data=new Uint8Array(rom);data.set([0xe2,0x30,0xa5,0x2e],0xc7c3);cpu.br[4]=0xc7c3;
 const snes={ram,cpu,cart:{data},frames:0,ppu:{mode:1}},cuts=[],flight=createNativeLocalFlight(snes,{});
 const plants=createNativePlants(snes,{canCut:()=>true,sceneryReplacement:t=>flight.breakScenery(t),onCut:r=>cuts.push(r)});
 const drain=()=>{for(let i=0;i<8;i++){ram[0x82]=0;ram[0x2e]=0;snes.frames++;cpu.cycle();}};
 return{ram,snes,plants,flight,cuts,drain,tile:(x,y)=>ram[0x10000+y*128+x]};
}

test("one punch or wave breaks Watts's whole stalagmite to the retail opened floor and marks the latch",()=>{
 const watts=caveStalagmites[0];
 for(const[policy,x,y,length]of[['objects',20,12,28],['beam',20,13,200],['super-beam',21,12,640]]){
  const m=machine(294);
  assert.equal(m.flight.breakScenery(m.plants.metadata(20,11,0)),0x46);
  assert.deepEqual(m.plants.beam({x:x*16+8,y:y*16+8,dx:0,dy:-1,length,halfWidth:policy==='objects'?9:19,policy}).map(t=>[t.tx,t.ty]),watts.cells.map(([tx,ty])=>[tx,ty]),policy);
  m.drain();
  for(const[tx,ty]of watts.cells){assert.equal(m.tile(tx,ty),0x46);assert.equal(m.plants.wasCleared(tx,ty,0),true,'spires and bases replay after a native rebuild');}
  assert.deepEqual(m.cuts.map(c=>c.tiles.length),[3,3],'two native row redraws');
  assert.ok(m.cuts.every(c=>c.tiles.every(t=>t.stalagmite==='watts-shortcut')),'the latch reaches onCut');
 }
 // A grazing punch at one spire still takes the whole object.
 let m=machine(294);m.plants.enqueueTiles([{tx:21,ty:10,layer:0}],{policy:'objects'});m.drain();
 for(const[tx,ty]of watts.cells)assert.equal(m.tile(tx,ty),0x46);
 // Plants policy (the native sword path) and another layer never break it.
 m=machine(294);assert.equal(m.plants.enqueueTiles([{tx:20,ty:11,layer:0}],{policy:'plants'}).length,0);
 assert.equal(m.plants.enqueueTiles([{tx:20,ty:11,layer:1}],{policy:'objects'}).length,0);
 // With CF14 at 7 the retail floor is already there: nothing to break.
 m=machine(294,{20:7});assert.equal(m.plants.enqueueTiles(watts.cells.map(([tx,ty])=>({tx,ty,layer:0})),{policy:'super-beam'}).length,0);
 // A native rebuild that restores the stalagmites is replayed silently.
 m=machine(294);m.plants.enqueueTiles([{tx:20,ty:11,layer:0}],{policy:'objects'});m.drain();
 for(const[tx,ty,t]of watts.cells)m.ram[0x10000+ty*128+tx]=t;
 m.ram[0x95]=0;m.drain();for(const[tx,ty]of watts.cells)assert.equal(m.tile(tx,ty),0x46);
 assert.equal(m.cuts.filter(c=>!c.replayed).length,2,'replays do not count as new cuts');
});

test('Dwarf Village plaza stalagmites break whole to the plaza floor and stay ordinary scenery',()=>{
 for(const o of caveStalagmites.filter(o=>o.map===287)){
  const m=machine(287),[tx,ty]=o.cells.at(-1);
  m.plants.enqueueTiles([{tx,ty,layer:0}],{policy:'objects'});m.drain();
  for(const[x,y]of o.cells)assert.equal(m.tile(x,y),0x2b,`${x},${y}`);
  assert.ok(m.cuts.flatMap(c=>c.tiles).every(t=>t.stalagmite===true),'no latch: native respawn on the next visit');
 }
 // The plaza's cliff-side stalagmites and their twins elsewhere stay put.
 const m=machine(287);
 for(const[x,y]of[[27,30],[27,31],[14,33],[16,33],[34,36],[25,32],[35,39]]){
  assert.equal(stalagmiteAt(287,m.plants.metadata(x,y,0)),null);assert.equal(m.flight.breakScenery(m.plants.metadata(x,y,0)),null,`${x},${y}`);
 }
 // The same tile at another map position is not an object cell.
 const t=m.plants.metadata(22,33,0);assert.equal(stalagmiteAt(290,t),null);assert.equal(stalagmiteAt(287,{...t,tile:0x7a}),null);
});
