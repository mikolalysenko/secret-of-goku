// Reproducible effect audition: real SoM sequencer + S-DSP versus the browser
// WAVs at their authored playback rates/gains. All recordings stay in .local.
// node snes/test/audio/effects.mjs [--search] [--wav] [--before=baseline.sfc]
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApu,loadRom,driverChunks,wav,loadSong} from './apu.mjs';
import {readWav,resample} from '../../gen/audio-brr.mjs';
import {octaveBands} from './songs.mjs';
import {cues} from '../../../engine/ki-sound.js';
import {SHOTS} from '../../gen/audio.mjs';
import {NATIVE_IDS,NATIVE_BEDS,RESIDENT} from '../../gen/audio-resident.mjs';

const root=resolve(import.meta.dirname,'../../..'),out=resolve(root,'.local/snes-test/audio/effects');
const rate=32000,db=x=>20*Math.log10(Math.max(x,1e-9));
const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/Math.max(1,a.length));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;

// Hann-windowed power centroid, 1024-point radix-2 FFT, 50% overlap.
function centroid(a){
 const n=1024,re=new Float64Array(n),im=new Float64Array(n);let power=0,moment=0;
 for(let p=0;p<a.length;p+=n/2){
  for(let i=0;i<n;i++){re[i]=(a[p+i]??0)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));im[i]=0;}
  for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let len=2;len<=n;len*=2)for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){
   const w=-2*Math.PI*j/len,c=Math.cos(w),s=Math.sin(w),k=i+j,q=k+len/2;
   const x=re[q]*c-im[q]*s,y=re[q]*s+im[q]*c;
   re[q]=re[k]-x;im[q]=im[k]-y;re[k]+=x;im[k]+=y;
  }
  for(let k=1;k<n/2;k++){const e=re[k]**2+im[k]**2;power+=e;moment+=e*k*rate/n;}
 }
 return moment/Math.max(power,1e-20);
}
export function features(pcm){
 // Remove leading/trailing silence below -40 dB of peak; duration measures
 // audible material, not padding or the driver's command latency.
 const env=[];for(let p=0;p<pcm.length;p+=320)env.push(rms(pcm.subarray(p,p+320)));
 const peak=Math.max(...env),first=env.findIndex(v=>v>peak*.01);
 let last=env.length-1;while(last>first&&env[last]<=peak*.01)last--;
 const a=pcm.subarray(Math.max(0,first)*320,(last+1)*320),level=rms(a);
 const shape=Array.from({length:32},(_,i)=>rms(a.subarray(Math.floor(i*a.length/32),Math.floor((i+1)*a.length/32)))/Math.max(level,1e-9));
 return {duration:a.length/rate,levelDb:db(level),centroid:centroid(a),bands:octaveBands(a).map(x=>x-db(level)),envelope:shape};
}
export function distance(a,b){
 const duration=Math.abs(Math.log2(Math.max(.01,a.duration)/Math.max(.01,b.duration)));
 const spectral=mean(a.bands.map((v,i)=>Math.min(24,Math.abs(v-b.bands[i]))))/12;
 const centroid=Math.abs(Math.log2(Math.max(30,a.centroid)/Math.max(30,b.centroid)));
 const envelope=Math.sqrt(mean(a.envelope.map((v,i)=>(v-b.envelope[i])**2)));
 const level=Math.min(24,Math.abs(a.levelDb-b.levelDb))/12;
 return {score:100/(1+.9*duration+.8*spectral+.4*centroid+.8*envelope+.3*level),duration,spectral,centroid,envelope,level};
}
export function installCandidate(h,tracks){
 const ptr=[];
 for(let v=0;v<2;v++){
  const at=0x3000+v*0x100,seq=tracks[v];
  if(seq){if(seq.length>0x100)throw Error('audition track too long');h.ram.set(seq,at);}
  ptr.push(seq?at&255:0,seq?at>>8:0);
 }
 h.ram.set(ptr,0x2F70);
}
export function renderEffect(rom,id,{sequence,tracks,echo=false,limit=4000}={}){
 const h=createApu({rom,extension:false});h.ms(60);h.take();
 if(echo){
  // Silent song, native echo preset 4: evaluate E2 using a real echo ring.
  const blob=Buffer.alloc(21);blob.writeUInt16LE(0x1A14,0);
  for(let i=2;i<20;i+=2)blob.writeUInt16LE(0x1A14,i);blob[20]=0xF2;
  loadSong(h,rom,{blob,instruments:[],echo:{edl:4,evol:64,efb:30,fir:0}});
  h.ms(300);h.take();
 }
 if(sequence||tracks){installCandidate(h,tracks??[sequence]);id=0xDC;}
 h.nativeCmd(2,id,15,0x88);
 let voices=0,voiceMs=0,seen=false,ended=false,ms=0;
 for(;ms<limit;ms+=10){
  h.ms(10);const mask=h.ram[0xAE],count=mask.toString(2).replaceAll('0','').length;
  voices=Math.max(voices,count);voiceMs+=10*count;
  if(mask)seen=true;else if(seen){ended=true;h.ms(echo?700:100);break;}
 }
 const {l,r}=h.take(),pcm=Float32Array.from(l,(v,i)=>(v+r[i])/65536);
 return {pcm,voices,voiceMs,ended,ms,features:features(pcm)};
}
function safeSequence(ram,ptr){
 if(!ptr)return true;
 for(let count=0;count<256;count++){
  const op=ram[ptr++];if(op===0xF2)return true;
  // No loops, jumps, global tempo/master changes.
  if([0xF0,0xF1,0xF9,0xFA,0xFB,0xF3,0xF4,0xF8].includes(op))return false;
  if(op===0xEA&&ram[ptr]>11)return false;
  if(op>=0xD2)ptr+=ram[0x1484+op-0xD2];
  if(ptr>=0x4800)return false;
 }
 return false;
}
export function browserPcm(name,{seconds,variant=0}={}){
 const c=cues[name],clip=c.clips[variant];
 const a=readWav(readFileSync(resolve(root,`assets/audio/dbz/${clip}.wav`)));
 let pcm=resample(a.pcm,a.rate*(c.rate??1),rate).map(v=>v*c.gain*.55);
 if(seconds)pcm=Float32Array.from({length:Math.round(seconds*rate)},(_,i)=>pcm[i%pcm.length]);
 return pcm;
}
export function browserFeatures(name,options={}){
 return cues[name].clips.map((_,variant)=>features(browserPcm(name,{...options,variant})));
}
export function rank(name,candidates,refs=browserFeatures(name)){
 const maxVoices=['hit','kick','impact','blast','beam','friezaBeam','vegetaBeam'].includes(name)?2:1;
 return candidates.filter(c=>c.ended&&c.voices<=maxVoices&&c.features.duration>.02).map(c=>({...c,
  score:mean(refs.map(r=>distance(c.features,r).score))})).sort((a,b)=>b.score-a.score);
}
// Held beds are bounded pulses, not SPC loops. Compare equal two-second
// windows against the browser's seamless source at full requested level.
export function renderBedPcm(rom,id){
 const h=createApu({rom,extension:false});h.ms(60);h.take();
 for(let n=0;n<5;n++){h.nativeCmd(2,id,15,0x88);h.ms(25000/60.0988);}
 const {l,r}=h.take();
 return Float32Array.from(l.slice(0,rate*2),(v,i)=>(v+r[i])/65536);
}
export function renderBed(rom,id){return features(renderBedPcm(rom,id));}
export async function search({extended=true}={}){
 mkdirSync(out,{recursive:true});const rom=loadRom(),ram=new Uint8Array(65536);
 for(const c of driverChunks(rom))ram.set(c.bytes,c.addr);
 const candidates=[],audit=[];
 const cacheFile=resolve(out,'search-cache.json');
 const cache=new Map(existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile)).map(c=>[c.key,c]):[]);
 const add=(name,id,sequence,eligible=true,options={})=>{
  const key=JSON.stringify(['render-v2',id,sequence,options]);
  let v=cache.get(key);
  if(!v){const {pcm,...render}=renderEffect(rom,id,{sequence,...options});v={key,...render};cache.set(key,v);}
  const row={name,id,sequence,...options,eligible,...v};delete row.key;
  audit.push(row);if(eligible&&v.ended&&v.voices<=2)candidates.push(row);
 };
 for(let id=0;id<0xDC;id++){
  const at=0x2C00+id*4,p=ram[at]|ram[at+1]<<8,q=ram[at+2]|ram[at+3]<<8;
  if(p||q)add(`native-${id.toString(16).padStart(2,'0')}`,id,undefined,safeSequence(ram,p)&&safeSequence(ram,q));
 }
 console.log(`Measured ${candidates.length} safe retail effects (up to two voices)`);
 const lengths=[[12,0x55],[24,0x53],[48,0x50],[96,0x4D],[144,0x4C],[192,0x4B],[264,0x4B]];
 for(const ins of [0,1,3,5,8,9])for(const oct of [2,4,6,7])for(const [ticks,note] of lengths)for(const slide of [0x0C,0x40,0xDC])for(const decay of [true,false]){
  const t=Math.min(255,ticks),seq=[0xD2,0xC0,0xEA,ins,0xE4,oct,0xD6,t,slide,...(decay?[0xD3,t,0]:[]),note,...(ticks>255?[0xB8]:[]),0xF2];
  add(`synth-${ins}-${oct}-${ticks}-${slide}${decay?'':'-hold'}`,0xDC,seq);
 }
 console.log(`Measured ${candidates.length} retail/sweep candidates`);
 writeFileSync(cacheFile,JSON.stringify([...cache.values()]));
 if(extended){
  // Noise through a sustained envelope; the driver's F2 restores NON/FLG.
  // No song uses DD/DE (audit.mjs). Every voice is bounded by its note length.
  for(const clock of [12,16,19,22,25,28,30,31])for(const [ticks,note] of lengths)for(const shape of ['fade','hold','decay']){
   const t=Math.min(255,ticks),seq=[0xD2,0xA8,0xEA,3,0xDD,clock,0xDE,0xEB,15,0xED,7,0xEE,shape==='decay'?22:0,
    ...(shape==='fade'?[0xD3,t,0]:[]),note,...(ticks>255?[0xB8]:[]),0xF2];
   add(`noise-${clock}-${ticks}-${shape}`,0xDC,seq);
  }
  // Short pitch/volume LFOs on boot instruments, with and without a slide.
  for(const ins of [0,1,3,5,8,9])for(const oct of [2,4,6])for(const [ticks,note] of [lengths[1],lengths[2],lengths[3],lengths[4]])for(const mode of ['vibrato','tremolo','both']){
   const seq=[0xD2,0xB0,0xEA,ins,0xE4,oct,
    ...(mode!=='tremolo'?[0xD7,0,32,0xF0]:[]),...(mode!=='vibrato'?[0xD9,0,40,0xC0]:[]),0xD3,ticks,0,note,0xF2];
   add(`lfo-${ins}-${oct}-${ticks}-${mode}`,0xDC,seq);
  }
  console.log(`Measured ${candidates.length} including noise/LFO`);
  writeFileSync(cacheFile,JSON.stringify([...cache.values()]));
  // A short noise attack followed by a pitched body (or the reverse)
  // adds two textures on one voice. Each event still has a fixed duration.
  for(const ins of [0,1,3,9])for(const oct of [4,6])for(const clock of [22,25,28])for(const firstNoise of [true,false])for(const [ticks,note] of [lengths[1],lengths[2],lengths[3]]){
   const seq=[0xD2,0xD0,0xEA,ins,0xE4,oct,0xDD,clock,0xD6,ticks,12,0xD3,ticks,0,
    ...(firstNoise?[0xDE]:[]),0x58,firstNoise?0xDF:0xDE,note,0xF2];
   add(`hybrid-${ins}-${oct}-${clock}-${ticks}-${firstNoise?'noise':'tone'}`,0xDC,seq);
  }
  // Fill the coarse sweep grid's timing gaps around common gameplay cues.
  for(const ins of [1,3,9])for(const oct of [4,6,7])for(const [ticks,note] of [[32,0x51],[36,0x52],[64,0x4E],[72,0x4F]])for(const vol of [96,160,240])for(const decay of [true,false]){
   const seq=[0xD2,vol,0xEA,ins,0xE4,oct,0xD6,ticks,ins===3?64:12,...(decay?[0xD3,ticks,0]:[]),note,0xF2];
   add(`fine-${ins}-${oct}-${ticks}-${vol}-${decay?'fade':'hold'}`,0xDC,seq);
  }
  // Refine the best new timbres per cue with quieter/louder attacks, a pitch
  // sweep, and song-provided echo. Ranking/feature weights stay unchanged.
  const finalists=new Map();
  for(const cue of SHOTS.slice(0,27))for(const c of rank(cue,candidates).filter(c=>c.sequence).slice(0,3))finalists.set(c.name,c);
  for(const c of finalists.values()){
   for(const volume of [96,144,208,240]){const seq=[...c.sequence];seq[1]=volume;add(`${c.name}-vol${volume}`,0xDC,seq);}
   for(const slide of [32,192])add(`${c.name}-slide${slide}`,0xDC,[...c.sequence.slice(0,4),0xD6,24,slide,...c.sequence.slice(4)]);
   add(`${c.name}-echo`,0xDC,[0xE2,...c.sequence],true,{echo:true});
  }
  // Two-track candidates only for contact/ki/beam, with bounded notes.
  // PMON is auditioned on the higher voice, driven by the adjacent lower one.
  for(const cue of ['hit','kick','blast','beam','friezaBeam']){
   const top=rank(cue,candidates).filter(c=>c.sequence&&!c.echo).slice(0,3);
   const tones=rank(cue,candidates).filter(c=>c.sequence&&!c.echo&&!c.name.startsWith('noise')).slice(0,2);
   for(const a of top)for(const b of tones)for(const modulate of [false,true]){
    const first=[...(modulate?[0xE0]:[]),...a.sequence],second=[...b.sequence];second[1]=72;
    add(`layer-${cue}-${a.name}-${b.name}${modulate?'-pmod':''}`,0xDC,undefined,true,{tracks:[first,second]});
   }
  }

  writeFileSync(cacheFile,JSON.stringify([...cache.values()]));
 }
 for(const r of RESIDENT)add('shipping-'+r.name,r.id,r.sequence,true,r.tracks?{tracks:r.tracks}:{});
 console.log(`Measured ${candidates.length} eligible candidates (${audit.length} auditions)`);
 writeFileSync(resolve(out,'audit.json'),JSON.stringify(audit));
 writeFileSync(resolve(out,'candidates.json'),JSON.stringify(candidates));
 const ranks=Object.fromEntries(SHOTS.slice(0,27).map(n=>[n,rank(n,candidates).slice(0,12)]));
 writeFileSync(resolve(out,'search.json'),JSON.stringify(ranks,null,1));
 for(const [name,r] of Object.entries(ranks))console.log(name,r.slice(0,4).map(c=>`${c.name}:${c.score.toFixed(1)}`).join(' '));
 const layering=['hit','kick','blast','beam','friezaBeam','vegetaBeam'].map(cue=>{
  const ranks=rank(cue,candidates);
  return {cue,choices:[1,2].map(voices=>{
   const c=ranks.find(c=>c.voices===voices);
   if(!c)return null;
   const r=renderEffect(rom,c.id,c);
   return {name:c.name,score:c.score,voices:r.voices,duration:r.features.duration,voiceMs:r.voiceMs};
  })};
 });
 writeFileSync(resolve(out,'layering.json'),JSON.stringify(layering,null,1));
 return candidates;
}
function writePcm(path,pcm){
 const p=Int16Array.from(pcm,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768))));
 writeFileSync(path,wav(p,p));
}
function mapFromRom(path){
 const rom=readFileSync(path),sym=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
 const m=sym.match(/^([0-9A-F]{2}):([0-9A-F]{4}) audio_native_ids$/mi);
 if(!m)throw Error('audio_native_ids missing from baseline symbols');
 const at=parseInt(m[1]+m[2],16)&0x3FFFFF;
 return {rom,ids:Array.from(rom.subarray(at,at+34))};
}
export function report({writeAudio=false,before}={}){
 mkdirSync(out,{recursive:true});
 const compare=resolve(out,'../compare');if(writeAudio)mkdirSync(compare,{recursive:true});
 const rom=readFileSync(process.env.SNES_ROM??resolve(root,'dist/snes/secret-of-goku.sfc'));
 const old=before?mapFromRom(before):null;
 const palette=[...new Set(NATIVE_IDS.slice(1,28))].map(id=>{
  const {pcm,...r}=renderEffect(rom,id);
  if(writeAudio)writePcm(resolve(out,`effect-${id.toString(16)}.wav`),pcm);
  return {id,name:RESIDENT.find(x=>x.id===id)?.name??'retail',...r};
 });
 const rows=SHOTS.slice(0,27).map((name,i)=>{
  const ranking=rank(name,palette),chosen=ranking.find(c=>c.id===NATIVE_IDS[i+1]);
  const runner=ranking.find(c=>c.id!==chosen.id);
  const previous=old?rank(name,[{id:old.ids[i+1],...renderEffect(old.rom,old.ids[i+1])}])[0]:null;
  if(previous)delete previous.pcm;
  // Only the beam requests echo. Dry scores remain directly comparable to
  // round one; a separate score/recording uses native preset 4's echo ring.
  const resident=RESIDENT.find(r=>r.id===chosen.id);
  const hasEcho=(resident?.tracks?.flat()??resident?.sequence??[]).includes(0xE2);
  const wet=hasEcho?rank(name,[{id:chosen.id,...renderEffect(rom,chosen.id,{echo:true})}])[0]:null;
  if(wet)delete wet.pcm;
  if(writeAudio){
   writePcm(resolve(compare,`${name}-browser.wav`),browserPcm(name));
   for(let v=1;v<cues[name].clips.length;v++)writePcm(resolve(compare,`${name}-browser-${v+1}.wav`),browserPcm(name,{variant:v}));
   writePcm(resolve(compare,`${name}-snes.wav`),renderEffect(rom,chosen.id,{echo:hasEcho}).pcm);
   if(hasEcho)writePcm(resolve(compare,`${name}-snes-dry.wav`),renderEffect(rom,chosen.id).pcm);
  }
  return {cue:name,previous,chosen,wet,runner};
 });
 writeFileSync(resolve(out,'cue-report.json'),JSON.stringify(rows,null,1));
 const label=c=>`$${c.id.toString(16).toUpperCase().padStart(2,'0')}`;
 const table=['| Cue | Old effect / score | New effect / score | Voices | Audible seconds |','| --- | --- | --- | ---: | ---: |',
  ...rows.map(r=>`| ${r.cue} | ${r.previous?label(r.previous)+' / '+r.previous.score.toFixed(1):'—'} | ${label(r.chosen)} / ${r.chosen.score.toFixed(1)}${r.wet?' ('+r.wet.score.toFixed(1)+' echo)':''} | ${r.chosen.voices} | ${r.chosen.features.duration.toFixed(2)}${r.wet?' ('+r.wet.features.duration.toFixed(2)+' echo)':''} |`)];
 writeFileSync(resolve(out,'cue-table.md'),table.join('\n')+'\n');console.log(table.join('\n'));
 const beds=palette.map(c=>({...c,features:renderBed(rom,c.id)}));
 const bedRows=Object.keys(NATIVE_BEDS).map(cue=>{
  const ranking=rank(cue,beds,browserFeatures(cue,{seconds:2}));
  if(writeAudio){writePcm(resolve(compare,`${cue}-browser.wav`),browserPcm(cue,{seconds:2}));writePcm(resolve(compare,`${cue}-snes.wav`),renderBedPcm(rom,NATIVE_BEDS[cue]));}
  return {cue,chosen:ranking.find(c=>c.id===NATIVE_BEDS[cue]),runner:ranking.find(c=>c.id!==NATIVE_BEDS[cue])};
 });
 writeFileSync(resolve(out,'bed-report.json'),JSON.stringify(bedRows,null,1));
 for(const r of bedRows)console.log(`| ${r.cue} (25-frame pulses) | ${label(r.chosen)} | ${r.chosen.score.toFixed(1)} | ${label(r.runner)} (${r.runner.score.toFixed(1)}) |`);
 if(writeAudio){
  writePcm(resolve(compare,'air-browser.wav'),browserPcm('air',{seconds:2}));
  writePcm(resolve(compare,'air-snes.wav'),new Float32Array(rate*2));
  writeFileSync(resolve(compare,'manifest.json'),JSON.stringify({rate,variant:'first browser variant; extra variants have numbered files',
   echo:'beam-snes uses native preset 4 (EDL 4, EVOL 64, EFB 30, FIR 0); beam-snes-dry has no echo',
   air:'continuous air is disabled; flight/landing are the boundary cues',cues:rows.map(r=>({cue:r.cue,id:r.chosen.id,voices:r.chosen.voices,dryScore:r.chosen.score,echoScore:r.wet?.score}))},null,1));
 }
 return rows;
}
if(process.argv[1]===import.meta.filename){
 if(process.argv.includes('--search'))await search();
 else report({writeAudio:process.argv.includes('--wav'),before:process.argv.find(a=>a.startsWith('--before='))?.slice(9)});
}
