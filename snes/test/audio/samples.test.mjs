import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,driverChunks,loadRom,loadSong,romSong,romInstrument,StreamPlayer} from './apu.mjs';
import {effectRam,trackBytes} from '../../gen/audio-resident-storage.mjs';
import {buildStreamClip} from '../../gen/audio-stream.mjs';
import {brrDecode} from '../../gen/audio-brr.mjs';
import {buildCustomBank,installCustom,CUSTOM_IDS,SAMPLE_BASE,RESERVE} from './custom-samples.mjs';
import {songInventory,songInstrumentSelectors,hash} from './sample-audit.mjs';
import {mixContext,proposedEcho} from './samples.mjs';
import {measure} from './punch.mjs';

import {roundFourApuRom} from './cartridge.mjs';
const rom=roundFourApuRom(readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const bank=buildCustomBank(),w=(a,p)=>a[p]|a[p+1]<<8;

test('custom bank is bounded and preserves all retail and unrelated resident tracks',()=>{
 const h=createApu({rom});h.ms(60);
 const boot=h.ram.slice(),layout=installCustom(h,bank);
 assert.equal(bank.bytes,1800);assert.equal(layout.used,1887);assert.ok(layout.used<=RESERVE);
 const old=effectRam(rom),changed=new Set(Object.values(CUSTOM_IDS));
 for(let id=0;id<=0xEC;id++)if(!changed.has(id))for(let v=0;v<2;v++){
  const p=0x2C00+4*id+2*v;
  assert.deepEqual(trackBytes(h.ram,w(h.ram,p)),trackBytes(old,w(old,p)),`effect $${id.toString(16)}/${v}`);
 }
 const allowed=a=>a>=SAMPLE_BASE&&a<SAMPLE_BASE+RESERVE||a>=0x1860&&a<0x1868||
  a>=0x18E0&&a<0x18E8||a>=0x19C0&&a<0x19D0||
  [...changed].some(id=>a>=0x2C00+4*id&&a<0x2C04+4*id);
 for(let a=0;a<65536;a++)if(!allowed(a))assert.equal(h.ram[a],boot[a],`unexpected ARAM change $${a.toString(16)}`);
 for(const s of bank.samples){
  assert.equal(s.bytes.length%9,0);assert.equal(s.bytes[s.bytes.length-9]&3,s.loop<0?1:3);
  if(s.loop>=0){
   assert.equal((s.bytes[s.loop]>>2)&3,0,'loop entry resets prediction');
   const once=brrDecode(s.bytes).pcm,again=brrDecode(s.bytes.subarray(s.loop),{p1:once.at(-1),p2:once.at(-2)}).pcm;
   assert.deepEqual(again,once.slice(s.loop/9*16),'loop repeat is bit-identical despite decoder history');
  }
 }
 const fullBoot=new Uint8Array(65536);for(const c of driverChunks(loadRom()))fullBoot.set(c.bytes,c.addr);
 assert.deepEqual(h.ram.slice(0x4800,0x4DF1),fullBoot.slice(0x4800,0x4DF1),'retail BRR unchanged');
});

test('all 69 sample sets fit after the proposed reservation, without stealing stream metadata',()=>{
 const retail=loadRom();
 for(const source of [retail,rom])for(const s of songInstrumentSelectors(source))assert.ok(s.instruments.every(i=>i<0x30));
 for(const s of songInventory()){
  const source=s.kind==='retail'?retail:rom;
  const h=createApu({rom:source});h.ms(60);
  const song=romSong(source,s.id),echo=proposedEcho(s);
  // A fresh native cache stores duplicate list ids only once. Model the
  // payload bound here, then check each unique BRR at its shifted address.
  const instruments=s.uniqueInstruments;
  const loaded=loadSong(h,source,{...song,instruments,echo,song:s.id,sampleBase:SAMPLE_BASE+RESERVE});
  assert.equal(loaded.end,s.end+RESERVE);assert.ok(loaded.end<=loaded.esa);
  assert.equal(loaded.esa,0xFA00-Math.max(1,echo.edl)*2048);
  let at=SAMPLE_BASE+RESERVE;
  instruments.forEach((id,k)=>{
   const ins=romInstrument(source,id);
   assert.deepEqual(h.ram.slice(at,at+ins.brr.length),Uint8Array.from(ins.brr),`${s.kind} $${s.id.toString(16)} sample ${id}`);
   assert.equal(w(h.ram,0x1980+4*k),at);assert.equal(w(h.ram,0x1982+4*k),at+ins.loop);
   assert.equal(w(h.ram,0x1840+2*k),ins.tune);assert.equal(w(h.ram,0x18C0+2*k),ins.adsr);
   at+=ins.brr.length;
  });
  // This is an allocation test, not playback of remapped duplicate lists.
  // The two lists are the same in every tight song and arrangement.
 }
});

test('every prototype and alternate is audible, bounded, and returns its voices',()=>{
 for(const cue of Object.keys(CUSTOM_IDS))for(const variant of ['custom','alt1','alt2']){
  const m=measure(rom,CUSTOM_IDS[cue],{echo:cue==='beam',setup:h=>installCustom(h,bank,{variant})});
  assert.ok(m.ended&&m.voices===2,`${cue}/${variant}`);
  assert.ok(m.peakDbFS>-16&&m.peakDbFS<-2,`${cue}/${variant}: output headroom`);
  assert.ok(m.durationMs<1400&&m.durationMs>=100);
  if(cue==='hit'||cue==='kick')assert.ok(m.timeToPeakMs<15,'contact starts sharply');
  if(cue==='beam')assert.ok(m.durationMs>1000,'beam sustains for the full wave');
 }
});

test('custom dense contacts preserve music, samples and headroom in tight songs and all arrangements',()=>{
 for(const song of songInventory().filter(s=>s.kind==='new'||s.kind==='retail'&&[4,12,44].includes(s.id))){
  const source=song.kind==='retail'?loadRom():rom;
  // Install shipping effect block over the retail driver so the unchanged
  // non-custom cues are available without borrowing song sequence space.
  const candidate=Buffer.from(source);
  candidate.set(rom.subarray(0x32139,0x33D39),0x32139);
  const mix=mixContext(candidate,bank,{song,cycles:2});
  assert.ok(mix.musicMask,'music still running');assert.equal(mix.clipped,0);
  assert.ok(mix.peakDbFS<-1,'at least 1 dB peak headroom');
 }
});

test('rare stream chunks cannot overwrite the prototype samples or DIR entries',()=>{
 const h=createApu({rom});h.ms(60);installCustom(h,bank);
 const before=hash(h.ram.slice(SAMPLE_BASE,SAMPLE_BASE+RESERVE)),dir=h.ram.slice(0x19C0,0x19D0);
 const clip=buildStreamClip(Float32Array.from({length:1200},(_,i)=>.3*Math.sin(2*Math.PI*311*i/6000)));
 const player=new StreamPlayer(h);h.nativeCmd(2,CUSTOM_IDS.beam,15,0x88);h.ms(60);
 player.start(0,clip,{pitch:0x0300});let seen=false;
 for(let frame=0;frame<60;frame++){
  player.frame(3,2);h.ms(1000/60.0988);seen||=h.status().active[0];
 }
 h.ms(600);assert.ok(seen,'rare stream actually played');
 assert.equal(h.ram[0xAE],0);assert.equal(hash(h.ram.slice(SAMPLE_BASE,SAMPLE_BASE+RESERVE)),before);
 assert.deepEqual(h.ram.slice(0x19C0,0x19D0),dir);
});
