// Index private round-eight auditions and measured load/presence tables.
// All inputs are cartridge captures or runner results; no audio normalization.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {buildResident7} from '../../gen/audio-resident7.mjs';
import {buildExtended8} from '../../gen/audio-extended8.mjs';
import {readWav} from '../../gen/audio-brr.mjs';
const root=resolve('.local/snes-test/audio'),work=join(root,'round8'),out=join(root,'compare8');
const read=p=>JSON.parse(readFileSync(p)),json=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
const before=read(join(work,'before/audio/loads/results.json')),after=read(join(work,'final/loads/results.json'));
const bootBefore=read(join(work,'before/audio/loads-boot/results.json')),bootAfter=read(join(work,'final/loads-boot/results.json'));
function timings(a,b){return Object.keys(b).filter(k=>k.endsWith('_stall_frames')).sort().map(k=>({load:k.replace('_stall_frames',''),before:a[k],after:b[k],delta:b[k]-a[k]}));}
const rows=timings(before,after),boot=timings(bootBefore,bootAfter);
const route=timings(read(join(work,'routes-before/loads/results.json')),read(join(work,'routes-shipping/loads/results.json'))).sort((a,b)=>Number(a.load.split('_step_')[1])-Number(b.load.split('_step_')[1]));
const stats=rs=>({meanBefore:rs.reduce((s,r)=>s+r.before,0)/rs.length,meanAfter:rs.reduce((s,r)=>s+r.after,0)/rs.length,worstAdded:rs.reduce((a,b)=>a.delta>b.delta?a:b),best:rs.reduce((a,b)=>a.delta<b.delta?a:b)});
const known={4:'Retail boss / Danger',0x12:'Potos / town fixtures',0x1B:'Palace / Thanatos fixtures',0x1C:'Rabite field / sword / Sandship fixtures',0x26:'Mana Fortress fixture',0x3B:'Frieza arrival',0x3C:'Frieza battle',0x3D:'Orbit',0x3E:'Vegeta',0x3F:'Full power'};
const presence=Array.from({length:64},(_,id)=>{const tag='load_'+id.toString(16).toUpperCase().padStart(2,'0'),s=after[tag+'_extended'];return {id,hex:'$'+id.toString(16).toUpperCase().padStart(2,'0'),context:known[id]??'Retail song',...s,present:!!s.base,echo:after[tag+'_echo_values']};});
const c=buildResident7(),e=buildExtended8(c);
// Whole-source Fourier energy above each resampler cutoff. This describes
// the bandwidth/storage trade, not perceptual similarity or BRR codec error.
const source=readWav(readFileSync('assets/audio/dbz/teleport.wav'));
let size=1;while(size<source.pcm.length)size*=2;
const re=new Float64Array(size),im=new Float64Array(size);re.set(source.pcm);
for(let i=1,j=0;i<size;i++){let b=size>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
for(let n=2;n<=size;n*=2)for(let i=0;i<size;i+=n)for(let j=0;j<n/2;j++){
 const phase=-2*Math.PI*j/n,cos=Math.cos(phase),sin=Math.sin(phase),a=i+j,b=a+n/2;
 const x=re[b]*cos-im[b]*sin,y=re[b]*sin+im[b]*cos;
 re[b]=re[a]-x;im[b]=im[a]-y;re[a]+=x;im[a]+=y;
}
const energy=Array.from({length:size/2+1},(_,i)=>re[i]**2+im[i]**2),total=energy.reduce((a,b)=>a+b,0);
const rates=[8000,10000,12000,16000].map(rate=>{
 const brrBytes=Math.ceil(source.pcm.length/source.rate*rate/16)*9;
 const reserve=Math.ceil((e.used-e.teleport.bytes+brrBytes)/256)*256;
 return {rate,brrBytes,bankReserve:reserve,eligibleSongs:presence.filter(p=>p.free>reserve).length,cutoffHz:rate*.47,sourceEnergyAboveCutoffPercent:100*energy.reduce((s,v,i)=>s+(i*source.rate/size>rate*.47?v:0),0)/total};
});
json('teleport-rates.json',{sourceRate:source.rate,sourceFrames:source.pcm.length,seconds:source.pcm.length/source.rate,selectedRate:10000,note:'Whole-clip zero-padded FFT, no window. Band energy is diagnostic, not an audibility threshold. Eligibility ignores incoming cache history.',rates});
json('song-presence.json',{rule:'The optional bank must fit below the actual echo ceiling without evicting any still-valid cached music sample. Eligibility is the current song alone; actual admission/retention also depends on cache history. The table is the canonical 00..3F pass, not a permanent song whitelist.',reserve:e.reserve,eligible:presence.filter(p=>p.eligible).length,present:presence.filter(p=>p.present).length,songs:presence});
json('load-timing.json',{unit:'NTSC frames, including fractions. CPU dispatcher stall; optional sample payload adds zero synchronous bytes. Positive deltas include changed cache history and planning/pointer overhead; they are not hidden by the mean.',canonical:{stats:stats(rows),rows},powerOn:{stats:stats(boot),rows:boot},commonRoute:{stats:stats(route),rows:route}});
json('bank-budget.json',{permanent:{reserve:c.reserve,used:c.used,brrBytes:c.sampleBytes,codeBytes:c.codeBytes,sharedBytes:c.layout.used,sharedCapacity:c.layout.capacity},optional:{reserve:e.reserve,payload:e.bytes.length,used:e.used,beam:e.beam,teleport:e.teleport},echoChangeFromRound7:0});
const table=['# Round eight: song presence and measured stalls','', 'Canonical echo presets, consecutive 00..3F pass. Eligible means the song alone leaves room. Admitted means its incoming cache also leaves room; compact cues remain active until idle prefetch completes. All five arrangements use the compact sounds. No echo parameters change from round seven.','', '| Song | Context | Free bytes | Eligible | Admitted in this pass | Before frames | After frames | Change |','| --- | --- | ---: | --- | --- | ---: | ---: | ---: |'];
for(const [i,p] of presence.entries()){const r=rows[i];table.push(`| ${p.hex} | ${p.context} | ${p.free} | ${p.eligible?'Yes':'No'} | ${p.present?'Yes':'Compact'} | ${r.before.toFixed(3)} | ${r.after.toFixed(3)} | ${r.delta.toFixed(3)} |`);}
table.push('','## Common field / town / boss / arrangement route','','| Load | Before frames | After frames | Change |','| --- | ---: | ---: | ---: |');
for(const r of route)table.push(`| ${r.load} | ${r.before.toFixed(3)} | ${r.after.toFixed(3)} | ${r.delta.toFixed(3)} |`);
writeFileSync(join(out,'tables.md'),table.join('\n')+'\n');
const manifest=read(join(out,'manifest.json'));
manifest.notes=['Rupture is the shipping default; arc and storm are alternate cartridge builds with half a dB of additional contact headroom and a lower wave command level.','Raw Mesen stereo DAC captures; no post-render gain, limiter or normalization.','The optional bank is resident data, not playback streaming. Compact fallback is immediately available.','Common arrangement loads are compared in load-timing.json; cache-history regressions are listed as well.','Real melee places the player once beside a live enemy, then uses normal controller input and AI. Every version must record an actual HIT command.'];
manifest.artifacts=[{file:'song-presence.json',description:'All 64 canonical songs: free bytes, theoretical eligibility, observed admission and echo parameters.'},{file:'load-timing.json',description:'Before/after CPU stall timings for 64 consecutive loads, 192 power-on/preset loads, and the 15-change common route.'},{file:'bank-budget.json',description:'Permanent and optional sample/code/sequence byte budgets.'},{file:'teleport-rates.json',description:'Full teleport rate alternatives: bandwidth, BRR cost and theoretical song coverage.'},{file:'tables.md',description:'Readable song-presence and common-route timing tables.'}];
const file='pc-teleport-full.wav';copyFileSync('assets/audio/dbz/teleport.wav',join(out,file));const data=readFileSync(join(out,file));
manifest.files=manifest.files.filter(f=>f.file!==file);manifest.files.push({file,variant:'source',description:'Whole original 0.83-second teleport source, unprocessed; used to verify the extended tail.',sampleRate:source.rate,samples:source.pcm.length,seconds:source.pcm.length/source.rate,sha256:createHash('sha256').update(data).digest('hex')});
manifest.validation={};for(const [name,path] of [['audio','final/summary.json'],['gameplay','shipping-gameplay/summary.json'],['combat','shipping-combat.json'],['emulators','shipping-emulators.json']])if(existsSync(join(work,path))){
 const data=read(join(work,path));
 manifest.validation[name]=name==='gameplay'?data.map(r=>({name:r.name,pass:r.pass,cpuMisses:r.misses.length,videoFrames:r.videoFrames})):data;
}
for(const [name,description] of [['shipping-perf.log','All six perf scenes, original versus shipping cartridge.'],['shipping-modprof.log','Per-module CPU measurements from perf states.'],['arc-tests.log','Fifteen alternate-design headroom, voice and bank checks (arc).'],['storm-tests.log','Fifteen alternate-design headroom, voice and bank checks (storm).'],['final-audio.log','Full audio-suite outcome, including 53 Node/SPC tests and all cartridge cases.']]){
 copyFileSync(join(work,name),join(out,name));manifest.artifacts.push({file:name,description});
}
const measurements=[];
for(const f of manifest.files.filter(f=>f.variant==='rupture')){
 const b=manifest.files.find(b=>b.variant==='before'&&b.file===f.file.replace(/-rupture\.wav$/,'-before.wav'));
 if(b)measurements.push({sound:f.file.replace(/-rupture\.wav$/,''),before:b.file,after:f.file,peakDbFS:{before:b.peakDbFS,after:f.peakDbFS},wholeTakeRmsDbFS:{before:b.rmsDbFS,after:f.rmsDbFS},clipped:{before:b.clipped,after:f.clipped},bank:f.bank});
}
json('mix-measurements.json',{note:'Unnormalized raw stereo DAC. RMS includes music and silence; compare matched takes, not unrelated durations. No psychoacoustic loudness claim.',measurements});
manifest.artifacts.push({file:'mix-measurements.json',description:'Matched take peaks, whole-take RMS and clipped samples; includes real fights and rapid overlapping contacts.'});
const listen=['# Round eight listening','',
 'Rupture is the default: the most low-body weight. Arc exposes more whine; storm emphasizes broadband roar. These are raw cartridge recordings with no normalization.',
 '', 'Start with the real melee and wave fights, then compare the isolated sounds. Real melee begins beside a live enemy and uses normal input/AI; every take contains a punch contact.',
 '', '| Sound | Before | Rupture | Arc | Storm |', '| --- | --- | --- | --- | --- |'];
const candidates=manifest.files.filter(f=>f.variant==='arc').map(f=>f.file.replace(/-arc\.wav$/,''));
const ordered=[...candidates.filter(n=>n.startsWith('fight-')),...candidates.filter(n=>!n.startsWith('fight-'))];
for(const stem of ordered)listen.push(`| ${stem} | ${['before','rupture','arc','storm'].map(t=>`[${t}](${stem}-${t}.wav)`).join(' | ')} |`);
listen.push('','## Other changed cues and mixes','','| Sound | Before | Default |','| --- | --- | --- |');
for(const r of measurements.filter(r=>!candidates.includes(r.sound)))listen.push(`| ${r.sound} | [before](${r.before}) | [rupture](${r.after}) |`);
listen.push('','[Whole teleport source](pc-teleport-full.wav) · [Song presence and timings](tables.md) · [Full index and measurements](manifest.json)','');
writeFileSync(join(out,'listen.md'),listen.join('\n'));
manifest.artifacts.push({file:'listen.md',description:'Clickable candidate auditions and all before/default pairs.'});
for(const [tag,v] of Object.entries(manifest.versions)){
 manifest.artifacts.push({file:v.manifest,description:`${tag}: source ROM hash and per-take DAC measurements.`});
 manifest.artifacts.push({file:v.commandTrace,description:`${tag}: cartridge effect-command trace and bank state at every take.`});
}
for(const f of manifest.artifacts)f.sha256=createHash('sha256').update(readFileSync(join(out,f.file))).digest('hex');
json('manifest.json',manifest);
console.log(JSON.stringify({canonical:stats(rows),powerOn:stats(boot),commonRoute:stats(route),eligible:presence.filter(p=>p.eligible).length,presence:presence.filter(p=>p.present).length,files:manifest.files.length},null,2));
