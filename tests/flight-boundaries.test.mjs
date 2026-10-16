import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeLocalFlight} from '../engine/native-local-flight.js';

function fixture(options={}){
  const ram=new Uint8Array(0x20000),cpu={r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}};
  const word=(a,v)=>{ram[a]=v&255;ram[a+1]=v>>8;};
  ram.set([0x5c,0xa8,0xc0,0,0x5c,0xcf,0xc1,0],0x100);
  word(0xc0,128);word(0xc2,96);word(0xe002,25);word(0xe004,40);ram[0xe000]=ram[0xe02c]=1;
  for(const layer of [0,1]){
    const at=0x1b800+layer*0x400;
    ram.set([3,0,0xc8,0],at+4);ram.set([3,0,0,0],at+8);
    ram.set([0,0,4,0],at+12);ram.set([0,0,0xc1,5],at+16);ram.set([0,0,0xc1,4],at+20);
    ram.set([3,0,0xc2,0],at+24);
  }
  const snes={ram,cpu},hook=createNativeLocalFlight(snes,{active:()=>true,speed:8,phase:true,...options});
  const tile=(x,y,t,layer=0)=>{ram[0x10000+layer*0x4000+y*128+x]=t;};
  const phase=(dx=6,dy=0)=>{ram[0x1e]=dx;ram[0x1f]=dy;cpu.br[4]=0xd778;cpu.cycle();return cpu.br[4]===0xd7f3;};
  return{snes,ram,cpu,word,hook,tile,phase};
}

test('destroyed deck blocks walking and landing but remains flyable inside native map bounds',()=>{
 let flying=false;
 const {hook,cpu,ram,word}=fixture({enabled:()=>true,active:()=>flying,phase:()=>flying,missingFloor:(x,y)=>x>=32&&x<64&&y>=32&&y<64});
 assert.equal(hook.canLand(40,40),false);assert.equal(hook.canFly(40,40),true);
 word(0xe002,25);word(0xe004,40);ram[0x1e]=3;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],0,'Feet stop at the broken tile');
 flying=true;ram[0x1e]=3;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],8,'Flight crosses the same tile at full speed');
 assert.equal(hook.canFly(-1,40),false);assert.equal(hook.canFly(128,40),false);
});

test('Mana Beast flight stays inside its fixed arena without scrolling Mode 7 art',()=>{
 const {snes,ram,cpu,word,hook,phase}=fixture();snes.ppu={mode:7};word(0xdc,253);word(0xc0,576);word(0xc2,576);
 ram.set([3,0,0,0],0x1b800);word(0xe002,296);word(0xe004,320);
 assert.equal(hook.canFly(296,320),true);assert.equal(hook.canLand(),false);assert.equal(phase(),true);
 hook.settle();assert.equal(hook.recovered,0,'Open sky is not a corrupt map position');
 for(const [x,y]of[[183,320],[409,320],[296,291],[296,433]])assert.equal(hook.canFly(x,y),false);
 word(0xe002,408);ram[0x1e]=8;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],0,'Holding right stops at the arena edge');
 ram[0x84]=8;ram[0x86]=0x88;cpu.br[4]=0xd6ac;cpu.cycle();assert.equal(ram[0x84]|ram[0x86],0);
 word(0xdc,252);assert.equal(hook.canFly(296,320),false,'No other Mode 7 map inherits this exception');
 ram[0x84]=8;cpu.br[4]=0xd6ac;cpu.cycle();assert.equal(ram[0x84],8);
});

test('flight crosses low native obstacles, but walls, slopes and switches retain native collision',()=>{
  for(const t of [1,2,3,4,6]){
    const {hook,tile,phase}=fixture();tile(2,2,t);
    assert.equal(phase(),t===1||t===6,`descriptor ${t}`);
    assert.equal(hook.canLand(36,40),false,'cannot land inside any obstacle');
  }
});

test('terrain height one is walkable, low objects can be exited, and unsafe high-speed steps are limited',()=>{
  const {hook,ram,word,tile,phase,cpu}=fixture();
  ram[0xe00b]=1;ram.set([1,0,0,0],0x1b800);
  assert.equal(hook.canLand(25,40),true);
  tile(2,2,1);word(0xe002,46);
  assert.equal(phase(8),true,'leave an obstacle even when the destination is all clear');
  word(0xe002,25);tile(2,2,2);ram[0x1e]=8;cpu.br[4]=0xd651;cpu.cycle();
  assert.equal(ram[0x1e],1,'native collision receives a single pixel near a wall');
});

