import test from 'node:test';
import assert from 'node:assert/strict';
import {friezaScenePose,friezaDeathBallPose,treeFriezaPose,treeTiming,templeFollowerPose,exteriorFollowerPose,coreTiming} from '../engine/frieza-staging.js';
import {altarCamera,introTiming} from '../engine/frieza-intro.js';

const outside={map:195,x:520,y:696,clock:0},camera={map:195,cameraX:392,cameraY:584};
test('cutscene arrivals settle without a body-size switch, and cue changes preserve the hovering anchor',()=>{
 for(const kind of['reveal','core-arrival']){
  let previous=null;
  for(let age=0;age<=144;age++){
   const p=friezaScenePose({...outside,kind,age},camera);
   assert.ok(Object.values(p).every(Number.isInteger));assert.equal(p.frame,0);
   if(previous)assert.ok(Math.abs(p.x-previous.x)<=1&&Math.abs(p.y-previous.y)<=3);
   previous=p;
  }
 }
 for(const [from,to,age]of[['reveal','steal',237],['steal','temple-exit',184],['core-arrival','core-charge',120],['core-charge','core-shot',237],['core-shot','core-impact',72],['core-impact','depart',184]]){
  const a=friezaScenePose({...outside,kind:from,age},camera),b=friezaScenePose({...outside,kind:to,clock:age,age:0},camera);
  assert.deepEqual([a.x,a.y],[b.x,b.y],`${from} -> ${to} must not teleport`);
 }
 const exit={...outside,kind:'temple-exit'};
 const start=templeFollowerPose({...exit,age:0},camera),crouch=templeFollowerPose({...exit,age:42},camera);
 assert.deepEqual([start.x,start.y],[crouch.x,crouch.y]);assert.equal(crouch.column,37);
 assert.ok(templeFollowerPose({...exit,age:180},camera).y<-32);
 assert.ok(friezaScenePose({...outside,kind:'depart',age:144},camera).y<-48);
});

test('Goku follows in a flight pose, settles below the dialogue, and takes off without a position pop',()=>{
 for(const superSaiyan of[false,true]){
  const knee=superSaiyan?34:38,exit={...outside,kind:'temple-exit'};
  assert.equal(templeFollowerPose({...exit,age:60},camera,superSaiyan).column,knee);
  let previous=exteriorFollowerPose({kind:'core-arrival',age:0},superSaiyan);
  for(let age=1;age<=120;age++){
   const p=exteriorFollowerPose({kind:'core-arrival',age},superSaiyan);
   assert.ok(Object.values(p).every(Number.isInteger));assert.ok(Math.abs(p.x-previous.x)<=1&&Math.abs(p.y-previous.y)<=2);
   assert.ok(p.y-31>76,'Goku is entirely below the dialogue window');previous=p;
  }
  for(const kind of['core-charge','core-shot','core-impact','depart','eighth'])assert.deepEqual(exteriorFollowerPose({kind,age:0},superSaiyan),previous);
  const launch=exteriorFollowerPose({kind:'core-escape',age:0},superSaiyan);
  assert.deepEqual([launch.x,launch.y],[previous.x,previous.y]);
  assert.ok(exteriorFollowerPose({kind:'core-escape',age:120},superSaiyan).y<-32);
 }
});

test('Death Ball charge and release share an anchor, with small whole-pixel growth and a readable throw',()=>{
 for(const tree of[false,true]){
  const kind=tree?'tree-charge':'core-charge',pose=c=>tree?treeFriezaPose(c.kind,c.age,(c.clock??0)+c.age):friezaScenePose(c,camera);
  let previous=0;
  for(let age=0;age<180;age++){
   const c={...outside,kind,age},p=pose(c),b=friezaDeathBallPose(c,p,{tree});
   assert.ok([b.x,b.y,b.size,b.frame].every(Number.isInteger));assert.equal(b.size%2,0);
   if(age)assert.ok(b.size>=previous&&b.size-previous<=4,'No multi-tile size pops');previous=b.size;
   assert.ok(b.y+b.size/2<p.y-(tree?22:40),'The orb stays above his head');
  }
  const c={...outside,kind,age:237},shot={...outside,kind:tree?'tree-shot':'core-shot',clock:237,age:0};
  assert.deepEqual(friezaDeathBallPose(c,pose(c),{tree}),friezaDeathBallPose(shot,pose(shot),{tree}));
  const end={...shot,age:tree?treeTiming.throw:coreTiming.throw},b=friezaDeathBallPose(end,pose(end),{tree});
  assert.deepEqual([b.x,b.y,b.visible],tree?[150,126,false]:[80,320,false]);
  if(!tree){
   const last={...end,age:end.age-1},orb=friezaDeathBallPose(last,pose(last));
   assert.equal(orb.visible,true);assert.ok(orb.y-orb.size/2>224,'The entire ball leaves the screen before impact');
   assert.ok(coreTiming.eruption>=40,'Hold underground before the eruption');
  }
 }
});

test('the altar reveal pans slowly after the shot; Frieza stays beyond the Seed while Goku approaches',()=>{
 const altar={x:228,y:132,cameraX:104,cameraY:184},base={map:431,x:228,y:274,altar,kind:'reveal'};
 let previous=altar.cameraY;
 for(let age=0;age<=introTiming.pan;age++){
  const c={...base,age},camera=altarCamera(c),p=friezaScenePose(c,{cameraX:camera.x,cameraY:camera.y});
  assert.ok(Number.isInteger(camera.y)&&Number.isInteger(p.x)&&Number.isInteger(p.y));
  assert.ok(camera.y<=previous&&previous-camera.y<=1,'The native camera only streams one pixel per frame');previous=camera.y;
  if(age<=introTiming.entry)assert.ok(p.x>256,'Frieza waits off stage right during the initial scroll');
 }
 assert.equal(previous,64);
 const camera={cameraX:104,cameraY:64},a=friezaScenePose({...base,kind:'altar-approach',age:0},camera);
 for(let y=274;y>=242;y--)assert.deepEqual(friezaScenePose({...base,kind:'steal',age:30,y},camera),a,'Frieza does not approach Goku');
 assert.ok(altar.y<196&&196<242,'The Seed separates the two actors');
});

test('the distant Tree encounter preserves its anchor through every phase and flies out of frame',()=>{
 for(const [from,to,age]of[['tree-arrival','tree-charge',237],['tree-charge','tree-shot',237],['tree-shot','tree-impact',treeTiming.throw],['tree-impact','tree-leave',279]]){
  const a=treeFriezaPose(from,age,age),b=treeFriezaPose(to,0,age);
  assert.deepEqual([a.x,a.y],[b.x,b.y],`${from} -> ${to}`);
 }
 const p=treeFriezaPose('tree-leave',treeTiming.departure);
 assert.ok(p.x>256&&p.y<0);
});
