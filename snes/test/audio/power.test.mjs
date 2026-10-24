// Audible transients and real voice budgets, measured through the cartridge
// SPC/DSP. No extra voices, noise clock changes or runtime synthesis.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,loadSong,romSong,romEcho} from './apu.mjs';
import {renderCart,FRAME,installExtended} from './cues9.mjs';
import {highpass} from './loudness.mjs';
import {measure} from './punch.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');

test('Super Saiyan has an immediate broadband crack and a falling flash thump on one voice each',()=>{
 for(const id of [0xE0,0xE1]){
  const x=renderCart(rom,h=>h.nativeCmd(2,id,15,0x88))[0];
  const start=x.findIndex(v=>Math.abs(v)>.001),attack=highpass(x.slice(start,start+2560),32000);
  const db=10*Math.log10(attack.reduce((s,v)=>s+v*v,0)/attack.length);
  assert.ok(db>-21,`audible first 80 ms above 200 Hz (${db.toFixed(2)} dBFS)`);
  const m=measure(rom,id);
  assert.equal(m.voices,1);assert.equal(m.ended,true);
  assert.ok(m.timeToPeakMs<20&&m.ownershipMs<500,'sharp attack and bounded voice ownership');
  assert.ok(m.peakDbFS<-9,'headroom for the two power-up beds');
 }
});

test('both Kamehameha releases keep two voices and a falling impact audible above sub-bass',()=>{
 for(const extended of [false,true])for(const id of [0xEA,0xF0]){
  const h=createApu({rom});h.ms(60);if(extended)installExtended(h,rom);
  h.nativeCmd(2,id,15,0x88);const pitches=[];let maxVoices=0;
  for(let ms=0;ms<1300;ms++){
   h.ms(1);const mask=h.ram[0xAE];maxVoices=Math.max(maxVoices,mask.toString(2).replaceAll('0','').length);
   for(let v=0;v<8;v++)if((mask&(1<<v))&&h.dspReg(v*16+8)>0&&h.dspReg(v*16)>0&&h.dspReg(v*16+4)===0x31)
    pitches.push((h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8))*32000/4096);
   assert.equal(h.dspReg(0x3D),0,'no shared noise-clock changes');
  }
  assert.equal(maxVoices,2);assert.equal(h.ram[0xAE],0);
  assert.ok(pitches[0]>7000&&pitches[0]<9000,'impact starts near 8 kHz decoding');
  assert.ok(pitches.at(-1)<pitches[0]*.6,'impact falls into a deep body');
 }
});

test('short and first-reveal transformations keep headroom with both beds and return the music voices',()=>{
 for(const duration of [32,72])for(const song of [0x1C,0x3C,0x3F])for(const phase of [0,7,19]){
  const h=createApu({rom});h.ms(60);
  loadSong(h,rom,{...romSong(rom,song),echo:romEcho(rom,10),song,p2:10,p3:255});
  h.ms(1000+phase*FRAME);h.take();const musicMask=h.ram[0xAD];let maxVoices=0;
  for(let f=0;f<duration+100;f++){
   if(f===0)h.nativeCmd(2,0xE0,15,0x88);
   if(f===1)h.nativeCmd(0x81,0xED,0xD0,128);
   if(f===13)h.nativeCmd(0x81,0xEE,0xF0,128);
   if(f===Math.ceil(duration*14/40))h.nativeCmd(2,0xE1,15,0x88);
   if(f===duration)h.nativeCmd(0x81,0xED,0,128);
   if(f===duration+1)h.nativeCmd(0x81,0xEE,0,128);
   h.ms(FRAME);maxVoices=Math.max(maxVoices,h.ram[0xAE].toString(2).replaceAll('0','').length);
  }
  const {l,r}=h.take();let peak=0;for(const a of [l,r])for(const v of a)peak=Math.max(peak,Math.abs(v));
  assert.ok(peak<30000,`mix headroom ${duration}/${song}/${phase}: ${peak}`);
  assert.ok(maxVoices<=4,'same two beds and two one-shots');
  assert.equal(h.ram[0xAE],0);assert.equal(h.ram[0xAD],musicMask);assert.equal(h.dspReg(0x3D),0);
 }
});
