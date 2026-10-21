import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu} from './apu.mjs';
import {isResident7} from './cartridge.mjs';
import {motionComparison,motionMixes} from './motion.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'),skip=!isResident7(rom);
test('swings lose periodic buzz; ki retains punch and all three keep their single-voice budget',{skip},()=>{
 for(const r of motionComparison(rom)){
  assert.equal(r.after.ended,true);assert.equal(r.after.voices,1);
  assert.ok(r.after.voiceMs<=r.before.voiceMs,r.cue+' music voice ownership');
  if(r.cue!=='blast'){
   assert.ok(r.after.periodicity<.4&&r.after.periodicity<r.before.periodicity/2,r.cue+' periodicity');
   assert.ok(r.after.timeToPeakMs>=20&&r.after.timeToPeakMs<90,r.cue+' quick swell');
  }else{
   assert.ok(r.after.peakDbFS>=r.before.peakDbFS+2,'stronger launch attack');
   assert.ok(r.after.features.levelDb>=r.before.features.levelDb,'no softer launch');
   assert.ok(Math.abs(r.after.features.centroid-r.pc[0].centroid)<Math.abs(r.before.features.centroid-r.pc[0].centroid));
  }
 }
});
test('both swings fall in pitch and neither retunes the contact crack',{skip},()=>{
 for(const id of [0xE5,0xE6]){
  const h=createApu({rom});h.ms(60);h.nativeCmd(2,id,15,0x88);h.ms(60);
  const early=h.dspReg(0x72)|(h.dspReg(0x73)<<8);h.ms(100);
  const late=h.dspReg(0x72)|(h.dspReg(0x73)<<8);
  assert.ok(late<early*.95,'swing pitch falls during its tail');
 }
 // Explicitly compare shared FLG/NON activity with and without the swing.
 // Observe the contact's whole tail at 1 ms resolution, at both delays.
 for(const swing of [0xE5,0xE6])for(const gap of [1,2]){
  const trace=withSwing=>{const h=createApu({rom});h.ms(60);if(withSwing)h.nativeCmd(2,swing,15,0x88);h.ms(gap*1000/60.0988);h.nativeCmd(2,0xE7,15,0x88);const clocks=[];for(let i=0;i<180;i++){h.ms(1);if(h.dspReg(0x3D)&h.ram[0xAE])clocks.push(h.dspReg(0x6C)&31);}return [...new Set(clocks)];};
  assert.deepEqual(trace(true),trace(false));assert.deepEqual(trace(true),[31]);
 }
});
test('1/2-frame contacts and 5-frame ki volleys preserve headroom, noise state and music ownership',{skip},()=>{
 for(const r of motionMixes(rom)){
  const label=JSON.stringify(r);assert.equal(r.clipped,0,label);assert.ok(r.peak<30000,label);
  assert.ok(r.maxLaunchVoices<=1);assert.ok(r.maxSwingVoices<=2);assert.ok(r.maxVoices<=8);
  assert.equal(r.noiseMismatch,0,label);assert.equal(r.musicMask,255);assert.equal(r.effectMask,0);assert.equal(r.noiseMask,0);assert.equal(r.bankIntact,true);
 }
});
test('a contact returns either swing voice before counting overlap gain',{skip},()=>{
 for(const hit of [0xE7,0xE8,0xF1])for(const gap of [1,2]){
  const take=swing=>{
   const h=createApu({rom});h.ms(60);
   if(swing)h.nativeCmd(2,swing,15,0x88);
   h.ms(gap*1000/60.0988);h.nativeCmd(2,hit,15,0x88);
   let peakVolume=0;
   for(let t=0;t<50;t++){
    h.ms(1);const owned=[];
    for(let v=0;v<8;v++)if(h.ram[0xAE]&(1<<v)){
     owned.push(h.ram[0xFF80+v]);peakVolume=Math.max(peakVolume,h.dspReg(v*16));
    }
    assert.equal(owned.filter(id=>id===0xE5||id===0xE6).length,0,'swing still steals/counts a voice');
    assert.deepEqual(owned,[hit,hit]);
   }
   h.ms(500);assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
   return peakVolume;
  };
  const alone=take(null);
  for(const swing of [0xE5,0xE6])assert.equal(take(swing),alone,'contact gain was reduced by its own swing');
 }
});
