import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {decodeMapPiece,decodeMetatiles,RomFormatError,requireRange} from '../tools/rom/map-codec.mjs';
import {crc32,inspectRom,extractPotos,decodeMapHeader,decodeObject,decodePlacements,
  decodeDoor,composeMap,readCollisionTypes,US_ROM} from '../tools/rom/rom.mjs';
import {decodePlanarTile,encodePng,snesColor,renderMap,readGraphics} from '../tools/rom/graphics.mjs';
import {readTileset} from '../tools/rom/rom.mjs';
import {decodeWorldRow,readWorldMap,renderWorld} from '../tools/rom/world.mjs';

const piece=(width,height,data)=>Uint8Array.from([(width-1)*2,(height-1)*2,...data]);
test('map literals preserve row-major order and consume only their own stream',()=>{
  const decoded=decodeMapPiece(piece(3,2,[1,2,3,4,5,6,0xff]));
  assert.deepEqual(decoded.tiles,[1,2,3,4,5,6]);
  assert.equal(decoded.bytesConsumed,8);
});
test('all four constant-back-reference distances repeat a captured tile',()=>{
  assert.deepEqual(decodeMapPiece(piece(14,1,[1,2,3,4,0xc0,0xc9,0xd2,0xdb])).tiles,
    [1,2,3,4,4,4,4,4,4,4,4,4,4,4]);
  assert.deepEqual(decodeMapPiece(piece(6,1,[1,2,3,4,0xc9])).tiles,[1,2,3,4,3,3]);
});
test('row copies support one and two prior rows with overlapping output',()=>{
  assert.deepEqual(decodeMapPiece(piece(3,3,[7,8,9,1,2,3,0xe0,0x82])).tiles,[7,8,9,1,2,3,7,8,9]);
  assert.deepEqual(decodeMapPiece(piece(3,3,[7,8,9,0xe5])).tiles,[7,8,9,7,8,9,7,8,9]);
});
test('pattern runs repeat recent tiles in forward order',()=>{
  assert.deepEqual(decodeMapPiece(piece(8,1,[5,6,0xe8,0x85])).tiles,[5,6,5,6,5,6,5,6]);
  assert.deepEqual(decodeMapPiece(piece(7,1,[4,5,6,0xe9,3])).tiles,[4,5,6,4,5,6,4]);
});
test('increment/decrement runs wrap within bytes',()=>{
  assert.deepEqual(decodeMapPiece(piece(5,1,[2,0xf0,0x83])).tiles,[2,1,0,255,254]);
  assert.deepEqual(decodeMapPiece(piece(4,1,[10,0xf2])).tiles,[10,11,12,13]);
});
test('map decoding fails on unsupported, truncated, overflowing, or before-start references',()=>{
  for(const input of [[],[0],[0,0,0xf8],[0,0,0xc0],[2,0,1,0xe0],[2,0,1,0xc7],[2,0,1,0xe8,0x80]])
    assert.throws(()=>decodeMapPiece(Uint8Array.from(input)),RomFormatError);
  assert.throws(()=>requireRange(new Uint8Array(4),NaN,1),RomFormatError);
  assert.throws(()=>requireRange(new Uint8Array(4),0,-1),RomFormatError);
});
function bits(value) {
  const padded=value.padEnd(Math.ceil(value.length/8)*8,'0');
  return Uint8Array.from(padded.match(/.{8}/g).map(byte=>parseInt(byte,2)));
}
test('metatiles support all bitstream operations, signed offsets, and page-local wrapping',()=>{
  const stream=bits('1111'+'1110010111111111'+'01'+'10'+'110'+'1111111'+
    '1110'+'1'+'000'+'000001'+'1110'+'0'+'111'+'100001'+'110'+'0011111'+'00');
  assert.deepEqual(decodeMetatiles(stream,2).metatiles,
    [[0xe5ff,0xe500,0xe5ff,0xe5fe],[0x05ff,0x1de0,0x1dff,0x1dff]]);
  assert.throws(()=>decodeMetatiles(stream.subarray(0,1),2),RomFormatError);
  assert.throws(()=>decodeMetatiles(bits('110'+'1111111'),1),/invalid 8x8 tile/);
});
test('identification handles a 512-byte copier prefix without changing payload hashes',()=>{
  const payload=Buffer.alloc(0x200000);
  payload.write('Secret of MANA       ',0xffc0,'ascii');payload[0xffd5]=0x21;
  payload[0xffd9]=1;payload.writeUInt16LE(0x1234,0xffde);payload.writeUInt16LE(0xedcb,0xffdc);
  const clean=inspectRom(payload),prefixed=inspectRom(Buffer.concat([Buffer.alloc(512,255),payload]));
  assert.equal(clean.title,'Secret of MANA');assert.equal(clean.mapping,'HiROM');
  assert.equal(clean.checksumPairValid,true);assert.equal(prefixed.headerSize,512);
  assert.equal(prefixed.sha256,clean.sha256);assert.equal(clean.knownRevision,null);
  assert.throws(()=>extractPotos(payload),/Unsupported ROM revision/);
  assert.throws(()=>inspectRom(Buffer.alloc(12)),/SNES HiROM header/);
  assert.equal(crc32(Buffer.from('123456789')),'cbf43926');
});
test('header tileset16 uses byte 2, independently of graphics tileset8',()=>{
  const header=decodeMapHeader(Uint8Array.from([0xc2,0x98,0xc4,7,0xc0,2,0,255]));
  assert.equal(header.tileset8,2);assert.equal(header.tileset16,4);
  assert.equal(header.specialEventTileMode,3);assert.equal(header.walkOnEvent,true);
  assert.equal(header.layer1UsesForegroundTiles,true);assert.equal(header.layer2UsesForegroundTiles,true);
});
test('objects, placements and doors preserve packed coordinates and event IDs',()=>{
  const object=decodeObject(Uint8Array.from([16,0x6f,0x81,0x82,0xc8,0xa0,0x34,0x42]));
  assert.equal(object.x,1);assert.equal(object.y,2);assert.equal(object.event,0x234);
  assert.equal(object.collisionLayer,2);assert.equal(object.direction,'right');
  const placement=decodePlacements(Uint8Array.from([0xfe,16,0x6f,0x56,5,7]));
  assert.deepEqual(placement,[{id:0x356,layer:'background',x:2,y:3,visibility:{flag:16,min:6,max:15}}]);
  assert.throws(()=>decodePlacements(Uint8Array.from([1,2,3])),RomFormatError);
  assert.throws(()=>decodePlacements(Uint8Array.from([0xfe,0])),RomFormatError);
  const rom=Buffer.alloc(0x83008);rom.set([2,105,31,133],0x83000);
  assert.deepEqual({...decodeDoor(rom,0),raw:null,offset:null},{id:0,offset:null,raw:null,map:258,x:52,y:15,collisionLayer:2,transition:133});
});
test('composition selects event overlays and the correct foreground tile half',()=>{
  const always={flag:0,min:0,max:15},later={flag:16,min:6,max:15};
  const pieces=[{x:0,y:0,width:2,height:1,layer:'background',tiles:[2,3],visibility:always},
    {x:1,y:0,width:1,height:1,layer:'background',tiles:[4],visibility:later},
    {x:0,y:0,width:1,height:1,layer:'foreground',tiles:[5],visibility:always}];
  const header={layer1UsesForegroundTiles:false,layer2UsesForegroundTiles:true};
  const tileset={collision:Array.from({length:384},(_,i)=>i&255)};
  const early=composeMap(pieces,header,tileset,{16:5}),late=composeMap(pieces,header,tileset,{16:6});
  assert.deepEqual(early.layers.background,[2,3]);assert.deepEqual(late.layers.background,[2,4]);
  assert.deepEqual(late.layers.foreground,[197,null]);assert.deepEqual(late.collision.foreground,[197,null]);
});
test('collision behavior wall bit is independent from slope metadata',()=>{
  const rom=Buffer.alloc(0xb0400);rom.set([0x13,6,0,0,0x12,0,0x14,0],0xb0000);
  const types=readCollisionTypes(rom);assert.equal(types[0].solid,true);assert.equal(types[1].solid,false);
  assert.equal(types[1].shapeCode,0x14);
});
test('SNES planar graphics use paired planes and preserve synthetic high-plane fills',()=>{
  const tile=Buffer.alloc(32);tile[0]=0x80;tile[1]=0x40;tile[16]=0x20;tile[17]=0x10;
  assert.deepEqual(decodePlanarTile(tile,0).slice(0,8),[1,2,4,8,0,0,0,0]);
  assert.deepEqual(decodePlanarTile(tile,0,2,12).slice(0,4),[13,14,12,12]);
  const three=Buffer.alloc(24);three[16]=0x80;three[17]=0x40;
  const decoded=decodePlanarTile(three,0,3);assert.equal(decoded[0],4);assert.equal(decoded[9],4);
  assert.throws(()=>decodePlanarTile(tile.subarray(0,31),0),RomFormatError);
  assert.deepEqual(snesColor(0x7fff),[255,255,255,255]);
});
test('PNG output contains deterministic unfiltered RGBA scanlines and valid chunk CRCs',()=>{
  const pixels=Uint8Array.from([255,0,0,255,0,255,0,255]);
  const png=encodePng({width:2,height:1,rgba:pixels});
  let offset=8;
  while(offset<png.length) {
    const length=png.readUInt32BE(offset),kind=png.subarray(offset+4,offset+8).toString();
    const body=png.subarray(offset+8,offset+8+length);
    assert.equal(png.readUInt32BE(offset+8+length),parseInt(crc32(png.subarray(offset+4,offset+8+length)),16));
    if(kind==='IDAT') assert.deepEqual([...inflateSync(body)],[0,...pixels]);
    offset+=length+12;
  }
});
test('world RLE respects bounded rows and permits escaped high tile IDs',()=>{
  assert.deepEqual(decodeWorldRow(Uint8Array.from([3,0xc2,4,0xc0,0xfe]),5).tiles,[3,4,4,4,0xfe]);
  assert.throws(()=>decodeWorldRow(Uint8Array.from([0xc2]),3),RomFormatError);
  assert.throws(()=>decodeWorldRow(Uint8Array.from([0xff,1]),8),/overflows/);
  assert.throws(()=>decodeWorldRow(Uint8Array.from([1]),2),RomFormatError);
});
test('Mode 1 composition respects both background priority bits and BG1 tie-breaking',()=>{
  const map={composite:{width:1,pixelWidth:16,pixelHeight:16,layers:{background:[0],foreground:[1]}}};
  const graphics={tiles:[Array(64).fill(1),Array(64).fill(2)]};
  const palette={palettes:[[[0,0,0,0],[255,0,0,255],[0,255,0,255]]]};
  for(const [bgPriority,fgPriority,color] of [[0,0,[255,0,0,255]],[1,0,[255,0,0,255]],
    [0,1,[0,255,0,255]],[1,1,[255,0,0,255]]]) {
    const tileset={metatiles:[Array(4).fill(bgPriority<<13),Array(4).fill(1|(fgPriority<<13))]};
    assert.deepEqual([...renderMap(map,tileset,graphics,palette).rgba.subarray(0,4)],color);
  }
});

