// SPDX-License-Identifier: LGPL-2.1-only
// Based on Moppleton's SecretOfManaRandomizer. See NOTICE.md.
import {createHash} from 'node:crypto';
import {decodeMapPiece, decodeMetatiles, requireRange, RomFormatError} from './map-codec.mjs';

export const US_ROM = Object.freeze({
  size:0x200000, sha1:'8133041a363e3cc68cedef40b49b6d20d03c505d',
  sha256:'4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f', crc32:'d0176b24',
});
export const OFFSETS = Object.freeze({doors:0x83000, triggers:0x84000,
  placements:0x85000, objects:0x87000, collisions:0xb0400,
  metatiles:0xb4000, palettes:0xc8000, pieces:0xd0004});
export const POTOS_MAPS = Object.freeze([
  {id:131,name:'Potos Village'}, {id:257,name:'Potos house'},
  {id:258,name:"Potos elder's house"}, {id:259,name:'Potos inn'},
  {id:260,name:'Mantis Ant cave'},
]);

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i=0;i<8;++i) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
export function word(bytes, offset) {
  requireRange(bytes, offset, 2); return bytes[offset] | (bytes[offset+1] << 8);
}
export function long(bytes, offset) {
  requireRange(bytes, offset, 3); return bytes[offset] | (bytes[offset+1] << 8) | (bytes[offset+2] << 16);
}
export function normalizeRom(file) {
  const headerSize = file.length % 0x8000 === 512 ? 512 : 0;
  return {bytes:file.subarray(headerSize), headerSize};
}
export function inspectRom(file) {
  const {bytes,headerSize}=normalizeRom(file);
  requireRange(bytes, 0xffc0, 64, 'SNES HiROM header');
  const title=Buffer.from(bytes.subarray(0xffc0,0xffd5)).toString('ascii').trimEnd();
  const sha1=createHash('sha1').update(bytes).digest('hex');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  let sum=0;
  for (const byte of bytes) sum=(sum+byte)&0xffff;
  const checksum=word(bytes,0xffde), checksumComplement=word(bytes,0xffdc);
  return {fileSize:file.length,size:bytes.length,headerSize,title,
    mapping:bytes[0xffd5] === 0x21 || bytes[0xffd5] === 0x31 ? 'HiROM' : 'unrecognized',
    mapMode:bytes[0xffd5],cartridgeType:bytes[0xffd6],region:bytes[0xffd9],version:bytes[0xffdb],
    checksum,checksumComplement,checksumPairValid:(checksum ^ checksumComplement)===0xffff,
    computedChecksum:sum,checksumMatches:sum===checksum,
    resetVector:word(bytes,0xfffc),sha1,sha256,crc32:crc32(bytes),
    knownRevision:bytes.length===US_ROM.size && sha1===US_ROM.sha1 ? 'Secret of Mana (USA), original retail revision' : null};
}
function integerIn(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value >= max) throw new RomFormatError(`${label} out of range: ${value}`);
}
export function mapTableRange(bytes, table, id) {
  // A next pointer supplies the end; map 511 needs separate terminal handling.
  integerIn(id,511,'Map ID');
  const base=table & 0xff0000;
  const start=base+word(bytes,table+id*2);
  const end=base+word(bytes,table+(id+1)*2);
  if (end < start) throw new RomFormatError(`Non-monotonic map ${id} table at 0x${table.toString(16)}`);
  requireRange(bytes,start,end-start,'Map table span');
  return {start,end};
}
export function decodeMapHeader(bytes) {
  requireRange(bytes,0,8,'Map header');
  return {raw:Array.from(bytes.subarray(0,8)),tileset8:bytes[0]&63,
    tileAnimationMode:bytes[0]>>6,paletteSet:bytes[1]&127,paletteAnimated:!!(bytes[1]&128),
    tileset16:bytes[2]&63,layer1UsesForegroundTiles:!!(bytes[2]&64),layer2UsesForegroundTiles:!!(bytes[2]&128),
    singleLayerMode:bytes[3]>>4,specialMapFlag:!!(bytes[3]&8),walkOnEvent:!!(bytes[3]&4),
    specialEventTileMode:bytes[3]&3,flammieEnabled:!!(bytes[4]&128),magicRopeEnabled:!!(bytes[4]&64),
    displaySettings:bytes[5],unknownByte6:bytes[6],npcPalette:bytes[7],weaponsAllowed:bytes[7]===255};
}
export function decodeObject(bytes, index = 0) {
  requireRange(bytes,0,8,'Map object');
  return {index,raw:Array.from(bytes.subarray(0,8)),visibility:{flag:bytes[0],min:bytes[1]>>4,max:bytes[1]&15},
    x:bytes[2]&127,y:bytes[3]&127,spawnPriority:!!(bytes[2]&128),frozen:!!(bytes[3]&128),
    direction:['up','down','left','right'][bytes[4]>>6],collisionLayer:bytes[4]&8 ? 2 : 1,
    species:bytes[5],event:bytes[6]|((bytes[7]&7)<<8),interactionBits:bytes[7]>>3};
}
export function decodePlacements(bytes) {
  let offset=0, layer=null;
  const pieces=[];
  while (offset<bytes.length) {
    const first=bytes[offset];
    if(first===0xfe || first===0xff) { layer=first===0xfe ? 'background':'foreground'; ++offset; continue; }
    if(!layer) throw new RomFormatError('Map placements must begin with FE or FF layer marker');
    requireRange(bytes,offset,5,'Map placement');
    pieces.push({id:bytes[offset+2] | ((bytes[offset+3]&1)<<8) | ((bytes[offset+4]&1)<<9),
      layer,x:bytes[offset+3]>>1,y:bytes[offset+4]>>1,
      visibility:{flag:first,min:bytes[offset+1]>>4,max:bytes[offset+1]&15}});
    offset+=5;
  }
  return pieces;
}
export function mapPieceOffset(bytes,id) {
  integerIn(id,1024,'Map piece ID');
  const bank=id<0xa3 ? 0xd : id<0x206 ? 0xe : id<0x300 ? 0xf : 0xc;
  return (bank<<16)+word(bytes,OFFSETS.pieces+id*2);
}
export function readMapPiece(bytes,id) {
  const offset=mapPieceOffset(bytes,id);
  let end=id<1023 ? mapPieceOffset(bytes,id+1) : (offset&0xff0000)+0x10000;
  if ((offset&0xff0000)!==(end&0xff0000)) end=(offset&0xff0000)+0x10000;
  if(end<=offset) throw new RomFormatError(`Invalid or empty map piece ${id}: 0x${offset.toString(16)}..0x${end.toString(16)}`);
  requireRange(bytes,offset,end-offset,`Map piece ${id}`);
  try { return {offset,compressedLength:end-offset,...decodeMapPiece(bytes.subarray(offset,end))}; }
  catch(error) { throw new RomFormatError(`Map piece ${id} @ 0x${offset.toString(16)}: ${error.message}`); }
}
export function decodeDoor(bytes,id) {
  integerIn(id,1024,'Door ID');
  const offset=OFFSETS.doors+id*4;
  requireRange(bytes,offset,4,'Door');
  return {id,offset,raw:Array.from(bytes.subarray(offset,offset+4)),map:bytes[offset]|((bytes[offset+1]&1)<<8),
    x:bytes[offset+1]>>1,y:bytes[offset+2]>>1,collisionLayer:bytes[offset+2]&1 ? 2:1,transition:bytes[offset+3]};
}
export function readTileset(bytes,id) {
  integerIn(id,64,'Tileset ID');
  const offset=long(bytes,OFFSETS.metatiles+id*3);
  const end=long(bytes,OFFSETS.metatiles+(id+1)*3);
  requireRange(bytes,offset,end-offset,`Tileset ${id}`);
  const collisionOffset=OFFSETS.collisions+id*384;
  requireRange(bytes,collisionOffset,384,'Collision table');
  return {id,offset,collisionOffset,collision:Array.from(bytes.subarray(collisionOffset,collisionOffset+384)),
    ...decodeMetatiles(bytes.subarray(offset,end))};
}
export function readCollisionTypes(bytes) {
  requireRange(bytes,0xb0000,1024,'Collision behavior table');
  return Array.from({length:256},(_,id)=>{
    const offset=0xb0000+id*4,raw=Array.from(bytes.subarray(offset,offset+4));
    return {id,offset,raw,solid:!!(raw[0]&1),shapeCode:raw[2],
      tileTrigger:!!(raw[1]&128),interpretation:raw[2] ? 'shape or event data; not a full-tile wall' : 'full-tile solidity known'};
  });
}
export function isVisible(visibility,eventFlags={}) {
  const value=eventFlags[visibility.flag] ?? 0;
  return value>=visibility.min && value<=visibility.max;
}
export function composeMap(pieces,header,tileset,eventFlags={}) {
  const width=Math.max(1,...pieces.map(piece=>piece.x+piece.width));
  const height=Math.max(1,...pieces.map(piece=>piece.y+piece.height));
  const layers={background:Array(width*height).fill(null),foreground:Array(width*height).fill(null)};
  const collision={background:Array(width*height).fill(null),foreground:Array(width*height).fill(null)};
  for (const piece of pieces) {
    if(!isVisible(piece.visibility,eventFlags)) continue;
    const foregroundTiles=piece.layer==='background' ? header.layer1UsesForegroundTiles : header.layer2UsesForegroundTiles;
    const tileBase=foregroundTiles ? 192 : 0;
    for(let y=0;y<piece.height;++y) for(let x=0;x<piece.width;++x) {
      const index=(piece.y+y)*width+piece.x+x;
      const tile=piece.tiles[y*piece.width+x]+tileBase;
      if(tile>=tileset.collision.length) throw new RomFormatError(`Metatile ${tile} outside tileset`);
      layers[piece.layer][index]=tile;
      collision[piece.layer][index]=tileset.collision[tile];
    }
  }
  return {width,height,tileSize:16,pixelWidth:width*16,pixelHeight:height*16,eventFlags,layers,collision};
}
export function readMap(bytes,id,name=`Map ${id}`,eventFlags={}) {
  const objectRange=mapTableRange(bytes,OFFSETS.objects,id);
  if((objectRange.end-objectRange.start)%8!==0 || objectRange.end-objectRange.start<8) throw new RomFormatError(`Map ${id} object records are not aligned`);
  const header=decodeMapHeader(bytes.subarray(objectRange.start,objectRange.start+8));
  const objects=[];
  for(let offset=objectRange.start+8;offset<objectRange.end;offset+=8) objects.push(decodeObject(bytes.subarray(offset,offset+8),objects.length));
  const placementRange=mapTableRange(bytes,OFFSETS.placements,id);
  const pieces=decodePlacements(bytes.subarray(placementRange.start,placementRange.end)).map(piece=>({...piece,...readMapPiece(bytes,piece.id)}));
  const triggerRange=mapTableRange(bytes,OFFSETS.triggers,id);
  if((triggerRange.end-triggerRange.start)%2) throw new RomFormatError(`Map ${id} triggers are not word-aligned`);
  const triggers=[];
  let specialIndex=0;
  for(let offset=triggerRange.start;offset<triggerRange.end;offset+=2) {
    const index=triggers.length;
    let role='tile';
    if(index===0&&header.walkOnEvent) role='walk-on';
    else if(specialIndex<header.specialEventTileMode) role=`special-${0xbf-specialIndex++}`;
    const value=word(bytes,offset);
    triggers.push(value<0x800 ? {index,value,role,kind:'event',event:value} : {index,value,role,kind:'door',door:decodeDoor(bytes,value-0x800)});
  }
  const tileset=readTileset(bytes,header.tileset16);
  return {id,name,header,objects,triggers,pieces,offsets:{objects:objectRange,placements:placementRange,triggers:triggerRange},
    composite:composeMap(pieces,header,tileset,eventFlags)};
}

