// Swing/ki follow-up: the shipping SPC image, without RAM-only auditions.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createApu,loadSong} from './apu.mjs';
import {renderEffect,browserFeatures} from './effects.mjs';
import {punchMetrics} from './punch.mjs';
import {roundFourApuRom,isResident7,customSegments} from './cartridge.mjs';
import {readWav,resample} from '../../gen/audio-brr.mjs';
import {songInventory} from './sample-audit.mjs';
import {buildResident7,resident7Layout,SAMPLE_BASE,RESERVE} from '../../gen/audio-resident7.mjs';
const frame=1000/60.0988;
export const MOTION_CUES=[['swing',0xE5],['kickSwing',0xE6],['blast',0xDE]];
// Maximum normalized autocorrelation over 125-1000 Hz periods in a 60 ms
// window. A repeated pitched waveform scores high; this is not a listening
// quality score and intentionally ignores the slower amplitude envelope.
export function periodicity(pcm){
 const onset=pcm.findIndex(v=>Math.abs(v)>.0001),a=pcm.slice(onset+1600,onset+3520);
 let best=0;
 for(let lag=32;lag<=256;lag++){
  let dot=0,ea=0,eb=0;
  for(let i=lag;i<a.length;i++){dot+=a[i]*a[i-lag];ea+=a[i]**2;eb+=a[i-lag]**2;}
  best=Math.max(best,dot/Math.sqrt(Math.max(1e-20,ea*eb)));
 }
 return best;
}
export function motionComparison(rom,before=roundFourApuRom(rom)){
 return MOTION_CUES.map(([cue,id])=>{
  const measure=r=>{const {pcm,features,...voice}=renderEffect(r,id);return {...voice,...punchMetrics(pcm),features,periodicity:periodicity(pcm)};};
  return {cue,id,before:measure(before),after:measure(rom),pc:browserFeatures(cue)};
 });
}
export function motionMix(rom,{song=0x3C,mode='combo',gap=1,beam=false,beds=false}){
 const s=JSON.parse(readFileSync('dist/snes/gen/audio/songs.json')).find(s=>s.id===song),h=createApu({rom});h.ms(60);
 if(song){loadSong(h,rom,{blob:readFileSync(`dist/snes/gen/audio/song_${song.toString(16)}.bin`),instruments:s.instruments.map(i=>i.id),echo:s.echo,song,p2:0x10,p3:255});h.waitFor(()=>h.ram[0xAD]===255,4e7);}
 h.ms(300);h.take();
 const immutable=customSegments(rom).map(s=>({addr:s.addr,bytes:h.ram.slice(s.addr,s.addr+s.bytes.length)}));
 let maxVoices=0,maxLaunchVoices=0,maxSwingVoices=0,noiseMismatch=0;
 const step=ms=>{for(let t=0;t<ms;t+=1){h.ms(Math.min(1,ms-t));const ids=[];for(let v=0;v<8;v++)if(h.ram[0xAE]&(1<<v))ids.push(h.ram[0xFF80+v]);maxVoices=Math.max(maxVoices,ids.length);maxLaunchVoices=Math.max(maxLaunchVoices,ids.filter(id=>id===0xDE).length);maxSwingVoices=Math.max(maxSwingVoices,ids.filter(id=>id===0xE5||id===0xE6).length);
   if(isResident7(rom))for(let v=0;v<8;v++)if((h.dspReg(0x3D)&(1<<v))&&[0xE5,0xE6,0xDE,0xED,0xEE].includes(h.ram[0xFF80+v]))noiseMismatch++;
  }};
 if(beds&&isResident7(rom))for(const id of [0xED,0xEE]){h.nativeCmd(0x81,id,240,128);step(frame);}
 for(let cycle=0;cycle<4;cycle++){
  if(beam){h.nativeCmd(2,isResident7(rom)?0xF0:0xEA,15,0x88);step(frame);}
  if(mode==='combo')for(let repeat=0;repeat<3;repeat++)for(let i=0;i<3;i++){
   h.nativeCmd(2,i===2?0xE6:0xE5,15,0x88);step(gap*frame);
   h.nativeCmd(2,i===2?0xE8:0xE7,15,0x88);step((14-gap)*frame);
  }
  else for(let i=0;i<24;i++){
   h.nativeCmd(2,0xDE,15,0x88);step(2*frame);
   h.nativeCmd(2,0x38,15,0x88);step((gap-2)*frame);
  }
  step((17+cycle*3)*frame);
 }
 if(beds&&isResident7(rom))for(const id of [0xED,0xEE]){h.nativeCmd(0x81,id,0,128);step(frame);}
 step(1800);
 let peak=0,clipped=0,sum=0;const {l,r}=h.take();for(const a of [l,r])for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=32767)clipped++;}
 return {song,mode,gap,beam,beds,maxVoices,maxLaunchVoices,maxSwingVoices,noiseMismatch,peak,peakDbFS:20*Math.log10(peak/32768),clipped,rmsDbFS:10*Math.log10(sum/(2*l.length*32768**2)),musicMask:h.ram[0xAD],effectMask:h.ram[0xAE],noiseMask:h.dspReg(0x3D),bankIntact:immutable.every(s=>Buffer.from(s.bytes).equals(Buffer.from(h.ram.slice(s.addr,s.addr+s.bytes.length))))};
}
export function motionMixes(rom){
 const rows=[];
 for(const song of [0x3C,0x3F])for(const beam of [false,true])for(const [mode,gaps] of [['combo',[1,2]],['volley',[5,8]]])for(const gap of gaps)rows.push(motionMix(rom,{song,beam,mode,gap}));
 for(const gap of [1,2])rows.push(motionMix(rom,{mode:'combo',gap,beds:true}));
 return rows;
}
export function sampleOptions(){
 const songs=songInventory().filter(s=>s.id<0x3B||s.kind==='new'),b=buildResident7(),free=RESERVE-b.used;
 const cap=(s,size)=>Math.min(s.echo.edl,Math.floor((0xFA00-1-SAMPLE_BASE-size-s.sampleBytes)/2048));
 const energy=a=>a.reduce((n,v)=>n+v*v,0)/a.length,rows=[];
 for(const name of ['swing','swing-2','kick-swing','blast'])for(const rate of [4000,6000,8000]){
  const w=readWav(readFileSync(`assets/audio/dbz/${name}.wav`)),pcm=resample(w.pcm,w.rate,rate),bytes=Math.ceil(pcm.length/16)*9;
  const size=RESERVE+bytes-free;
  rows.push({name,rate,seconds:w.pcm.length/w.rate,brrBytes:bytes,minimumTrimBytes:bytes-free,energyLossDb:10*Math.log10(energy(pcm)/energy(w.pcm)),additionalEdlChanges:songs.filter(s=>cap(s,size)<cap(s,RESERVE)).map(s=>({id:s.id,before:cap(s,RESERVE),after:cap(s,size)})),noEchoRoom:songs.filter(s=>cap(s,size)<1&&s.echo.edl>0).map(s=>s.id)});
 }
 const compactBytes=360,compactReserve=RESERVE+compactBytes-free;
 return {free,rows,compact:{attackMs:32,loopMs:128,rate:4000,brrBytes:compactBytes,minimumTrimBytes:compactBytes-free,additionalEdlChanges:songs.filter(s=>cap(s,compactReserve)<cap(s,RESERVE)).map(s=>({id:s.id,before:cap(s,RESERVE),after:cap(s,compactReserve)})),noEchoRoom:songs.filter(s=>cap(s,compactReserve)<1&&s.echo.edl>0).map(s=>s.id)},note:'Full clips; BRR-only lower bounds exclude sequence, metadata and pitch-helper relocation. The current layout can grow only 58 bytes before song 0C loses its last echo step.'};
}
if(process.argv[1]===import.meta.filename){
 const path=process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc',rom=readFileSync(path),before=process.argv.find(a=>a.startsWith('--before='))?.slice(9),bank=buildResident7();
 const comparisons=motionComparison(rom,before?readFileSync(before):undefined),mixes=motionMixes(rom),layout=resident7Layout(readFileSync('rom/secret-of-mana-us.sfc'),bank.tracks);
 const out=resolve('.local/snes-test/audio/compare7');mkdirSync(out,{recursive:true});
 writeFileSync(resolve(out,'motion-analysis7.json'),JSON.stringify({rom:path,sha256:createHash('sha256').update(rom).digest('hex'),before,comparisons,mixes,sampleOptions:sampleOptions(),bank:{used:bank.used,reserve:bank.reserve,sampleBytes:bank.sampleBytes,codeBytes:bank.codeBytes,sharedSequenceUsed:layout.used,sharedSequenceCapacity:layout.capacity}},null,2));
 console.table(comparisons.map(r=>({cue:r.cue,peakBefore:r.before.peakDbFS,peak:r.after.peakDbFS,periodBefore:r.before.periodicity,period:r.after.periodicity,centroid:r.after.features.centroid,voiceMs:r.after.voiceMs})));
 console.table(mixes.map(({song,mode,gap,beam,beds,maxVoices,peakDbFS,clipped,bankIntact})=>({song,mode,gap,beam,beds,maxVoices,peakDbFS,clipped,bankIntact})));
}