test('water currents and stairs are flyable floors, with guidance bypassed only in flight',()=>{
  for(const code of [0x20,0x21,0x22,0x23,0x31,0x3f]){
    const {hook,ram,cpu}=fixture();ram.set([0,2,code,0],0x1b800);
    assert.equal(hook.canFly(40,40),true);assert.equal(hook.canLand(40,40),true);
    ram[0x1e]=2;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],8,'A safe floor keeps full flight speed');
    ram[0xe048]=code;cpu.br[4]=0xd359;cpu.cycle();assert.equal(cpu.br[4],0xd38e);
    ram[0x1b800]=3;assert.equal(hook.canFly(40,40),false,'Floor behavior cannot open a solid wall');
  }
  const {ram,cpu}=fixture({phase:false});ram[0xe048]=0x31;cpu.br[4]=0xd359;cpu.cycle();
  assert.equal(cpu.br[4],0xd359,'Walking and ground charging retain native currents');
});

test('flight restores the last safe position after an unexpected out-of-bounds displacement',()=>{
  const {hook,word}=fixture();hook.settle();const state=hook.snapshot();
  word(0xe002,65530);hook.settle();
  assert.equal(hook.recovered,1);assert.equal(hook.canLand(),true);
  assert.deepEqual(hook.snapshot(),state);
});

test('the full flight footprint prevents corner cutting and checks each intermediate pixel',()=>{
  const {tile,phase,word}=fixture();tile(2,2,1);tile(2,1,2);
  assert.equal(phase(),true);
  word(0xe004,35);assert.equal(phase(),false,'top of footprint clips the wall');
  tile(2,1,0);tile(2,2,2);tile(3,2,1);word(0xe002,25);
  assert.equal(phase(24),false,'cannot tunnel through a wall to reach a low obstacle');
});

test('map size, collision layer and live obstacle changes immediately alter flight boundaries',()=>{
  const {tile,hook,ram,word,cpu,phase}=fixture();tile(2,2,1);tile(2,2,2,1);
  assert.equal(phase(),true);ram[0xe00b]=0x80;assert.equal(phase(),false);
  ram[0xe00b]=0;tile(2,2,0);assert.equal(hook.canLand(40,40),true);assert.equal(hook.canFloat(40,40),false);
  for(const [x,y]of [[-1,40],[4,40],[124,40],[40,-1],[40,92],[128,40]])assert.equal(hook.canLand(x,y),false);
  word(0xe002,119);ram[0x1e]=8;cpu.br[4]=0xd651;cpu.cycle();assert.equal(ram[0x1e],1,'clamped before wrap');
  word(0xc0,64);assert.equal(hook.canLand(80,40),false,'new map has its own bounds');
});

test('the ferry crossing keeps decorative stars airborne and needs both real piers',()=>{
 const {ram,word,tile,hook}=fixture();word(0xdc,32);word(0xc0,1024);word(0xc2,1024);ram[0xe00b]=0x82;
 ram.set([0x13,6,0,0],0x1bc00);ram.set([0x12,7,0,0],0x1bc00+4);ram.set([0x12,6,0,0],0x1bc00+8);
 for(let x=24;x<=29;x++){tile(x,17,1,1);tile(x,44,1,1);}
 tile(26,25,2,1); // Native star artwork has a misleading floor descriptor.
 assert.equal(hook.canFly(424,408,1),true);assert.equal(hook.canLand(424,408,1),false);
 assert.equal(hook.canFly(424,280,1),true);assert.equal(hook.canLand(424,280,1),true);
 assert.equal(hook.canFly(376,408,1),false,'the outer void is not part of this route');
 tile(26,44,0,1);assert.equal(hook.canFly(424,392,1),false,'missing destination pier closes the crossing');
 tile(26,44,1,1);word(0xdc,33);assert.equal(hook.canFly(424,392,1),false,'ferry travel/other maps retain their own geometry');
});