export function readEventBytes(bytes,id) {
  integerIn(id,0x800,'Event ID');
  const bank=id<0x400 ? 0x90000 : 0xa0000;
  const index=id&0x3ff;
  const offset=bank+word(bytes,bank+index*2);
  const end=id===0x3ff ? 0x9f2d7 : bank+word(bytes,bank+(index+1)*2);
  requireRange(bytes,offset,end-offset,`Event 0x${id.toString(16)}`);
  return {id,offset,bytes:Array.from(bytes.subarray(offset,end)),status:'raw event bytecode; not interpreted'};
}

export function extractPotos(file,{allowUnknown=false,eventFlags={16:6},maps=POTOS_MAPS}={}) {
  const rom=inspectRom(file);
  if(!allowUnknown&&!rom.knownRevision) throw new RomFormatError(`Unsupported ROM revision (SHA-1 ${rom.sha1}); expected unmodified Secret of Mana (USA)`);
  const {bytes}=normalizeRom(file);
  const extracted=maps.map(({id,name})=>readMap(bytes,id,name,eventFlags));
  const collisionTypes=readCollisionTypes(bytes);
  for(const map of extracted) {
    const grid=map.composite;
    grid.solid={};
    for(const layer of ['background','foreground']) grid.solid[layer]=grid.collision[layer].map(id=>id===null||collisionTypes[id].solid ? 1:0);
    // Potos has 9 door tiles in layer 1, matching the 9 post-walk-on triggers.
    // Do not guess at maps whose layer switching/special triggers need simulation.
    if(map.id===131) {
      const locations=[];
      grid.collision.background.forEach((type,index)=>{
        if(type!==null&&collisionTypes[type].tileTrigger) locations.push({x:index%grid.width,y:Math.floor(index/grid.width)});
      });
      const tileTriggers=map.triggers.filter(trigger=>trigger.role==='tile');
      if(locations.length!==tileTriggers.length) throw new RomFormatError('Potos door tile count does not match trigger table');
      tileTriggers.forEach((trigger,index)=>{trigger.position={...locations[index],layer:'background'};});
    }
  }
  const tilesets=Object.fromEntries([...new Set(extracted.map(map=>map.header.tileset16))].map(id=>[id,readTileset(bytes,id)]));
  const eventIds=new Set(extracted.flatMap(map=>[...map.objects.map(object=>object.event),...map.triggers.filter(trigger=>trigger.kind==='event').map(trigger=>trigger.event)]));
  const events=[...eventIds].sort((a,b)=>a-b).map(id=>readEventBytes(bytes,id));
  return {schemaVersion:1,rom,coordinateSystem:'16-pixel tiles; arrays are row-major; origin is ROM map origin',
    defaultEventFlags:eventFlags,maps:extracted,tilesets,collisionTypes,events,
    limitations:['Static event flag snapshot; event bytecode is preserved but not executed.',
      'Collision bytes and solid bit are decoded. Slopes, corners, layer switching and special actions require a fuller movement interpreter.',
      'Unsupported map compression commands fail explicitly; this is targeted data reversing, not a full decompilation.']};
}
