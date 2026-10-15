import test from 'node:test';import assert from 'node:assert/strict';
import {homingStep,discContact,sweptDistance,rushStep,beamTouchesShot} from '../engine/frieza-combat.js';
test('a chasing disc has limited turn and can be led through its owner',()=>{
 const d={x:0,y:0,angle:0,speed:3.1,age:41},player={x:100,y:0},boss={x:50,y:0};let hit=null;
 for(let i=0;i<30&&!hit;i++){d.previousX=d.x;d.previousY=d.y;homingStep(d,player);hit=discContact(d,player,boss);}
 assert.equal(hit,'frieza');assert.ok(d.x<player.x);
 const turn={x:0,y:0,angle:Math.PI-.01,speed:3,age:0};homingStep(turn,{x:-100,y:-2},.035);assert.ok(turn.angle>Math.PI-.01,'shortest turn crosses the angle wrap');
 const abrupt={x:0,y:0,angle:0,speed:3,age:0};homingStep(abrupt,{x:0,y:100},.035);assert.equal(abrupt.angle,.035);
});

test('rushes and projectiles commit whole pixels; a beam counters a crossing projectile',()=>{
 const boss={x:0.4,y:0.7,node:0,nodes:[{x:83.2,y:31.6}],dash:1};
 for(let i=0;i<20&&boss.dash;i++){rushStep(boss);assert.ok(Number.isInteger(boss.x)&&Number.isInteger(boss.y));}
 assert.equal(boss.dash,0);assert.deepEqual([boss.x,boss.y],[83,32]);
 const disc={x:10.2,y:8.9,speed:3,angle:.7,age:0};
 for(let i=0;i<100;i++){homingStep(disc,{x:120,y:115});assert.ok(Number.isInteger(disc.x)&&Number.isInteger(disc.y));}
 const beam={x:10,y:30,dx:1,dy:0},geometry={halfWidth:15,length:200,taper:0};
 assert.equal(beamTouchesShot(beam,geometry,{kind:'orb',x:50,y:55,previousX:50,previousY:45}),true);
 assert.equal(beamTouchesShot(beam,geometry,{kind:'disc',x:50,y:80}),false);
});
test('projectiles sweep their full step and have separate launch grace for Goku and Frieza',()=>{
 const disc={x:30,y:0,previousX:-30,previousY:0,age:11};
 assert.equal(sweptDistance(0,0,-30,0,30,0),0);assert.equal(discContact(disc,{x:0,y:0},{x:0,y:0}),'goku');
 assert.equal(discContact({...disc,age:41},{x:0,y:0},{x:0,y:0}),'frieza');
 assert.equal(discContact({...disc,age:10},{x:0,y:0},{x:0,y:0}),null);
 assert.equal(discContact({...disc,age:41},{x:0,y:30},{x:0,y:30}),null);
});