test('flight can change terrain height, and forest banks require usable ground on both sides',()=>{
 const {hook,ram,word,tile,phase,cpu}=fixture();
 ram[0xe00b]=1;ram.set([2,0,0,0],0x1b800);
 assert.equal(hook.canLand(25,40),false);assert.equal(hook.canFly(25,40),true,'fly between native height bands');
 assert.equal(hook.canLand(25,40,0,2),true,'teleport checks the target terrain, not Goku’s old terrain');
 hook.settle();assert.equal(ram[0xe00b],2);assert.equal(hook.canLand(25,40),true,'flight can land at its new height without walking through a staircase');
 const rom=new Uint8Array(0x90000);rom[0x80002]=2;
 // This fixture needs cartridge art metadata to distinguish banks from trees.
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 ram.set([3,0,0,0],0x1b800+62*4);ram.set([0x73,0,0,0],0x1b800+186*4);
 for(let y=0;y<6;y++)tile(2,y,62);
 assert.equal(native.canFly(40,40),true,'a thin riverbank between two shores');
 assert.equal(native.canLand(40,40),false,'stay airborne over the rock face');
 for(let y=0;y<6;y++)for(let x=3;x<8;x++)tile(x,y,186);
 assert.equal(native.canFly(40,40),false,'the same bank art at the forest/void boundary stays closed');
 native.dispose();
});

test('flight passes NPC contact without disabling enemy collisions or ground conversations',()=>{
 for(const flying of[false,true])for(const species of[0x10,0x90]){
  const {ram,cpu,hook}=fixture({phase:flying});ram[0xe600]=1;ram[0xe780]=species;cpu.r[1]=1;cpu.br[1]=0;cpu.br[2]=0x600;cpu.br[4]=0xd017;cpu.cycle();
  assert.equal(cpu.br[4],flying&&species===0x90?0xcfe4:0xd017);assert.equal(hook.npcPasses,flying&&species===0x90?1:0);
 }
});

test('low village and woodland earth terraces are flyable only between real ground inside the map',()=>{
 for(const tileset of[0,1]){
  const {ram,cpu,tile,word}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=tileset;
  const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
  ram.set([0x12,6,0,0],0x1b800);ram.set([0x13,6,0,0],0x1b800+186*4);
  // Straight face, sloping end and inner corner use the same shared art in
  // both tilesets. Native collision differs, but flight may cross all three.
  for(const id of[102,96,117]){
   ram.set([0x13,6,0,0],0x1b800+id*4);
   for(let x=0;x<8;x++)tile(x,2,id);
   assert.equal(native.canFly(56,40),true);assert.equal(native.canLand(56,40),false);
   for(let y=0;y<2;y++)for(let x=0;x<8;x++)tile(x,y,186);
   assert.equal(native.canFly(56,40),false,'a terrace ending at forest void stays closed');
   for(let y=0;y<2;y++)for(let x=0;x<8;x++)tile(x,y,0);
  }
  // A doorway or layer-change marker is not a valid landing beyond a bank.
  ram.set([0x12,0x80,0,0],0x1b800+190*4);for(let x=0;x<8;x++)tile(x,1,190);
  assert.equal(native.canFly(56,40),false);for(let x=0;x<8;x++)tile(x,1,0);
  word(0xc2,48);assert.equal(native.canFly(56,40),false,'the far shore is outside the map bounds');word(0xc2,96);
  for(const [x,y]of[[-1,40],[4,40],[128,40],[56,-1],[56,96]])assert.equal(native.canFly(x,y),false);
  ram.set([0x13,6,0,0],0x1b800+53*4);tile(3,2,53);assert.equal(native.canFly(56,40),false,'a house wall does not become a terrace');
  native.dispose();
 }
});
test('woodland and town stream banks cross adjacent lily pads, but still need ground beyond them',()=>{
 for(const tileset of[0,1]){
  const {ram,cpu,tile}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=tileset;
  const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
  const pads=tileset===0?[130,159]:[159,162];
  ram.set([0x12,6,0,0],0x1b800);ram.set([0x13,6,0,0],0x1b800+186*4);
  for(const id of[82,89,90,91,94])for(const pad of pads){
   ram.set([0x13,6,0,0],0x1b800+id*4);ram.set([0x13,6,0,0],0x1b800+pad*4);
   for(let y=0;y<6;y++){tile(2,y,id);tile(3,y,pad);}
   assert.equal(native.canFly(40,40),true,`set ${tileset}: bank ${id} across pad ${pad}`);
   assert.equal(native.canFly(56,40),true);assert.equal(native.canLand(56,40),false);
   for(let y=0;y<6;y++)for(let x=4;x<8;x++)tile(x,y,186);
   assert.equal(native.canFly(40,40),false,'no shore beyond the pad closes the bank');
   for(let y=0;y<6;y++)for(let x=4;x<8;x++)tile(x,y,0);
  }
  native.dispose();
 }
});

