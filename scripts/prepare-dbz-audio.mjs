// Decode only the selected short effects, never entire downloaded packs.
// Usage: node scripts/prepare-dbz-audio.mjs .local/dbz-audio/source
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=process.argv[2];if(!root)throw Error('Provide the local DBZ source directory.');
const rate=32000,out='assets/audio/dbz';fs.mkdirSync(out,{recursive:true});
const sources={
 blast:['ki-blast/goku-ki-blast-sound-effect.wav','goku/ki-blast'],
 charge:['kamehameha-charge/goku-kamehameha-charge-sound-effect.wav','goku/kamehameha-charge'],
 beam:['kamehameha-fire/goku-kamehameha-fire-sound-effect.wav','goku/kamehameha-fire'],
 teleport:['goku-instant-transmission/goku-goku-instant-transmission-sound-effect.mp3','goku/goku-instant-transmission'],
 flight:['cell-flying-turbo/cell-cell-flying-turbo-sound-effect.mp3','cell/cell-flying-turbo'],
 power:['son-goku-power-up/Dragon Ball Son Goku Power Up Sound Effect 1.mp3','goku/son-goku-power-up'],
 transform:['son-goku-power-up/Dragon Ball Son Goku Power Up Sound Effect 3.mp3','goku/son-goku-power-up'],
 electric:['son-gohan-ssj2-electricity-aura/son-gohan-son-gohan-ssj2-electricity-aura-sound-effect.mp3','son-gohan/son-gohan-ssj2-electricity-aura'],
 punchA:['punch-fight/Dragon Ball Z Punch Sound Effect N°19.wav','dragon-ball-z-punch-fight'],
 punchB:['punch-fight/Dragon Ball Z Punch Sound Effect N°22.wav','dragon-ball-z-punch-fight'],
 punchC:['punch-fight/Dragon Ball Z Punch Sound Effect N°37.mp3','dragon-ball-z-punch-fight'],
 kick:['punch-fight/Dragon Ball Z Punch Sound Effect N°4.mp3','dragon-ball-z-punch-fight'],
};
const clips=[
 {name:'swing',source:'flight',start:.76,end:1.29,tempo:2.4,rms:.13},
 {name:'hit-1',source:'punchA',start:0,end:.57,rms:.19},
 {name:'hit-2',source:'punchB',start:0,end:.38,rms:.19},
 {name:'hit-3',source:'punchC',start:0,end:.40,rms:.19},
 {name:'kick',source:'kick',start:0,end:.69,rms:.2},
 {name:'blast',source:'blast',start:.085,end:.82,tempo:1.15,rms:.16},
 {name:'impact',source:'beam',start:.03,end:.63,tempo:1.25,rms:.18},
 {name:'beam',source:'beam',start:0,end:1.10,rms:.20,fade:.24},
 {name:'teleport',source:'teleport',start:0,end:.83,rms:.17},
 {name:'flight',source:'flight',start:.73,end:1.32,tempo:1.3,rms:.16},
 {name:'landing',source:'flight',start:.86,end:1.30,tempo:1.6,reverse:true,rms:.12},
 {name:'transform',source:'transform',start:.18,end:.89,tempo:1.2,rms:.20},
 {name:'revert',source:'transform',start:.25,end:.87,tempo:1.5,reverse:true,rms:.13},
 {name:'charged',source:'electric',start:5,end:5.28,rms:.12},
 {name:'charge',source:'charge',start:1.6,end:5.15,loop:.24,rms:.20},
 {name:'aura',source:'electric',start:5,end:7.8,loop:.18,rms:.15},
 {name:'air',source:'power',start:.70,end:2.30,loop:.20,rms:.16},
];
function wav(samples){
 const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
 samples.forEach((x,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));return b;
}
const result=[];
for(const clip of clips){
 const [file,url]=sources[clip.source],source=path.join(root,file);
 const filters=[`atrim=start=${clip.start}:end=${clip.end}`,'asetpts=PTS-STARTPTS','highpass=f=65','lowpass=f=10000'];
 if(clip.tempo)filters.push(`atempo=${clip.tempo}`);if(clip.reverse)filters.push('areverse');
 const decoded=spawnSync('ffmpeg',['-v','error','-i',source,'-af',filters.join(','),'-ac','1','-ar',String(rate),'-f','f32le','-'],{maxBuffer:20*1024*1024});if(decoded.status)throw Error(decoded.stderr.toString());
 let a=Float32Array.from({length:decoded.stdout.length/4},(_,i)=>decoded.stdout.readFloatLE(i*4));
 if(clip.loop){
  const n=Math.round(clip.loop*rate),loop=new Float32Array(a.length-n);loop.set(a.subarray(n,a.length-n));
  for(let i=0;i<n;i++){const u=i/(n-1);loop[loop.length-n+i]=a[a.length-n+i]*Math.cos(u*Math.PI/2)+a[i]*Math.sin(u*Math.PI/2);}
  a=loop;
 }else{
  const fade=Math.round((clip.fade??Math.min(.08,a.length/rate*.2))*rate);
  for(let i=0;i<a.length;i++)a[i]*=Math.min(1,i/(rate*.003))*Math.min(1,(a.length-1-i)/fade);
 }
 const rms=Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),peak=a.reduce((s,x)=>Math.max(s,Math.abs(x)),0),gain=Math.min(clip.rms/rms,.80/peak);
 a=a.map(x=>x*gain);fs.writeFileSync(`${out}/${clip.name}.wav`,wav(a));
 result.push({...clip,file:`${clip.name}.wav`,duration:a.length/rate,sourceFile:file,sourceUrl:`https://soundsverse.com/dragon-ball-z/${url}`,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),gain});
}
fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({rate,credit:'Dragon Ball sound effects, selected excerpts shared by Soundsverse / Youtube Sound Effects. Original sound rights remain with their owners.',processing:'Mono PCM; high/low pass; trimmed to animation cues; level matched with headroom. Sustained beds use equal-power circular crossfades with no silence or edge fades.',clips:result},null,2)+'\n');
console.log(`Prepared ${result.length} short DBZ effects and independent looping energy beds.`);
