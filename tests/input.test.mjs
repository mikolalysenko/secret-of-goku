import test from 'node:test';
import assert from 'node:assert/strict';
import {GameInput} from '../engine/input.js';
import {GamepadInput} from '../engine/gamepad.js';
const pad=(buttons=[],axes=[0,0],index=0)=>({index,id:'test',connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))});
test('standard controller maps combat, menus, diagonal sticks and edge-only actions',()=>{
 const input=new GameInput(),events=[],gamepad=new GamepadInput(input,{fly:()=>events.push('fly'),pause:()=>events.push('pause'),start:()=>events.push('start')});
 gamepad.poll([pad([0,4,9],[1,-1])]);assert.equal(input.sample(),1|(1<<10)|(1<<3)|(1<<7)|(1<<4));assert.deepEqual(events,['start']);
 gamepad.poll([pad([0,4,9],[1,-1])]);assert.deepEqual(events,['start']);
 input.clear();gamepad.poll([pad([7,11])]);assert.deepEqual(events,['start','pause']);assert.equal(input.sample(),0);
 gamepad.poll([pad([7,11])]);assert.equal(events.length,2);
 input.clear();gamepad.poll([pad([1,2,3,5,6,8])]);assert.equal(input.sample(),(1<<8)|(1<<1)|(1<<9)|(1<<11)|(1<<2));
});
test('stick dead zone has hysteresis and direction changes do not leave a held opposite input',()=>{
 const input=new GameInput(),gamepad=new GamepadInput(input);
 for(const x of[.01,-.1,.29]){gamepad.poll([pad([],[x,0])]);assert.equal(input.sample(),0);}
 gamepad.poll([pad([],[.4,0])]);input.sample();assert.equal(input.sample(),1<<7);
 gamepad.poll([pad([],[.25,0])]);assert.equal(input.sample(),1<<7);
 gamepad.poll([pad([],[-.6,0])]);assert.equal(input.sample(),1<<6);
 gamepad.poll([pad([],[.05,0])]);input.sample();assert.equal(input.sample(),0);
});
test('disconnect cancels controller charge and pending taps without releasing keyboard sources',()=>{
 const input=new GameInput(),events=[],gamepad=new GamepadInput(input,{disconnect:()=>events.push('cancel')});
 input.press('keyboard',4);gamepad.poll([pad([0])]);gamepad.poll([]);
 assert.equal(input.sample(),1<<4);assert.deepEqual(events,['cancel']);
 input.press('attack',0);gamepad.poll([pad([0])]);gamepad.poll([]);assert.equal(input.has(0),true);assert.equal(events.length,1);
});
test('focus loss and suspend require neutral controls before rearming',()=>{
 const input=new GameInput(),gamepad=new GamepadInput(input);gamepad.poll([pad([0])]);gamepad.poll([pad([0])],{focused:false});assert.equal(input.sample(),0);
 gamepad.poll([pad([0])]);assert.equal(input.sample(),0);gamepad.poll([pad()]);gamepad.poll([pad([0])]);assert.equal(input.sample(),1);
 gamepad.suspend();gamepad.poll([pad([0])]);assert.equal(input.sample(),0);
});
test('unmapped pads are reported and do not accidentally trigger standard actions',()=>{
 const input=new GameInput(),labels=[],gamepad=new GamepadInput(input,{status:label=>labels.push(label)});
 gamepad.poll([{...pad([0]),mapping:''}]);assert.equal(input.sample(),0);assert.match(labels[0],/standard/);
});

test('resuming consumes Start until it is released, then the native Start button works normally',()=>{
 const input=new GameInput();let paused=true;
 const gamepad=new GamepadInput(input,{start:()=>{if(paused){paused=false;return true;}return false;}});
 gamepad.poll([pad([9])]);assert.equal(paused,false);assert.equal(input.sample(),0);
 gamepad.poll([pad([9])]);assert.equal(input.sample(),0);gamepad.poll([pad()]);gamepad.poll([pad([9])]);assert.equal(input.sample(),1<<3);
});