test('plain and flowering Water Palace lily pads are low scenery, not landing floors or walls',()=>{
 const {ram,cpu,tile}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=22;
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 for(const id of[173,174]){
  ram.set([0x13,6,0,0],0x1b800+id*4);tile(2,2,id);
  for(let x=34;x<=45;x++){assert.equal(native.canFly(x,40),true);assert.equal(native.canLand(x,40),false);}
 }
 for(const id of[120,175]){
  ram.set([0x13,6,0,0],0x1b800+id*4);tile(2,2,id);
  assert.equal(native.canFly(40,40),false,'palace walls and column bases retain collision');
 }
 native.dispose();
});

test('multiple movement updates cannot outrun one VRAM row/column upload in a video frame',()=>{
 const {ram,cpu}=fixture(),distances=[];
 for(let i=0;i<3;i++){ram[0x1e]=8;cpu.br[4]=0xd651;cpu.cycle();distances.push(ram[0x1e]);}
 assert.deepEqual(distances,[8,6,0]);
});

test('palace flight crosses enclosed platform gaps but stops at walls and open map voids',()=>{
 const {ram,cpu,tile}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=23;
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 ram.set([0x12,7,0,0],0x1b800+185*4);
 for(const id of[6,22,38,54,187,16])ram.set([0x13,6,0,0],0x1b800+id*4);
 // No ordinary zero tile is ground in this palace; build two real platforms.
 ram.set([0x13,6,0,0],0x1b800);
 for(let x=1;x<7;x++){tile(x,1,185);tile(x,2,6);tile(x,3,22);tile(x,4,187);tile(x,5,185);}
 for(const y of[40,56,72]){assert.equal(native.canFly(56,y),true);assert.equal(native.canLand(56,y),false);}
 tile(3,1,187);assert.equal(native.canFly(56,56),false,'a gap needs a real shore at both ends');
 tile(3,1,185);tile(3,3,16);assert.equal(native.canFly(56,56),false,'upright walls never become gap tiles');
 assert.equal(native.canFly(4,56),false,'the map boundary remains closed');native.dispose();
});

test('ruins balcony flight crosses short floor lips between heights, not walls or voids',()=>{
 const {ram,cpu,tile,word}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=9|128;ram[0xe00b]=0x81;
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 ram.set([0x12,6,0,0],0x1bc00+153*4);ram.set([0x11,7,0,0],0x1bc00+46*4);ram.set([0x13,6,0,0],0x1bc00+30*4);
 for(let x=0;x<8;x++){tile(x,1,153,1);tile(x,2,30,1);tile(x,3,46,1);}
 assert.equal(native.canFly(56,40,1),true);assert.equal(native.canLand(56,40,1),false);
 word(0xe002,56);word(0xe004,24);native.settle();assert.equal(ram[0xe00b],0x82,'landing adopts the upper balcony height');
 tile(3,1,46,1);assert.equal(native.canFly(56,40,1),false,'a wall between same-height floors remains solid');
 tile(3,1,0,1);assert.equal(native.canFly(56,40,1),false,'blank map buffer is not an upper floor');
 tile(3,1,153,1);ram.set([0x13,6,0,0],0x1bc00+31*4);tile(3,2,31,1);assert.equal(native.canFly(56,40,1),false,'upright wall art remains solid');
 native.dispose();
});

test('forest carved heads can be flown over and smashed without opening solid tree placeholders',()=>{
 const {ram,cpu,tile}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=1|128;ram[0xe00b]=2;
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 for(const id of[171,172])ram.set([0x13,0,0xc1,343-id],0x1b800+id*4);
 for(const id of[171,172]){tile(2,2,id);assert.equal(native.canFly(40,40),true);assert.equal(native.canLand(40,40),false);assert.equal(native.breakScenery(native.tileAt(40,40)),161);}
 ram.set([0x13,6,0,0],0x1b800+186*4);tile(2,2,186);assert.equal(native.canFly(40,40),false);assert.equal(native.breakScenery(native.tileAt(40,40)),null);
 rom[0x80002]=2|128;tile(2,2,171);assert.equal(native.canFly(40,40),false,'other tilesets cannot inherit the statue exception');assert.equal(native.breakScenery(native.tileAt(40,40)),null);
 native.dispose();
});

