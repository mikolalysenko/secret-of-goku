// Round-nine listening package. Raw Mesen DAC captures (no gain, no
// normalization, no offline effects) plus PC-edition references.
//   node snes/test/audio/capture9.mjs --rom=path.sfc --tag=before|round9|charged
//   node snes/test/audio/capture9.mjs --pc --before=main.sfc
// Files and manifest.json land in .local/snes-test/audio/round9/.
import {readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {wav} from './apu.mjs';
import {extendedInfo} from './cartridge.mjs';
import {cueMetrics,musicMetrics,integrated,maxMomentary,peakDb,clippedCount} from './loudness.mjs';
const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(k,d)=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const root=join(repo,'.local/snes-test/audio/round9');mkdirSync(root,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifestPath=join(root,'manifest.json');
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath)):{round:9,
 note:'Round-nine listening package. Cartridge files are raw 32 kHz stereo Mesen DAC captures (pinned core, no gain, normalization or offline processing). PC files are the original clips and renders of engine/ki-sound.js\'s chain.',
 versions:{},files:[]};
const save=()=>writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const f2=v=>Number.isFinite(v)?+v.toFixed(2):v;
const stereo=(l,r)=>[Float64Array.from(l,v=>v/32768),Float64Array.from(r,v=>v/32768)];
if(args.includes('--guide')){
 // Cue-by-cue index for the listening page: each cue's main, round-nine
 // and PC files, the in-game takes and the activation candidate.
 const have=f=>manifest.files.some(x=>x.file===f),pick=(...f)=>f.filter(have);
 const cues=[
  ['hit','Punch hit (HIT)',['pc-mix-hit.wav','pc-mix-hit-2.wav','pc-mix-hit-3.wav'],['pc-clip-hit-1.wav','pc-clip-hit-2.wav','pc-clip-hit-3.wav']],
  ['kick','Kick (KICK)',['pc-mix-kick.wav'],['pc-clip-kick.wav']],['kick-ssj','Super Saiyan kick (KICK in SSJ; the PC uses its one kick clip)',['pc-mix-kick.wav'],['pc-clip-kick.wav']],
  ['ki','Ki fire (BLAST)',['pc-mix-ki.wav'],['pc-clip-blast.wav']],['ki-ssj','Super Saiyan ki fire',['pc-mix-ki.wav'],['pc-clip-blast.wav']],
  ['ki-contact','Ki contact (IMPACT)',['pc-mix-ki-contact.wav'],['pc-clip-impact.wav']],
  ['kamehameha-start','Kamehameha start (the charge from rest)',['pc-mix-kamehameha-start.wav'],['pc-clip-charge.wav']],
  ['kamehameha-start-ssj','Super Saiyan Kamehameha start',['pc-mix-kamehameha-start-ssj.wav'],['pc-clip-charge.wav']],
  ['kamehameha-release','Kamehameha release and sustain (BEAM)',['pc-mix-kamehameha-release.wav'],['pc-clip-beam.wav']],
  ['kamehameha-release-ssj','Super Saiyan Kamehameha release and sustain',['pc-mix-kamehameha-release.wav'],['pc-clip-beam.wav']],
 ].map(([id,title,pcMix,pcClip])=>({id,title,
  overMusic:{before:pick(`mix-${id}-before.wav`)[0],round9:pick(`mix-${id}-round9.wav`)[0],charged:pick(`mix-${id}-charged.wav`)[0],pc:pick(...pcMix)},
  alone:{before:pick(`dry-${id}-before.wav`)[0],round9:pick(`dry-${id}-round9.wav`)[0],charged:pick(`dry-${id}-charged.wav`)[0],pc:pick(...pcMix.map(f=>f.replace('pc-mix-','pc-'))),pcClip:pick(...pcClip)}}));
 const takes=['punch-string','ki-volley','kamehameha'].flatMap(t=>['base','ssj'].map(f=>({id:`game-${t}-${f}`,before:pick(`game-${t}-${f}-before.wav`)[0],round9:pick(`game-${t}-${f}-round9.wav`)[0],charged:pick(`game-${t}-${f}-charged.wav`)[0]})));
 manifest.guide={versions:{before:'main 9b91aba (round eight)',round9:'this round, default: the spring opens the Kamehameha\'s charge',charged:'candidate AUDIO_ACTIVATION=charged: the spring plays at full charge (CHARGED) instead of at the start',pc:'the PC edition: original clips and the ki-sound chain renders'},
  cues,takes,charged:{note:'PC CHARGED reference (bright 0.28 s shimmer); the in-game Kamehameha takes reach full charge',pc:pick('pc-mix-charged.wav','pc-charged.wav','pc-clip-charged.wav')}};
 save();console.log(`guide: ${cues.length} cues, ${takes.length} takes`);process.exit(0);
}
if(args.includes('--pc')){
 // PC references: the untouched clips, then the ki-sound chain (cue gain,
 // .55 master, compressor) alone and over the field song at the browser's
 // .4 native-music gain (song through an echo-less DSP, as the browser's).
 const {renderPc,pcJobs}=await import('./pc9.mjs');
 const {renderMusic}=await import('./cues9.mjs');
 const before=readFileSync(resolve(opt('before')));
 const clips=[['hit-1','Punch contact, first of three rotating clips'],['hit-2','Punch contact, second clip'],['hit-3','Punch contact, third clip'],['kick','Finishing kick'],['blast','Ki shot launch'],['impact','Ki shot contact'],['charge','Charge loop (the Kamehameha start plays its opening)'],['charged','Charge full'],['beam','Kamehameha release and wave']];
 const files=[];
 for(const [clip,desc] of clips){
  const file=`pc-clip-${clip}.wav`;copyFileSync(join(repo,`assets/audio/dbz/${clip}.wav`),join(root,file));
  files.push({file,variant:'pc',kind:'clip',description:`PC edition: ${desc}, the original 16 kHz mono clip (assets/audio/dbz/${clip}.wav)`});
 }
 const jobs=pcJobs(),music=renderMusic(before,{echo:false,seconds:12}).map(c=>c.map(v=>v*.4));
 const map={hit:['hit','Punch contact (hit-1)'],hit2:['hit-2','Punch contact (hit-2, rate 1.035)'],hit3:['hit-3','Punch contact (hit-3, rate .975)'],kick:['kick','Finishing kick'],blast:['ki','Ki shot launch'],impact:['ki-contact','Ki shot contact'],
  chargeStart:['kamehameha-start','Kamehameha start: the charge loop from rest (level/rate ramp as ki-sound.js)'],chargeStartSsj:['kamehameha-start-ssj','Super Saiyan Kamehameha start (charge and aura loops)'],charged:['charged','Charge full'],beam:['kamehameha-release','Kamehameha release and wave']};
 const names=Object.keys(map),lead=.7,rate=48000;
 const alone=await renderPc(names.map(n=>jobs[n]));
 const shifted=await renderPc(names.map(n=>({...jobs[n],seconds:jobs[n].seconds+lead,events:(jobs[n].events??[]).map(e=>({...e,at:e.at+lead})),loops:(jobs[n].loops??[]).map(l=>({...l,start:l.start+lead,stop:l.stop+lead}))})));
 const up=c=>Float64Array.from({length:Math.floor(c.length*rate/32000)},(_,i)=>{const x=i*32000/rate,j=Math.floor(x),t=x-j;return (c[j]??0)*(1-t)+(c[j+1]??0)*t;});
 const pm=[up(music[0]),up(music[1])],musicLufs=integrated(pm,rate);
 const toI=a=>Int16Array.from(a,v=>Math.round(Math.max(-1,Math.min(32767/32768,v))*32768));
 names.forEach((n,i)=>{
  const [name,desc]=map[n],[l,r]=alone[i];
  writeFileSync(join(root,`pc-${name}.wav`),wav(toI(l),toI(r),rate));
  const m=cueMetrics([l,r],rate);
  files.push({file:`pc-${name}.wav`,variant:'pc',kind:'cue',description:`PC edition: ${desc}, through the ki-sound chain (cue gain, .55 master, compressor), alone`,sampleRate:rate,peakDbFS:f2(m.peakDbFS),momentaryLufs:f2(m.momentaryLufs)});
  const [sl,sr]=shifted[i],len=sl.length,mix=[0,1].map(c=>Float64Array.from({length:len},(_,k)=>(c?sr:sl)[k]+(pm[c][k]??0)));
  writeFileSync(join(root,`pc-mix-${name}.wav`),wav(toI(mix[0]),toI(mix[1]),rate));
  files.push({file:`pc-mix-${name}.wav`,variant:'pc',kind:'mix',description:`PC edition: ${desc} over the field song at the browser's .4 native gain (echo-less DSP render), 0.7 s of music first`,sampleRate:rate,sfxToMusicLu:f2(m.momentaryLufs-musicLufs)});
 });
 manifest.versions.pc={renderer:'Chromium OfflineAudioContext, engine/ki-sound.js cue chain (snes/test/audio/pc9.mjs)',musicLufs:f2(musicLufs)};
 manifest.files=manifest.files.filter(f=>f.variant!=='pc').concat(files);save();
 console.log(`pc: ${files.length} files`);process.exit(0);
}
const rom=resolve(opt('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')),tag=opt('tag','round9');
const out=join(root,'capture-'+tag);
const bytes=readFileSync(rom),sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const label=n=>{const m=sym.match(new RegExp(`^([\\dA-F]{2}):([\\dA-F]{4}) ${n}$`,'mi'));if(!m)throw Error(n);return parseInt(m[1]+m[2],16);};
const host=join(import.meta.dirname,'capture-host.py');chmodSync(host,0o755);process.env.MESEN=host;
const pre=`CP_STOP='waterfall'\nEXTENDED=${!!extendedInfo(bytes)}\nAUDIO_FRAME=${label('audio_frame')}\nIMPORT=${JSON.stringify(join(repo,'.local/snes-import/'))}\n`;
const test=pre+readFileSync(join(repo,'snes/test/checkpoints.lua'),'utf8')+'\n'+readFileSync(join(repo,'snes/test/world/lib.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'capture9.lua'),'utf8');
const copy=privateRom(rom,'capture9-'+tag);let run;
try{run=await runMesen({rom:copy,test,outDir:out,timeoutMs:900000});}finally{cleanupRom(copy);}
if(run.code!==0||!run.results?.captured)throw Error(JSON.stringify(run.results??run.output).slice(-3000));
const files=[];
for(const f of run.results.files){
 const pcm=readFileSync(join(out,f.name+'.pcm')),n=pcm.length/4,l=new Int16Array(n),r=new Int16Array(n);
 for(let i=0;i<n;i++){l[i]=pcm.readInt16LE(i*4);r[i]=pcm.readInt16LE(i*4+2);}
 const file=f.name+'-'+tag+'.wav',data=wav(l,r),x=stereo(l,r);writeFileSync(join(root,file),data);
 const entry={file,description:f.description,variant:tag,kind:f.name.split('-')[0],bank:f.bank,songVolume:f.songVolume,samples:n,seconds:+(n/32000).toFixed(3),sampleRate:32000,channels:2,
  sha256:hash(data),peakDbFS:f2(peakDb(x)),clipped:clippedCount(x),momentaryLufs:f2(maxMomentary(x,32000).lufs)};
 // Mix takes start with 0.7 s of the song alone: a rough in-capture ratio.
 if(f.name.startsWith('mix-')){const k=Math.round(.62*32000),music=x.map(c=>c.slice(0,k)),cue=x.map(c=>c.slice(k));
  entry.musicLufs=f2(integrated(music,32000));entry.sfxToMusicLu=f2(maxMomentary(cue,32000).lufs-entry.musicLufs);}
 files.push(entry);
}
manifest.versions[tag]={rom,romSha256:hash(bytes),commandTrace:`capture-${tag}/results.json`,contacts:run.results.contacts};
manifest.files=manifest.files.filter(f=>f.variant!==tag).concat(files);save();
console.log(`${tag}: ${files.length} WAVs, ${files.reduce((s,f)=>s+f.clipped,0)} clipped samples, contacts ${JSON.stringify(run.results.contacts)}`);
