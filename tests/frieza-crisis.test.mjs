import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {newCoreCrisis,activateTwilight,crisisDialogue,crisisGreetings,crisisGreeting,crisisFlightMessages,deathBallAnnouncement,deathBallAftermath} from '../engine/frieza-crisis.js';
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
test('after an early theft the radar completes missing palace visits before returning to Frieza',()=>{
 const rom=new Uint8Array(0x200000),frieza={stolen:true,stolenMask:3,stage:'hunt'};
 assert.equal(radarTarget(rom,{mask:3},{frieza}).id,2);
 assert.equal(radarTarget(rom,{mask:127},{frieza}).id,'frieza');
});

const path='.local/rom/secret-of-mana-us.sfc';
test('Frieza steals the Balls at the altar, and the Death Ball waits for the Fortress deck',{skip:!existsSync(path)},()=>{
 const rom=readFileSync(path),events=buildFriezaEvents(rom,0),calls=bytes=>{const out=[];for(let i=0;i<bytes.length;i+=commandLength(bytes,i))if(bytes[i]>=0x20&&bytes[i]<=0x27)out.push((bytes[i]&7)<<8|bytes[i+1]);return out;};
 const theft=calls(events.get(F.theft)),deck=calls(events.get(F.deckDeathBall));
 assert.ok(theft.indexOf(0x7d7)<theft.indexOf(F.reveal),'ominous native score begins before the reveal');
 assert.ok(theft.indexOf(F.steal)<theft.indexOf(F.palace),'he leaves the altar with the Balls');
 for(const id of[F.coreCharge,F.coreShot,F.coreImpact])assert.equal(theft.indexOf(id),-1,'no Death Ball at the altar');
 assert.ok(deck.indexOf(F.coreArrival)<deck.indexOf(F.coreCharge),'he starts charging on the deck');
 for(const id of[F.coreShot,F.coreImpact])assert.equal(deck.indexOf(id),-1,'the throw belongs to the flyby');
 for(const id of[F.offer,F.transitionOffer,F.retailEscape])assert.deepEqual(events.get(id),[0x51,1,0x10,F.theft,0]);
 assert.ok(events.get(F.escape).some((v,i,a)=>v===0x1f&&a[i+1]===4),'native world-mode handoff');
 const altar=compiledText(events.get(F.theft)).map(decodeText).join(' ');assert.match(altar,/eighth Ball/);assert.doesNotMatch(altar,/FIVE MINUTES/);
 const all=compiledText(events.get(F.deckDeathBall)).map(decodeText).join(' ');assert.match(all,/Filthy monkey!/);assert.match(all,/I erased Planet Vegeta/);assert.match(all,/I will erase this world too/);assert.doesNotMatch(all,/half a season|television|heard that one|Come on out|Investigate|Call out/i);
 assert.match(deathBallAnnouncement.join(' '),/FIVE\s+MINUTES/);
 for(const text of[...deathBallAnnouncement,...deathBallAftermath])assert.ok(wrapText(text).split('\n').length<=3,text);
 for(const collected of[0,3,7]){const text=compiledText(buildFriezaEvents(rom,0,{collected}).get(F.theft)).map(decodeText).join(' ');if(collected<7)assert.doesNotMatch(text,/collected every|all seven!/);}
});

test('new story choice slots cannot overwrite Frieza scenes',{skip:!existsSync(path)},()=>{
 const rom=readFileSync(path),story=buildStoryEvents(rom,0),frieza=buildFriezaEvents(rom,0);
 for(const id of story.keys())assert.ok(!frieza.has(id),`Overlapping event ${id.toString(16)}`);
 assert.ok(story.has(0x15b),'the Underground Palace breach owns a separate native event');
});

test('Frieza powers the native Dark Lich warm-up; no dialogue displays telepathy tags',{skip:!existsSync(path)},()=>{
 const rom=readFileSync(path);
 for(const mask of[0,1,2,3]){
  const events=buildFriezaEvents(rom,mask),text=id=>compiledText(events.get(id)).map(decodeText).join(' ');
  assert.match(text(F.trial),/FRIEZA:Here. A little\nof my power/);assert.match(text(F.trial),/You do amuse me/);
  assert.match(text(F.trial),/GOKU:Whoa! His ki/);
  if(mask&1)assert.match(text(F.trial),/Are you HAPPY/);
  if(mask&2)assert.match(text(F.trial),/Please stop smiling/);
  assert.doesNotMatch(text(F.trial),/GOKU:Here. Have a little ki/);
  assert.ok(events.get(F.trial).some((v,i,a)=>v===0x17&&a[i+1]===0x0c),'native Dark Lich music/control handoff');
  // Luka's post-orbit heal sounds like her native restore (event 41B).
  const chime=parseEvent(rom,0x41b).ops.find(o=>o.op===0x40).bytes,victory=events.get(F.victory),heal=victory.findIndex((v,i,a)=>v===0x2f&&a[i+1]===1);
  assert.deepEqual(chime,[0x40,2,7,0,0x88]);assert.ok(heal>0);assert.deepEqual(victory.slice(heal+2,heal+7),chime);
  for(const bytes of events.values())assert.doesNotMatch(compiledText(bytes).map(decodeText).join(' '),/\[telepathy\]/i);
  assert.doesNotMatch(compiledText(buildFriezaEnding(mask,!!(mask&2))).map(decodeText).join(' '),/\[telepathy\]/i);
 }
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
