// Round-five listening package. APU-only installation of a real, bounded
// resident bank; the shipping ROM, loader, native effects and music stay intact.
// node snes/test/audio/samples.mjs [--options]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createApu,loadSong,romSong} from './apu.mjs';
import {measure,punchMetrics,writePcm} from './punch.mjs';
import {NATIVE_IDS} from '../../gen/audio-resident.mjs';
import {buildCustomBank,installCustom,CUSTOM_IDS,SAMPLE_BASE,RESERVE} from './custom-samples.mjs';
import {out,root,hash,songInventory} from './sample-audit.mjs';
import {optionsReport,writeStereo} from './sample-options.mjs';

const CUES={hit:NATIVE_IDS[3],kick:NATIVE_IDS[4],impact:NATIVE_IDS[6],beam:NATIVE_IDS[8]};
const silentSong=()=>{
 const blob=Buffer.alloc(21);blob.writeUInt16LE(0x1A14,0);
 for(let i=2;i<20;i+=2)blob.writeUInt16LE(0x1A14,i);blob[20]=0xF2;return blob;
};
export function proposedEcho(s){return {...s.echo,edl:s.echo.edl-(s.free<RESERVE?1:0)};}
export function mixContext(rom,bank,{custom=true,song=null,cycles=1}={}){
 const h=createApu({rom});h.ms(60);
 const echo=song?(custom?proposedEcho(song):song.echo):{edl:4,evol:64,efb:30,fir:0};
 const source=song?romSong(rom,song.id):{blob:silentSong(),instruments:[]};
 const loaded=loadSong(h,rom,{...source,echo,song:song?.id??0x3B,p2:song?.command.p2??15,p3:0xFF,
  sampleBase:SAMPLE_BASE+(custom?RESERVE:0)});
 if(song)h.waitFor(()=>h.ram[0xAD]!==0,4e7);
 h.ms(300);if(custom)installCustom(h,bank);h.take();
 const sampleBefore=h.ram.slice(0x4800,loaded.end),extensionBefore=h.ext.segments
  .filter(s=>s.addr>=0x1598&&s.addr<0x1A00||s.addr>=0xFF89).map(s=>({addr:s.addr,bytes:h.ram.slice(s.addr,s.addr+s.bytes.length)}));
 for(let c=0;c<cycles;c++){
  if(song)for(const cue of ['hit','kick','impact','hit','kick']){h.nativeCmd(2,custom?CUSTOM_IDS[cue]:CUES[cue],15,0x88);h.ms(90);}
  h.nativeCmd(2,custom?CUSTOM_IDS.beam:CUES.beam,15,0x88);
  for(let i=0;i<9;i++){h.ms(6000/60.0988);h.nativeCmd(2,custom?CUSTOM_IDS.impact:CUES.impact,15,0x88);}
  h.ms(700);
 }
 h.ms(1000);
 assert.equal(h.ram[0xAE],0,'all effect voices returned');
 assert.equal(h.dspReg(0x3D),0,'noise released');
 assert.deepEqual(h.ram.slice(0x4800,loaded.end),sampleBefore,'resident/song sample bytes preserved');
 for(const s of extensionBefore)assert.deepEqual(h.ram.slice(s.addr,s.addr+s.bytes.length),s.bytes,'idle extension unchanged');
 const {l,r}=h.take();let peak=0,clipped=0;
 for(const channel of [l,r])for(const v of channel){peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>=32767)clipped++;}
 assert.equal(clipped,0,'mix clips');
 return {l:Float32Array.from(l,v=>v/32768),r:Float32Array.from(r,v=>v/32768),
  peakDbFS:20*Math.log10(peak/32768),clipped,musicMask:h.ram[0xAD],sampleEnd:loaded.end,esa:loaded.esa};
}

