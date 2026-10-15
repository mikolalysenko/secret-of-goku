import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {collateralShots,collateralStart,pullbackStart,cosmicDuration,collateralBeat,civilianPose,orbitIntroLines} from '../engine/frieza-cinematic.js';
import {cinematicMap} from '../engine/cinematic-map.js';
import {cinematicRuin} from '../engine/cinematic-ruins.js';
import {wrapText} from '../engine/event-codec.js';
import {readMap,readTileset} from '../tools/rom/rom.mjs';
import {readGraphics,readPalette,renderMap} from '../tools/rom/graphics.mjs';

test('collateral has separate establishment, warning, impact and aftermath beats; all dialogue fits',()=>{
 let start=collateralStart;
 for(const shot of collateralShots){
  assert.equal(collateralBeat(start).shot,shot);assert.equal(collateralBeat(start+shot.hit).age,shot.hit);
  assert.ok(shot.hit>=150);assert.ok(shot.duration-shot.hit>=110);
  start+=shot.duration;
 }
 assert.equal(start,pullbackStart);assert.equal(collateralBeat(start),null);assert.ok(cosmicDuration-start>=240);
 for(const text of [...orbitIntroLines,...collateralShots.map(s=>s.text)])assert.ok(wrapText(text).split('\n').length<=3,text);
});

test('montage scenery matches the independent ROM renderer and pedestrians stay on real ground',{skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},()=>{
 const rom=readFileSync('.local/rom/secret-of-mana-us.sfc'),original=rom.slice();
 for(const shot of collateralShots){
  const map=readMap(rom,shot.map,shot.name,{16:6}),actual=cinematicMap(rom,shot.map);
  const expected=renderMap(map,readTileset(rom,map.header.tileset16),readGraphics(rom,map.header.tileset8),readPalette(rom,map.header.paletteSet));
  assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
  for(let i=0;i<actual.pixels.length;i++){
   const at=i*4,p=expected.rgba,c=p[at+3]?1+(p[at]>>3)+((p[at+1]>>3)<<5)+((p[at+2]>>3)<<10):0;
   assert.equal(actual.pixels[i],c,`${shot.name} pixel ${i}`);
  }
  const before=actual.pixels.slice(),ruin=cinematicRuin(actual,shot),palette=new Set(before),changed=[];
  assert.deepEqual(actual.pixels,before,'Roof destruction must leave the original town intact');
  for(let i=0;i<before.length;i++)if(before[i]!==ruin.pixels[i]){
    const x=i%actual.width-shot.x,y=Math.floor(i/actual.width)-shot.y;
    assert.ok(x>=0&&x<256&&y>=0&&y<224,'Damage stays on the featured building');
    assert.ok(palette.has(ruin.pixels[i]),'Debris retains the native map palette');changed.push(i);
  }
  assert.ok(changed.length>100);assert.ok(ruin.sites.length>0);
  assert.deepEqual(cinematicRuin(actual,shot),ruin,'Camera pans and checkpoint redraws use the same damaged map');
  shot.people.forEach((route,index)=>{
   for(let age=0;age<shot.duration;age++){
    const p=civilianPose(route,age,index);assert.ok(Number.isInteger(p.x)&&Number.isInteger(p.y));
    for(const dx of[-4,4])for(const dy of[-2,2]){
     const cell=Math.floor((p.y+shot.y+dy)/16)*map.composite.width+Math.floor((p.x+shot.x+dx)/16),id=map.composite.collision.background[cell],at=0xb0000+id*4;
     assert.ok(id!==null&&(rom[at]&15)!==3&&!(rom[at]&8)&&rom[at+2]===0,`${shot.name} pedestrian ${index} frame ${age} feet ${p.x},${p.y} must not cross roofs, water or walls`);
    }
   }
  });
 }
 assert.deepEqual(rom,original,'Montage decoding must not mutate the cartridge or live map');
});
