import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildResident7,RESERVE,FLOOR} from '../../gen/audio-resident7.mjs';
import {customEdlCaps} from '../../gen/audio-custom.mjs';
import {brrDecode} from '../../gen/audio-brr.mjs';
import {buildSongs} from '../../gen/audio.mjs';
import {createApu,loadRom} from './apu.mjs';
import {isResident7} from './cartridge.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const bank=buildResident7();
test('round-seven samples, code and loop entries fit without changing retail BRRs',async()=>{
 assert.ok(bank.used<=RESERVE);assert.equal(bank.sampleBytes,1890);
 const songs=await buildSongs(new URL('../../../',import.meta.url).pathname,loadRom());
 for(const c of customEdlCaps(loadRom(),songs,RESERVE))assert.ok(c.end<0xFA00-c.maxEdl*0x800);
 for(const s of bank.samples){
  const once=brrDecode(s.bytes).pcm;
  if(s.loop>=0){
   const again=brrDecode(s.bytes.subarray(s.loop),{p1:once.at(-1),p2:once.at(-2)}).pcm;
   assert.deepEqual(again,once.slice(s.loop/9*16),'BRR loop has no predictor discontinuity');
   if(['charge','aura'].includes(s.name)){
    const body=once.slice(s.loop/9*16),window=Math.floor(s.rate*.02),rms=[];
    for(let i=0;i<body.length;i+=window){let e=0;for(let j=0;j<window;j++)e+=body[(i+j)%body.length]**2;rms.push(Math.sqrt(e/window));}
    const mean=rms.reduce((a,b)=>a+b,0)/rms.length;
    assert.ok(Math.sqrt(rms.reduce((a,b)=>a+(b-mean)**2,0)/rms.length)/mean<.15,'no repeated deep volume trough at the loop period');
   }
  }
  if(s.name==='beam')assert.ok(once.slice(0,s.attack).some(v=>Math.abs(v)>4000),'the source attack, after its leading silence, is present');
 }
});
test('sustained beds update without retriggering and stop through the native fade/release',{skip:!isResident7(rom)},()=>{
 const h=createApu({rom});h.ms(60);h.take();
 const owned=id=>Array.from({length:8},(_,v)=>v).filter(v=>(h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===id);
 for(const id of [0xED,0xEE]){
  h.nativeCmd(0x81,id,128,128);h.ms(100);const [v]=owned(id);assert.ok(v!==undefined);
  const start=h.ram.slice(0x4800,FLOOR);
  h.ms(3000);assert.deepEqual(owned(id),[v],'one uninterrupted sustained voice');
  const before=h.dspReg(v*16);h.nativeCmd(0x81,id,240,136);h.ms(100);
  assert.deepEqual(owned(id),[v]);assert.ok(h.dspReg(v*16)>before);
  assert.equal(h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8),136*(id===0xED?4:6));
  h.nativeCmd(0x81,id,0,128);h.ms(150);assert.deepEqual(owned(id),[]);assert.equal(h.ram[0xAE],0);
  assert.deepEqual(h.ram.slice(0x4800,FLOOR),start,'bank is immutable during playback');
 }
 const {l,r}=h.take();for(const a of [l,r])assert.ok(a.every(x=>Math.abs(x)<30000));
});
test('punch noise cannot retune sampled beds, and stopped beds return both music voices',{skip:!isResident7(rom)},()=>{
 const h=createApu({rom});h.ms(60);
 h.nativeCmd(0x81,0xED,200,128);h.ms(100);h.nativeCmd(0x81,0xEE,200,128);h.ms(100);
 const pitches=[6,7].map(v=>h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8));
 h.nativeCmd(2,0xE7,15,0x88);h.ms(30);assert.ok(h.dspReg(0x3D));
 assert.deepEqual([6,7].map(v=>h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8)),pitches);
 h.nativeCmd(0x81,0xED,240,132);h.ms(200);assert.equal(h.dspReg(0x3D),0);
 for(const id of [0xED,0xEE]){h.nativeCmd(0x81,id,0,128);h.ms(160);}
 assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
});
test('beam dispatch fades both held beds without separate CPU stop commands',{skip:!isResident7(rom)},()=>{
 for(const id of [0xEA,0xF0]){
  const h=createApu({rom});h.ms(60);
  for(const bed of [0xED,0xEE]){h.nativeCmd(0x81,bed,240,128);h.ms(100);}
  h.nativeCmd(2,id,15,0x88);h.ms(180);
  const owned=Array.from({length:8},(_,v)=>v).filter(v=>h.ram[0xAE]&(1<<v));
  assert.equal(owned.length,1);assert.equal(h.ram[0xFF80+owned[0]],id);
  assert.equal(h.ram[0x187C]|h.ram[0x187D],0);
  h.ms(1500);assert.equal(h.ram[0xAE],0);
 }
});
