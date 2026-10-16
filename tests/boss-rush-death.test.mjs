import test from 'node:test';
import assert from 'node:assert/strict';
import {bossRushDeathTiming as T,bossRushDeathPose} from '../engine/boss-rush-death.js';

test('character death has a long readable hold, a complete black pause, then the planet',()=>{
 assert.ok(T.fade>=300,'give collapse and the native reaper five seconds');
 assert.ok(T.planet-T.black>=48,'separate scenes with a full black beat');
 assert.ok(T.rupture-T.planet>=168,'establish the planet before breaking it');
 for(let age=T.black;age<=T.planet;age++){
  const p=bossRushDeathPose({age});assert.equal(p.light,0);assert.equal(p.native,false);
 }
 assert.equal(bossRushDeathPose({age:T.fade-1}).light,1);
 assert.equal(bossRushDeathPose({age:T.planet+48}).light,1);
 assert.equal(bossRushDeathPose({age:T.gameOver}).phase,'gameover');
});

test('orbital death reverts before the fall and shrinks toward the same visible planet',()=>{
 const orbit={hero:{x:220,y:52},camera:{x:95,y:154,r:104}},state={gold:true,orbit};
 assert.equal(bossRushDeathPose({...state,age:T.revert-1}).gold,true);
 assert.equal(bossRushDeathPose({...state,age:T.revert}).gold,false);
 const start=bossRushDeathPose({...state,age:T.fall});assert.equal(start.x,orbit.hero.x);assert.equal(start.y,orbit.hero.y);
 let previous=start;
 for(let age=T.fall;age<T.fallen;age++){
  const p=bossRushDeathPose({...state,age});
  for(const key of['x','y','size','row','column'])assert.equal(Number.isInteger(p[key]),true);
  assert.ok(p.x<=previous.x&&p.y>=previous.y&&p.size<=previous.size);assert.equal(p.gold,false);assert.equal(p.visible,true);previous=p;
 }
 const end=bossRushDeathPose({...state,age:T.fallen});
 assert.equal(end.visible,false);assert.ok(Math.hypot(end.x-orbit.camera.x,end.y-orbit.camera.y)<orbit.camera.r);
 assert.ok(T.fade-T.fallen>=36,'hold after the body falls out of sight');
});
