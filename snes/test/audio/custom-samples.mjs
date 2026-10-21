// RAM-only round-five prototype, deliberately not imported by the build.
// Four resident BRRs, no streaming or per-frame CPU servicing.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readWav,resample,brrEncode} from '../../gen/audio-brr.mjs';
import {root,hash} from './sample-audit.mjs';

export const SAMPLE_BASE=0x4DF1,RESERVE=0x800,INSTRUMENT_BASE=0x30;
export const CUSTOM_IDS={hit:0xE7,kick:0xE8,impact:0xED,beam:0xEA};
const zeroMean=a=>{const mean=a.reduce((s,v)=>s+v,0)/a.length;return a.map(v=>v-mean);};
const normalize=(a,peak)=>{let m=0;for(const v of a)m=Math.max(m,Math.abs(v));return a.map(v=>v*peak/Math.max(m,1e-9));};
const source=name=>readWav(readFileSync(join(root,`assets/audio/dbz/${name}.wav`)));

export function buildCustomBank(){
 let seed=0xDB250005;
 const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/0x80000000-1;};
 const srcHit=source('hit-1'),srcBoom=source('impact'),srcBeam=source('beam');
 const snap=new Float32Array(512);let last=0;
 for(let i=16;i<496;i++){
  const t=(i-16)/16000,n=noise(),high=n-last;last=n;
  // Slice around the browser hit's first main transient, add a sub-10 ms
  // high-frequency crack and taper to zero. Rendered WAVs get no processing.
  snap[i]=(srcHit.pcm[192+i-16]*.5*Math.exp(-t*45)+high*.85*Math.exp(-t*110))*Math.min(1,(496-i)/80);
 }
 const body=new Float32Array(1024);let phase=0;
 for(let i=16;i<1008;i++){
  const t=(i-16)/8000,f=63+150*Math.exp(-t*65);phase+=2*Math.PI*f/8000;
  const attack=Math.min(1,t*2200),fade=Math.min(1,(1008-i)/96);
  body[i]=attack*fade*(Math.sin(phase)+.19*Math.sin(2.03*phase)*Math.exp(-t*60))*Math.exp(-t*21);
 }
 const boomSource=resample(srcBoom.pcm,srcBoom.rate,8000),boom=new Float32Array(1024);
 let low=0,boomPhase=0;
 for(let i=16;i<1008;i++){
  const t=(i-16)/8000;low+=.32*(noise()-low);boomPhase+=2*Math.PI*(48+72*Math.exp(-t*45))/8000;
  boom[i]=(boomSource[280+i-16]*1.3+low*.22+Math.sin(boomPhase)*.19)*Math.exp(-t*18)*Math.min(1,(1008-i)/128);
 }
 // 624-sample circular sustain with a 96-sample overlap; filter-0 at the
 // loop entry discards BRR history, so repeated loops are deterministic.
 const beamSource=resample(srcBeam.pcm,srcBeam.rate,12000),loopLength=624,cross=96,start=2160;
 const loop=zeroMean(Float32Array.from({length:loopLength},(_,i)=>{
  if(i>=cross)return beamSource[start+i];
  const u=i/cross;return beamSource[start+i]*u+beamSource[start+loopLength+i]*(1-u);
 }));
 const roar=new Float32Array(640);roar.set(normalize(loop,1).map(v=>Math.tanh(v*2.4)),16);
 const defs=[
  {name:'snap',rate:16000,pcm:snap,peak:.90,tune:0,loop:-1,note:'31 ms browser hit transient plus a synthesized high-pass crack; 1 ms initial BRR guard.'},
  {name:'body',rate:8000,pcm:body,peak:.92,tune:0x80,loop:-1,note:'126 ms synthesized 213→63 Hz falling body with a short second harmonic; 2 ms guard.'},
  {name:'boom',rate:8000,pcm:boom,peak:.92,tune:0x80,loop:-1,note:'126 ms browser impact slice plus filtered noise and a falling low sine; 2 ms guard.'},
  {name:'roar',rate:12000,pcm:roar,peak:.88,tune:0xC0,loop:9,note:'52 ms browser beam sustain loop, 8 ms overlap and soft saturation; 1.33 ms guard, filter-0 loop entry.'},
 ];
 let at=SAMPLE_BASE;
 const samples=defs.map((d,i)=>{
  const pcm=normalize(d.pcm,d.peak),r=brrEncode(pcm,{resetAt:new Set(d.loop<0?[0]:[0,d.loop/9])});
  r.bytes[r.bytes.length-9]|=d.loop<0?1:3;
  const s={...d,pcm,bytes:r.bytes,snr:r.snr,addr:at,instrument:INSTRUMENT_BASE+i,adsr:0xE0FF,sha256:hash(r.bytes)};
  at+=r.bytes.length;return s;
 });
 assert.equal(at-SAMPLE_BASE,1800);
 return {samples,bytes:1800,sampleEnd:at,reserve:RESERVE};
}

