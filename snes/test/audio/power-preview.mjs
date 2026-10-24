// Unnormalized cartridge SPC/DSP A/B cue renders, not gameplay recordings.
// node snes/test/audio/power-preview.mjs --before=old.sfc [--rom=new.sfc]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApu,loadSong,romSong,wav} from './apu.mjs';
import {FRAME,FIELD_SONG,FIELD_PRESET,fieldEcho,silentSong,installExtended} from './cues9.mjs';
import {cueMetrics,int16Stereo} from './loudness.mjs';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const out=resolve(arg('out','.local/it-audio/preview'));mkdirSync(out,{recursive:true});
const shot=(frame,id)=>[frame,2,id,15,0x88],bed=(frame,id,level)=>[frame,0x81,id,level,128];
const cues=[
 ['teleport',false,[shot(0,0xEB),shot(8,0xEF)]],
 ['teleport-extended',true,[shot(0,0xEB),shot(8,0xEF)]],
 ['transform',false,[shot(0,0xE0),bed(1,0xED,0xD0),bed(13,0xEE,0xF0),shot(26,0xE1),bed(72,0xED,0),bed(73,0xEE,0)]],
 ...[false,true].flatMap(ext=>[['kamehameha',0xEA],['ssj-wave',0xF0]].map(([name,id])=>[name+(ext?'-extended':''),ext,[shot(0,id)]])),
];
const report={note:'32 kHz stereo SPC/DSP cue renders, identical command schedules, no normalization. Music files include the field song. Compact/extended selects the resident or completed optional bank.',versions:{},files:[]};
for(const [version,path] of [['before',arg('before')],['after',arg('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')]]){
 if(!path)continue;const rom=readFileSync(path);
 report.versions[version]={rom:resolve(path),sha256:createHash('sha256').update(rom).digest('hex')};
 for(const [name,ext,events] of cues)for(const music of [false,true]){
  const h=createApu({rom});h.ms(60);
  if(music){loadSong(h,rom,{...romSong(rom,FIELD_SONG),echo:fieldEcho(rom),song:FIELD_SONG,p2:FIELD_PRESET,p3:255});h.ms(1000);}
  else silentSong(h,rom,fieldEcho(rom));
  if(ext)assert.ok(installExtended(h,rom));
  h.take();h.ms(500);let maxVoices=0;
  for(let f=0;f<180;f++){
   for(const [at,...cmd] of events)if(at===f)h.nativeCmd(...cmd);
   h.ms(FRAME);maxVoices=Math.max(maxVoices,h.ram[0xAE].toString(2).replaceAll('0','').length);
  }
  const {l,r}=h.take(),metrics=cueMetrics(int16Stereo(l,r),32000),file=`${name}-${music?'music':'alone'}-${version}.wav`;
  assert.equal(metrics.clipped,0,`${file} clipped`);assert.equal(h.ram[0xAE],0,`${file} retained effects`);
  writeFileSync(join(out,file),wav(l,r));report.files.push({file,version,cue:name,music,maxVoices,...metrics});
 }
}
writeFileSync(join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${report.files.length} WAVs and manifest: ${out}`);
