// Secret of Mana (US) music sequence format — the AKAO-family dialect run by
// the cartridge's SPC700 driver (ARAM $0200-$1597, uploaded from C3:0748).
// Reverse-engineered from the driver; see docs/agents/snes-port/audio.md.
//
// Song blob (uploaded to ARAM $1A00 by the CPU loader at C3:0198):
//   +$00 u16 base   address space the pointers below are written in
//   +$02 u16 x8     track pointers (voice 0..7)
//   +$12 u16 none   a track whose pointer equals this value is silent
//   +$14 ...        track data; the driver relocates by ($1A14 - base)
// Track bytes:
//   $00-$D1  note = index*15 + length: index 0-11 = C..B (driver octave),
//            12 = tie, 13 = rest; length indexes DURATIONS (ticks, 48/quarter)
//   $D2-$FF  commands, operand counts in COMMANDS below
export const DURATIONS=[192,144,96,64,72,48,32,36,24,16,12,8,6,4,3];
export const NOTE_TIE=12,NOTE_REST=13;
// [mnemonic, operand count] for $D2..$FF (counts read from the driver table at ARAM $1484).
export const COMMANDS={
 0xD2:['volume',1],0xD3:['volumeFade',2],0xD4:['pan',1],0xD5:['panFade',2],0xD6:['pitchSlide',2],
 0xD7:['vibrato',3],0xD8:['vibratoOff',0],0xD9:['tremolo',3],0xDA:['tremoloOff',0],0xDB:['panLfo',2],
 0xDC:['panLfoOff',0],0xDD:['noiseFreq',1],0xDE:['noiseOn',0],0xDF:['noiseOff',0],0xE0:['pitchModOn',0],
 0xE1:['pitchModOff',0],0xE2:['echoOn',0],0xE3:['echoOff',0],0xE4:['octave',1],0xE5:['octaveUp',0],
 0xE6:['octaveDown',0],0xE7:['transpose',1],0xE8:['transposeRel',1],0xE9:['tuning',1],0xEA:['instrument',1],
 0xEB:['attack',1],0xEC:['decay',1],0xED:['sustainLevel',1],0xEE:['sustainRate',1],0xEF:['adsrDefault',0],
 0xF0:['loop',1],0xF1:['loopEnd',0],0xF2:['end',0],0xF3:['tempo',1],0xF4:['tempoFade',2],
 0xF5:['echoVolume',1],0xF6:['echoVolumeFade',2],0xF7:['echoFeedback',2],0xF8:['masterVolume',1],
 0xF9:['loopBreak',3],0xFA:['goto',2],0xFB:['cpuJump',2],0xFC:['loopReset',0],0xFD:['specialInstrument',1],
 0xFE:['end',0],0xFF:['end',0],
};
export const OP=Object.fromEntries(Object.entries(COMMANDS).filter(([k])=>k<0xFE).map(([k,[n]])=>[n,Number(k)]));
// Driver note numbering: n = octave*12 + index + transpose - 10; pitch =
// PITCH_TABLE[n % 12] << (n/12 - 4) scaled by the instrument tuning, so n = 59
// (octave 5, A) is the sample's unity rate. The browser renderer's note N
// (unity at 57) is driver note N + 2.
export const PITCH_TABLE=[0x0879,0x08FA,0x0983,0x0A14,0x0AAD,0x0B50,0x0BFC,0x0CB2,0x0D74,0x0E41,0x0F1A,0x1000];

// Exact driver pitch for a note on an instrument with tuning bytes (t1, t2)
// (C3:3E9E word, low byte t1) — mirrors ARAM $04ED-$054D.
export function driverPitch(note,t1,t2=0,tuneOffset=0){
 const semi=((note%12)+12)%12,oct=Math.floor(note/12);
 const table=PITCH_TABLE[semi];
 const t=(t1+tuneOffset)&0xff,negative=((t1+tuneOffset)&0x80)!==0;
 let p=((table>>8)*t)+(((table&0xff)*t)>>8);
 p&=0xffff;
 if(t2)p+=((p>>8)*t2)>>8;
 if(!negative)p+=table;
 p&=0xffff;
 if(oct<4)p>>=(4-oct);else if(oct>4)p=(p<<(oct-4))&0xffff;
 return p;
}

// Decode a song blob (as uploaded to $1A00) into per-track event lists.
export function decodeSong(blob,{load=0x1A00}={}){
 const u16=a=>blob[a]|blob[a+1]<<8;
 const base=u16(0),none=u16(0x12),rel=(load+0x14)-base;
 const tracks=[];
 for(let t=0;t<8;t++){
  const ptr=u16(2+t*2);
  if(ptr===none){tracks.push(null);continue;}
  tracks.push(decodeTrack(blob,ptr+rel-load,{rel,load}));
 }
 return {base,none,tracks};
}
export function decodeTrack(blob,start,{rel=0,load=0x1A00,max=4000}={}){
 const events=[];let i=start;const seen=new Set();
 while(i>=0&&i<blob.length&&events.length<max){
  const at=i,b=blob[i++];
  if(b<0xD2){const index=Math.floor(b/15),len=DURATIONS[b%15];events.push({at,note:index,len,kind:index===NOTE_TIE?'tie':index===NOTE_REST?'rest':'note'});continue;}
  const [name,n]=COMMANDS[b],args=[...blob.subarray(i,i+n)];i+=n;
  const e={at,cmd:name,op:b,args};
  if(name==='goto'||name==='cpuJump'){e.target=(args[0]|args[1]<<8)+rel-load;}
  if(name==='loopBreak'){e.target=(args[1]|args[2]<<8)+rel-load;}
  events.push(e);
  if(name==='end')break;
  if(name==='goto'){if(seen.has(e.target))break;seen.add(e.target);break;}
 }
 return events;
}
export function formatEvents(events){
 const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B','~','r'];
 return events.map(e=>e.cmd?`${e.cmd}(${e.args.map(a=>a.toString(16)).join(',')})${e.target!==undefined?'->'+e.target.toString(16):''}`:`${names[e.note]}${e.len}`).join(' ');
}
