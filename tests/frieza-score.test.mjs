import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {arrangements} from '../engine/mana-arrangements.js';
import {patches} from '../engine/mana-score-kit.js';
import {readManaInstruments,decodeBrr} from '../engine/mana-instruments.js';
import {renderSpcScoreSync,scoreLength} from '../engine/spc-score.js';
const meta=JSON.parse(readFileSync(new URL('../assets/audio/music/score.json',import.meta.url)));
const romPath='.local/rom/secret-of-mana-us.sfc';

test('entrance, combat and training arrangements keep their references and develop across eight voices',()=>{
 assert.match(meta.runtime.references.battle.url,/5CpQ-uBRa78/);assert.match(meta.runtime.references.vegeta.url,/M954D_jyJbQ/);
 const scores=Object.fromEntries(Object.entries(arrangements).map(([k,b])=>[k,b()]));
 assert.deepEqual(Object.keys(scores),['arrival','battle','orbit','vegeta','vegeta-full-power']);
 assert.equal(scores.arrival.title,'Five Minutes');assert.ok(scores.arrival.bpm<scores.battle.bpm);
 assert.ok(scores.orbit.bpm>scores.battle.bpm);assert.ok(scores['vegeta-full-power'].bpm>scores.vegeta.bpm);
 for(const[key,score]of Object.entries(scores)){
  assert.equal(score.voices.length,8);assert.ok(score.sections.length>=6,key);
  assert.ok(score.bars*4*60/score.bpm>=75,`${key} is a full multi-section arrangement`);
  for(const voice of score.voices){
   assert.ok(voice.events.length>30,`${key}: ${voice.role} plays throughout`);
   // A monophonic voice keys one note per instant; none is silently dropped.
   assert.equal(new Set(voice.events.map(e=>e.at)).size,voice.events.length,`${key}: ${voice.role}`);
   for(const e of voice.events){
    const patch=patches[e.patch];assert.ok(patch,`${key}: ${e.patch}`);
    assert.ok(e.at>=0&&e.at<score.bars*4&&e.len>0);
    // Stay near the registers the game's own sequences give each sample.
    if(patch.range)assert.ok(e.note>=patch.range[0]-5&&e.note<=patch.range[1]+5,`${key}: ${e.patch} note ${e.note}`);
   }
  }
  const used=new Set(score.voices.flatMap(v=>v.events.map(e=>e.patch)));
  for(const p of['kick','snare','strings','brass'])assert.ok(used.has(p),`${key} uses ${p}`);
 }
 // Kick and snare share one voice, as in the game's boss theme.
 assert.deepEqual(new Set(scores.battle.voices[0].events.map(e=>e.patch)),new Set(['kick','snare']));
});

test('the score metadata ships no audio: every cue is rendered at runtime',()=>{
 assert.deepEqual(meta.runtime.tracks.map(t=>t.key),Object.keys(arrangements));
 for(const key of Object.keys(arrangements))assert.ok(!existsSync(new URL(`../assets/audio/music/${key}.wav`,import.meta.url)),`${key} is rendered at runtime`);
});

test('BRR decoding follows the hardware filters, range clamp and 15-bit wrap',()=>{
 // Header: shift 12, filter 0, END. Nibbles 7 and -8 hit both 15-bit limits.
 const block=[0xc1,0x78,0,0,0,0,0,0,0];
 const pcm=decodeBrr(Uint8Array.from(block),0,9);
 assert.equal(pcm.length,16);assert.equal(pcm[0],0x3800);assert.equal(pcm[1],-0x4000);
 // Filter 1 decays a held value by 15/16 per sample.
 const held=decodeBrr(Uint8Array.from([0xc1,0x77,0x77,0x77,0x77,0x77,0x77,0x77,0x77,0x05,0,0,0,0,0,0,0,0]),0,18);
 assert.equal(held[15],0x3800);assert.equal(held[16],0x3800-(0x3800>>4));
 assert.equal(readManaInstruments(new Uint8Array(1024)),null);
});

test('the cartridge instrument bank renders seamless, balanced cues',{skip:!existsSync(romPath)},()=>{
 const bank=readManaInstruments(new Uint8Array(readFileSync(romPath)));
 assert.equal(bank.length,33);
 // Strings (18) and synth brass (3) loop; kick (23) is a one-shot.
 assert.ok(bank[18].loopStart>0&&bank[3].loopStart>0);assert.equal(bank[23].loopStart,-1);
 assert.deepEqual(bank[18].adsr,[0xff,0xe0]);
 for(const[key,build]of Object.entries(arrangements)){
  const score=build(),r=renderSpcScoreSync(bank,score);
  assert.equal(r.left.length,scoreLength(score));
  let sum=0,peak=0,dc=0,delta=0;
  for(let i=0;i<r.left.length;i++){const v=r.left[i];sum+=v*v;peak=Math.max(peak,Math.abs(v),Math.abs(r.right[i]));dc+=v;if(i)delta=Math.max(delta,Math.abs(v-r.left[i-1]));}
  assert.ok(Math.sqrt(sum/r.left.length)>.08,`${key} is audible`);assert.ok(peak<=.8001);assert.ok(Math.abs(dc/r.left.length)<.01);
  assert.ok(Math.abs(r.left[0]-r.left.at(-1))<delta*.5,`${key} loops without a seam`);
  for(const v of r.voices)assert.ok(v.rms>.004,`${key}: ${v.role} is audible`);
 }
});
