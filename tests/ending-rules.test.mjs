import test from 'node:test';
import assert from 'node:assert/strict';
import {endingResult,endingEvents} from '../engine/ending-rules.js';
import {buildBadEnding,heroFarewell} from '../engine/ending-events.js';
import {compiledText} from '../engine/story-compiler.js';
import {decodeText,eventRange} from '../engine/event-codec.js';
import {readFileSync,existsSync} from 'node:fs';

const complete=()=>({quest:{status:{mask:127,seedMask:127}},frieza:{status:{stage:'defeated',stolen:false}},challenge:{status:{fed:true,started:true,won:true}},worldKi:{status:{fortressDestroyed:false}}});
test('good ending requires real collection, defeated Frieza and victory over the upgraded Beast',()=>{
  assert.deepEqual(endingResult(complete()),{outcome:'good',reason:null});
  for(const [part,change,reason]of[
    ['quest',{mask:126},'balls'],['quest',{seedMask:126,delivered:1},'balls'],
    ['frieza',{stage:'dormant'},'frieza'],['frieza',{stage:'hunt',stolen:true},'frieza'],
    ['frieza',{stage:'won',stolen:true},'frieza'],['challenge',{fed:false},'beast'],
    ['challenge',{started:false},'beast'],['challenge',{won:false},'beast'],
    ['worldKi',{fortressDestroyed:true},'fortress'],
  ]){const m=complete();Object.assign(m[part].status,change);assert.deepEqual(endingResult(m),{outcome:'bad',reason},JSON.stringify(change));}
  const m=complete();m.worldKi.status.fortressDestroyed=true;m.quest.status.mask=0;m.frieza.status.stage='hunt';
  assert.equal(endingResult(m).reason,'fortress','Destruction stays fatal regardless of other completed prerequisites');
});
test('both endings finish with Kai; bad endings never summon Shenron or restore Randi',()=>{
  const text=bytes=>compiledText(bytes).map(b=>decodeText(b)).join('\n');
  for(const cause of['fortress','balls','frieza','beast']){
    const words=text(buildBadEnding(cause));
    assert.match(words,/world is gone/);assert.match(words,/jerk move/);
    assert.doesNotMatch(words,/IT IS GRANTED|Randi is alive|I got the rest|I will fetch/);
  }
  assert.match(text(heroFarewell()),/good job/);assert.match(text(heroFarewell()),/more careful/);
});
test('new farewell callbacks use unused native event slots',{skip:!existsSync('.local/rom/secret-of-mana-us.sfc')},()=>{
  const rom=readFileSync('.local/rom/secret-of-mana-us.sfc');
  for(const id of Object.values(endingEvents)){const{start,end}=eventRange(rom,id);assert.equal(end-start,1);assert.equal(rom[start],0);}
});
