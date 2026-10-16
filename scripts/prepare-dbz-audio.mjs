// Decode only the selected short effects, never entire downloaded packs.
// Usage: node scripts/prepare-dbz-audio.mjs .local/dbz-audio/source
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {snesAudio,snesAudioDescription,snesWav} from './snes-audio.mjs';
const root=process.argv[2];if(!root)throw Error('Provide the local DBZ source directory.');
const rate=snesAudio.rate,out='assets/audio/dbz';fs.mkdirSync(out,{recursive:true});
const sources={
 whoosh:['anime-whoosh/Anime_Whoosh_Sound_20_(High_Quality).ogg','https://soundeffects.fandom.com/wiki/Anime_Whoosh_Sound_20'],
 swish:['anime-whoosh/Anime_Whoosh_Sound_16.ogg','https://soundeffects.fandom.com/wiki/Anime_Whoosh_Sound_16'],
 blast:['ki-blast/goku-ki-blast-sound-effect.wav','goku/ki-blast'],
 charge:['kamehameha-charge/goku-kamehameha-charge-sound-effect.wav','goku/kamehameha-charge'],
 beam:['kamehameha-fire/goku-kamehameha-fire-sound-effect.wav','goku/kamehameha-fire'],
 teleport:['goku-instant-transmission/goku-goku-instant-transmission-sound-effect.mp3','goku/goku-instant-transmission'],
 flight:['cell-flying-turbo/cell-cell-flying-turbo-sound-effect.mp3','cell/cell-flying-turbo'],
 transform:['son-goku-power-up/Dragon Ball Son Goku Power Up Sound Effect 1.mp3','goku/son-goku-power-up'],
 revert:['son-goku-power-up/Dragon Ball Son Goku Power Up Sound Effect 3.mp3','goku/son-goku-power-up'],
 electric:['son-gohan-ssj2-electricity-aura/son-gohan-son-gohan-ssj2-electricity-aura-sound-effect.mp3','son-gohan/son-gohan-ssj2-electricity-aura'],
 punchA:['punch-fight/Dragon Ball Z Punch Sound Effect N°19.wav','dragon-ball-z-punch-fight'],
 punchB:['punch-fight/Dragon Ball Z Punch Sound Effect N°22.wav','dragon-ball-z-punch-fight'],
 punchC:['punch-fight/Dragon Ball Z Punch Sound Effect N°37.mp3','dragon-ball-z-punch-fight'],
 kick:['punch-fight/Dragon Ball Z Punch Sound Effect N°4.mp3','dragon-ball-z-punch-fight'],
};
const clips=[
 {name:'swing',source:'whoosh',start:.02,end:.29,tempo:1.25,rms:.13},
 {name:'swing-2',source:'swish',start:.02,end:.29,tempo:1.3,rms:.13},
 {name:'kick-swing',source:'whoosh',start:.01,end:.37,tempo:1.1,rms:.14},
 {name:'hit-1',source:'punchA',start:0,end:.57,rms:.19},
 {name:'hit-2',source:'punchB',start:0,end:.38,rms:.19},
 {name:'hit-3',source:'punchC',start:0,end:.40,rms:.19},
 {name:'kick',source:'kick',start:0,end:.69,rms:.2},
 {name:'blast',source:'blast',start:.085,end:.82,tempo:1.15,rms:.16},
 {name:'impact',source:'beam',start:.03,end:.63,tempo:1.25,rms:.18},
 {name:'beam',source:'beam',start:0,end:1.10,rms:.20,fade:.24},
 {name:'teleport',source:'teleport',start:0,end:.83,rms:.17},
 {name:'flight',source:'whoosh',start:.01,end:.37,rms:.15,leadIn:{source:'charge',start:1.6,end:1.82,level:.65,overlap:.025}},
 // Brake with the same air as takeoff, then touch down. Reversing Cell's
 // turbo sample made the landing sound like a spinning razor/disc.
 {name:'landing',source:'whoosh',start:.06,end:.37,highpass:90,lowpass:2400,rms:.12,fade:.11,decay:3,layers:[
  {source:'punchB',start:0,end:.18,highpass:45,lowpass:1300,level:.48,offset:.07,decay:9},
 ]},
 // Keep the full power-up eruption and its rumbling decay at the original
 // speed. The old half-second sped-up excerpt lost both the attack and tail.
 {name:'transform',source:'transform',start:.015,end:2.57,rms:.25,highpass:45,fade:.24},
 // Non-vocal energy eruption, kept separate from the transformation shout.
 // A bass impact opens into the TV charge/electricity beds, then decays.
 {name:'power-burst',source:'charge',start:1.6,end:3.15,rms:.28,highpass:45,fade:.24,decay:1.8,thump:true,layers:[
  {source:'beam',start:.03,end:.45,level:.85,decay:7},
  {source:'electric',start:5,end:6.55,level:.32,decay:2.3},
 ]},
 {name:'deflect',source:'swish',start:.02,end:.25,tempo:1.25,rms:.18,layers:[
  {source:'punchB',start:0,end:.18,level:.55,decay:8},
 ]},
 {name:'revert',source:'revert',start:.25,end:.87,tempo:1.5,reverse:true,rms:.13},
 {name:'charged',source:'electric',start:5,end:5.28,rms:.12},
 {name:'charge',source:'charge',start:1.6,end:5.15,loop:.24,rms:.20},
 {name:'aura',source:'electric',start:5,end:7.8,loop:.18,rms:.15},
 // Pure TV-anime air, not a voiced Goku power-up repeated indefinitely.
 {name:'air',source:'whoosh',start:.04,end:.35,tempo:.5,highpass:140,lowpass:2800,steady:true,loop:.12,rms:.10},
];
const sourceInfo=clip=>{
 const [file,url]=sources[clip.source],source=path.join(root,file);
 return{sourceFile:file,sourceUrl:url.startsWith('https:')?url:`https://soundsverse.com/dragon-ball-z/${url}`,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex')};
};
function decode(clip){
 const source=path.join(root,sources[clip.source][0]);
 const filters=[`atrim=start=${clip.start}:end=${clip.end}`,'asetpts=PTS-STARTPTS',`highpass=f=${clip.highpass??65}`,`lowpass=f=${clip.lowpass??snesAudio.lowpass}`];
 if(clip.tempo)filters.push(`atempo=${clip.tempo}`);if(clip.reverse)filters.push('areverse');
 const decoded=spawnSync('ffmpeg',['-v','error','-i',source,'-af',filters.join(','),'-ac','1','-ar',String(rate),'-f','f32le','-'],{maxBuffer:20*1024*1024});if(decoded.status)throw Error(decoded.stderr.toString());
 return Float32Array.from({length:decoded.stdout.length/4},(_,i)=>decoded.stdout.readFloatLE(i*4));
}
const level=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const result=[];
for(const clip of clips){
 let a=decode(clip);
 if(clip.layers){
  const gain=.22/level(a);
  a=a.map((v,i)=>v*gain*Math.exp(-i/rate*(clip.decay??0)));
  for(const layer of clip.layers){
   const b=decode(layer),gain=.22*layer.level/level(b);
   const offset=Math.round((layer.offset??0)*rate);
   for(let i=0;i<Math.min(a.length-offset,b.length);i++)a[offset+i]+=b[i]*gain*Math.exp(-i/rate*(layer.decay??0));
  }
  if(clip.thump)for(let i=0;i<a.length;i++){
   const t=i/rate,phase=2*Math.PI*(48*t+55*(1-Math.exp(-t*22))/22);
   a[i]+=.65*Math.sin(phase)*Math.exp(-t*8);
  }
 }
 if(clip.steady){
  // Even the whoosh's envelope before looping, to leave soft moving air
  // rather than a rhythmic series of new takeoffs. The source has no voice.
  const window=Math.round(rate*.035),energy=new Float64Array(a.length+1),target=level(a);
  for(let i=0;i<a.length;i++)energy[i+1]=energy[i]+a[i]*a[i];
  a=a.map((v,i)=>{const lo=Math.max(0,i-window),hi=Math.min(a.length,i+window+1),rms=Math.sqrt((energy[hi]-energy[lo])/(hi-lo));return v*Math.min(3,target/Math.max(.001,rms));});
 }
 if(clip.leadIn){
  const lead=decode(clip.leadIn),overlap=Math.round(clip.leadIn.overlap*rate),offset=lead.length-overlap;
  const joined=new Float32Array(offset+a.length),gain=level(a)/level(lead)*clip.leadIn.level;
  for(let i=0;i<lead.length;i++)joined[i]=lead[i]*gain*Math.min(1,i/(rate*.003),(lead.length-1-i)/overlap);
  for(let i=0;i<a.length;i++)joined[offset+i]+=a[i]*Math.min(1,i/overlap);
  a=joined;
 }
 if(clip.loop){
  const n=Math.round(clip.loop*rate),loop=new Float32Array(a.length-n);loop.set(a.subarray(n,a.length-n));
  for(let i=0;i<n;i++){const u=i/(n-1);loop[loop.length-n+i]=a[a.length-n+i]*Math.cos(u*Math.PI/2)+a[i]*Math.sin(u*Math.PI/2);}
  a=loop;
 }else{
  const fade=Math.round((clip.fade??Math.min(.08,a.length/rate*.2))*rate);
  for(let i=0;i<a.length;i++)a[i]*=Math.min(1,i/(rate*.003))*Math.min(1,(a.length-1-i)/fade);
 }
 const rms=Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),peak=a.reduce((s,x)=>Math.max(s,Math.abs(x)),0),gain=Math.min(clip.rms/rms,.80/peak);
 a=a.map(x=>x*gain);fs.writeFileSync(`${out}/${clip.name}.wav`,snesWav(a));
 result.push({...clip,...(clip.layers?{layers:clip.layers.map(layer=>({...layer,...sourceInfo(layer)}))}:{}),...(clip.leadIn?{leadIn:{...clip.leadIn,...sourceInfo(clip.leadIn)}}:{}),file:`${clip.name}.wav`,duration:a.length/rate,...sourceInfo(clip),gain});
}
fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({rate,bits:snesAudio.bits,credit:'Dragon Ball sound effects, selected excerpts shared by Soundsverse / Youtube Sound Effects and Soundeffects Wiki. Original sound rights remain with their owners.',processing:snesAudioDescription+' Trimmed to animation cues and level matched with headroom. Sustained beds use equal-power circular crossfades with no silence or edge fades.',clips:result},null,2)+'\n');
console.log(`Prepared ${result.length} short DBZ effects and independent looping energy beds.`);
