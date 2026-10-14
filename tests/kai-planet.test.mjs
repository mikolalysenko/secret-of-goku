import test from 'node:test';
import assert from 'node:assert/strict';
import {newKaiScene,tickKaiScene,onKaiLawn} from '../engine/kai-planet.js';

test('Bubbles wanders across the lawn without walking through the speakers or off the planet',()=>{
 const scene=newKaiScene(),directions=new Set();let steps=0,rests=0,minX=256,maxX=0;
 for(let i=0;i<36000;i++){
  tickKaiScene(scene);const b=scene.bubbles;
  assert.ok(onKaiLawn(b.x,b.y));
  if(b.walking){directions.add(b.direction);steps++;}else rests++;
  minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);
 }
 assert.equal(directions.size,4);assert.ok(steps>10000&&rests>1000);assert.ok(maxX-minX>70);
});
test('Bubbles resumes the same path, pauses and animation from a checkpoint',()=>{
 const scene=newKaiScene();for(let i=0;i<173;i++)tickKaiScene(scene);
 const saved=structuredClone(scene),replay=structuredClone(saved);
 for(let i=0;i<1000;i++){tickKaiScene(scene);tickKaiScene(replay);}
 assert.deepEqual(scene,replay);assert.notDeepEqual(scene,saved);
});
