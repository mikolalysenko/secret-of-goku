// Measure the actual authored SPC notes, not just their sequence operands.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu} from './apu.mjs';
import {measure} from './punch.mjs';
import {isRound9} from './cartridge.mjs';
import {NOISE_CLOCK} from '../../gen/audio-resident7.mjs';
import {attackMs} from './round9.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');

// Round nine: both finishers share one long crunch on the contact noise
// clock; under it a sampled rumble falls an octave from 4 kHz decode rate
// (a smack sinking into the boom). SSJ's body is louder and longer.
test('normal and SSJ finishers sustain a falling sampled thump under the shared crunch',{skip:!isRound9(rom)},t=>{
 const hit=measure(rom,0xE7),rows=[];
 const tailEnergy=m=>m.pcm.slice(Math.round((m.onsetMs+80)*32)).reduce((s,v)=>s+v*v,0);
 for(const id of [0xE8,0xF1]){
  const m=measure(rom,id),h=createApu({rom});h.ms(60);h.nativeCmd(2,id,15,0x88);
  const pitches=[],clocks=new Set();let seen=false;
  for(let ms=0;ms<450;ms++){
   h.ms(1);
   for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.dspReg(v*16+8)>0){
    seen=true;
    if(h.dspReg(0x3D)&(1<<v))clocks.add(h.dspReg(0x6C)&31);
    else if(h.dspReg(v*16)>0){
     // Aperiodic rumble: verify source and falling decode rate, not an oscillator frequency.
     assert.equal(h.dspReg(v*16+4),0x31);
     const pitch=h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8);
     pitches.push(pitch*32000/4096);
    }
   }
  }
  assert.ok(seen&&pitches.length>200);
  assert.ok(pitches[0]>3000&&pitches[0]<5000,`smack starts near 4 kHz decode rate (${pitches[0]})`);
  assert.ok(pitches.at(-1)<pitches[0]*.6,'rumble falls during the heavy tail');
  assert.ok(pitches.every((v,i)=>!i||v<=pitches[i-1]),'continuous downward sweep');
  assert.deepEqual([...clocks],[NOISE_CLOCK],'contact crunch on the shared noise clock');
  assert.ok(m.durationMs>=330&&m.durationMs<=400,`long crunch tail ${m.durationMs} ms`);
  assert.ok(tailEnergy(m)>tailEnergy(hit)*2,'finisher has substantially more tail than HIT');
  assert.ok(attackMs(m.pcm)<10&&m.peakDbFS<-1.5,'immediate crack with dry headroom');
  assert.equal(m.voices,2);assert.ok(m.voiceMs<=800&&m.ownershipMs<=420);
  assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
  rows.push({m,pitches});
  t.diagnostic(`${id.toString(16)}: ${pitches[0].toFixed(0)}→${pitches.at(-1).toFixed(0)} samples/s, ${m.durationMs} ms, ${m.peakDbFS.toFixed(2)} dBFS, ${m.voiceMs} voice-ms`);
 }
 assert.ok(rows[1].m.low80Energy>rows[0].m.low80Energy*1.2,'SSJ increases the body energy');
 assert.ok(rows[1].pitches.length>rows[0].pitches.length,'SSJ has the longer body');
});

// A new contact supersedes any HIT/KICK still sounding (beds.s release
// loop), so overlapping cracks never retune or stack on one another.
test('a contact supersedes the previous one on the shared noise clock',{skip:!isRound9(rom)},()=>{
 for(const kick of [0xE8,0xF1])for(const gap of [1,2])for(const reverse of [false,true]){
  const h=createApu({rom});h.ms(60);
  const first=reverse?0xE7:kick,second=reverse?kick:0xE7;
  h.nativeCmd(2,first,15,0x88);h.ms(gap*1000/60.0988);
  h.nativeCmd(2,second,15,0x88);h.ms(3);
  let noiseFrames=0;
  for(let ms=0;ms<450;ms++){
   h.ms(1);
   const ids=[];for(let v=0;v<8;v++)if(h.ram[0xAE]&(1<<v))ids.push(h.ram[0xFF80+v]);
   assert.ok(!ids.includes(first),'the earlier contact was released');
   assert.ok(ids.length<=2,'one contact at a time');
   if(h.dspReg(0x3D)&h.ram[0xAE]){noiseFrames++;assert.equal(h.dspReg(0x6C)&31,NOISE_CLOCK);}
  }
  assert.ok(noiseFrames>0);assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
 }
});