test('whip flight opens only the complete native pad/post corridor with ground beyond both ends',()=>{
 const {ram,cpu,tile,word}=fixture(),rom=new Uint8Array(0x90000);word(0xc0,160);rom[0x80002]=10;ram[0xb8]=1;
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 ram.set([0x12,6,0,0],0x1b800+101*4);for(let y=0;y<6;y++)for(let x=0;x<10;x++)tile(x,y,101);ram.set([0x13,7,0,0],0x1b800+41*4);ram.set([0x13,7,0xf8,0x6f],0x1b800+130*4);ram.set([0x10,0x46,0,0],0x1b800+191*4);
 tile(2,2,191);for(let x=3;x<6;x++)tile(x,2,41);tile(6,2,130);tile(4,3,41);
 for(let x=40;x<=120;x++)assert.equal(native.canFly(x,40),true,`swept footprint at ${x}`);
 for(const x of[56,72,88,104])assert.equal(native.canLand(x,40),false,'cannot land in the gap or on its post');
 assert.equal(native.canFly(72,56),false,'nearby cliff art remains solid');
 tile(7,2,41);assert.equal(native.canFly(72,40),false,'no ground behind the post');tile(7,2,101);
 tile(1,2,41);assert.equal(native.canFly(72,40),false,'no ground behind the pad');tile(1,2,101);
 ram[0xb8]=2;assert.equal(native.canFly(72,40),false,'BF has a different purpose in other special-tile modes');ram[0xb8]=1;
 tile(2,2,101);assert.equal(native.canFly(72,40),false,'a decorative post alone never opens a cliff');tile(2,2,191);
 ram[0x1b800+41*4+1]|=0x10;assert.equal(native.canFly(72,40),false,'a layer-change seam is not gap airspace');native.dispose();
});

test('a native return pad may share the adjacent whip lane anchor, but ordinary floor cannot',()=>{
 const {ram,cpu,tile,word}=fixture(),rom=new Uint8Array(0x90000);word(0xc0,160);ram[0xb8]=1;
 const native=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
 ram.set([0x12,6,0,0],0x1b800);ram.set([0x13,7,0,0],0x1b800+41*4);ram.set([0x13,7,0xf8,0x6f],0x1b800+130*4);ram.set([0x10,0x46,0,0],0x1b800+191*4);
 tile(2,2,191);tile(6,2,130);tile(6,3,191);
 for(let x=3;x<6;x++){tile(x,2,41);tile(x,3,41);}
 assert.equal(native.canFly(72,56),true,'the return pad has its adjacent real anchor');
 tile(6,3,0);assert.equal(native.canFly(72,56),false,'the exception requires the return pad');native.dispose();
});

test('castle chasms and Gaia lava/air need two real shores and never become landing floors',()=>{
 for(const [map,set,gap,edge,floor,wall]of[[302,15,90,106,100,56],[285,10,41,20,70,118],[284,10,5,4,70,118]]){
  const {ram,cpu,tile,word}=fixture(),rom=new Uint8Array(0x90000);rom[0x80002]=set;word(0xdc,map);
  const h=createNativeLocalFlight({ram,cpu,cart:{data:rom}},{active:()=>true,phase:true});
  ram.set([0x13,6,0,0],0x1b800+wall*4);ram.set([0x12,7,0,0],0x1b800+floor*4);
  for(const id of[gap,edge])ram.set([0x13,6,0,0],0x1b800+id*4);
  for(let y=0;y<6;y++)for(let x=0;x<8;x++)tile(x,y,wall);
  for(let x=1;x<7;x++){tile(x,1,floor);tile(x,2,edge);tile(x,3,gap);tile(x,4,floor);}
  for(let y=36;y<=60;y++){assert.equal(h.canFly(56,y),true,`${map}: ${y}`);assert.equal(h.canLand(56,y,0,2),false);}
  tile(3,4,wall);assert.equal(h.canFly(56,56),false,'no far shore');tile(3,4,floor);
  assert.equal(h.canFly(8,56),false,'outside the corridor');assert.equal(h.canFly(-8,56),false,'outside the map');
  ram.set([0x12,0x80,0,0],0x1b800+floor*4);assert.equal(h.canFly(56,56),false,'an event or door is not a shore');h.dispose();
 }
});
