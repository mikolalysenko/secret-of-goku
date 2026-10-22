// The shot must keep a textured body, exact pitch variation and one owner
// while normal/SSJ requests alternate inside a five-frame volley.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,extensionSegments} from './apu.mjs';
import {isResident7,isRound9,customSegments,impactId} from './cartridge.mjs';
import {PC,cueRatios} from './round9.mjs';
import {KI_CONTACT,NOISE_CLOCK} from '../../gen/audio-resident7.mjs';
import {measure} from './punch.mjs';
import {periodicity,motionMix} from './motion.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'),skip=!isRound9(rom);

// Round nine: "sharper, more like the PC" — a bright pew on the boot saw
// (≈3.3 kHz, the PC blast's 4.3 kHz tone falling) hands over to the arc's
// crackle on the same voice; no DSP noise, so it never retunes contacts.
test('a sharp pew hands over to the arc crackle on one voice; both forms rotate three pitches',{skip},t=>{
 const h=createApu({rom});h.ms(60);const rows=[];
 for(const form of [0,1])for(let play=0;play<3;play++){
  h.take();h.nativeCmd(2,0xDE,form?0x0D:0x0F,0x88);
  const first={},order=[],trail={};let voices=0,ended=0;
  for(let ms=0;ms<400;ms++){
   h.ms(1);let owned=0;
   for(let v=0;v<8;v++)if(h.ram[0xAE]&(1<<v)){
    owned++;assert.equal(h.ram[0xFF80+v],0xDE);
    assert.equal(h.dspReg(0x3D)&(1<<v),0,'blast cannot retune the contact noise');
    if(h.dspReg(v*16+8)>0){
     // Each part's start rate is its first pitch held for two samples (SRCN
     // is written a moment before the new note's pitch and key-on).
     const src=h.dspReg(v*16+4),p=h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8);
     if(order.at(-1)!==src)order.push(src);
     if(first[src]===undefined){if(trail[src]===p)first[src]=p;trail[src]=p;}
    }
   }
   voices=Math.max(voices,owned);if(owned)ended=ms;
  }
  assert.deepEqual(order,[5,0x32],'pew, then crackle');assert.equal(voices,1);
  assert.ok(ended>=250&&ended<350,`return voice after the shot (${ended} ms)`);
  const {l,r}=h.take();assert.ok([...l,...r].every(v=>Math.abs(v)<32767));
  rows.push({form,play,first,ended});
 }
 for(const source of [5,0x32])for(let form=0;form<2;form++)for(let i=0;i<3;i++){
  const ratio=rows[form*3+i].first[source]/rows[form*3].first[source];
  // E9's 1 / 1.035 / .977 cycle; the instruments' fine-tuning bytes and the
  // slide's tick phase skew a sampled start rate by up to about 1.2%.
  assert.ok(Math.abs(ratio-[1,1.03515625,.9765625][i])<.015,`same pitch rotation in both timbres (${ratio})`);
 }
 for(const source of [5,0x32])assert.ok(Math.abs(rows[3].first[source]/rows[0].first[source]-2**(2/12))<.015,'SSJ is two semitones brighter');
 assert.ok(rows[0].first[5]*32000/4096/32>3000,'the pew starts above 3 kHz');
 const m=measure(rom,0xDE);
 assert.ok(m.durationMs>=200&&m.durationMs<=320);assert.ok(m.high30Energy>.05,'bright onset');
 assert.ok(m.peakDbFS>-11&&m.peakDbFS<-5,'punchy attack with headroom');
 assert.ok(periodicity(m.pcm)<.2,'crackle body is broadband rather than a sustained carrier');
 for(const name of ['ki','kiSsj']){
  const r=cueRatios(rom,name);
  assert.ok(r.lu>=PC.blast.lu&&r.small>=PC.blast.small,`${name} ${r.lu.toFixed(2)} / ${r.small.toFixed(2)} LU vs PC ${PC.blast.lu} / ${PC.blast.small}`);
 }
 t.diagnostic(JSON.stringify(rows));
});

test('five-frame volleys use at most three voices, five during the wave attack, across form changes and music phases',{skip},()=>{
 for(const song of [0x3C,0x3F])for(const beam of [false,true])for(const phase of [0,7,19]){
  const r=motionMix(rom,{song,beam,phase,mode:'volley',gap:5,blastP2:'alternate'}),label=JSON.stringify(r);
  assert.equal(r.clipped,0,label);assert.ok(r.peak<30000,label);
  assert.equal(r.maxLaunchVoices,1,label);assert.ok(r.maxVoices<=(beam?5:3),label);
  assert.equal(r.effectMask,0);assert.equal(r.musicMask,255);assert.equal(r.noiseMask,0);assert.equal(r.noiseMismatch,0);assert.equal(r.bankIntact,true);
 }
});

