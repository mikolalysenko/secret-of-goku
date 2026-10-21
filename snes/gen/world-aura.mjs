// World-owned OBJ version of the browser flame. Deduplication, rather than
// scaling or mirroring, fits every 48x64 frame in A's 32 unused 8x8 tiles.
import {drawKiAura} from '../../engine/ki-aura.js';
import {encodeTile} from '../tools/gfx.mjs';

export function generateWorldAura({a, effect, manifest, xdata}) {
  const effects = Object.fromEntries(['charge-orb', 'gold-arc'].map(group =>
    [group, manifest.frames.filter(f => f.group === group).map(f => effect(f.name))]));
  const luma = c => { c--; return (c & 31)*3 + (c >> 5 & 31)*6 + (c >> 10 & 31); };
  const ramps = Object.values(effects).map(frames => [...new Set(frames.flatMap(f => [...f]))]
    .filter(Boolean).sort((a,b) => luma(a)-luma(b)));
  if (ramps.some(p => p.length < 4)) throw Error('world aura: missing native ramp');
  a.label('world_aura_palette');
  for (const ramp of ramps) a.dw([0,...Array.from({length:4},(_,i)=>ramp[Math.min(ramp.length-2,i)]-1),...Array(11).fill(0)]);
  // Preserve the four semantic shades even when blue's shorter native ramp
  // merges its two highlights. Gold still needs those distinct indices.
  const geometry={'charge-orb':[[1,2,3,4,5]],'gold-arc':[[1,2,3,4,5]]};
  // $6C/$7C is the docking miniature. $CE/$DE is unused effect slot 23.
  const tiles = [...Array.from({length:12},(_,i)=>0x60+i),
    ...Array.from({length:12},(_,i)=>0x70+i),0x6E,0x6F,0x7E,0x7F,0xCE,0xCF,0xDE,0xDF];
  const blobs = Array.from({length:3},()=>new Uint8Array(32768));
  const meta = new Uint8Array(96*144), counts = [];
  for (let level=1; level<=8; level++) for (let phase=0; phase<12; phase++) {
    const id=(level-1)*12+phase, pixels=new Uint8Array(48*64);
    drawKiAura(geometry,0,0,phase*3,(x,y,c)=>{
      if(x < -24 || x >= 24 || y < -48 || y >= 16) throw Error('world aura: bounds');
      pixels[(y+48)*48+x+24]=c;
    },{gold:false,power:level/8,height:32,clock:0});
    const unique=new Map(), pieces=[];
    for(let y=0;y<64;y+=8) for(let x=0;x<48;x+=8) {
      const bytes=encodeTile(pixels,48,x,y,4);
      if(bytes.every(b=>b===0)) continue;
      const key=Buffer.from(bytes).toString('hex');
      if(!unique.has(key)) {
        const n=unique.size;
        if(n>=tiles.length) throw Error('world aura: more than 32 distinct tiles');
        unique.set(key,n);
        blobs[id>>5].set(bytes,(id&31)*1024+n*32);
      }
      pieces.push(x,y,tiles[unique.get(key)],0x3E); // priority 3, palette 7, small OBJ
    }
    if(pieces.length>144) throw Error('world aura: more than 36 sprites');
    counts.push(pieces.length/4);
    meta.set(pieces,id*144);
  }
  blobs.forEach((b,i)=>xdata(`world_aura_${i}`,b));
  xdata('world_aura_oam',meta);
  a.label('world_aura_count');a.db(counts);
  a.label('world_aura_oam_offset');a.dw(counts.map((_,i)=>i*144));
  a.label('world_aura_dma');
  for(let i=0;i<96;i++) a.raw(`\tdl !XDATA_WORLD_AURA_${i>>5}+$${((i&31)*1024).toString(16)} : db 0`);
  // Encode (level-1)*12 and gold in bit 7; the live clock supplies phase.
  const entry=(power,gold=false)=>power<=0?255:(Math.min(8,Math.ceil(power*8))-1)*12+(gold?128:0);
  a.label('world_aura_focus');a.db(Array.from({length:97},(_,p)=>entry(.25+.45*p/96)));
  a.label('world_aura_charge_base');a.db(Array.from({length:91},(_,p)=>entry(.15+.4*p/90)));
  a.label('world_aura_charge_ssj');a.db(Array.from({length:46},(_,p)=>entry(.4+.6*p/45,true)));
  for(const duration of [32,72]) {
    const ignition=Math.ceil(duration*14/40);
    a.label(`world_aura_transform${duration}`);
    a.db(Array.from({length:duration+1},(_,age)=>entry(age>=ignition?1:.4+.4*age/ignition,age>=ignition)));
  }
  for(const duration of [10,20]) {
    a.label(`world_aura_revert${duration}`);
    a.db(Array.from({length:duration+1},(_,age)=>entry(Math.max(0,1-age/duration),age<8)));
  }
}
