import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {newCoreCrisis,activateTwilight,crisisDialogue,crisisGreetings,crisisGreeting,crisisFlightMessages} from '../engine/frieza-crisis.js';
import {buildFriezaEvents,buildFriezaEnding,friezaEvents as F} from '../engine/frieza-events.js';
import {parseEvent,decodeText,encodeText,wrapText,commandLength} from '../engine/event-codec.js';
import {compileStoryEvent,compiledText} from '../engine/story-compiler.js';
import {buildStoryEvents} from '../engine/story-events.js';
import {radarTarget} from '../engine/dragon-radar.js';

test('the core deadline is persistent story state and twilight does not rewind or complete other quests',()=>{
 const r=new Uint8Array(0x20000);r[0xcf41]=2;r[0xcf44]=3;r[0xcf46]=4;r[0xcf4e]=4;
 activateTwilight(r);assert.deepEqual([r[0xcf41],r[0xcf44],r[0xcf45],r[0xcf46],r[0xcf4e]],[3,6,1,4,4]);
 r[0xcf41]=4;r[0xcf44]=7;activateTwilight(r);assert.equal(r[0xcf41],4);assert.equal(r[0xcf44],7);
 assert.deepEqual(newCoreCrisis(),{active:true,minutes:5,flightNotified:false});
 for(const text of [...Object.values(crisisGreetings),...Object.values(crisisDialogue),...crisisFlightMessages])encodeText(text);
 for(const text of crisisFlightMessages)assert.ok(wrapText(text).split('\n').length<=3,text);
 assert.match(crisisFlightMessages.join(' '),/THAT IS NOT PLENTY/);
 for(const frieza of[{eligible:true},{stolen:true}]){
  const target=radarTarget(new Uint8Array(0x200000),{mask:127},{frieza});
  assert.ok(wrapText(`RADAR 8TH BALL TURN AROUND\nNext: ${target.name}\n${target.hint}`).split('\n').length<=3);
 }
});

const path='.local/rom/secret-of-mana-us.sfc';
test('Death Ball precedes twilight, and declining at the native transition preserves the retail exit',{skip:!existsSync(path)},()=>{
 const rom=readFileSync(path),events=buildFriezaEvents(rom,0),bytes=events.get(F.theft),calls=[];
 for(let i=0;i<bytes.length;i+=commandLength(bytes,i))if(bytes[i]>=0x20&&bytes[i]<=0x27)calls.push((bytes[i]&7)<<8|bytes[i+1]);
 assert.ok(calls.indexOf(F.coreCharge)<calls.indexOf(F.coreShot));assert.ok(calls.indexOf(F.coreShot)<calls.indexOf(F.coreImpact));assert.ok(calls.indexOf(F.coreImpact)<calls.indexOf(F.leave));
 assert.deepEqual(events.get(F.retailEscape).slice(2),Array.from(compileStoryEvent(parseEvent(rom,0x4a4),0)));
 assert.ok(events.get(F.escape).some((v,i,a)=>v===0x1f&&a[i+1]===4),'native world-mode handoff');
 const all=compiledText(bytes).map(decodeText).join(' ');assert.match(all,/destabilized the core/);assert.match(all,/FIVE MINUTES/);assert.doesNotMatch(all,/half a season|television|heard that one/i);
});

test('the Tree blame and every ending party variant follow Frieza through to the repaired core',{skip:!existsSync(path)},()=>{
 const rom=readFileSync(path),tree=parseEvent(rom,0x5f8),source=new Set([...parseEvent(rom,0x4e0).ops,...tree.ops].filter(o=>o.op==='text').map(o=>o.at));
 for(const at of Object.keys(crisisDialogue))assert.ok(source.has(+at),Number(at).toString(16));
 for(const mask of[0,1,2,3]){
  const text=compiledText(compileStoryEvent(tree,mask,{textOverrides:crisisDialogue})).map(decodeText).join(' ');
  assert.match(text,/Death Ball/);assert.doesNotMatch(text,/THANATOS.s doing/);
  const ending=compiledText(buildFriezaEnding(mask,!!(mask&2))).map(decodeText).join(' ');assert.match(ending,/Repair the planet/);assert.match(ending,/THE CORE IS WHOLE/);
  const finale=buildStoryEvents(rom,mask,{crisis:true});assert.match(compiledText(finale.get(0x429)).map(decodeText).join(' '),/Five minutes/);
 }
 assert.equal(crisisGreeting({id:4,ops:[{op:'text',text:'WATTS:Which weapon?'}]}),'watts');
 assert.equal(crisisGreeting({id:5,ops:[{op:'text',text:'Would you like to buy supplies?'}]}),'shop');
});
