// Reproducible effect audition: real SoM sequencer + S-DSP versus the browser
// WAVs at their authored playback rates/gains. All recordings stay in .local.
// node snes/test/audio/effects.mjs [--search] [--wav]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApu,loadRom,driverChunks,wav} from './apu.mjs';
import {readWav,resample} from '../../gen/audio-brr.mjs';
import {octaveBands} from './songs.mjs';
import {cues} from '../../../engine/ki-sound.js';
import {SHOTS} from '../../gen/audio.mjs';
import {NATIVE_IDS,RESIDENT} from '../../gen/audio-resident.mjs';

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
export function renderEffect(rom,id,{sequence,limit=4000}={}){
 const h=createApu({rom,extension:false});h.ms(60);h.take();
 if(sequence){h.ram.set(sequence,0x2F80);h.ram.set([0x80,0x2F,0,0],0x2F70);id=0xDC;}
 h.nativeCmd(2,id,15,0x88);
 let voices=0,seen=false,ended=false,ms=0;
 for(;ms<limit;ms+=10){
  h.ms(10);const mask=h.ram[0xAE];voices=Math.max(voices,mask.toString(2).replaceAll('0','').length);
  if(mask)seen=true;else if(seen){ended=true;h.ms(100);break;}
 }
 const {l,r}=h.take(),pcm=Float32Array.from(l,(v,i)=>(v+r[i])/65536);
 return {pcm,voices,ended,ms,features:features(pcm)};
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
export function browserFeatures(name){
 const c=cues[name];return c.clips.map(clip=>{
  const a=readWav(readFileSync(resolve(root,`assets/audio/dbz/${clip}.wav`)));
  return features(resample(a.pcm,a.rate*(c.rate??1),rate).map(v=>v*c.gain*.55));
 });
}
export function rank(name,candidates){
 const refs=browserFeatures(name);
 return candidates.filter(c=>c.ended&&c.voices===1&&c.features.duration>.02).map(c=>({...c,
  score:mean(refs.map(r=>distance(c.features,r).score))})).sort((a,b)=>b.score-a.score);
}
export async function search(){
 mkdirSync(out,{recursive:true});const rom=loadRom(),ram=new Uint8Array(65536);
 for(const c of driverChunks(rom))ram.set(c.bytes,c.addr);
 const candidates=[],audit=[];
 const add=(name,id,sequence,eligible=true)=>{
  const r=renderEffect(rom,id,{sequence});
  const {pcm,...v}=r;audit.push({name,id,sequence,eligible,...v});
  if(eligible&&r.ended&&r.voices===1)candidates.push({name,id,sequence,...v});
 };
 for(let id=0;id<0xDC;id++){
  const at=0x2C00+id*4,p=ram[at]|ram[at+1]<<8,q=ram[at+2]|ram[at+3]<<8;
  if(p||q)add(`native-${id.toString(16).padStart(2,'0')}`,id,undefined,safeSequence(ram,p)&&safeSequence(ram,q));
 }
 console.log(`Measured ${candidates.length} safe single-voice retail effects`);
 // Short loop-free sweeps and decays from boot instruments. A 4-byte effect
 // pointer plus 11-14 sequence bytes fits eight or nine of these in $90 B.
 for(const ins of [0,1,3,5,8,9])for(const oct of [2,4,6,7])for(const [ticks,note] of [[12,0x55],[24,0x53],[48,0x50],[96,0x4D],[144,0x4C],[192,0x4B],[264,0x4B]])for(const slide of [0x0C,0x40,0xDC])for(const decay of [true,false]){
  const t=Math.min(255,ticks),seq=[0xD2,0xC0,0xEA,ins,0xE4,oct,0xD6,t,slide,...(decay?[0xD3,t,0]:[]),note,...(ticks>255?[0xB8]:[]),0xF2];
  add(`synth-${ins}-${oct}-${ticks}-${slide}${decay?'':'-hold'}`,0xDC,seq);
 }
 writeFileSync(resolve(out,'audit.json'),JSON.stringify(audit));
 writeFileSync(resolve(out,'candidates.json'),JSON.stringify(candidates));
 const ranks=Object.fromEntries(SHOTS.slice(0,27).map(n=>[n,rank(n,candidates).slice(0,12)]));
 writeFileSync(resolve(out,'search.json'),JSON.stringify(ranks,null,1));
 for(const [name,r] of Object.entries(ranks))console.log(name,r.slice(0,4).map(c=>`${c.name}:${c.score.toFixed(1)}`).join(' '));
 return candidates;
}
export function report({writeAudio=false}={}){
 mkdirSync(out,{recursive:true});
 const rom=readFileSync(process.env.SNES_ROM??resolve(root,'dist/snes/secret-of-goku.sfc'));
 const palette=[...new Set(NATIVE_IDS.slice(1,28))].map(id=>{
  const {pcm,...r}=renderEffect(rom,id);
  if(writeAudio){const p=Int16Array.from(pcm,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768))));writeFileSync(resolve(out,`effect-${id.toString(16)}.wav`),wav(p,p));}
  return {id,name:RESIDENT.find(x=>x.id===id)?.name??'retail',...r};
 });
 const rows=SHOTS.slice(0,27).map((name,i)=>{
  const ranking=rank(name,palette),chosen=ranking.find(c=>c.id===NATIVE_IDS[i+1]);
  const runner=ranking.find(c=>c.id!==chosen.id);
  return {cue:name,chosen,runner};
 });
 writeFileSync(resolve(out,'cue-report.json'),JSON.stringify(rows,null,1));
 const label=c=>`$${c.id.toString(16).toUpperCase().padStart(2,'0')} ${c.name}`;
 const table=['| Cue | Effect | Score | Alternative (score) |','| --- | --- | ---: | --- |',...rows.map(r=>`| ${r.cue} | ${label(r.chosen)} | ${r.chosen.score.toFixed(1)} | ${label(r.runner)} (${r.runner.score.toFixed(1)}) |`)];
 writeFileSync(resolve(out,'cue-table.md'),table.join('\n')+'\n');
 console.log(table.join('\n'));
 return rows;
}
if(process.argv[1]===import.meta.filename){
 if(process.argv.includes('--search'))await search();
 else report({writeAudio:process.argv.includes('--wav')});
}
