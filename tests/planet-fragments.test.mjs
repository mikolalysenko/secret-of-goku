import test from 'node:test';
import assert from 'node:assert/strict';
import {fracturePlanet,fragmentPose} from '../engine/planet-fragments.js';

test('planet fractures preserve all surface pixels in deterministic, irregular masks',()=>{
 const globe=new Uint16Array(256*224);
 for(let y=0;y<224;y++)for(let x=0;x<256;x++)if(Math.hypot(x-87,y-140)<72)globe[y*256+x]=1+(x*17+y*29)%32768;
 const pieces=fracturePlanet(globe),seen=new Set();assert.equal(pieces.length,64);
 assert.deepEqual(fracturePlanet(globe),pieces);
 let irregular=0;
 for(const p of pieces){
  if(p.pixels.length<p.width*p.height*.9)irregular++;
  for(const v of p.pixels){const i=v.y*256+v.x;assert.ok(!seen.has(i));seen.add(i);assert.equal(v.color,globe[i]);}
  for(const age of[0,20,60,120]){
   const pose=fragmentPose(p,age);assert.ok(Object.values(pose).every(Number.isFinite));
   if(age)assert.ok(Math.hypot(pose.x-87,pose.y-140)>Math.hypot(p.x-87,p.y-140));
  }
 }
 assert.ok(irregular>60,'Surface pieces do not become a grid of rectangles');
 assert.equal(seen.size,globe.filter(Boolean).length);
});
