import test from 'node:test';import assert from 'node:assert/strict';
import {homingStep,discContact,sweptDistance} from '../engine/frieza-combat.js';
test('a chasing disc has limited turn and can be led through its owner',()=>{
 const d={x:0,y:0,angle:0,speed:3.1,age:41},player={x:100,y:0},boss={x:50,y:0};let hit=null;
 for(let i=0;i<30&&!hit;i++){d.previousX=d.x;d.previousY=d.y;homingStep(d,player);hit=discContact(d,player,boss);}
 assert.equal(hit,'frieza');assert.ok(d.x<player.x);
 const turn={x:0,y:0,angle:Math.PI-.01,speed:3,age:0};homingStep(turn,{x:-100,y:-2},.035);assert.ok(turn.angle>Math.PI-.01,'shortest turn crosses the angle wrap');
 const abrupt={x:0,y:0,angle:0,speed:3,age:0};homingStep(abrupt,{x:0,y:100},.035);assert.equal(abrupt.angle,.035);
});
test('projectiles sweep their full step and have separate launch grace for Goku and Frieza',()=>{
 const disc={x:30,y:0,previousX:-30,previousY:0,age:11};
 assert.equal(sweptDistance(0,0,-30,0,30,0),0);assert.equal(discContact(disc,{x:0,y:0},{x:0,y:0}),'goku');
 assert.equal(discContact({...disc,age:41},{x:0,y:0},{x:0,y:0}),'frieza');
 assert.equal(discContact({...disc,age:10},{x:0,y:0},{x:0,y:0}),null);
 assert.equal(discContact({...disc,age:41},{x:0,y:30},{x:0,y:30}),null);
});
