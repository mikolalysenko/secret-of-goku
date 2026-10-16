import test from 'node:test';import assert from 'node:assert/strict';
import {wishFlightPose,wishFlightTiming} from '../engine/wish-flight.js';
import {buildFriezaEnding} from '../engine/frieza-events.js';
import {endingEvents} from '../engine/ending-rules.js';
import {call} from '../engine/story-events.js';

test('wish departure has a readable ascent, held seven-ball apex, scatter, and quiet aftermath',()=>{
 const t=wishFlightTiming;
 assert.deepEqual(wishFlightPose(0),wishFlightPose(t.rise-1));
 assert.ok(wishFlightPose(80).dragonY<wishFlightPose(30).dragonY);
 assert.equal(wishFlightPose(t.apex).dragon,false);
 assert.deepEqual(wishFlightPose(t.apex).balls,wishFlightPose(t.scatter-1).balls);
 const apex=wishFlightPose(t.apex),away=wishFlightPose(t.scatter+40);
 for(let i=0;i<7;i++)assert.ok(Math.hypot(away.balls[i].x-128,away.balls[i].y-56)>Math.hypot(apex.balls[i].x-128,apex.balls[i].y-56)+60);
 for(let age=0;age<=t.end;age++){const p=wishFlightPose(age);assert.equal(p.balls.length,7);for(const ball of p.balls)assert.ok(Object.values(ball).every(Number.isInteger));assert.deepEqual(wishFlightPose(age),p);}
 assert.ok(t.end-t.settle>=60);assert.equal(wishFlightPose(t.end).departed,true);
});
test('the departure event occurs after the wish and dialogue, before the village, for every party',()=>{
 for(const mask of[0,1,2,3])for(const member of[false,true]){
  const bytes=buildFriezaEnding(mask,member),find=id=>{const pair=call(id);return bytes.findIndex((v,i)=>v===pair[0]&&bytes[i+1]===pair[1]);};
  assert.ok(find(0xa3)<find(0xa4));assert.ok(find(0xa4)<find(endingEvents.scatter));assert.ok(find(endingEvents.scatter)<find(0xa5));
  const wait=bytes.slice(find(endingEvents.scatter)+2,find(endingEvents.scatter)+4);
  assert.equal(wait[0],0x28);assert.ok(wait[1]*5>=wishFlightTiming.end,'native waits last five frames per unit; show the full scatter and aftermath');
 }
});