const note=(pitch,ticks)=>pitch*15+({3:14,4:13,6:12,8:11,12:10,16:9,24:8,32:6,48:5,96:2}[ticks]);
const sample=(ins,vol=0xFF,octave=4)=>[0xD2,vol,0xEA,INSTRUMENT_BASE+ins,0xE4,octave];
export function customTracks(cue,variant='custom'){
 const brighter=variant==='alt1',heavier=variant==='alt2';
 if(cue==='hit')return [
  brighter?[0xD2,0xE8,0xDD,31,0xDE,note(0,3),0xF2]:[...sample(0,0xFF),note(9,4),0xF2],
  [...sample(1,0xFF),0xD6,16,heavier?0xFA:0xFD,note(heavier?7:9,16),0xF2]];
 if(cue==='kick')return [
  brighter?[0xD2,0xE8,0xDD,29,0xDE,note(0,6),0xF2]:[...sample(0,0xF0),note(6,6),0xF2],
  [...sample(1,0xFF),0xD6,24,heavier?0xF8:0xFC,note(heavier?4:7,24),0xF2]];
 if(cue==='impact')return [
  [...sample(2,0xFF),0xD6,24,heavier?0xF4:0xFA,note(heavier?4:7,24),0xF2],
  brighter?[0xD2,0x90,0xDD,30,0xDE,note(0,6),0xF2]:[...sample(0,0xC0),note(9,4),0xF2]];
 if(cue==='beam')return [
  [0xE2,...sample(3,0xB8),0xD3,12,0xE8,0xD6,96,heavier?0xF8:0xFD,note(brighter?11:9,96),0xD3,12,0,note(12,12),0xF2],
  brighter?[0xD2,0x44,0xDD,27,0xDE,0xD3,96,0,note(0,96),0xF2]:
   [...sample(2,0xD0),0xD6,24,0xF8,note(heavier?2:5,24),0xF2]];
 throw Error(`unknown custom cue ${cue}`);
}

// All four cues coexist at their actual proposed addresses. Do not use the
// audition helper's $3000/$3100 scratch, which overwrites retail effects.
export function installCustom(h,bank,{variant='custom'}={}){
 const w=(a,v)=>{h.ram[a]=v&255;h.ram[a+1]=v>>8;};
 for(const s of bank.samples){
  h.ram.set(s.bytes,s.addr);
  w(0x1800+2*s.instrument,s.tune);w(0x1880+2*s.instrument,s.adsr);
  w(0x1900+4*s.instrument,s.addr);w(0x1902+4*s.instrument,s.addr+Math.max(0,s.loop));
 }
 let at=bank.sampleEnd;const seen=new Map(),sequences=[];
 for(const [cue,id] of Object.entries(CUSTOM_IDS)){
  const tracks=customTracks(cue,variant);
  tracks.forEach((bytes,v)=>{
   const key=bytes.join(','),address=seen.get(key)??at;
   if(!seen.has(key)){h.ram.set(bytes,at);seen.set(key,at);sequences.push({cue,voice:v,addr:at,bytes});at+=bytes.length;}
   w(0x2C00+id*4+v*2,address);
  });
 }
 // $ED's pointer uses four bytes of the now-unreferenced round-four shared
 // hit/kick body at $2FB4. All other retail/resident sequences are untouched.
 assert.ok(at<=SAMPLE_BASE+RESERVE,`prototype bank overflow: ${at-SAMPLE_BASE}`);
 return {used:at-SAMPLE_BASE,sequenceBytes:at-bank.sampleEnd,free:SAMPLE_BASE+RESERVE-at,sequences};
}
