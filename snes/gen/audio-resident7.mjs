// Round seven: PC-derived resident beds/attacks; no common-sound streaming.
// Historical round-six synthesis stays in audio-custom.mjs for auditions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readWav,resample,brrEncode} from './audio-brr.mjs';
import {assemble} from './audio-spc700.mjs';
import {RESIDENT,NATIVE_IDS} from './audio-resident.mjs';
import {residentLayout,effectOffset} from './audio-resident-storage.mjs';
export const SAMPLE_BASE=0x4DF1,RESERVE=0x900,FLOOR=SAMPLE_BASE+RESERVE;
export const BED_IDS=[0xED,0xEE];
export const IDS=NATIVE_IDS.map((v,i)=>i===17?0xEF:v);
const root=resolve(import.meta.dirname,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=(name,rate)=>{const w=readWav(readFileSync(join(root,`assets/audio/dbz/${name}.wav`)));return resample(w.pcm,w.rate,rate);};
// An equal-power overlap and slow circular RMS correction remove the source's
// repeating amplitude dip. BRR prediction resets at entry, not on every block.
function loop(pcm,start,n,cross,flat=5){
 const a=Float32Array.from({length:n},(_,i)=>i<cross?pcm[start+i]*Math.sin(i/cross*Math.PI/2)+pcm[start+n+i]*Math.cos(i/cross*Math.PI/2):pcm[start+i]);
 const mean=a.reduce((s,v)=>s+v,0)/n;for(let i=0;i<n;i++)a[i]-=mean;
 const width=Math.floor(n/flat),energy=new Float32Array(n);let total=0;
 for(let i=0;i<n;i++){let e=0;for(let j=-width;j<=width;j++)e+=a[(i+j+n)%n]**2;energy[i]=Math.sqrt(e/(2*width+1));total+=energy[i];}
 for(let i=0;i<n;i++)a[i]*=total/n/Math.max(.01,energy[i]);
 return a;
}
export function buildResident7(){
 const defs=[
  {name:'charge',rate:4000,frames:640,start:720,cross:128,tune:0x80,octave:3,gain:1.7},
  {name:'aura',rate:6000,frames:768,start:8400,cross:160,tune:0xC0,octave:3,gain:2.5,flatten:16},
  {name:'beam',rate:6000,frames:768,start:1200,cross:160,tune:0xC0,octave:3,gain:2.6,attack:192,attackStart:360},
  {name:'teleport',rate:10000,frames:960,tune:0xA0,octave:4,gain:1.65,oneShot:true},
 ];
 let at=SAMPLE_BASE;
 const samples=defs.map((d,i)=>{
  const src=source(d.name,d.rate);let pcm,offset;
  if(d.oneShot){pcm=src.slice(0,d.frames);offset=-1;for(let j=0;j<64;j++)pcm[pcm.length-1-j]*=j/64;}
  else {const attack=d.attack??16;pcm=new Float32Array(attack+d.frames);if(d.attack)pcm.set(src.slice(d.attackStart??0,(d.attackStart??0)+attack));pcm.set(loop(src,d.start,d.frames,d.cross,d.flatten),attack);offset=attack/16*9;}
  // Soft peak limiting is in the encoded source; output recordings are raw.
  pcm=pcm.map(v=>Math.tanh(v*d.gain)*.94);
  const b=brrEncode(pcm,{resetAt:new Set(offset<0?[0]:[0,offset/9])});b.bytes[b.bytes.length-9]|=offset<0?1:3;
  const result={...d,pcm,bytes:b.bytes,snr:b.snr,addr:at,loop:offset,instrument:0x30+i,adsr:0xE0FF,sha256:hash(b.bytes)};at+=b.bytes.length;return result;
 });
 const sampleBytes=at-SAMPLE_BASE;
 const word=(b,p,v)=>{b[p]=v&255;b[p+1]=v>>8;};
 const metadata=[{addr:0x1860,bytes:new Uint8Array(8)},{addr:0x18E0,bytes:new Uint8Array(8)},{addr:0x19C0,bytes:new Uint8Array(16)}];
 const bank=new Uint8Array(RESERVE);
 for(const [i,s] of samples.entries()){bank.set(s.bytes,s.addr-SAMPLE_BASE);word(metadata[0].bytes,i*2,s.tune);word(metadata[1].bytes,i*2,s.adsr);word(metadata[2].bytes,i*4,s.addr);word(metadata[2].bytes,i*4+2,s.addr+Math.max(0,s.loop));}
 const ins=(i,vol)=>[...(vol===undefined?[]:[0xD2,vol]),0xEA,0x30+i,0xE4,samples[i].octave];
 const beam=full=>[0xE2,...ins(2,0xE8),...(full?[0xE9,0xE5]:[]),0xD3,12,0xFF,0x89,0xD3,12,0,0xBE,0xF2];
 const tracks=new Map([
  [0xEA,beam(false)],[0xF0,beam(true)],
  [0xEB,[...ins(3,0xB8),0x91,0xF2]],[0xEF,[...ins(3,0x72),0x91,0xF2]],
  [0xED,[...ins(0),0x87,0xF0,0,0xB4,0xF1]],
  [0xEE,[...ins(1),0x87,0xF0,0,0xB4,0xF1]],
  [0xEC,[...ins(1,0),0xE9,0xC0,0xD3,6,0xA0,0x8F,0xD3,12,0,0xBE,0xF2]], // low sampled shuffle; no shared DSP-noise clock
  [0xE3,[...ins(2,0xC0),0xE4,2,0xD3,24,0,0x8F,0xF2]],
  [0xDF,[...ins(0,0x80),0xD3,16,0,0x90,0xF2]],
  [0xE0,[0xE2,...ins(1,0xC0),0xD3,48,0x80,0x89,0xD3,24,0,0xBC,0xF2]],
  [0xE1,[...ins(2,0xC0),0xD3,48,0,0x8C,0xF2]],
 ]);
 const pointers=[],sequences=[];
 for(const [id,seq] of tracks){const pair=new Uint8Array(4);word(pair,0,at);pointers.push({addr:0x2C00+id*4,bytes:pair});sequences.push({id,addr:at,bytes:seq});bank.set(seq,at-SAMPLE_BASE);at+=seq.length;}
 const code=assemble(readFileSync(join(root,'snes/src/modules/audio/spc/beds.s'),'utf8'),{name:'beds.s',symbols:{CODE_BASE:at}});
 const patches=[];let end=at;
 for(const seg of code.segments)if(seg.addr>=SAMPLE_BASE&&seg.addr<FLOOR){assert.ok(seg.addr+seg.bytes.length<=FLOOR,`resident7 needs ${seg.addr+seg.bytes.length-SAMPLE_BASE} bytes`);bank.set(seg.bytes,seg.addr-SAMPLE_BASE);end=Math.max(end,seg.addr+seg.bytes.length);}else patches.push(seg);
 return {samples,sampleBytes,sequences,pointers,tracks,reserve:RESERVE,floor:FLOOR,used:end-SAMPLE_BASE,codeBytes:end-at,segments:[{addr:SAMPLE_BASE,bytes:bank},...metadata,{addr:0x187C,bytes:new Uint8Array(4)},...patches],symbols:Object.fromEntries(code.symbols)};
}
export function resident7Asm(rom,c){
 const retained=RESIDENT.filter(r=>!c.tracks.has(r.id));retained.push({id:0xF0,tracks:[]});
 const layout=residentLayout(rom,retained),map=new Map();
 for(const p of [...layout.patches,...c.pointers])for(let i=0;i<p.bytes.length;i++)map.set(p.addr+i,p.bytes[i]);
 const h=n=>'$'+n.toString(16).toUpperCase();
 return [...map].sort((a,b)=>a[0]-b[0]).flatMap(([a,v])=>{const pc=effectOffset(a),cpu=0xC00000+pc;return [`%orig1(${h(cpu)}, ${h(rom[pc])})`,`%patch(${h(cpu)}, 1, audio)`,`org ${h(cpu)}`,`db ${h(v)}`];}).join('\n')+'\n';
}
