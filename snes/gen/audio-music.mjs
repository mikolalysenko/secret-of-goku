// Compiles the browser's Mana-instrument arrangements (engine/*-arrangement.js,
// via engine/mana-arrangements.js) into Secret of Mana's own sequence format
// (snes/gen/audio-seq.mjs), so the cartridge's driver plays them like any
// native song: tempo, the song's instruments as $20+k, notes and ties on the
// driver's duration grid, per-note volume, vibrato, echo, and a whole-song
// loop. Bars that repeat exactly become driver loops (F0 n … F1).
import {DURATIONS,NOTE_TIE,NOTE_REST,OP,driverPitch} from './audio-seq.mjs';

export const TICKS_PER_BEAT=48;
const TIMER_HZ=8000/36;
export const tempoByte=(bpm,tpb=TICKS_PER_BEAT)=>Math.round(bpm*tpb/60*256/TIMER_HZ);
export const realBpm=(tempo,tpb=TICKS_PER_BEAT)=>tempo*TIMER_HZ/256*60/tpb;

// Lengths the driver can express as a note/rest plus ties: ≥ 3, not 5.
export const representable=t=>t>=3&&t!==5;
export function splitTicks(t){
 if(!representable(t))throw Error(`tick count ${t} not representable`);
 const out=[];let left=t;
 while(left>0){
  const d=DURATIONS.find(v=>v<=left&&(left===v||representable(left-v)));
  out.push(d);left-=d;
 }
 return out;
}
const durIndex=d=>DURATIONS.indexOf(d);
const cost=t=>t===0?0:splitTicks(t).length;
// Note length and the rest after it within a gap: close to the wanted gate
// (the driver keys off about a tick early, hence +1), in as few bytes as
// possible. Percussion (one-shot samples) simply fills its gap.
export function chooseGate(gap,want,percussive){
 if(percussive&&representable(gap))return gap;
 let best=gap,bestScore=Infinity;
 for(let g=3;g<=gap;g++){
  if(!representable(g)||(g<gap&&!representable(gap-g)))continue;
  const score=cost(g)+cost(gap-g)+Math.abs(g-(want+1))/6;
  if(score<bestScore){bestScore=score;best=g;}
 }
 return best;
}

// Driver note for an event: tonal patches shift by +2 (unity at 59, not 57);
// percussion with an explicit browser pitch takes the nearest driver pitch.
export function driverNote(e,patch,ins){
 if(patch.pitch){
  let best=0,err=Infinity;
  for(let n=12;n<120;n++){const p=driverPitch(n,ins.t1,ins.t2);if(!p)continue;const d=Math.abs(Math.log(p/patch.pitch));if(d<err){err=d;best=n;}}
  return best;
 }
 return (e.note??60)+(patch.transpose??0)+2;
}

// Split one voice into exact tokens: notes (gate +1 tick: the driver keys
// off about a tick early), rests, and the ties that continue a note.
function tokens(voice,{total,tpb,patches,patchMap,substitute,mute}){
 const ev=[];
 for(const e of voice.events){
  let name=substitute[e.patch]??e.patch;
  if(mute.has(name))continue;
  ev.push({...e,patch:name,on:Math.round(e.at*tpb),gate:Math.max(3,Math.round(e.len*tpb))});
 }
 ev.sort((a,b)=>a.on-b.on);
 const out=[];let t=0;
 for(let i=0;i<ev.length;i++){
  const e=ev[i];if(e.on<t)continue;
  if(e.on>t){out.push({kind:'rest',len:e.on-t});t=e.on;}
  const next=i+1<ev.length?ev[i+1].on:total,room=next-t;
  const patch=patches[e.patch],ins=patchMap[e.patch];
  const gate=chooseGate(room,e.gate,!!ins.oneShot);
  out.push({kind:'note',len:gate,e,drv:driverNote(e,patch,ins),patch,ins});
  t+=gate;
  if(room>gate){out.push({kind:'rest',len:room-gate});t+=room-gate;}
 }
 if(t<total)out.push({kind:'rest',len:total-t});
 // a rest shorter than 3 ticks merges into the token before it
 for(let i=out.length-1;i>0;i--)if(!representable(out[i].len)){out[i-1].len+=out[i].len;out.splice(i,1);}
 return out;
}

// Group tokens into bars wherever a token boundary falls on a bar line.
function bars(toks,barTicks){
 const groups=[];let cur=[],t=0;
 for(const k of toks){cur.push(k);t+=k.len;if(t%barTicks===0){groups.push(cur);cur=[];}}
 if(cur.length)groups.push(cur);
 return groups;
}

