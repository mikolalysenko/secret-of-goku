// Local sources only; records provenance and applies the same sample-bank
// treatment as the rest of the mod. Does not download or publish source packs.
// node scripts/prepare-frieza-audio.mjs LAUGH_MP3 CLASSIC_PACK_DIRECTORY
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {snesWav,snesAudio,snesAudioDescription} from './snes-audio.mjs';
const [laugh,pack]=process.argv.slice(2);if(!laugh||!pack)throw Error('Provide laugh file and classic effects directory.');
const clips=[
 {name:'frieza-laugh',source:laugh,start:.06,end:4.50,rms:.16,sourceUrl:'https://www.myinstants.com/en/instant/frieza-ohohohohoh-46566/'},
 {name:'frieza-orb',source:path.join(pack,'friezadeathball.wav'),start:0,end:1.028,rms:.20,sourceUrl:'https://staredit.net/sc1db/file/1158/'},
 {name:'frieza-disc',source:'assets/audio/dbz/blast.wav',start:0,end:.58,rms:.17,sourceUrl:'https://soundsverse.com/dragon-ball-z/goku/ki-blast',filter:'asetrate=20000,aresample=16000,highpass=f=650,lowpass=f=5600,tremolo=f=28:d=0.65,afade=t=out:st=0.40:d=0.18,atrim=end=0.58',processing:'Voice-free ki effect: pitch raised 25%, 650 Hz high-pass, 28 Hz tremolo, 180 ms fade. Same mono 16 kHz / 10-bit bank treatment.'},
];
for(const c of clips){
 const result=spawnSync('ffmpeg',['-v','error','-i',c.source,'-af',c.filter??`atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS,highpass=f=90,lowpass=f=${snesAudio.lowpass}`,'-ac','1','-ar',String(snesAudio.rate),'-f','f32le','-'],{maxBuffer:4e6});if(result.status)throw Error(result.stderr.toString());
 const pcm=Float32Array.from({length:result.stdout.length/4},(_,i)=>result.stdout.readFloatLE(i*4));
 const rms=Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length),peak=pcm.reduce((max,x)=>Math.max(max,Math.abs(x)),0),gain=Math.min(c.rms/rms,(c.filter ? .7 : .75)/peak);
 for(let i=0;i<pcm.length;i++)pcm[i]*=gain*(c.filter?1:Math.min(1,i/(snesAudio.rate*.004),(pcm.length-1-i)/(snesAudio.rate*.04)));
 fs.writeFileSync(`assets/audio/dbz/${c.name}.wav`,snesWav(pcm));
 c.file=`${c.name}.wav`;c.sourceFile=c.filter?c.source:path.basename(c.source);c.sha256=createHash('sha256').update(fs.readFileSync(c.source)).digest('hex');c.duration=pcm.length/snesAudio.rate;c.gain=gain;delete c.source;delete c.filter;
}
fs.writeFileSync('assets/audio/dbz/frieza.json',JSON.stringify({processing:snesAudioDescription,credit:'Short Dragon Ball audio excerpts. Original rights remain with their owners.',clips},null,2)+'\n');
