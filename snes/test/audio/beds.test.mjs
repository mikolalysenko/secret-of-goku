import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildResident7,RESERVE,FLOOR,SPRING,MUSIC_STEP,HUM_SCALE} from '../../gen/audio-resident7.mjs';
import {customEdlCaps} from '../../gen/audio-custom.mjs';
import {brrDecode} from '../../gen/audio-brr.mjs';
import {buildSongs} from '../../gen/audio.mjs';
import {createApu,loadRom} from './apu.mjs';
import {isResident7,isRound9} from './cartridge.mjs';
import {PC,cueRatios} from './round9.mjs';
import {silentSong,fieldEcho} from './cues9.mjs';
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const bank=buildResident7();
test('resident samples, code and loop entries fit without changing retail BRRs',async()=>{
 // Round nine: the hum loop is 32 ms (was 128) from its first block, 1,593
// BRR bytes in all.
 assert.ok(bank.used<=RESERVE);assert.equal(bank.sampleBytes,1593);
 assert.equal(bank.samples.find(s=>s.name==="charge").frames,128);
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
 const voice=id=>Array.from({length:8},(_,v)=>v).find(v=>(h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===id);
 h.nativeCmd(0x81,0xED,200,128);h.ms(100);h.nativeCmd(0x81,0xEE,200,128);h.ms(100);
 const beds=[voice(0xED),voice(0xEE)],pitches=beds.map(v=>h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8));
 h.nativeCmd(2,0xE7,15,0x88);h.ms(30);assert.ok(h.dspReg(0x3D));
 assert.deepEqual(beds.map(v=>h.dspReg(v*16+2)|(h.dspReg(v*16+3)<<8)),pitches);
 h.nativeCmd(0x81,0xED,240,132);h.ms(400);assert.equal(h.dspReg(0x3D),0);
 for(const id of [0xED,0xEE]){h.nativeCmd(0x81,id,0,128);h.ms(160);}
 h.ms(800);// the one-shot spring started with the charge bed ends by itself
 assert.equal(h.ram[0xAE],0);assert.equal(h.dspReg(0x3D),0);
});
test('beam dispatch fades both held beds without separate CPU stop commands',{skip:!isResident7(rom)},()=>{
 for(const id of [0xEA,0xF0]){
  const h=createApu({rom});h.ms(60);
  for(const bed of [0xED,0xEE]){h.nativeCmd(0x81,bed,240,128);h.ms(100);}
  h.nativeCmd(2,id,15,0x88);h.ms(180);
  const owned=Array.from({length:8},(_,v)=>v).filter(v=>h.ram[0xAE]&(1<<v));
  assert.equal(owned.length,2);assert.equal(h.ram[0xFF80+owned[0]],id);
  assert.equal(h.ram[0x187C]|h.ram[0x187D],0);
  h.ms(1500);assert.equal(h.ram[0xAE],0);
 }
});