const romPath=new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url);
test('optional local US ROM: Potos dimensions, compressed bounds, and door table agree',
  {skip:!existsSync(romPath)},()=>{
    const bytes=readFileSync(romPath),before=Buffer.from(bytes),data=extractPotos(bytes);
    assert.equal(data.rom.sha256,US_ROM.sha256);assert.equal(data.rom.crc32,US_ROM.crc32);
    assert.equal(data.rom.checksumMatches,true);
    const map=data.maps[0];assert.equal(map.composite.width,52);assert.equal(map.composite.height,52);
    for(const m of data.maps) for(const p of m.pieces) {
      assert.equal(p.tiles.length,p.width*p.height);assert.ok(p.bytesConsumed<=p.compressedLength);
    }
    assert.deepEqual(map.triggers.filter(t=>t.role==='tile').map(t=>[t.position.x,t.position.y]),
      [[36,16],[16,19],[4,23],[4,24],[27,24],[13,30],[18,38],[33,42],[34,42]]);
    assert.equal(map.triggers[1].door.map,258);assert.deepEqual(bytes,before);
    const world=readWorldMap(bytes);
    assert.equal(world.tiles.length,512*512);
    assert.equal(world.rowOffsets[357],0x6ff9e);assert.equal(world.rowOffsets[358],0x7004b);
    assert.equal(world.rowOffsets[511],0x74190);
    assert.deepEqual(world.takeoffs[131],{map:131,x:304,y:378});
    assert.equal(world.landingZones[11*16+9].map,131);
    const rendered=renderWorld(world);assert.equal(rendered.width,1024);assert.equal(rendered.height,1024);
  });

