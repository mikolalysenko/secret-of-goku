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
      if(mapped)assert.ok(mapped.columns.includes(pose.column),`${entry.key} follows native frame ${graphicFrame}`);
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
