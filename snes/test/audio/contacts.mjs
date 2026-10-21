// Contact loudness and headroom on the cartridge's actual SPC image.
// No output normalization; Mesen DAC recordings are produced by capture7.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createApu,loadSong} from './apu.mjs';
import {measure} from './punch.mjs';
import {isResident7,roundFourApuRom} from './cartridge.mjs';
export const CONTACT_IDS=[0xE7,0xE8];
const frame=1000/60.0988;
export function contactComparison(rom,before=roundFourApuRom(rom)){
 return CONTACT_IDS.map((id,i)=>{
  const {pcm:a,...old}=measure(before,id),{pcm:b,...now}=measure(rom,id);
  return {cue:i?'kick':'hit',id,before:old,after:now,peakGainDb:now.peakDbFS-old.peakDbFS,
   bodyGainDb:10*Math.log10(now.low80Energy/old.low80Energy),crunchGainDb:10*Math.log10(now.high30Energy/old.high30Energy)};
 });
}
export function contactMix(rom,{song,gap,mode,phase=0}){
 const s=JSON.parse(readFileSync('dist/snes/gen/audio/songs.json')).find(s=>s.id===song);
 if(!s)throw Error('unknown contact test song');
 const h=createApu({rom});h.ms(60);
 loadSong(h,rom,{blob:readFileSync(`dist/snes/gen/audio/song_${song.toString(16)}.bin`),instruments:s.instruments.map(i=>i.id),echo:s.echo,song,p2:0x10,p3:255});
 h.waitFor(()=>h.ram[0xAD]===255,4e7);h.ms(300+phase);h.take();
 const bank=h.ram.slice(0x4DF1,0x56F1);
 if(mode==='beds'&&isResident7(rom))for(const id of [0xED,0xEE]){h.nativeCmd(0x81,id,240,id===0xED?136:128);h.ms(frame);}
 for(let cycle=0;cycle<4;cycle++){
  if(mode==='beam'){h.nativeCmd(2,isResident7(rom)?0xF0:0xEA,15,0x88);h.ms(frame);}
  for(let i=0;i<16;i++){
   h.nativeCmd(2,CONTACT_IDS[i&1],15,0x88);h.ms(gap*frame);
  }
  // Pause between bursts to vary musical and DSP-noise phase.
  h.ms((17+cycle*3)*frame);
 }
 if(mode==='beds'&&isResident7(rom))for(const id of [0xED,0xEE]){h.nativeCmd(0x81,id,0,128);h.ms(frame);}
 h.ms(1800);
 let peak=0,clipped=0,sum=0;const {l,r}=h.take();
 for(const a of [l,r])for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=32767)clipped++;}
 return {song,gap,mode,phase,seconds:l.length/32000,peak,peakDbFS:20*Math.log10(peak/32768),rmsDbFS:10*Math.log10(sum/(2*l.length*32768**2)),clipped,
  musicMask:h.ram[0xAD],effectMask:h.ram[0xAE],noiseMask:h.dspReg(0x3D),bankIntact:!isResident7(rom)||Buffer.from(h.ram.slice(0x4DF1,0x56F1)).equals(Buffer.from(bank))};
}
export function contactMixes(rom){
 const rows=[];
 for(const song of [0x3C,0x3F])for(const gap of [2,3,5,8])for(const mode of ['rapid','beam','beds'])rows.push(contactMix(rom,{song,gap,mode,phase:(gap-2)*137}));
 return rows;
}
if(process.argv[1]===import.meta.filename){
 const path=process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc',rom=readFileSync(path);
 const before=process.argv.find(a=>a.startsWith('--before='))?.slice(9);
 const comparisons=contactComparison(rom,before?readFileSync(before):undefined),mixes=contactMixes(rom);
 const out=resolve('.local/snes-test/audio/compare7');mkdirSync(out,{recursive:true});
 writeFileSync(resolve(out,'contact-analysis7.json'),JSON.stringify({rom:path,sha256:createHash('sha256').update(rom).digest('hex'),before:before??'Reconstructed round-four APU image',comparisons,mixes},null,2));
 console.table(comparisons.map(r=>({cue:r.cue,before:r.before.peakDbFS,after:r.after.peakDbFS,gain:r.peakGainDb,body:r.bodyGainDb,crunch:r.crunchGainDb})));
 console.table(mixes.map(({song,gap,mode,peakDbFS,clipped})=>({song:song.toString(16),gap,mode,peakDbFS,clipped})));
}
