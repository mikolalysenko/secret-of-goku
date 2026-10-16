import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context={window:{}};
for(const file of ['goku-animation-data.js','goku-native-actions.js','goku-animation.js'])vm.runInNewContext(await readFile(new URL('../engine/'+file,import.meta.url),'utf8'),context);

test('all 51 native actions resolve their phases to valid Goku cells in both forms and all directions',()=>{
  assert.equal(context.window.GokuNativeActions.length,51);
  for(const superSaiyan of [false,true])for(let facing=0;facing<4;facing++)for(const entry of context.window.GokuNativeActions){
    const mod={frame:0,facing,options:{superSaiyan},read8:()=>0,read16:()=>0};
    const motion=new context.window.GokuAnimation(mod),frames=entry.phases?.flatMap(p=>p.frames)||[0];
    for(const graphicFrame of frames){
      mod.frame++;const displayed={map:131,x:100,y:100,animation:0x80|entry.id,latchedAnimation:0x80|entry.id,sequence:entry.pointers[0],graphicFrame,lift:0,status1:0,status2:0};
      const pose=motion.pose({displayed});
      assert.ok(context.window.GokuAnimationData.forms[pose.sheet].cells[pose.column*4+pose.row].opaque,`${entry.key} has art`);
      const mapped=entry.phases?.find(p=>p.frames.includes(graphicFrame))?.source[superSaiyan?'ssj':'goku'];
      if(mapped){
        const columns=mapped.columns.map(c=>superSaiyan&&[42,43].includes(c)?33:c);
        assert.ok(columns.includes(pose.column),`${entry.key} follows native frame ${graphicFrame}`);
      }
      if(superSaiyan&&[1,2].includes(pose.row))assert.ok(![42,43].includes(pose.column),'never display the source knockdown cells that revert to black hair');
    }
  }
});

test('native chest, boss and recovery phases never become a combat action or guess a different animation table',()=>{
  const mod={frame:1,facing:3,options:{},read8:()=>0,read16:()=>0},motion=new context.window.GokuAnimation(mod);
  const chest=context.window.GokuNativeActions[0x1b];
  const displayed={map:1,x:100,y:100,animation:0x9b,latchedAnimation:0x9b,sequence:chest.pointers[0],graphicFrame:104,lift:0,status1:0,status2:0};
  assert.equal(motion.pose({displayed}).kind,'chest');assert.equal(mod.action,undefined);
  displayed.sequence=0x1234;mod.frame++;assert.equal(motion.pose({displayed}).kind,'idle');
});

test('blocked walking uses a relaxed moving push in both forms and every direction',()=>{
  for(const superSaiyan of [false,true])for(let facing=0;facing<4;facing++)for(const native of [0,1,2]){
    const input=[0x20,0x80,0x40,0x10][facing];
    const mod={frame:0,facing,input,canAttack:true,options:{superSaiyan},read8:()=>0,read16:()=>0};
    const motion=new context.window.GokuAnimation(mod),entry=context.window.GokuNativeActions[native];
    const displayed={map:131,x:100,y:100,animation:native,latchedAnimation:native,sequence:entry.pointers[0],graphicFrame:0,lift:0,status1:0,status2:0};
    const step=()=>{mod.frame++;return motion.pose({displayed});},frames=new Set();
    for(let i=0;i<90;i++){
      const p=step();assert.equal(p.sheet,superSaiyan?'ssj':'goku');assert.equal(p.row,[0,2,1,3][facing]);
      if(i<6)assert.notEqual(p.kind,'push','input must be blocked before pushing');
      if(i>=6){assert.equal(p.kind,'push');assert.equal(p.column,0,'keeps the relaxed standing body');frames.add(p.nudge);}
      assert.equal(JSON.stringify(motion.pose({displayed})),JSON.stringify(p),'repainting cannot advance the loop');
    }
    assert.equal(frames.size,4,'short alternating steps have two planted beats');
    const saved=motion.snapshot(),next=step();motion.restore(saved);mod.frame--;assert.deepEqual(step(),next,'checkpoint resumes the same phase');
    mod.input=0;assert.notEqual(step().kind,'push','release drops the palm');
    mod.input=input;assert.notEqual(step().kind,'push','a new press does not inherit old contact time');
    for(let i=0;i<12;i++){displayed.x++;assert.notEqual(step().kind,'push','moving freely remains locomotion');}
    mod.input=input|[0x10,0x40,0x80,0x20][facing];for(let i=0;i<12;i++)assert.notEqual(step().kind,'push','opposite directions are not pressure');
    mod.input=input;mod.canAttack=false;for(let i=0;i<12;i++)assert.notEqual(step().kind,'push','native scenes and menus retain control');
    mod.canAttack=true;displayed.lift=12;for(let i=0;i<12;i++)assert.notEqual(step().kind,'push','airborne poses never push');
    displayed.lift=0;mod.action={kind:'focus'};for(let i=0;i<12;i++)assert.equal(step().kind,'focus','focus takes precedence over contact');
  }
});

test('native enemy pushes animate while moving or braced, release cleanly, and preserve scripted gestures',()=>{
 for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++)for(const id of[8,17]){
  const mod={frame:0,facing,input:[0x20,0x80,0x40,0x10][facing],canAttack:true,options:{superSaiyan},read8:()=>0,read16:()=>0};
  const motion=new context.window.GokuAnimation(mod),entry=context.window.GokuNativeActions[id];
  const displayed={map:129,x:100,y:100,animation:id,latchedAnimation:id,sequence:entry.pointers[0],graphicFrame:0,lift:0,status1:0,status2:0};
  const phases=new Set(),steps=new Set(),step=()=>{mod.frame++;return motion.pose({displayed});};
  for(let i=0;i<60;i++){
   displayed.x++;const p=step();assert.equal(p.kind,'push');assert.equal(p.sheet,superSaiyan?'ssj':'goku');
   phases.add(p.nudge);if(p.legs!==undefined)steps.add(p.legs);
  }
  assert.equal(phases.size,4);assert.equal(steps.size,4,'moving the enemy advances the feet');
  for(let i=0;i<8;i++)step();assert.equal(step().legs,undefined,'blocked contact returns to the slower in-place cadence');
  mod.input=0;assert.equal(step().kind,'idle','a stale native contact pose must not flash the strained brace');
  mod.canAttack=false;assert.equal(step().kind,entry.key,'scripted gestures still use their native mapping');
 }
});

test('flight departure and landing stay upright, brake into touchdown and retain cruise art in the air',()=>{
  for(const superSaiyan of[false,true])for(let facing=0;facing<4;facing++){
    const mod={frame:0,facing,options:{superSaiyan},read8:()=>0,read16:()=>0},motion=new context.window.GokuAnimation(mod),knee=superSaiyan?34:38;
    const heights=[];
    for(let age=0;age<=32;age++){
      mod.frame++;mod.flightTransition={kind:'landing',age};const pose=motion.pose();
      assert.equal(pose.column,age<24?knee:age<29?knee-1:0);heights.push(pose.extraLift);
    }
    assert.equal(heights[0],72);assert.equal(heights[24],0);
    assert.ok(heights.every((h,i)=>!i||h<=heights[i-1]));assert.ok(heights[0]-heights[4]>heights[16]-heights[20],'descent slows before the feet touch down');
    mod.flightTransition={kind:'takeoff',age:10};mod.frame++;assert.equal(motion.pose().column,knee);
    mod.flightTransition=null;mod.frame++;assert.ok(motion.pose({flight:true}).column>=knee+2);
  }
});
