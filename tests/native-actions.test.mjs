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
