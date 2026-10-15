import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonGeometry,dungeonGroups,dungeonSpecialScenes} from '../engine/dungeon-geometry.js';
import {createNativePlants} from '../engine/native-plants.js';
import {createNativeLocalFlight} from '../engine/native-local-flight.js';

function fixture({map=312,tileset=23|128}={}){
 const ram=new Uint8Array(0x20000),data=new Uint8Array(0x100000),word=(r,a,v)=>{r[a]=v&255;r[a+1]=v>>8;};
 const cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}},snes={ram,cpu,cart:{data},frames:1};
 word(ram,0xdc,map);word(ram,0xc0,192);word(ram,0xc2,192);
 word(data,0x87000+map*2,0x2000);data[0x82002]=tileset;
 word(data,0x85000+map*2,0x1000);word(data,0x85002+map*2,0x100b);
 data.set([0,15,0,0,0,255,0,15,0,0,0],0x81000);word(data,0xd0004,0x1000);data.set([22,22],0xd1000);
 const descriptor=(id,bytes,l=0)=>ram.set(bytes,0x1b800+l*0x400+id*4);
 const put=(x,y,id,l=0)=>{ram[0x10000+l*0x4000+y*128+x]=id;};
 descriptor(0,[0x13,6,0,0]);descriptor(10,[0x13,6,0,0]);descriptor(186,[0x12,6,0,0]);descriptor(187,[0x13,6,0,0]);
 descriptor(8,[0x13,6,0,0],1);descriptor(110,[0x12,6,0,0],1);
 for(let y=3;y<9;y++)for(let x=2;x<10;x++){put(x,y,x===5||x===6?10:186);put(x,y,x===5||x===6?8:110,1);}
 const g=createDungeonGeometry(snes);return{ram,data,cpu,snes,g,put,descriptor};
}
test('internal walls require two real floors at the same height and preserve both visual layers',()=>{
 const f=fixture(),t=f.g.tile(5,5,0),p=f.g.breach(t,{dx:1});
 assert.ok(p);assert.equal(p.cells.length,2);assert.equal(p.edits.length,4);assert.deepEqual(p.ends.map(t=>[t.tx,t.ty]),[[4,5],[7,5]]);
 assert.deepEqual(p.edits.map(t=>t.replacement),[186,110,186,110]);assert.equal(f.g.air(t),false);
 f.put(7,5,0);f.put(8,5,0);f.put(9,5,0);assert.equal(f.g.breach(t,{dx:1}),null,'outside filler is never a destination floor');
 f.put(7,5,185);f.descriptor(185,[0x11,6,0,0]);assert.equal(f.g.breach(t,{dx:1}),null,'different height floors must use flight');
});
test('dungeon gap flight needs two shores and cannot use scripts, unplaced space or clipped entrance pockets',()=>{
 const f=fixture();for(let y=3;y<9;y++)for(const x of[5,6])f.put(x,y,187);
 assert.equal(f.g.air(f.g.tile(5,5,0)),true);assert.equal(f.g.breach(f.g.tile(5,5,0)),null,'beams do not manufacture floors over air');
 for(let x=7;x<11;x++)f.put(x,5,187);f.g.invalidate();assert.equal(f.g.air(f.g.tile(5,5,0)),false);
 f.put(7,5,186);f.descriptor(186,[0x12,0x86,0,0]);f.g.invalidate();assert.equal(f.g.air(f.g.tile(5,5,0)),false,'walk-on triggers do not count as shores');
 assert.equal(f.g.tile(0,5,0),null);assert.equal(f.g.tile(12,5,0),null);
});
test('Fortress entrance seams are flyable between decks but retain the hull and tower boundaries',()=>{
 const f=fixture({map:255,tileset:20|128}),h=createNativeLocalFlight(f.snes,{active:()=>true,phase:true});
 for(const id of[64,65,103,104,119,120,135,136,151,152,167,168]){
  f.descriptor(id,[0x13,6,0,0]);
  for(let y=3;y<9;y++)for(const x of[5,6])f.put(x,y,id);
  f.g.invalidate();h.dungeon.invalidate();
  for(let x=74;x<=118;x++)assert.equal(h.canFly(x,88,0),true,`Entrance seam ${id}, x=${x}`);
  assert.equal(h.canLand(88,88,0),false,'Goku must hover over the recessed seam');
 }
 f.descriptor(70,[0x73,6,0,0]);f.put(5,5,70);h.dungeon.invalidate();
 assert.equal(h.canFly(88,88,0),false,'A tall engine tower is not a deck gap');
 f.put(5,5,119);for(let x=7;x<12;x++)f.put(x,5,0);h.dungeon.invalidate();
 assert.equal(h.canFly(88,88,0),false,'The same rim cannot open the outer sky');
 f.put(7,5,186);f.descriptor(186,[0x12,0x86,0,0]);h.dungeon.invalidate();
 assert.equal(h.canFly(88,88,0),false,'A scripted doorway is not a destination deck');
 assert.equal(h.canFly(-8,88,0),false);assert.equal(h.canFly(192,88,0),false);h.dispose();
});
test('wall breaches sample open floor instead of repeating a decorative platform lip',()=>{
 const f=fixture();f.descriptor(15,[0x12,6,0,0]);f.put(4,5,15);
 const path=f.g.breach(f.g.tile(5,5,0),{dx:1});assert.ok(path);
 assert.equal(path.ends[0].tile,15);assert.equal(path.source.tile,186);assert.ok(path.edits.filter(e=>e.layer===0).every(e=>e.replacement===186));
});
test('demolition refuses script cells or layer changes even when they are on the other visual layer',()=>{
 for(const bytes of[[0x13,0x86,0,0],[0x13,0x46,0,0],[0x13,6,0xf8,0x6f],[0x1b,6,0,0]]){
  const f=fixture();f.descriptor(8,bytes,1);assert.equal(f.g.breach(f.g.tile(5,5,0),{dx:1}),null);
 }
 const f=fixture();f.ram[0xdc]=131;f.ram[0xdd]=0;assert.equal(f.g.context(),null,'town/intro graphics cannot become dungeon scenery');
 const ids=dungeonGroups.flatMap(g=>g.maps);assert.equal(new Set(ids).size,ids.length,'one reaction/progression family per room');
});
test('only full Super Saiyan beams queue wall demolition; native redraw and checkpoints retain the passage safely',()=>{
 const f=fixture();f.data.set([0xe2,0x30,0xa5,0x2e],0xc7c3);f.cpu.br[4]=0xc7c3;const cuts=[];
 const plants=createNativePlants(f.snes,{canCut:()=>f.ram[0xd0]===0,demolitionPlan:(tiles,a)=>f.g.demolish(tiles,a),onCut:r=>cuts.push(r)});
 const shot=policy=>plants.beam({x:72,y:88,dx:1,dy:0,length:48,halfWidth:0,policy});
 assert.equal(shot('objects').length,0);assert.ok(shot('super-beam').length>=4);
 const drain=()=>{for(let i=0;i<20;i++){f.ram[0x82]=0;f.snes.frames++;f.cpu.cycle();}};drain();
 assert.equal(plants.metadata(5,5,0).tile,186);assert.equal(plants.metadata(5,5,1).tile,110);
 const saved=plants.snapshot();f.put(5,5,10);f.put(5,5,8,1);plants.restore(saved);drain();assert.equal(plants.metadata(5,5,0).tile,186);
 f.put(5,5,10);f.put(4,5,0);drain();assert.equal(plants.metadata(5,5,0).tile,10,'a different room layout cannot inherit an old tunnel');
 assert.ok(cuts.some(c=>c.tiles.some(t=>t.demolition)));
});
test('piece visibility changes invalidate cached crossings and boss pictures never become collision geometry',()=>{
 const f=fixture();f.data[0x81000]=1;f.data[0x81001]=0;
 assert.ok(f.g.breach(f.g.tile(5,5,0)));
 f.ram[0xcf01]=1;f.snes.frames++;
 assert.equal(f.g.tile(5,5,0),null,'hidden pieces cannot be replaced by boss scratch bytes');
 f.ram[0xcf01]=0;f.g.invalidate();assert.ok(f.g.breach(f.g.tile(5,5,0)));
 for(const id of dungeonSpecialScenes.keys()){f.ram[0xdc]=id&255;f.ram[0xdd]=id>>8;assert.equal(f.g.context(),null);}
});
test('Fire Palace wall recesses cannot become copied floor across a demolished wall',()=>{
 const f=fixture();f.descriptor(90,[0x10,0,0,0]);f.descriptor(91,[0x10,0,0,0]);
 for(let x=1;x<11;x++)f.put(x,5,x<5?91:x>6?90:10);
 assert.equal(f.g.breach(f.g.tile(5,5,0),{dx:1}),null,'walkable collision alone does not make a window ledge safe floor art');
});
