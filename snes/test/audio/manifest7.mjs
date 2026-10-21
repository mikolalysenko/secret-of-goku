// Combine cartridge/browser recordings, verify hashes and measure echo pairs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.local/snes-test/audio/compare7');
const read=n=>JSON.parse(readFileSync(join(root,n),'utf8'));
const parts=['r4','r7','pc',...['punch7','motion7','fix7','variety7'].filter(t=>existsSync(join(root,'manifest-'+t+'.json')))].map(t=>read('manifest-'+t+'.json'));
const followup=parts.find(p=>p.tag==='punch7');
const motion=parts.find(p=>p.tag==='motion7'),fix=parts.find(p=>p.tag==='fix7'),variety=parts.find(p=>p.tag==='variety7'),current=variety??fix??motion??followup??parts[1];
const files=parts.flatMap(p=>p.files),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(new Set(files.map(f=>f.file)).size,files.length,'duplicate listening file');
for(const f of files){
 assert.equal(hash(readFileSync(join(root,f.file))),f.sha256,f.file+' hash changed');
 // Keep the original cartridge's overloads in the unprocessed comparison.
 // The new cartridge and browser references must have zero clipped samples.
 if(!(f.variant==='r4'&&/^(contact|motion)-/.test(f.file)))assert.equal(f.clipped,0,f.file+' clips');
}
function stereoTail(file){
 const b=readFileSync(join(root,file));assert.equal(b.toString('ascii',36,40),'data');
 const rate=b.readUInt32LE(24),channels=b.readUInt16LE(22),count=(b.length-44)/(2*channels);
 let e=0,n=0;for(let i=Math.round(8.05*rate);i<Math.min(count,Math.round(12*rate));i++)for(let c=0;c<channels;c++){const v=b.readInt16LE(44+2*(i*channels+c))/32768;e+=v*v;n++;}
 return 10*Math.log10(Math.max(1e-20,e/Math.max(1,n)));
}
const echoPairs=[];
for(const f of parts[0].files.filter(f=>f.file.startsWith('echo-'))){
 const other=f.file.replace('-r4','-r7'),b=parts[1].files.find(g=>g.file===other);
 const id=parseInt(f.file.slice(5,7),16),s=read('analysis7.json').echo.find(e=>e.id===id);
 echoPairs.push({id,round4:f.file,round7:other,edl4:s.before,edl6:s.round6,edl7:s.after,delayChangeMs:s.delayMs,
  wholeFileRmsChangeDb:b.rmsDbFS-f.rmsDbFS,tailRms4DbFS:stereoTail(f.file),tailRms7DbFS:stereoTail(other)});
}
const comparisons=parts[0].files.filter(f=>!f.file.startsWith('echo-')).map(f=>{
 const motionKey=f.file.replace('-r4.wav','');
 if(motionKey.startsWith('motion-')){
  const before=motionKey+(fix?'-motion7.wav':'-punch7.wav'),after=motionKey+(fix?'-fix7.wav':'-motion7.wav');
  assert.ok(files.some(f=>f.file===before));assert.ok(files.some(f=>f.file===after));
  const pc=motionKey.includes('combo')?[`pc-motion-combo-${motionKey.includes('2f')?'2':'1'}f.wav`]:motionKey.includes('volley')||motionKey.endsWith('input-ki')?[`pc-motion-${motionKey.includes('beam')?'beam-':''}volley-5f.wav`]:motionKey.endsWith('input-melee')?['pc-motion-combo-1f.wav']:['pc-'+motionKey.replace('motion-solo-','')+'.wav'];
  for(const name of pc)assert.ok(files.some(f=>f.file===name),name+' reference missing');
  return {sound:motionKey,round4:f.file,punch7:motionKey+'-punch7.wav',before,after,beforeVariant:fix?'motion7':'punch7',variant:fix?'fix7':'motion7',pc};
 }
 const key=f.file.replace('-r4.wav',''),variant=key.startsWith('contact-')?(fix?'fix7':'punch7'):'r7',r7=key+'-'+variant+'.wav';assert.ok(files.some(f=>f.file===r7));
 const pcKey=key.replace('solo-','').replace('context-','').replace('revert-landing','revert').replace('transform-revert','focus-transform').replace(/^flight$/,'flight');
 const candidates=[`pc-${pcKey}.wav`,...(key==='solo-revert-landing'?['pc-landing.wav']:[]),...(key==='context-flight'||key==='context-world-flight'?['pc-flight-context.wav']:[]),...(key==='context-teleport'?['pc-teleport-context.wav']:[])];
 if(key.startsWith('contact-'))candidates.push(...(key.endsWith('-kick')?['pc-kick.wav']:key.endsWith('-hit')?['pc-hit-1.wav','pc-hit-2.wav','pc-hit-3.wav']:['pc-hit-1.wav','pc-hit-2.wav','pc-hit-3.wav','pc-kick.wav']));
 return {sound:key,round4:f.file,round7:r7,variant,pc:[...new Set(candidates)].filter(n=>files.some(f=>f.file===n))};
});
const variationKeys=['variation-battle-combos','variation-solo-whiffs','variation-battle-volley'];
if(variety)for(const sound of variationKeys){
 const before=sound+'-fix7.wav',after=sound+'-variety7.wav',pc=['pc-'+sound+'.wav'];
 for(const file of [before,after,...pc])assert.ok(files.some(f=>f.file===file),file+' comparison missing');
 comparisons.push({sound,before,after,beforeVariant:'fix7',variant:'variety7',pc});
}
const trace7=read('trace-r7/results.json'),ids=phase=>trace7.commands.filter(c=>c.phase===phase).map(c=>c.id);
assert.ok(!ids('hold-B').includes(0x27));assert.ok(ids('native-hold-B').includes(0x27));assert.ok(ids('world-takeoff').includes(0xEC));
const profiles={};
for(const [tag,p] of [['r4','../baseline7/profile/loads/results.json'],['r6','../baseline7/profile-r6/loads/results.json'],['r7','../final7/audio/loads/results.json']])if(existsSync(join(root,p))){
 const r=read(p),rows=r.song_load_profile;assert.equal(rows.length,64);
 const total=k=>rows.reduce((n,s)=>n+(s[k]??0),0);
 profiles[tag]={songs:64,totalStallFrames:Array.from({length:64},(_,id)=>r[`load_${id.toString(16).toUpperCase().padStart(2,'0')}_stall_frames`]).reduce((a,b)=>a+b,0),
  totalLoadFrames:Array.from({length:64},(_,id)=>r[`load_${id.toString(16).toUpperCase().padStart(2,'0')}_load_frames`]).reduce((a,b)=>a+b,0),
  sequenceFrames:total('sequence'),cachePlanFrames:total('cache_plan'),compactFrames:total('compact'),instrumentFrames:total('instruments'),tableFrames:total('tables'),echoSetupFrames:total('echo_setup'),
  uploadedBrrBytes:rows.reduce((n,s)=>n+s.uploads.reduce((a,b)=>a+b,0),0),compactedBrrBytes:rows.reduce((n,s)=>n+s.moves.reduce((a,b)=>a+b.bytes,0),0)};
}
function workingFiles(path=''){
 return readdirSync(join(root,path),{withFileTypes:true}).flatMap(e=>{
  const file=path?path+'/'+e.name:e.name;
  if(e.isDirectory())return workingFiles(file);
  if(file==='manifest.json'||files.some(f=>f.file===file))return [];
  const ext=file.split('.').at(-1),description=({pcm:'Unprocessed source DAC recording, stereo signed 16-bit 32 kHz.',mss:'Private Mesen checkpoint used to reproduce the recording.',png:'Private checkpoint screenshot.',lua:'Generated Mesen fixture/trace script.',json:'Machine-readable trace, per-renderer manifest, or analysis.'})[ext]??'Capture/analysis working file.';
  return [{file,description,sha256:hash(readFileSync(join(root,file)))}];
 });
}
const manifest={title:'Secret of Goku — audio round seven'+(variety?' with swing/contact/ki variation':fix?' with combo gain and charge timing fixes':motion?' with punch contact, swing and ki follow-ups':followup?' with punch contact follow-up':''),currentCartridge:current.tag,roms:parts.filter(p=>p.rom).map(({tag,sha256,rom})=>({tag,sha256,rom})),
 listeningOrder:[...(variety?variationKeys:[]),...(motion?['motion-solo-swing','motion-solo-swing-2','motion-solo-kick-swing','motion-solo-blast','motion-solo-combo','motion-battle-combo-1f','motion-battle-combo-2f','motion-battle-volley-5f','motion-full-power-beam-volley-5f','motion-input-melee','motion-input-ki']:[]),...(followup?['contact-solo-hit','contact-solo-kick','contact-battle-hit','contact-battle-kick','contact-battle-rapid','contact-battle-beam','contact-full-power-rapid','contact-full-power-beam']:[]),'context-charge-beam','context-focus','context-flight','context-teleport','context-ki-volley','context-melee-hold','context-transform-revert','context-world-flight'],
 renderers:parts.map(({tag,renderer,note,fixtures})=>({tag:tag??'PC',renderer,note,fixtures})),
 notes:['No output gain normalization. Compare versions at the same player volume. New-cartridge and PC files have zero clipped samples; unmodified round-four stress recordings retain and report any original clipping.','The PC references isolate browser sound clips and loops; they do not include browser music.','Teleport uses a bandwidth-prioritized 96 ms attack; aura/beam use longer loops than the round-six beam.','Continuous air is omitted in the cartridge; the PC flight-context reference includes it.','Historical charge-baseline results were affected by shared checkpoint provenance. The fix7 report distinguishes the maintainer’s clean round-four baseline (12) from the locally reproduced historical ROM result; final before/after shipping runs use the same current shared checkpoints, read-only.',...(followup?['r7 preserves the initial round-seven takes; punch7 preserves the louder contact follow-up, and contact-* pairs compare round four with that follow-up.','HIT/KICK are louder native noise/pop sequences, with SPC gain reduction during effect overlaps. No sample reservation or EDL-cap change.']:[]),...(motion?['motion7 preserves the swing/ki follow-up. With fix7 present, motion-* comparisons show round four, motion7 before the fix, and fix7 after it; punch7 remains available.','Swings reuse the aura BRR with a short swell and falling pitch; E5 alternates two tunings. Ki keeps instrument 9 with a stronger attack and shaped decay. Contact tracks, all four BRRs, bed/beam/teleport/flight cues and echo caps are unchanged.','motion-* combo/volley takes use deterministic native effect commands through the real cartridge dispatcher. The two motion-input-* takes separately exercise actual gameplay. PC motion contexts use the same event spacing without music.']:[]),...(fix?['fix7 releases E5/E6 through native F2 cleanup before allocating a contact. Its own swing no longer reduces HIT/KICK gain; the overlap rule remains for other occupied effect voices.','Charge timing uses a cheaper held-bed path and direct native dispatch after queue/mailbox admission. BRRs, levels, pitches, envelopes, update throttle and stop/expiry behavior are unchanged. No reservation or echo change.',variety?'The earlier fix7 charge target is deferred: the maintainer accepts 13 for the variation follow-up.':'The local full gameplay charge case remains 13 misses; the requested target of 12 is unresolved. The timing report includes both original and shifted miss frames, without equating recovered hold frames with an overall improvement.']:[])],
 clippedSamples:{current:current.files.reduce((n,f)=>n+f.clipped,0),round4ContactStress:files.filter(f=>f.variant==='r4'&&f.file.startsWith('contact-')).reduce((n,f)=>n+f.clipped,0),round4MotionStress:files.filter(f=>f.variant==='r4'&&f.file.startsWith('motion-')).reduce((n,f)=>n+f.clipped,0)},
 comparisons,echoPairs,songLoadProfiles:profiles,files,workingFiles:workingFiles(),
 auxiliary:[{file:'analysis7.json',description:'BRR/loop/rate/storage options and dry SPC effect measurements; normalized beam-attack correlation compares a 32 ms 6 kHz source template at the best offset in the first 100 ms.'},
 ...['r4','r6','r7'].map(tag=>({file:`trace-${tag}/results.json`,description:`Effect commands from real controller inputs, ${tag}.`})),
 ...['r4','r7'].map(tag=>({file:`capture-${tag}/results.json`,description:`Cartridge capture provenance and all commands for ${tag}.`})),
 ...['r4','r7'].map(tag=>({file:`capture-${tag}-melee/results.json`,description:`B-hold weapon-buzz comparison, ${tag}.`})),
 ...(followup?[{file:'contact-analysis7.json',description:'Dry contact peak/body/crunch comparison and 24 rapid/beam/bed overlap stress cases on the cartridge SPC image.'},{file:'contact-validation7.json',description:'Follow-up build hashes, suite results, CPU budget, and unchanged shared-checkpoint hashes.'},...['r4','punch7'].map(tag=>({file:`capture-${tag}-contacts/results.json`,description:`Punch follow-up solo, music-mix and real-input capture commands, ${tag}.`}))]:[]),
 ...(motion?[{file:'motion-analysis7.json',description:'Swing periodicity/envelopes, ki loudness/bandwidth, 18 combo/volley overlap cases and sample-byte/echo trade-offs.'},{file:'motion-validation7.json',description:'Build/rollback hashes, suites, identical before/after gameplay misses and unchanged checkpoint/sample/track checks.'},{file:'motion-cpu7.json',description:'Settled idle CPU comparison at modprof boundaries, 300 frames on each cartridge in sword/battle perf states.'},...['r4','punch7','motion7'].map(tag=>({file:`capture-${tag}-motion/results.json`,description:`Three-way swing/ki capture commands, ${tag}.`}))]:[]),
 ...(fix?[{file:'fix-validation7.json',description:'Combo/melee loudness, raw clipping counts, before/after shipping gameplay, audio/perf/combat results, hashes and charge trace diagnosis.'},...['motion','contacts'].map(group=>({file:`capture-fix7-${group}/results.json`,description:`Final fix7 cartridge capture commands and provenance: ${group}.`}))]:[]),
 ...(variety?[{file:'variation-validation7.json',description:'Independent pitch cycles, headroom, storage/stack checks, suite results, unchanged gameplay misses and hashes.'},{file:'variation-cpu7.json',description:'Before/after settled idle profile at modprof call boundaries.'},...['fix7','variety7'].map(tag=>({file:`capture-${tag}-variation/results.json`,description:`Two combos, eight whiffs and a ki volley through the real cartridge dispatcher: ${tag}.`}))]:[])]};
if(variety)manifest.notes.push('variety7 adds a six-combination punch swing cycle (two swell/sweep envelopes times three pitches), and independent three-pitch HIT/ki cycles. Kick swing, kick, shared noise clock, gain/overlap handling, samples and EDL caps are unchanged. Native sequence reloads restart the cycles.',
 'The maintainer accepted charge at 13/240 and deferred further charge work. Earlier round-four cross-tree results are not the clean baseline; compare each build with its own generated SPC upload. The variety7 before/after shipping gameplay comparison must not increase any miss count.');
writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`${files.length} verified WAV files, ${comparisons.length} cue/context pairs, ${echoPairs.length} echo pairs`);console.log(JSON.stringify(profiles,null,2));