// Round nine: the charge bed's first command starts the springy activation
// (charge.wav's opening), on its own voice with the song echo, and the start
// of a Kamehameha sits at least as far over the field song as the PC's.
test('a charge from rest starts a gapless, echoed spring of rising chirps',{skip:!isRound9(rom)},()=>{
 for(const [level,expect] of [[0x70,true],[0xD0,true],[0xE0,false],[0xF0,false]]){
  const h=createApu({rom});h.ms(60);silentSong(h,rom,fieldEcho(rom));
  h.nativeCmd(0x81,0xED,level,120);
  const freq=[];let owned=false,gap=0,last=-1,echo=0;
  for(let ms=0;ms<1400;ms++){
   h.ms(1);
   for(let v=0;v<8;v++)if((h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===SPRING){
    owned=true;const env=h.dspReg(v*16+8);
    if(env)assert.equal(h.dspReg(v*16+4),3,'instrument 3 partials');
    if(h.dspReg(0x4D)&(1<<v))echo++;if(ms>40&&ms<600&&env<64)gap++;
    if(env&&ms%4===0&&ms<600)freq.push((h.dspReg(v*16+2)|h.dspReg(v*16+3)<<8)*32000/4096/64);
    last=ms;
   }
  }
  assert.equal(owned,expect,`level $${level.toString(16)}`);
  if(!expect)continue;
  assert.ok(last>900&&last<1250,`one-shot spring ends ${last} ms`);
  assert.equal(gap,0,'chirps tie into each other: no key-off gaps');
  assert.ok(echo>800,'the spring rings through the song echo');
  const lo=Math.min(...freq),hi=Math.max(...freq);
  assert.ok(lo>950&&lo<1100&&hi>1150&&hi<1300,`≈1.0–1.2 kHz like charge.wav (${lo.toFixed(0)}–${hi.toFixed(0)})`);
  // Count resets: a fall of more than a semitone from the running peak.
  let resets=0,peak=freq[0];
  for(const f of freq){if(f>peak)peak=f;else if(f<peak/2**(1/12)){resets++;peak=f;}}
  assert.ok(resets>=5,`repeated rising chirps, not one sweep (${resets})`);
  assert.ok(h.ram[0xFF80+[...Array(8).keys()].find(v=>h.ram[0xFF80+v]===0xED)]===0xED,'the hum bed continues');
 }
});
test('the activation and SSJ activation sit at least as far over the field song as the PC charge',{skip:!isRound9(rom)},()=>{
 for(const [name,ref] of [['chargeStart',PC.chargeStart],['chargeStartSsj',PC.chargeStartSsj]]){
  const r=cueRatios(rom,name);
  assert.ok(r.lu>=ref.lu,`${name} ${r.lu.toFixed(2)} LU vs PC ${ref.lu}`);
  assert.ok(r.small>=ref.small,`${name} small-speaker ${r.small.toFixed(2)} vs PC ${ref.small}`);
  assert.ok(r.band>=ref.band,`${name} band ${r.band.toFixed(2)} vs PC ${ref.band}`);
  assert.equal(r.clipped,0);
 }
});
test('songs start 3 dB below retail and the hum bed scales by HUM_SCALE',{skip:!isRound9(rom)},()=>{
 const h=createApu({rom});h.ms(60);
 assert.deepEqual([h.ram[0x0DC4],h.ram[0x1019]],[MUSIC_STEP,MUSIC_STEP]);
 assert.equal(MUSIC_STEP*15,0xB4);
 h.nativeCmd(0x81,0xED,0x80,128);h.ms(250);
 const v=Array.from({length:8},(_,v)=>v).find(v=>(h.ram[0xAE]&(1<<v))&&h.ram[0xFF80+v]===0xED);
 assert.ok(Math.abs(h.ram[0xFC11+v*2]-((0x80*HUM_SCALE)>>8))<=1,'native 6-tick fade settles on level × HUM_SCALE');
});
// The Kamehameha's release ducks the song volume once and the driver's own
// fade restores it; a CPU/song fade in progress is left alone, port 1 stays
// clear, and the release then sits over the music like the PC's beam.
test('the wave release ducks the song and the native fade restores it',{skip:!isRound9(rom)},async()=>{
 const {romSong,romEcho,loadSong}=await import('./apu.mjs');
 const {DUCK,DUCK_STEPS}=await import('../../gen/audio-resident7.mjs');
 const field=()=>{const h=createApu({rom});h.ms(60);const s=romSong(rom,0x1C);
  loadSong(h,rom,{blob:s.blob,instruments:s.instruments,echo:romEcho(rom,10),song:0x1C,p2:10,p3:255});
  h.waitFor(()=>h.ram[0xAD]!==0,4e7);h.ms(500);return h;};
 for(const id of [0xEA,0xF0]){
  const h=field(),base=h.ram[0x84];assert.equal(base,0xB4);
  h.nativeCmd(2,id,15,0x88);h.ms(5);
  assert.equal(h.ram[0x84],(base*DUCK)>>8,'ducked at once');assert.ok(h.ram[0x8B]>DUCK_STEPS-3);
  let restored=0;for(let ms=0;ms<DUCK_STEPS*31.5+500;ms++){h.ms(1);if(!restored&&h.ram[0x84]===base)restored=ms;assert.equal(h.cpuRead(1),0);}
  assert.ok(restored>DUCK_STEPS*31.5*.9&&restored<DUCK_STEPS*31.5*1.1,`restored after ${restored} ms`);
  assert.equal(h.ram[0x8B],0);assert.equal(h.ram[0xAE],0);
  // Repeated releases never drift the music volume.
  for(let i=0;i<3;i++){h.nativeCmd(2,id,15,0x88);h.ms(DUCK_STEPS*31.5+200);}
  assert.equal(h.ram[0x84],base,'no cumulative drift');
 }
 // A song fade already running (here a CPU fade toward half volume) wins.
 const h=field();h.nativeCmd(0x80,0x28);h.ms(40);const during=h.ram[0x84];
 h.nativeCmd(2,0xEA,15,0x88);h.ms(5);assert.ok(Math.abs(h.ram[0x84]-during)<=4,'no duck during a fade');
 h.ms(DUCK_STEPS*31.5);assert.equal(h.ram[0x84],8*12,'the CPU fade reaches its own target');
});
