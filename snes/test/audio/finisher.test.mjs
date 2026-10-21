// Measure the actual authored SPC notes, not just their sequence operands.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu} from './apu.mjs';
import {measure} from './punch.mjs';
import {isResident7} from './cartridge.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');

test('normal and SSJ finishers sustain a deep falling thump under the shared crack',{skip:!isResident7(rom)},t=>{
 const hit=measure(rom,0xE7),rows=[];
 const tailEnergy=m=>m.pcm.slice(Math.round((m.onsetMs+80)*32)).reduce((s,v)=>s+v*v,0);
 for(const id of [0xE8,0xF1]){
  const m=measure(rom,id),h=createApu({rom});h.ms(60);h.nativeCmd(2,id,15,0x88);
  const pitches=[],clocks=new Set();let seen=false;
  for(let ms=0;ms<350;ms++){
   h.ms(1);
   for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.dspReg(v*16+8)>0){
    seen=true;
    if(h.dspReg(0x3D)&(1<<v))clocks.add(h.dspReg(0x6C)&31);
    else if(h.dspReg(v*16)>0){
     // Instrument 3 has one period per 64-sample loop.
     const pitch=h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8);
     pitches.push(pitch*32000/4096/64);
    }
   }
  }
  assert.ok(seen&&pitches.length>150);
  assert.ok(pitches[0]>=75&&pitches[0]<=80,'bass attack is below 80 Hz');
  assert.ok(pitches.at(-1)>=60&&pitches.at(-1)<=66,'fall stays in the bass range');
  assert.ok(pitches.every((v,i)=>!i||v<=pitches[i-1]),'continuous downward sweep');
  assert.deepEqual([...clocks],[31],'contact cracks share one noise clock');
  assert.ok(m.durationMs>=170&&m.durationMs<=205,'150–200 ms thump, within one 5 ms metric window');
  assert.ok(tailEnergy(m)>tailEnergy(hit)*4,'finisher has substantially more bass tail than HIT');
  assert.ok(m.timeToPeakMs<12&&m.peakDbFS<-2.5,'immediate crack with dry headroom');
  assert.equal(m.voices,2);assert.ok(m.voiceMs<=320&&m.ownershipMs<=250);
  assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
  rows.push(m);
  t.diagnostic(`${id.toString(16)}: ${pitches[0].toFixed(2)}→${pitches.at(-1).toFixed(2)} Hz, ${m.durationMs} ms, ${m.peakDbFS.toFixed(2)} dBFS, ${m.voiceMs} voice-ms`);
 }
 assert.ok(rows[1].low80Energy>rows[0].low80Energy*1.2,'SSJ increases the bass energy');
 assert.ok(rows[1].durationMs>rows[0].durationMs,'SSJ has the longer thump');
});

test('kicks and punches cannot retune each other when their cracks overlap',{skip:!isResident7(rom)},()=>{
 for(const kick of [0xE8,0xF1])for(const gap of [1,2])for(const reverse of [false,true]){
  const h=createApu({rom});h.ms(60);
  h.nativeCmd(2,reverse?0xE7:kick,15,0x88);h.ms(gap*1000/60.0988);
  h.nativeCmd(2,reverse?kick:0xE7,15,0x88);
  let noiseFrames=0;
  for(let ms=0;ms<350;ms++){
   h.ms(1);
   if(h.dspReg(0x3D)&h.ram[0xAE]){noiseFrames++;assert.equal(h.dspReg(0x6C)&31,31);}
  }
  assert.ok(noiseFrames>0);assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
 }
});
