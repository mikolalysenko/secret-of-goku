// Reproduce ki7 dry/stress measurements from two complete cartridges.
// node snes/test/audio/ki.mjs --before=path/to/14958c8.sfc
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderEffect,browserFeatures} from './effects.mjs';
import {punchMetrics} from './punch.mjs';
import {periodicity,motionMix} from './motion.mjs';
import {createApu} from './apu.mjs';
import {customSegments} from './cartridge.mjs';
import {effectRam,trackBytes} from '../../gen/audio-resident-storage.mjs';
import {buildResident7,resident7Layout} from '../../gen/audio-resident7.mjs';

const before=process.argv.find(a=>a.startsWith('--before='))?.slice(9);
if(!before)throw Error('--before must name the committed pre-ki cartridge');
const after=process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc',old=readFileSync(before),rom=readFileSync(after);
const hash=b=>createHash('sha256').update(b).digest('hex');
function dry(r,id,p2=15){
 const {pcm,features,...voice}=renderEffect(r,id,{p2});
 return {...voice,...punchMetrics(pcm),features,periodicity:periodicity(pcm)};
}
const bank=buildResident7(),layout=resident7Layout(readFileSync('rom/secret-of-mana-us.sfc'),bank.tracks);
const samples=customSegments(rom).find(s=>s.addr===0x4DF1).bytes.subarray(0,bank.sampleBytes);
assert.deepEqual(samples,customSegments(old).find(s=>s.addr===0x4DF1).bytes.subarray(0,bank.sampleBytes));
const contactTracks=r=>{const ram=effectRam(r);return [0,1].map(v=>{const p=0x2CE0+v*2;return trackBytes(ram,ram[p]|ram[p+1]<<8);});};
assert.deepEqual(contactTracks(rom),contactTracks(old));
const oldRam=createApu({rom:old}).ram,newRam=createApu({rom}).ram;
assert.deepEqual(oldRam.slice(0x4800,0x4DF1),newRam.slice(0x4800,0x4DF1));
const launch=[0,1].map(form=>({form,p2:form?13:15,before:dry(old,0xDE,form?13:15),after:dry(rom,0xDE,form?13:15)}));
const mixes=[];
for(const song of [0x3C,0x3F])for(const beam of [false,true])for(const blastP2 of [15,13,'alternate'])for(const phase of [0,7,19]){
 const m=motionMix(rom,{song,beam,blastP2,phase,mode:'volley',gap:5});
 assert.equal(m.clipped,0);assert.ok(m.maxVoices<=(beam?4:3));assert.equal(m.maxLaunchVoices,1);assert.equal(m.effectMask,0);assert.equal(m.musicMask,255);assert.equal(m.bankIntact,true);mixes.push(m);
}
const result={before,after,hashBefore:hash(old),hashAfter:hash(rom),launch,pc:browserFeatures('blast'),
 contact:{id:0x38,tracksUnchanged:true,retailSamplesUnchanged:true,before:dry(old,0x38),after:dry(rom,0x38)},
 storage:{reserve:bank.reserve,used:bank.used,sampleBytes:bank.sampleBytes,samplesUnchanged:true,samplesSha256:hash(samples),codeBytes:bank.codeBytes,sequenceBytes:bank.sequences.reduce((n,s)=>n+s.bytes.length,0),sharedUsed:layout.used,sharedCapacity:layout.capacity,
  helperBytes:bank.segments.find(s=>s.addr===0x180).bytes.length,alias:bank.segments.filter(s=>[0x183E,0x18BE,0x197C].includes(s.addr)).map(s=>({address:s.addr,bytes:s.bytes.length}))},mixes};
writeFileSync('.local/snes-test/audio/compare7/ki-analysis7.json',JSON.stringify(result,null,2));
console.table(launch.map(r=>({form:r.form,beforePeak:r.before.peakDbFS,afterPeak:r.after.peakDbFS,beforeMs:r.before.durationMs,afterMs:r.after.durationMs,beforePeriodicity:r.before.periodicity,afterPeriodicity:r.after.periodicity,voiceMs:r.after.voiceMs})));
console.log(JSON.stringify({mixes:mixes.length,worstPeakDbFS:Math.max(...mixes.map(m=>m.peakDbFS)),clipped:0,maxVoices:Math.max(...mixes.map(m=>m.maxVoices)),storage:result.storage},null,2));