export function report({options=false}={}){
 mkdirSync(out,{recursive:true});
 const romPath=process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc');
 const rom=readFileSync(romPath),before=hash(rom),bank=buildCustomBank(),cues=[];
 for(const [cue,id] of Object.entries(CUES)){
  const versions={};
  for(const version of ['r4','custom','alt1','alt2']){
   const custom=version!=='r4';
   const {pcm,...metrics}=measure(rom,custom?CUSTOM_IDS[cue]:id,{echo:cue==='beam',
    setup:custom?h=>installCustom(h,bank,{variant:version}):null});
   assert.ok(metrics.ended&&metrics.voices<=2,`${cue}/${version} must terminate in two voices`);
   assert.ok(metrics.peakDbFS<-2,`${cue}/${version} needs headroom`);
   const file=`${cue}-${version}.wav`;writePcm(join(out,file),pcm);versions[version]={file,...metrics};
  }
  const notes={hit:'Shared snap plus low body; alt1 substitutes a short DSP-noise crack, alt2 lowers/slides the body further.',
   kick:'The same two samples pitched down; alt1 substitutes a short DSP-noise crunch, alt2 deeper body.',
   impact:'Custom explosion plus snap, distinct id $ED; retail $38 remains intact. Alt1 substitutes a short DSP-noise crack; alt2 lowers the explosion.',
   beam:'52 ms roar loop for 108 ticks with song echo, plus a short low explosion. Alt1 adds sustained DSP noise and raises roar pitch; alt2 deepens both samples.'};
  cues.push({cue,note:notes[cue],versions});
 }
 const h=createApu({rom});h.ms(60);const layout=installCustom(h,bank);
 const sampleInfo=bank.samples.map(s=>{
  return {name:s.name,instrument:s.instrument,rate:s.rate,addr:s.addr,bytes:s.bytes.length,
   loopOffset:s.loop,loopSamples:s.loop<0?0:(s.bytes.length-s.loop)/9*16,
   codecSnrDb:s.snr,sha256:s.sha256,note:s.note};
 });
 const context=[];
 for(const custom of [false,true]){
  const mix=mixContext(rom,bank,{custom}),version=custom?'custom':'r4',file=`beam-contacts-${version}.wav`;
  writeStereo(join(out,file),mix);const {l,r,...m}=mix;context.push({file,...m,
   metrics:punchMetrics(Float32Array.from(l,(v,i)=>(v+r[i])/2)),note:'Nine contacts six video frames apart, silent song, preset 4.'});
 }
 for(const song of songInventory().filter(s=>s.kind==='new')){
  for(const custom of [false,true]){
   const mix=mixContext(rom,bank,{custom,song,cycles:4}),file=`mix-${song.name}-${custom?'custom':'r4'}.wav`;
   assert.equal(mix.musicMask,255,'all eight arrangement tracks alive');
   writeStereo(join(out,file),mix);const {l,r,...m}=mix;context.push({file,...m,note:'Rapid contacts plus four nine-impact waves; proposed EDL only for custom; no gain normalization.'});
  }
 }
 const manifest={romSha256:before,rate:32000,
  renderer:'Real retail SPC700 sequencer and sample-accurate S-DSP. Centred 02 ee 0F 88. No post-render gain or normalization.',
  status:'RAM-only prototype: shipping ROM and all default assets unchanged. Proposed sample bank requires loader reservation and audible EDL changes, so no AUDIO_CUSTOM_SAMPLES build define is installed.',
  echo:'Isolated beam and wave pairs use preset 4 (EDL 4/EVOL 64/EFB 30/FIR 0); hit/kick/impact dry. Music contexts use each arrangement, with only the proposed custom EDL reductions.',
  metrics:'punch.mjs: -60 dB relative sample onset; 5 ms RMS duration to -40 dB relative peak; Hann-corrected FS² ms low80/high30; 10 ms voice-ownership observations.',
  bank:{base:SAMPLE_BASE,reserve:RESERVE,sampleBytes:bank.bytes,...layout,samples:sampleInfo},cues,context};
 if(options)manifest.options=optionsReport();
 writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 assert.equal(hash(readFileSync(romPath)),before,'ROM unchanged');
 console.table(cues.flatMap(c=>Object.entries(c.versions).map(([version,m])=>({cue:c.cue,version,
  peakMs:m.timeToPeakMs.toFixed(2),dB:m.peakDbFS.toFixed(2),duration:m.durationMs,voiceMs:m.voiceMs,
  low:m.low80Energy.toFixed(4),high:m.high30Energy.toFixed(4)}))));
 return manifest;
}
if(process.argv[1]===import.meta.filename)report({options:process.argv.includes('--options')});
