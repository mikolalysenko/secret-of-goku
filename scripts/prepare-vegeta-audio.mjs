// Keep original recordings local; ship only the two short prepared excerpts.
// node scripts/prepare-vegeta-audio.mjs FINAL_FLASH_MP3 VEGETA_35880_MP3
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {snesWav,snesAudio,snesAudioDescription} from './snes-audio.mjs';

const [finalFlash,kakarot]=process.argv.slice(2);
if(!finalFlash||!kakarot)throw Error('Provide the Japanese Final Flash and Vegeta(35880) source recordings.');
const clips=[
 {name:'vegeta-final-flash',source:finalFlash,start:.06,end:2.75,tempo:1,rms:.22,
  sourceUrl:'https://www.myinstants.com/en/instant/vegeta-final-flash/',
  downloadUrl:'https://www.myinstants.com/media/sounds/vegeta-final-flash.mp3',
  text:'ファイナルフラッシュ！',credit:'Vegeta’s original Japanese Final Flash against Cell, Dragon Ball Z; short recording shared on Myinstants.'},
 {name:'vegeta-kakarot',source:kakarot,start:1.82,end:2.50,tempo:.85,rms:.22,
  sourceUrl:'https://www.101soundboards.com/sounds/59071971-base-form-main-voice-files-vegeta35880-jie-zhao-wotsukeruzo-kakarotsuto',
  downloadUrl:'https://hoovers.101soundboards.com/sb/board_sounds/nlebvbvj.mp3',
  text:'カカロット！',credit:'Japanese Vegeta, Dragon Ball Z: Budokai Tenkaichi 3 (PlayStation 2), Base form/Main Voice Files/Vegeta(35880).wav. Shared by 101soundboards from The Sounds Resource.',
  originalListing:'https://sounds.spriters-resource.com/playstation_2/dragonballzbudokaitenkaichi3/asset/425588/'},
];
for(const c of clips){
 const filters=[`atrim=start=${c.start}:end=${c.end}`,'asetpts=PTS-STARTPTS','highpass=f=85',`lowpass=f=${snesAudio.lowpass}`,
  'equalizer=f=210:t=q:w=.8:g=2','acompressor=threshold=.14:ratio=2:attack=12:release=130',`atempo=${c.tempo}`];
 const result=spawnSync('ffmpeg',['-v','error','-i',c.source,'-af',filters.join(','),'-ac','1','-ar',String(snesAudio.rate),'-f','f32le','-'],{maxBuffer:4e6});
 if(result.error||result.status)throw result.error??Error(result.stderr.toString());
 const pcm=Float32Array.from({length:result.stdout.length/4},(_,i)=>result.stdout.readFloatLE(i*4));
 const rms=Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length),peak=pcm.reduce((max,x)=>Math.max(max,Math.abs(x)),0);
 if(!pcm.length||!Number.isFinite(rms)||rms===0)throw Error(`Empty or silent source: ${c.name}`);
 const gain=Math.min(c.rms/rms,.75/peak);
 for(let i=0;i<pcm.length;i++)pcm[i]*=gain*Math.min(1,i/(snesAudio.rate*.012),(pcm.length-1-i)/(snesAudio.rate*.06));
 fs.writeFileSync(`assets/audio/dbz/${c.name}.wav`,snesWav(pcm));
 c.file=`${c.name}.wav`;c.sourceFile=path.basename(c.source);c.sha256=createHash('sha256').update(fs.readFileSync(c.source)).digest('hex');
 c.duration=pcm.length/snesAudio.rate;c.gain=gain;delete c.source;
}
fs.writeFileSync('assets/audio/dbz/vegeta.json',JSON.stringify({rate:snesAudio.rate,bits:snesAudio.bits,processing:snesAudioDescription,
 adaptation:'Short Japanese voice excerpts, 85 Hz high-pass, 210 Hz presence EQ, compression, pitch-preserving tempo, level matching and 12/60 ms edge fades. Final Flash retains its brief energy tail; Kakarotto is isolated from the end of Vegeta’s challenge.',
 credit:'Original Dragon Ball performances and game audio retain their respective rights; not covered by the project code license.',clips},null,2)+'\n');