// options:
//   patchMap   patch → {k: song instrument index, t1, t2: tuning bytes}
//   volume(vol, patch) → D2 byte; vibrato(v) → [delay, rate, depth] or null
//   substitute patch → patch; mute: Set of patches dropped
// Volume ladder: 0.75 dB steps from 255 down; a new D2 is emitted only when
// the level moves by at least volumeStep dB (accents stay, jitter merges).
export const VOLUME_LADDER=Array.from({length:48},(_,i)=>Math.round(255*10**(-0.75*i/20)));
export function ladderVolume(x){x=Math.max(1,Math.min(255,x));let b=VOLUME_LADDER[0];for(const l of VOLUME_LADDER)if(Math.abs(l-x)<Math.abs(b-x))b=l;return b;}
export function compileSong(score,{patchMap,patches,volume,vibrato,substitute={},mute=new Set(),tempo=tempoByte(score.bpm),pan=0x80,volumeStep=1.2,master=0xFF}){
 const tpb=TICKS_PER_BEAT,total=score.bars*4*tpb,barTicks=4*tpb;
 const trackBytes=[],stats=[];
 score.voices.forEach((voice,v)=>{
  const toks=tokens(voice,{total,tpb,patches,patchMap,substitute,mute});
  const sum=toks.reduce((a,k)=>a+k.len,0);if(sum!==total)throw Error(`voice ${v}: ${sum} ticks, expected ${total}`);
  const out=[];
  if(v===0)out.push(OP.tempo,tempo,OP.masterVolume,master);
  out.push(OP.pan,pan,OP.echoOn);
  const loopAt=out.length;
  const encode=(group,st)=>{
   const b=[],s={...st};
   for(const k of group){
    if(k.kind==='rest'){for(const d of splitTicks(k.len))b.push(NOTE_REST*15+durIndex(d));continue;}
    if(s.ins!==k.ins.k){b.push(OP.instrument,0x20+k.ins.k);s.ins=k.ins.k;}
    const vib=vibrato(k.patch.vibrato??null),key=vib?vib.join(','):'off';
    if(s.vib!==key){if(vib)b.push(OP.vibrato,...vib);else b.push(OP.vibratoOff);s.vib=key;}
    const vol=volume(k.e.vol??100,k.patch);
    if(s.vol===null||Math.abs(20*Math.log10(vol/s.vol))>=volumeStep){b.push(OP.volume,vol);s.vol=vol;}
    const n=k.drv+10,oct=Math.floor(n/12),idx=n%12;
    if(s.oct!==oct){b.push(s.oct!==null&&oct===s.oct+1?OP.octaveUp:s.oct!==null&&oct===s.oct-1?OP.octaveDown:OP.octave);if(b.at(-1)===OP.octave)b.push(oct);s.oct=oct;}
    const parts=splitTicks(k.len);
    b.push(idx*15+durIndex(parts[0]));
    for(const d of parts.slice(1))b.push(NOTE_TIE*15+durIndex(d));
   }
   return {bytes:b,end:s};
  };
  const groups=bars(toks,barTicks);
  // '?': unknown after the whole-song goto, so the first note sets vibrato
  let st={oct:null,ins:null,vol:null,vib:'?'},i=0,loops=0;
  const same=(a,b)=>a.oct===b.oct&&a.ins===b.ins&&a.vol===b.vol&&a.vib===b.vib;
  // At each bar, try blocks of 1-4 bars that repeat back to back from the
  // same driver state (and leave that state unchanged); take the block that
  // saves the most bytes, else emit one bar.
  const eq=(a,b)=>a.length===b.length&&a.every((x,j)=>x===b[j]);
  const block=(at,p,from)=>{let b=[],s=from;for(let q=0;q<p;q++){const e=encode(groups[at+q],s);b=b.concat(e.bytes);s=e.end;}return {bytes:b,end:s};};
  while(i<groups.length){
   let best=null;
   for(let p=1;p<=4&&i+p<=groups.length;p++){
    const b=block(i,p,st);if(!same(b.end,st))continue;
    let n=1;while(i+(n+1)*p<=groups.length&&n<256&&eq(block(i+n*p,p,st).bytes,b.bytes))n++;
    const save=b.bytes.length*(n-1)-3;
    if(n>1&&save>0&&(!best||save>best.save))best={p,n,b,save};
   }
   if(best){out.push(OP.loop,best.n-1,...best.b.bytes,OP.loopEnd);loops++;i+=best.p*best.n;continue;}
   const one=encode(groups[i],st);out.push(...one.bytes);st=one.end;i++;
  }
  trackBytes.push({bytes:out,loopAt});stats.push({voice:v,role:voice.role,bytes:out.length,loops,notes:toks.filter(k=>k.kind==='note').length});
 });
 // Blob: pointers are ARAM addresses (base $1A14 → no relocation).
 const pos=[];let off=0x14;
 for(const t of trackBytes){pos.push(off);off+=t.bytes.length+3;}
 const blob=new Uint8Array(off),w16=(o,x)=>{blob[o]=x&255;blob[o+1]=x>>8;};
 w16(0,0x1A14);
 trackBytes.forEach((t,k)=>{
  w16(2+k*2,0x1A00+pos[k]);blob.set(t.bytes,pos[k]);
  const g=pos[k]+t.bytes.length;blob[g]=OP.goto;w16(g+1,0x1A00+pos[k]+t.loopAt);
 });
 w16(0x12,0xFFFF);
 return {blob,stats,tempo,ticks:total};
}
