import test from 'node:test';
import assert from 'node:assert/strict';
import {partyText} from '../engine/native-story.js';
import {prepareStoryArea} from '../engine/story-areas.js';
import {worldAim} from '../engine/world-ki.js';
import {beamTouchesBarrier,kiBarriers} from '../engine/native-barriers.js';
import {commandLength} from '../engine/event-codec.js';

test('native ASCII credits remain opaque despite letters matching event opcodes',()=>{
  const credits=[0x7d,...Buffer.from('WORLD\nSTAFF 1, 2'),0x7e,0x30,0x68,2];
  assert.equal(commandLength(credits,0),credits.length-3);
  assert.equal(commandLength(credits,credits.length-3),3);
});

test('incomplete party dialogue preserves NPC replies in mixed speaker pages',()=>{
  const page='{1}:Dyluck!\nTHANATOS:Too late!\n{0}:Let him go!\n{2}:Hey!';
  assert.equal(partyText(page,0).text,'\nTHANATOS:Too late!\n{0}:Let him go!');
  assert.equal(partyText(page,3).text,page);
  assert.equal(partyText(' and another thing...',0,true).text,'');
  assert.equal(partyText('LUKA:Find {1}.',0,true).text,'LUKA:Find Primm.');
  assert.ok(partyText(page,1).text.startsWith('{1}:'));
  assert.ok(partyText(page,2).text.endsWith('{2}:Hey!'));
});

test('early area prerequisites are local, monotone and leave Tree and final bosses untouched',()=>{
  const r=new Uint8Array(0x20000);r[0xcf24]=8;
  assert.deepEqual(prepareStoryArea(r,131),[]);
  prepareStoryArea(r,134);assert.equal(r[0xcf24],8);
  prepareStoryArea(r,432);assert.equal(r[0xcf41],2);assert.equal(r[0xcf44],1);
  assert.equal(r[0xcf46],0);assert.equal(r[0xcf4e],0);
  assert.deepEqual(prepareStoryArea(r,82),[],'castle exterior still requires an invitation or a blast');
  assert.deepEqual(prepareStoryArea(r,300),[],'witch gate is not opened just by entering');
});

test('aerial targeting uses native heading and wraps across world seams',()=>{
  for(const[heading,target]of[[0,{x:2,y:4090}],[256,{x:4090,y:2}],[512,{x:2,y:10}],[768,{x:10,y:2}]]){
    const a=worldAim({x:2,y:2},heading,target);assert.ok(Math.abs(a.along-8)<.001);assert.ok(Math.abs(a.across)<.001);
  }
  assert.ok(worldAim({x:100,y:100},0,{x:100,y:200}).along<0);
});

test('scripted gates require a charged travelling wave aimed at their actual rectangle',()=>{
  for(const barrier of kiBarriers){
    const[x,y,w,h]=barrier.rect,beam={x:x+w/2,y:y+h+80,dx:0,dy:-1,width:19,strength:1,length:180};
    assert.equal(beamTouchesBarrier(beam,barrier),true);
    assert.equal(beamTouchesBarrier({...beam,dy:1},barrier),false);
    assert.equal(beamTouchesBarrier({...beam,strength:.25},barrier),false);
    assert.equal(beamTouchesBarrier({...beam,x:x-150},barrier),false);
    assert.equal(beamTouchesBarrier({...beam,length:2},barrier),false);
  }
});
