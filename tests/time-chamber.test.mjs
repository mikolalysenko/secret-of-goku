import test from 'node:test';
import assert from 'node:assert/strict';
import {chamberLayout,chamberForeground,encodeChamberPiece,createTimeChamber} from '../engine/time-chamber.js';
import {decodeMapPiece} from '../tools/rom/map-codec.mjs';

test('Time Chamber collision expands the native room, with an intact doorway and safe outer border',()=>{
 const tiles=chamberLayout(),bytes=encodeChamberPiece(tiles),decoded=decodeMapPiece(bytes);
 assert.ok(bytes.length<=346,'Only the existing trial piece storage is used');
 assert.deepEqual([decoded.width,decoded.height],[64,64]);assert.deepEqual(decoded.tiles,[...tiles]);
 for(let i=0;i<64;i++)assert.ok([tiles[i],tiles[63*64+i],tiles[i*64],tiles[i*64+63]].every(t=>t===11));
 assert.equal(tiles[18*64+32],11,'The pavilion is solid');assert.equal(tiles[23*64+32],70,'Both fighters start on real floor');
 assert.equal(tiles[56*64+56],70,'The far end of the larger arena has real collision data');
 for(const[x,y]of[[27,15],[36,15],[27,20],[36,20]])assert.equal(tiles[y*64+x],70,'Empty corners beside the pavilion stay walkable');
 const foreground=encodeChamberPiece(chamberForeground()),blank=decodeMapPiece(foreground);
 assert.deepEqual([blank.width,blank.height],[64,64],'Clear the foreground across the entire room, not only its first tile');
 assert.ok(blank.tiles.every(t=>t===0));assert.ok(bytes.length+foreground.length<=388,'Both layers fit before map piece 714');
});

test('the chamber background uses native scroll, preserves actors/menus and only owns its map',()=>{
 const ram=new Uint8Array(0x20000),original=[123,4,2],p={mode:1,getColor:()=>original};
 const mod={options:{enabled:true},gokuActive:true,nativeField:true,trial:{roomLoaded:false}},arena=createTimeChamber({ram,ppu:p},mod,{loadArt:false});
 assert.equal(p.getColor(false,128,100),original);ram[0xdc]=72;assert.equal(arena.active,false,'A destination ID alone must not repaint the outgoing cave');
 mod.trial.roomLoaded=true;assert.equal(arena.active,true);
 mod.nativeField=false;assert.equal(arena.active,false);arena.dispose();assert.equal(p.getColor(),original);
});