const caveWramPath=new URL('../.local/emulator-probe/map-260-wram.bin',import.meta.url);
const caveVramPath=new URL('../.local/emulator-probe/map-260-vram.bin',import.meta.url);
test('optional original-engine dump: cave maps, metatiles and graphics match WRAM/VRAM exactly',
  {skip:![romPath,caveWramPath,caveVramPath].every(existsSync)},()=>{
    const rom=readFileSync(romPath),wram=readFileSync(caveWramPath),vram=readFileSync(caveVramPath);
    const map=extractPotos(rom).maps.find(m=>m.id===260);
    for(const [layer,base] of [['background',0x10000],['foreground',0x14000]])
      for(let y=0;y<30;++y) for(let x=0;x<30;++x)
        assert.equal(wram[base+y*128+x],map.composite.layers[layer][y*30+x]-(layer==='foreground'?192:0));
    const metatiles=readTileset(rom,10).metatiles.flat();
    for(let half=0;half<2;++half) for(let i=0;i<768;++i)
      assert.equal(wram.readUInt16LE(0x1c000+half*0x800+i*2),metatiles[half*768+i]);
    const graphics=readGraphics(rom,10);
    graphics.tiles.forEach((pixels,tile)=>assert.deepEqual(decodePlanarTile(vram,tile*32),pixels));
  });
