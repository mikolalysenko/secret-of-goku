// Shared round-five sample synthesis and cartridge layout.
// Four resident BRRs, no streaming or per-frame CPU servicing.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assemble} from './audio-spc700.mjs';
import {residentLayout,effectOffset} from './audio-resident-storage.mjs';
import {RESIDENT} from './audio-resident.mjs';
import {readWav,resample,brrEncode} from './audio-brr.mjs';
const root=resolve(import.meta.dirname,'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

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
 assert.ok(['custom','alt1','alt2'].includes(variant),`unknown take ${variant}`);
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

export const DEFAULT_TAKES={hit:'alt1',kick:'alt1',impact:'custom',beam:'custom'};
// dB relative to round five. Calibration is measured in cartridge renders.
export const DEFAULT_LEVELS={hit:-0.2,kick:0.2,impact:5,beam:3};
export function customSettings(env=process.env){
 const parse=(text,defaults,convert)=>{
  const result={...defaults},seen=new Set();
  for(const pair of text?text.split(','):[]){
   const [cue,value,...extra]=pair.split(':');
   assert.ok(Object.hasOwn(defaults,cue)&&value!==undefined&&!extra.length&&!seen.has(cue),`bad audio setting ${pair}`);
   result[cue]=convert(value);seen.add(cue);
  }
  return result;
 };
 const takes=parse(env.AUDIO_CUSTOM_TAKES,DEFAULT_TAKES,v=>{assert.ok(['custom','alt1','alt2'].includes(v),`unknown take ${v}`);return v;});
 const levels=parse(env.AUDIO_CUSTOM_LEVELS,DEFAULT_LEVELS,v=>{const n=Number(v);assert.ok(v.trim()!==''&&Number.isFinite(n)&&n>=-24&&n<=11.9,`level ${v} outside -24..11.9 dB`);return n;});
 return {takes,levels};
}

// EDL is capped against the unique required instrument set, independent of
// caller preset. The native cache must have a spare byte (it compares >=).
export function customEdlCaps(rom,songs){
 const word=a=>rom[a]|rom[a+1]<<8,ptr=a=>(rom[a]|rom[a+1]<<8|rom[a+2]<<16)&0x3FFFFF;
 return Array.from({length:64},(_,id)=>{
  const ids=songs.find(s=>s.id===id)?.ids??Array.from({length:16},(_,k)=>word(0x33F22+32*id+2*k)).filter(Boolean);
  const bytes=[...new Set(ids)].reduce((n,i)=>n+word(ptr(0x33DF9+3*(i-1))),0);
  const end=SAMPLE_BASE+RESERVE+bytes,edl=Math.min(15,Math.floor((0xFA00-1-end)/0x800));
  assert.ok(edl>=1,`song ${id} cannot fit the resident reservation`);
  return {id,bytes,end,maxEdl:edl};
 });
}

export function buildCustom({settings=customSettings(),bank=buildCustomBank()}={}){
 const bytes=new Uint8Array(RESERVE),metadata=[{addr:0x1860,bytes:new Uint8Array(8)},{addr:0x18E0,bytes:new Uint8Array(8)},{addr:0x19C0,bytes:new Uint8Array(16)}];
 const word=(b,a,v)=>{b[a]=v&255;b[a+1]=v>>8;};
 for(const s of bank.samples){
  const i=s.instrument-INSTRUMENT_BASE;bytes.set(s.bytes,s.addr-SAMPLE_BASE);
  word(metadata[0].bytes,i*2,s.tune);word(metadata[1].bytes,i*2,s.adsr);
  word(metadata[2].bytes,i*4,s.addr);word(metadata[2].bytes,i*4+2,s.addr+Math.max(0,s.loop));
 }
 let at=bank.sampleEnd;const pointers=[],sequences=[],seen=new Map();
 for(const [cue,id] of Object.entries(CUSTOM_IDS)){
  const pair=new Uint8Array(4);
  customTracks(cue,settings.takes[cue]).forEach((data,voice)=>{
   const key=data.join(','),addr=seen.get(key)??at;
   if(!seen.has(key)){bytes.set(data,at-SAMPLE_BASE);seen.set(key,at);sequences.push({cue,voice,addr,bytes:data});at+=data.length;}
   word(pair,voice*2,addr);
  });
  pointers.push({addr:0x2C00+4*id,bytes:pair});
 }
 assert.ok(at<=0x5580,'custom sequences overlap level routine');
 const gains=Object.fromEntries(Object.entries(settings.levels).map(([cue,db])=>[cue,Math.round(0x40*10**(db/20))]));
 const code=assemble(readFileSync(join(root,'snes/src/modules/audio/spc/custom.s'),'utf8'),{
  name:'custom.s',symbols:Object.fromEntries(Object.entries(gains).map(([cue,n])=>[cue.toUpperCase()+'_LEVEL',n]))});
 const patches=[];
 for(const s of code.segments){
  if(s.addr>=SAMPLE_BASE&&s.addr<SAMPLE_BASE+RESERVE){assert.ok(s.addr+s.bytes.length<=SAMPLE_BASE+RESERVE);bytes.set(s.bytes,s.addr-SAMPLE_BASE);}
  else patches.push(s);
 }
 return {settings,gains,bank,sequences,pointers,sequenceBytes:at-bank.sampleEnd,
  segments:[{addr:SAMPLE_BASE,bytes},...metadata,...patches],
  levelAddress:code.symbols.get('custom_levels'),saturateAddress:code.symbols.get('custom_saturate'),codeBytes:code.segments.reduce((n,s)=>n+s.bytes.length,0)};
}

// Overlay before emitting registered patches, never write the same ROM byte
// twice. $ED reuses only the abandoned round-four hit/kick body pointer area.
export function customResidentAsm(rom,custom){
 const map=new Map();
 for(const p of [...residentLayout(rom,RESIDENT).patches,...custom.pointers])for(let i=0;i<p.bytes.length;i++)map.set(p.addr+i,p.bytes[i]);
 const h=n=>'$'+n.toString(16).toUpperCase(),lines=[];
 for(const a of [...map.keys()].sort((a,b)=>a-b)){
  const pc=effectOffset(a),cpu=0xC00000+pc;
  lines.push(`%orig1(${h(cpu)}, ${h(rom[pc])})`,`%patch(${h(cpu)}, 1, audio)`,`org ${h(cpu)}`,`db ${h(map.get(a))}`);
 }
 return lines.join('\n')+'\n';
}
