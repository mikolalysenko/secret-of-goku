// Input is the separated vocal stem; the original stays outside the build.
// Usage: node scripts/prepare-kamehameha-audio.mjs /path/to/vocals.wav /path/to/original.mp3
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import {createHash} from 'node:crypto';
const source=process.argv[2],original=process.argv[3];if(!source||!original)throw Error('Provide the Japanese vocal stem and original recording paths.');
const edits=[{name:'charge',start:.03,end:3.10,tempo:.82},{name:'release',start:3.10,end:5.45,tempo:.94}];
for(const e of edits){
 const duration=(e.end-e.start)/e.tempo;
 const filters=[`atrim=start=${e.start}:end=${e.end}`,'asetpts=PTS-STARTPTS','highpass=f=85','lowpass=f=6500','equalizer=f=210:t=q:w=.8:g=2','acompressor=threshold=.14:ratio=2:attack=12:release=130',`atempo=${e.tempo}`,'alimiter=limit=.78:level=false',`afade=t=in:d=0.018`,`afade=t=out:st=${duration-.085}:d=0.085`];
 const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-af',filters.join(','),'-ar','44100','-ac','1','-c:a','pcm_s16le',`assets/audio/kamehameha-${e.name}.wav`],{stdio:'inherit'});if(run.status)process.exit(run.status);
}
fs.writeFileSync('assets/audio/kamehameha-jp.json',JSON.stringify({source:'https://www.tonosfrikis.com/melodias/movil/son_goku_kame_hame_ha_original_944.html',title:'Son Goku - Kame Hame Ha [Original]',credit:'Japanese Dragon Ball performance; excerpt shared by Carlos on TonosFrikis (2014-06-05).',sha256:createHash('sha256').update(fs.readFileSync(original)).digest('hex'),vocalStemSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),separation:'Demucs htdemucs --two-stems=vocals; voice isolated from the original mixed recording. Some residual effects may remain in the learned vocal stem.',adaptation:'Continuous dramatic charge, followed by a separately triggered release. Natural vowels retained; pitch-preserving slowdown, EQ/compression and edge fades. Charge delivery has the same pace in both forms. Energy is supplied by a separate looping DBZ effect, not the voice file.',edits},null,2)+'\n');