test('the pew and the crackle both sound on every five-frame shot before the next retrigger',{skip},()=>{
 const h=createApu({rom}),frame=1000/60.0988;h.ms(200);
 for(let i=0;i<18;i++){
  h.nativeCmd(2,0xDE,i%2?13:15,0x88);let pewMs=0,arcMs=0;
  for(let ms=0;ms<5*frame;ms++){
   if(ms===Math.ceil(2*frame))h.nativeCmd(2,impactId(rom),15,0x88);
   h.ms(1);
   for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===0xDE&&h.dspReg(v*16+8)>0&&h.dspReg(v*16)>0){
    const src=h.dspReg(v*16+4);if(src===5)pewMs++;else if(src===0x32)arcMs++;
   }
  }
  assert.ok(pewMs>=40&&arcMs>=10,`shot ${i}: pew ${pewMs} ms, crackle ${arcMs} ms`);
 }
});

// Round nine's ki contact: a falling rumble boom, then the shared crunch, on
// one voice, at least as far over the field song as the PC impact; halved
// under the Kamehameha's duck as the PC's compressor tames it under a beam.
test('the ki contact booms then crunches on one voice, louder than the PC impact against the music',{skip:!isRound9(rom)},()=>{
 const r=cueRatios(rom,'kiContact');
 assert.ok(r.lu>=PC.impact.lu&&r.small>=PC.impact.small&&r.band>=PC.impact.band,`${r.lu.toFixed(2)} / ${r.small.toFixed(2)} / ${r.band.toFixed(2)} vs PC ${JSON.stringify(PC.impact)}`);
 const m=measure(rom,KI_CONTACT);
 assert.equal(m.voices,1);assert.equal(m.ended,true);assert.ok(m.durationMs>=250&&m.durationMs<=360);
 const h=createApu({rom});h.ms(60);h.nativeCmd(2,KI_CONTACT,15,0x88);
 const sources=[],clocks=new Set();
 for(let ms=0;ms<400;ms++){h.ms(1);for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.dspReg(v*16+8)>0){
  if(h.dspReg(0x3D)&(1<<v)){clocks.add(h.dspReg(0x6C)&31);if(sources.at(-1)!=='noise')sources.push('noise');}
  else if(sources.at(-1)!==h.dspReg(v*16+4))sources.push(h.dspReg(v*16+4));
 }}
 assert.deepEqual(sources,[0x31,'noise']);assert.deepEqual([...clocks],[NOISE_CLOCK]);
 assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
 // Under the wave's duck the contact takes half the gain of a lone one.
 const level=wave=>{const g=createApu({rom});g.ms(60);if(wave){g.nativeCmd(2,0xEA,15,0x88);g.ms(100);}g.nativeCmd(2,KI_CONTACT,15,0x88);
  let peak=0;for(let ms=0;ms<60;ms++){g.ms(1);for(let v=0;v<8;v++)if((g.ram[0xAE]&(1<<v))&&g.ram[0xFF80+v]===KI_CONTACT)peak=Math.max(peak,g.dspReg(v*16));}return peak;};
 const alone=level(false),under=level(true);
 assert.ok(Math.abs(under-alone/2)<=1,`halved under the wave (${alone} → ${under})`);
});

test('unity-tuned beam alias occupies only free streaming metadata and shares the existing BRR',{skip},()=>{
 const h=createApu({rom}),segments=customSegments(rom),alias=segments.filter(s=>[0x183E,0x18BE,0x197C].includes(s.addr));
 assert.equal(alias.reduce((n,s)=>n+s.bytes.length,0),8);
 for(const a of alias)for(const s of extensionSegments().segments)assert.ok(a.addr+a.bytes.length<=s.addr||s.addr+s.bytes.length<=a.addr);
 assert.deepEqual(h.ram.slice(0x197C,0x1980),h.ram.slice(0x19C8,0x19CC),'same beam attack and loop');
 assert.deepEqual([...h.ram.slice(0x183E,0x1840)],[0,0]);
 assert.deepEqual(h.ram.slice(0x18BE,0x18C0),h.ram.slice(0x18E4,0x18E6));
});
