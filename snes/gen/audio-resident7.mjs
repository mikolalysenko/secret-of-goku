// Resident rumble/arc textures (round eight) with round nine's louder mix:
// crunch contacts, a bright ki shot, a ki contact and a pulsing charge.
// Historical round-six synthesis stays in audio-custom.mjs for auditions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readWav,resample,brrEncode} from './audio-brr.mjs';
import {assemble} from './audio-spc700.mjs';
import {RESIDENT,customNativeIds,KI_CONTACT_ID,ROAR_ID} from './audio-resident.mjs';
import {residentLayout,effectOffset} from './audio-resident-storage.mjs';
import {DESIGNS8,rumble8,arc8,teleport8} from './audio-design8.mjs';
import {chargePulse,CHARGE_FRAMES,CHARGE_RATE,CHARGE_SCALE} from './audio-charge.mjs';
export const DESIGN8=Number(process.env.AUDIO_DESIGN??1);
assert.ok(Number.isInteger(DESIGN8)&&DESIGN8>=0&&DESIGN8<DESIGNS8.length,'AUDIO_DESIGN must be 0, 1 or 2');
export const SAMPLE_BASE=0x4DF1,RESERVE=0x900,FLOOR=SAMPLE_BASE+RESERVE;
export const BED_IDS=[0xED,0xEE];
// An empty retail table row holds the ki contact (the IMPACT cue).
// The old spring's $7D row is empty again; charging uses just its bed.
export const KI_CONTACT=KI_CONTACT_ID;
export const IDS=customNativeIds();
// Song volume per start/target nibble: $0C instead of the driver's $11
// lowers every song 3.0 dB (12/17); fades keep their shape.
export const MUSIC_STEP=0x0C;
// The Kamehameha's release ducks the song a further 8.5 dB (×$60/256) and
// the driver's fade restores it linearly over 64 steps of 31.5 ms (2.0 s):
// like a Genesis effect taking over music channels, the beam owns the mix.
export const DUCK=0x60,DUCK_STEPS=64;
// Round ten: the release as a Genesis-style laser, on the same two voices
// and 108 ticks. Voice 1, shared by both forms: the arc an octave above its
// wave rate (a brighter roar, with the song echo) rising three semitones.
// Voice 2: boot instrument 0's 64-sample pulse as the beam's buzz. It ignites
// near 0.9 kHz, sweeps down three octaves in 24 ticks, then holds under a
// fast square trill (D7: ±1 semitone, flipping every `trill` ticks) while it
// rises three semitones. SSJ falls three semitones deeper, trills slower and
// buzzes louder. No new samples, noise clock or CPU work.
export const RELEASE={arc:0xD8,buzz:new Map([[0xEA,{volume:0xB8,sweep:-36,trill:1}],[0xF0,{volume:0xC8,sweep:-39,trill:2}]])};
// Driver note bytes: index×15 + length slot; ties use index 12.
const LENGTH={192:0,144:1,96:2,64:3,72:4,48:5,32:6,36:7,24:8,16:9,12:10,8:11,6:12,4:13,3:14};
const note=(index,ticks)=>index*15+LENGTH[ticks],tie=ticks=>180+LENGTH[ticks];
// Every contact, the ki contact and the ki crackle share one noise clock:
// 10.7 kHz puts the PC hits' 1–5 kHz crunch in front, without a 32 kHz hiss.
export const NOISE_CLOCK=29;
const contactGain=v=>Math.round(v*(DESIGN8===1?1:.94));
const crunch=(volume,hold,fade)=>[0xD2,contactGain(volume),0xDD,NOISE_CLOCK,0xDE,note(0,hold),0xD3,fade,0,tie(fade),0xF2];
// A falling "smack" into the rumble under the crunch. Octave 3 A plays the
// 6 kHz rumble at 8 kHz (HIT); the finishers start an octave lower.
const thump=(volume,octave,ticks,fade,length)=>[0xD2,contactGain(volume),0xEA,0x31,0xE4,octave,0xD6,ticks,0xF4,0xD3,fade,0,note(9,length),0xF2];
const kickCrunch=crunch(0xD0,24,16);
export const CONTACTS7=[
 {id:0xE7,page:0x3A,tracks:[
  crunch(0xE0,12,12),
  [0xD2,contactGain(0x88),0xEA,0x31,0xE4,3,0xE9,0xFA,0xE7,0,0xD6,12,0xF4,0xD3,16,0,note(9,16),0xF2]]},
 // Both finishers share one crunch track (the holes are full); the SSJ
 // kick's extra weight is its longer, louder falling body.
 {id:0xE8,tracks:[kickCrunch,thump(0xC0,2,24,32,32)]},
 {id:0xF1,tracks:[kickCrunch,thump(0xD8,2,32,36,36)]},
];
// Motion follow-up. The aura BRR provides broadband swings without touching
// the DSP's shared noise clock. E5 alternates swell/sweep and independently
// rotates three tunings; E7's pop and DE rotate the same three tunings.
// Their E9 operands are also their counters, reset by native sequence loads.
// DE: a bright "pew" on the boot saw (instrument 5 at ≈3.3 kHz, falling
// seven semitones in 6 ticks; the PC blast's tone sits at 4.3 kHz) hands
// over to the arc's crackle an octave above its wave rate, falling an
// octave, on the same voice. E9 gives the 1 / 1.035 / .977 rate cycle. Its
// D2/E7 operands are set at command time: p2=$0F normal ($EF), $0D SSJ
// (two semitones brighter, $FF).
export const MOTION7=[
 {id:0xE5,page:0x3A,tracks:[[0xD2,0,0xEA,0x31,0xE4,4,0xE9,0xFA,0xD6,22,0xF7,0xD3,3,0xD0,0x93,0xD3,16,0,0xBD,0xF2]]},
 {id:0xE6,tracks:[[0xD2,0,0xEA,0x31,0xE4,4,0xE9,0xC0,0xD6,36,0xF9,0xD3,4,0xE0,0x94,0xD3,32,0,0xBA,0xF2]]},
 {id:0xDE,page:0x3A,tracks:[[0xD2,0xEF,0xEA,5,0xE4,7,0xE9,0xFA,0xE7,0,0xD6,6,0xF9,note(9,6),0xEA,0x32,0xE4,6,0xD6,20,0xF4,0xD3,22,0,note(9,24),0xF2]]},
];
// Ki contact: a falling rumble boom, then the shared crunch, on one voice.
export const KI_CONTACT_TRACK=[0xD2,0xD0,0xEA,0x31,0xE4,3,0xD6,4,0xF4,note(9,4),0xDD,NOISE_CLOCK,0xDE,note(0,8),0xD3,24,0,tie(24),0xF2];
// Dry 96 ms one-shot: return the voice after 16 ticks, without sustaining
// a repeated slice of the source into an artificial reverberant tail.
const teleportOut={id:0xEB,tracks:[[0xD2,0xB8,0xEA,0x33,0xE4,4,note(9,16),0xF2]]};
export function resident7Layout(rom,tracks){
 const retained=RESIDENT.filter(r=>!tracks.has(r.id)).map(r=>[...CONTACTS7,...MOTION7,teleportOut].find(c=>c.id===r.id)??r);
 retained.push({id:0xF0,tracks:[]},CONTACTS7.find(r=>r.id===0xF1));return residentLayout(rom,retained);
}
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
  // Removing the spring and its launch code pays for a 96 ms ki pulse
  // without growing the permanent reservation or changing other samples.
  {name:'charge',rate:CHARGE_RATE,frames:CHARGE_FRAMES,tune:0,octave:3,attack:0},
  {name:'aura',rate:6000,frames:768,start:8400,cross:160,tune:0,octave:3,gain:2.5,flatten:16},
  {name:'beam',rate:6000,frames:768,start:1200,cross:160,tune:0xC0,octave:3,gain:2.6,attack:192,attackStart:360},
  {name:'teleport',rate:10000,frames:960,oneShot:true,tune:0xA0,octave:4},
 ];
 let at=SAMPLE_BASE;
 const samples=defs.map((d,i)=>{
  let pcm,offset;
  if(d.name==='charge'){pcm=chargePulse();offset=0;}
  else if(d.name==='teleport'){pcm=teleport8(d.rate,{seconds:d.frames/d.rate,release:.024});offset=-1;}
  else {
   const src=source(d.name,d.rate);
   if(d.oneShot){pcm=src.slice(0,d.frames);offset=-1;for(let j=0;j<64;j++)pcm[pcm.length-1-j]*=j/64;}
   else {const attack=d.attack??16;pcm=new Float32Array(attack+d.frames);if(d.attack)pcm.set(src.slice(d.attackStart??0,(d.attackStart??0)+attack));pcm.set(loop(src,d.start,d.frames,d.cross,d.flatten),attack);offset=attack/16*9;}
  }
  if(d.name==='aura'){pcm.fill(0);pcm.set(rumble8(d.frames,d.rate,DESIGN8),16);}
  else if(d.name==='beam'){
   pcm.set(arc8(d.attack,d.rate,DESIGN8,{attack:d.attack}));
   pcm.set(arc8(d.frames,d.rate,DESIGN8),d.attack);
  }
  const b=brrEncode(pcm,{resetAt:new Set(offset<0?[0]:[0,offset/9])});b.bytes[b.bytes.length-9]|=offset<0?1:3;
  const result={...d,pcm,bytes:b.bytes,snr:b.snr,addr:at,loop:offset,instrument:0x30+i,adsr:0xE0FF,sha256:hash(b.bytes)};at+=b.bytes.length;return result;
 });
 const sampleBytes=at-SAMPLE_BASE;
 const word=(b,p,v)=>{b[p]=v&255;b[p+1]=v>>8;};
 // The unused tuning/ADSR entries also hold command-time swing release.
 // Stop before the mutable bed parameters at $187C; songs use $20-$2F.
 const metadata=[{addr:0x1860,bytes:new Uint8Array(28)},{addr:0x18E0,bytes:new Uint8Array(32)},{addr:0x19C0,bytes:new Uint8Array(16)}];
 const bank=new Uint8Array(RESERVE);
 for(const [i,s] of samples.entries()){bank.set(s.bytes,s.addr-SAMPLE_BASE);word(metadata[0].bytes,i*2,s.tune);word(metadata[1].bytes,i*2,s.adsr);word(metadata[2].bytes,i*4,s.addr);word(metadata[2].bytes,i*4+2,s.addr+Math.max(0,s.loop));}
 // Instrument $1F uses the free tails of the stream extension's metadata
 // regions. It points to the existing beam BRR; no extra sample or EDL.
 const alias=[{addr:0x183E,bytes:Uint8Array.of(0,0)},{addr:0x18BE,bytes:new Uint8Array(2)},{addr:0x197C,bytes:new Uint8Array(4)}];
 word(alias[1].bytes,0,samples[2].adsr);
 word(alias[2].bytes,0,samples[2].addr);word(alias[2].bytes,2,samples[2].addr+samples[2].loop);
 const extension=assemble(readFileSync(join(root,'snes/src/modules/audio/spc/stream.s'),'utf8'));
 for(const a of alias)for(const s of extension.segments)assert.ok(a.addr+a.bytes.length<=s.addr||s.addr+s.bytes.length<=a.addr,'blast alias overlaps rare-line extension');
 metadata.push(...alias);
 const ins=(i,vol,octave=samples[i].octave)=>[...(vol===undefined?[]:[0xD2,vol]),0xEA,0x30+i,0xE4,octave];
 const releaseArc=[0xE2,...ins(2,contactGain(RELEASE.arc),4),0xD6,96,3,note(9,96),0xD3,12,0,tie(12),0xF2];
 const tracks=new Map([
  [0xEA,releaseArc],
  [0xEF,[...ins(3,0x72),note(9,16),0xF2]],
  [0xED,[...ins(0),0x87,0xF0,0,0xB4,0xF1]],
  [0xEE,[...ins(1),0x87,0xF0,0,0xB4,0xF1]],
  [0xEC,[...ins(1,0),0xE9,0xC0,0xD3,6,0xA0,0x8F,0xD3,12,0,0xBE,0xF2]], // low sampled shuffle; no shared DSP-noise clock
  [0xE3,[0xD2,0xC0,0xEA,0x1F,0xE4,2,0xE9,0xC0,0xD3,24,0,0x8F,0xF2]],
  // CHARGED: round nine's bright shimmer (the PC's 0.28 s sparkle), the arc
  // an octave above its wave rate rising seven semitones, with the song echo.
  [0xDF,[0xE2,0xD2,0xFF,0xEA,0x32,0xE4,6,0xD6,24,7,0xD3,24,0,note(9,24),0xF2]],
  // Transformation: a bright, falling arc crack at the start; the gold
  // flash's POWER_BURST lands a deeper rumble thump. Each stays on its
  // existing single voice; the charge/aura beds supply the sustained roar.
  [0xE0,[0xE2,0xD2,0xF8,0xEA,0x1F,0xE4,4,0xD6,24,0xF4,0xD3,32,0,note(9,48),0xF2]],
  [0xE1,[...ins(1,0xFF,3),0xD6,18,0xF4,0xD3,32,0,note(9,36),0xF2]],
  // Round nine: the kick swing moves out of the full shared holes.
  [0xE6,MOTION7.find(m=>m.id===0xE6).tracks[0]],
  [KI_CONTACT,KI_CONTACT_TRACK],
 ]);
 const pointers=[],sequences=[];
 for(const [id,seq] of tracks){const pair=new Uint8Array(4);word(pair,0,at);pointers.push({addr:0x2C00+id*4,bytes:pair});sequences.push({id,addr:at,bytes:seq});bank.set(seq,at-SAMPLE_BASE);at+=seq.length;}
 // SSJ's release points at the same arc bytes; only its buzz differs.
 const arcAt=sequences.find(s=>s.id===0xEA).addr,ssjPair=new Uint8Array(4);word(ssjPair,0,arcAt);
 pointers.push({addr:0x2C00+0xF0*4,bytes:ssjPair});sequences.push({id:0xF0,addr:arcAt,bytes:releaseArc,shared:0xEA});
 // The retail-empty roar row plays that arc alone on one voice (full gain in
 // beds.s, no buzz and no duck), for a roar that is not a Kamehameha.
 const roarPair=new Uint8Array(4);word(roarPair,0,arcAt);pointers.push({addr:0x2C00+ROAR_ID*4,bytes:roarPair});
 const layout=resident7Layout(readFileSync(join(root,'rom/secret-of-mana-us.sfc')),tracks);
 // The release buzz (RELEASE): ignition sweep, then trill and rise. The same
 // 108 ticks and native F2 cleanup as the arc; F2 also clears its echo bit.
 for(const [id,{volume,sweep,trill}] of RELEASE.buzz){
  const seq=[0xD2,contactGain(volume),0xEA,0,0xE4,6,0xD6,24,sweep&255,note(9,24),0xD7,0,trill,0xFF,0xD6,72,3,tie(72),0xD3,12,0,tie(12),0xF2];
  word(pointers.find(p=>p.addr===0x2C00+id*4).bytes,2,at);sequences.push({id:null,body:id,addr:at,bytes:seq});bank.set(seq,at-SAMPLE_BASE);at+=seq.length;
 }
 const swing=layout.tracks.find(t=>t.id===0xE5);
 const hit=layout.tracks.find(t=>t.id===0xE7&&t.voice===1),blast=layout.tracks.find(t=>t.id===0xDE);
 for(const t of [swing,hit,blast]){assert.equal(t.addr>>8,0x3A,'variation operands share one page');assert.equal(t.bytes[6],0xE9);}
 assert.equal(swing.bytes[8],0xD6);assert.equal(swing.bytes[11],0xD3);
 assert.equal(blast.bytes[8],0xE7);
 const code=assemble(readFileSync(join(root,'snes/src/modules/audio/spc/beds.s'),'utf8'),{name:'beds.s',symbols:{CODE_BASE:at,TUNE_PAGE:0x3A00,SWING_TUNE:swing.addr+7,HIT_TUNE:hit.addr+7,BLAST_TUNE:blast.addr+7,BLAST_FORM:blast.addr+9,BLAST_VOLUME:blast.addr+1,SWING_SWEEP:swing.addr+10,SWING_SWELL:swing.addr+12,
  KI_CONTACT,MUSIC_STEP,DUCK,DUCK_STEPS,CHARGE_SCALE,CHARGE_PITCH:CHARGE_RATE/1000}});
 const patches=[];let end=at;
 for(const seg of code.segments)if(seg.addr>=SAMPLE_BASE&&seg.addr<FLOOR){assert.ok(seg.addr+seg.bytes.length<=FLOOR,`resident7 needs ${seg.addr+seg.bytes.length-SAMPLE_BASE} bytes`);bank.set(seg.bytes,seg.addr-SAMPLE_BASE);end=Math.max(end,seg.addr+seg.bytes.length);}else{
  if([0x1868,0x18E8].includes(seg.addr)){
   const region=metadata.find(m=>m.addr===seg.addr-8);
   assert.ok(8+seg.bytes.length<=region.bytes.length,'swing release exceeds unused instrument metadata');
   region.bytes.set(seg.bytes,8);continue;
  }
  if(seg.addr===0x19D0)assert.ok(seg.addr+seg.bytes.length<=0x1A00,'resident pitch exceeds unused DIR entries');
  if(seg.addr===0x0180)assert.ok(seg.addr+seg.bytes.length<=0x01C0,'variation helper must leave at least 64 stack bytes');
  patches.push(seg);
 }
 const prefetch=assemble(readFileSync(join(root,'snes/src/modules/audio/spc/prefetch.s'),'utf8'),{name:'prefetch.s',symbols:{...Object.fromEntries(extension.symbols),BANK_CODE:end}});
 for(const seg of prefetch.segments)if(seg.addr>=SAMPLE_BASE&&seg.addr<FLOOR){
  assert.ok(seg.addr+seg.bytes.length<=FLOOR,'prefetch exceeds permanent reservation');
  bank.set(seg.bytes,seg.addr-SAMPLE_BASE);end=Math.max(end,seg.addr+seg.bytes.length);
 }else patches.push(seg);
 return {design:DESIGNS8[DESIGN8].name,samples,sampleBytes,sequences,pointers,tracks,layout,reserve:RESERVE,floor:FLOOR,used:end-SAMPLE_BASE,codeBytes:end-at,segments:[{addr:SAMPLE_BASE,bytes:bank},...metadata,{addr:0x187C,bytes:new Uint8Array(4)},...patches],symbols:Object.fromEntries(code.symbols)};
}
export function resident7Asm(rom,c){
 const layout=resident7Layout(rom,c.tracks),map=new Map();
 for(const p of [...layout.patches,...c.pointers])for(let i=0;i<p.bytes.length;i++)map.set(p.addr+i,p.bytes[i]);
 const h=n=>'$'+n.toString(16).toUpperCase();
 return [...map].sort((a,b)=>a[0]-b[0]).flatMap(([a,v])=>{const pc=effectOffset(a),cpu=0xC00000+pc;return [`%orig1(${h(cpu)}, ${h(rom[pc])})`,`%patch(${h(cpu)}, 1, audio)`,`org ${h(cpu)}`,`db ${h(v)}`];}).join('\n')+'\n';
}
