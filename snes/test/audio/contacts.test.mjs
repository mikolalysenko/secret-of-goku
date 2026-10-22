import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isResident7,isRound9} from './cartridge.mjs';
import {contactMixes} from './contacts.mjs';
import {measure} from './punch.mjs';
import {PC,cueRatios,attackMs} from './round9.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
// Round nine: the maintainer heard round eight's contacts as quiet; most of
// their energy was sub-200 Hz rumble. Each contact must now sit at least as
// far over the field song as the PC's (HIT: its loudest clip, hit-1), on
// small speakers too, with the PC's 0.5–5 kHz crunch.
test('contacts crack and crunch at least as far over the field song as the PC hits',{skip:!isRound9(rom)},()=>{
 for(const [name,ref,band] of [['hit',PC.hit1,PC.hitMean.band],['kick',PC.kick,PC.kick.band-.5],['kickSsj',PC.kick,PC.kick.band-.5]]){
  const r=cueRatios(rom,name);
  assert.ok(r.lu>=ref.lu,`${name} ${r.lu.toFixed(2)} LU vs PC ${ref.lu}`);
  assert.ok(r.small>=ref.small,`${name} small-speaker ${r.small.toFixed(2)} vs PC ${ref.small}`);
  assert.ok(r.band>=band,`${name} 0.5–5 kHz ${r.band.toFixed(2)} dB vs ${band}`);
  assert.ok(r.peakDbFS<-1.5,`${name} dry headroom ${r.peakDbFS}`);assert.equal(r.clipped,0);
 }
});
test('contacts keep two voices, an immediate crack and bounded tails',{skip:!isRound9(rom)},()=>{
 const rows=[0xE7,0xE8,0xF1].map(id=>({id,...measure(rom,id)}));
 for(const r of rows){
  assert.equal(r.voices,2);assert.equal(r.ended,true);
  assert.ok(attackMs(r.pcm)<10,`${r.id.toString(16)} crack reaches full level at ${attackMs(r.pcm)} ms`);
  assert.ok(r.crestDb<11,`${r.id.toString(16)} dense crunch, crest ${r.crestDb} dB`);
  assert.ok(r.durationMs<=(r.id===0xE7?240:400),`${r.id.toString(16)} tail ${r.durationMs} ms`);
  assert.ok(r.voiceMs<=(r.id===0xE7?450:800)&&r.ownershipMs<=(r.id===0xE7?260:420));
 }
 assert.ok(rows[1].durationMs>rows[0].durationMs,'finishers ring longer than HIT');
 assert.ok(rows[2].low80Energy>rows[1].low80Energy*1.2,'SSJ kick has the heavier body');
});
test('rapid contacts with full-power beams and beds fit battle/full-power mix headroom',{skip:!isResident7(rom)},()=>{
 for(const r of contactMixes(rom)){
  const tag=`song ${r.song.toString(16)} ${r.mode} every ${r.gap} frames`;
  assert.equal(r.clipped,0,tag+' clips');assert.ok(r.peak<30000,tag+` peak ${r.peak}`);
  assert.equal(r.musicMask,255,tag+' music');assert.equal(r.effectMask,0,tag+' effect voice return');
  assert.equal(r.noiseMask,0,tag+' noise cleanup');assert.equal(r.bankIntact,true,tag+' resident bank');
 }
});
