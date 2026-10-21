// The shot must keep a textured body, exact pitch variation and one owner
// while normal/SSJ requests alternate inside a five-frame volley.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,extensionSegments} from './apu.mjs';
import {isResident7,customSegments} from './cartridge.mjs';
import {measure} from './punch.mjs';
import {periodicity,motionMix} from './motion.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'),skip=!isResident7(rom);

test('ki zap hands its single voice to the existing beam texture and both forms rotate three pitches',{skip},t=>{
 const h=createApu({rom});h.ms(60);const rows=[];
 for(const form of [0,1])for(let play=0;play<3;play++){
  h.take();h.nativeCmd(2,0xDE,form?0x0D:0x0F,0x88);
  const first={},sources=new Set();let voices=0,ended=0;
  for(let ms=0;ms<400;ms++){
   h.ms(1);let owned=0;
   for(let v=0;v<8;v++)if(h.ram[0xAE]&(1<<v)){
    owned++;assert.equal(h.ram[0xFF80+v],0xDE);
    assert.equal(h.dspReg(0x3D)&(1<<v),0,'blast cannot retune the contact noise');
    if(h.dspReg(v*16+8)>0){
     const src=h.dspReg(v*16+4);sources.add(src);
     first[src]??=h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8);
    }
   }
   voices=Math.max(voices,owned);if(owned)ended=ms;
  }
  assert.deepEqual([...sources],[9,0x1F]);assert.equal(voices,1);
  assert.ok(ended>=240&&ended<300,'return voice after the 250 ms shot');
  const {l,r}=h.take();assert.ok([...l,...r].every(v=>Math.abs(v)<32767));
  rows.push({form,play,first,ended});
 }
 for(const source of [9,0x1F])for(let form=0;form<2;form++)for(let i=0;i<3;i++){
  const ratio=rows[form*3+i].first[source]/rows[form*3].first[source];
  assert.ok(Math.abs(ratio-[1,1.03515625,.9765625][i])<.003,'same pitch rotation in both timbres');
 }
 for(const source of [9,0x1F])assert.ok(Math.abs(rows[3].first[source]/rows[0].first[source]-2**(2/12))<.003,'SSJ is two semitones brighter');
 const m=measure(rom,0xDE);
 assert.ok(m.durationMs>=200&&m.durationMs<=300);assert.ok(m.timeToPeakMs<45);
 assert.ok(m.peakDbFS>-14&&m.peakDbFS<-10,'punchy attack with headroom');
 assert.ok(periodicity(m.pcm)<.2,'sampled body is broadband rather than a sustained carrier');
 t.diagnostic(JSON.stringify(rows));
});

test('five-frame volleys use at most three voices, four with a beam, across form changes and music phases',{skip},()=>{
 for(const song of [0x3C,0x3F])for(const beam of [false,true])for(const phase of [0,7,19]){
  const r=motionMix(rom,{song,beam,phase,mode:'volley',gap:5,blastP2:'alternate'}),label=JSON.stringify(r);
  assert.equal(r.clipped,0,label);assert.ok(r.peak<30000,label);
  assert.equal(r.maxLaunchVoices,1,label);assert.ok(r.maxVoices<=(beam?4:3),label);
  assert.equal(r.effectMask,0);assert.equal(r.musicMask,255);assert.equal(r.noiseMask,0);assert.equal(r.noiseMismatch,0);assert.equal(r.bankIntact,true);
 }
});

test('the sampled body is audible on every five-frame shot before the next retrigger',{skip},()=>{
 const h=createApu({rom}),frame=1000/60.0988;h.ms(200);
 for(let i=0;i<18;i++){
  h.nativeCmd(2,0xDE,i%2?13:15,0x88);let zap=false,bodyMs=0;
  for(let ms=0;ms<5*frame;ms++){
   if(ms===Math.ceil(2*frame))h.nativeCmd(2,0x38,15,0x88);
   h.ms(1);
   for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===0xDE&&h.dspReg(v*16+8)>0&&h.dspReg(v*16)>0){
    if(h.dspReg(v*16+4)===9)zap=true;
    else if(zap&&h.dspReg(v*16+4)===0x1F)bodyMs++;
   }
  }
  assert.ok(zap&&bodyMs>=10,`shot ${i}: textured body ${bodyMs} ms`);
 }
});

test('unity-tuned beam alias occupies only free streaming metadata and shares the existing BRR',{skip},()=>{
 const h=createApu({rom}),segments=customSegments(rom),alias=segments.filter(s=>[0x183E,0x18BE,0x197C].includes(s.addr));
 assert.equal(alias.reduce((n,s)=>n+s.bytes.length,0),8);
 for(const a of alias)for(const s of extensionSegments().segments)assert.ok(a.addr+a.bytes.length<=s.addr||s.addr+s.bytes.length<=a.addr);
 assert.deepEqual(h.ram.slice(0x197C,0x1980),h.ram.slice(0x19C8,0x19CC),'same beam attack and loop');
 assert.deepEqual([...h.ram.slice(0x183E,0x1840)],[0,0]);
 assert.deepEqual(h.ram.slice(0x18BE,0x18C0),h.ram.slice(0x18E4,0x18E6));
});
