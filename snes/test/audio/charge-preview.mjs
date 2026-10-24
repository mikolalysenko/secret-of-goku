// Unnormalized A/B listening files from each cartridge's own SPC/DSP.
// node snes/test/audio/charge-preview.mjs [--before=old.sfc] [--rom=new.sfc]
// Cue renders, not gameplay recordings; private WAVs/report stay in .local.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApu,loadSong,romSong,wav} from './apu.mjs';
import {FRAME,FIELD_SONG,FIELD_PRESET,fieldEcho,silentSong} from './cues9.mjs';
import {cueMetrics,int16Stereo} from './loudness.mjs';

const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const out=resolve(arg('out','.local/charge-audio/preview'));
mkdirSync(out,{recursive:true});
const report={note:'32 kHz stereo cartridge SPC/DSP renders. No gain normalization or offline effects. Identical command schedules before/after; mix files include the field song.',versions:{},files:[]};
for(const [version,path] of [['before',arg('before')],['after',arg('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')]]){
 if(!path)continue;
 const rom=readFileSync(path),sym=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
 const table=name=>{
  const m=sym.match(new RegExp(`^([\\dA-F]{2}):([\\dA-F]{4}) audio_${name}_levels$`,'mi'));
  assert.ok(m,`missing ${name} envelope`);return parseInt(m[1]+m[2],16)&0x3FFFFF;
 };
 report.versions[version]={rom:resolve(path),sha256:createHash('sha256').update(rom).digest('hex')};
 for(const [name,cap,frames] of [['focus',96,240],['charge',90,210],['super',45,180],['tap',90,6]])for(const mix of [false,true]){
  const h=createApu({rom});h.ms(60);
  if(mix){const s=romSong(rom,FIELD_SONG);loadSong(h,rom,{...s,echo:fieldEcho(rom),song:FIELD_SONG,p2:FIELD_PRESET,p3:255});h.ms(1000);}
  else silentSong(h,rom,fieldEcho(rom));
  h.take();h.ms(500);
  const base=table(name==='tap'?'charge':name),sent=[-1,-1],rates=[-1,-1];let next=0,maxVoices=0;
  for(let f=0;f<frames;f++){
   // Same level/rate quantization and one-command/12-frame round robin
   // as audio_beds_service, with no other gameplay cues competing here.
   if(f%12===0){
    const row=base+4*Math.min(cap,f);
    for(let j=0;j<2;j++){
     const i=(next+j)&1,level=rom[row+i]&0xF0,rate=rom[row+2+i]&0xFC;
     if(level===sent[i]&&(!level||rate===rates[i]))continue;
     h.nativeCmd(0x81,0xED+i,level,rate);sent[i]=level;rates[i]=rate;next=i^1;break;
    }
   }
   h.ms(FRAME);maxVoices=Math.max(maxVoices,h.ram[0xAE].toString(2).replaceAll('0','').length);
  }
  for(let i=0;i<2;i++){h.nativeCmd(0x81,0xED+i,0,128);h.ms(FRAME);}
  h.ms(1400);
  const {l,r}=h.take(),metrics=cueMetrics(int16Stereo(l,r),32000);
  assert.equal(metrics.clipped,0,`${version} ${name} clipped`);
  const file=`${name}-${mix?'music':'alone'}-${version}.wav`;
  writeFileSync(join(out,file),wav(l,r));
  report.files.push({file,version,cue:name,music:mix,maxVoices,...metrics});
 }
}
writeFileSync(join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${report.files.length} WAVs and manifest: ${out}`);
