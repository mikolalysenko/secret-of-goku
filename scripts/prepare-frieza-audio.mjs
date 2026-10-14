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
 {name:'frieza-disc',source:path.join(pack,'krillindestructodisc.wav'),start:0,end:1.042,rms:.17,sourceUrl:'https://staredit.net/sc1db/file/1158/'},
];
for(const c of clips){
 const result=spawnSync('ffmpeg',['-v','error','-i',c.source,'-af',`atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS,highpass=f=90,lowpass=f=${snesAudio.lowpass}`,'-ac','1','-ar',String(snesAudio.rate),'-f','f32le','-'],{maxBuffer:4e6});if(result.status)throw Error(result.stderr.toString());
 const pcm=Float32Array.from({length:result.stdout.length/4},(_,i)=>result.stdout.readFloatLE(i*4));
 const rms=Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length),peak=pcm.reduce((max,x)=>Math.max(max,Math.abs(x)),0),gain=Math.min(c.rms/rms,.75/peak);
 for(let i=0;i<pcm.length;i++)pcm[i]*=gain*Math.min(1,i/(snesAudio.rate*.004),(pcm.length-1-i)/(snesAudio.rate*.04));
 fs.writeFileSync(`assets/audio/dbz/${c.name}.wav`,snesWav(pcm));
 c.file=`${c.name}.wav`;c.sourceFile=path.basename(c.source);c.sha256=createHash('sha256').update(fs.readFileSync(c.source)).digest('hex');c.duration=pcm.length/snesAudio.rate;c.gain=gain;delete c.source;
}
fs.writeFileSync('assets/audio/dbz/frieza.json',JSON.stringify({processing:snesAudioDescription,credit:'Short Dragon Ball audio excerpts. Original rights remain with their owners.',clips},null,2)+'\n');
