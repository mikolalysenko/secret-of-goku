import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isResident7} from './cartridge.mjs';
import {contactComparison,contactMixes} from './contacts.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
test('contacts retain loud pop/crunch; only the finishing kick has a longer voice budget',{skip:!isResident7(rom)},()=>{
 for(const r of contactComparison(rom)){
  assert.ok(r.peakGainDb>=2.5,`${r.cue} peak gain ${r.peakGainDb} dB`);
  assert.ok(r.bodyGainDb>=3&&r.crunchGainDb>=1.5,`${r.cue} body/crunch gains ${r.bodyGainDb}/${r.crunchGainDb} dB`);
  assert.ok(r.after.peakDbFS<-2.5&&r.after.timeToPeakMs<12);
  if(r.id===0xE7)assert.ok(r.after.durationMs<=r.before.durationMs&&r.after.voiceMs<=r.before.voiceMs);
  else assert.ok(r.after.durationMs<=205&&r.after.voiceMs<=320,'bounded finisher tail');
  assert.equal(r.after.voices,2);assert.equal(r.after.ended,true);
 }
});
test('rapid contacts with full-power beams and beds fit battle/full-power mix headroom',{skip:!isResident7(rom)},()=>{
 for(const r of contactMixes(rom)){
  const tag=`song ${r.song.toString(16)} ${r.mode} every ${r.gap} frames`;
  assert.equal(r.clipped,0,tag+' clips');assert.ok(r.peak<30000,tag+` peak ${r.peak}`);
  assert.equal(r.musicMask,255,tag+' music');assert.equal(r.effectMask,0,tag+' effect voice return');
  assert.equal(r.noiseMask,0,tag+' noise cleanup');assert.equal(r.bankIntact,true,tag+' resident bank');
 }
});
