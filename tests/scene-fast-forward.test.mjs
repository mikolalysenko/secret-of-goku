import test from 'node:test';
import assert from 'node:assert/strict';
import {windowHasChoice,createSceneFastForward} from '../engine/scene-fast-forward.js';
import {box,choice} from '../engine/story-events.js';
test('fast-forward recognizes choices before any confirmation, including multi-page windows and command arguments',()=>{
 const scan=bytes=>windowHasChoice(i=>bytes[i]??0,0);
 assert.equal(scan(box('Hello.\nThis is a regular message.')),false);
 assert.equal(scan(choice('Feed the Beast?\n',[{label:'No',x:1},{label:'Yes',x:15}])),true);
 assert.equal(scan([0x50,0x30,0x58,0x5b,0x9b,0x51]),false,'opcode arguments are not selection commands');
});
test('R accelerates and pulses ordinary prose, while L+R and choices never auto-confirm',()=>{
 const ram=new Uint8Array(0x20000);ram[0xd0]=0x81;ram[0xe4]=1;
 let text=box('Hello.');const mod={frame:16,read8:a=>ram[a],read16:a=>ram[a]|ram[a+1]<<8,story:{inspectByte:i=>text[i]??0}};
 const ff=createSceneFastForward(mod);assert.equal(ff.state(0x800).active,true);assert.equal(ff.input(0x800),1<<16);
 ram[0xd0]=0x83;assert.equal(ff.input(0x800),1<<16);ram[0xd0]=0x81;mod.frame=18;assert.equal(ff.input(0x800),0);assert.equal(ff.state(0xc00).active,false);assert.equal(ff.input(0xc00),0xc00);
 text=choice('Stay or go?\n',[{label:'Stay',x:1},{label:'Go',x:15}]);ff.state(0);
 assert.equal(ff.state(0x800).choice,true);mod.frame=32;assert.equal(ff.input(0x800),0);
 ram[0xd0]=0;assert.equal(ff.state(0x800).active,false);
});
