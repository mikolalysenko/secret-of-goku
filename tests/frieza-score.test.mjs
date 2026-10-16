import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../assets/audio/music/',import.meta.url);
const combat=JSON.parse(readFileSync(new URL('score.json',root)));
const training=JSON.parse(readFileSync(new URL('vegeta-score.json',root)));

test('combat and training arrangements retain their references and develop across all eight voices',()=>{
 assert.equal(combat.tracks.length,3);assert.equal(training.tracks.length,2);
 assert.match(combat.reference.url,/5CpQ-uBRa78/);assert.match(training.reference.url,/M954D_jyJbQ/);
 assert.ok(training.tracks[1].bpm>training.tracks[0].bpm);
 assert.ok(combat.tracks[2].bpm>combat.tracks[1].bpm);
 for(const track of [...combat.tracks.slice(1),...training.tracks]){
  assert.equal(track.voices,8);assert.equal(track.channels.length,8);
  assert.ok(track.duration>=75,'A full multi-section arrangement replaces the short loop');
  assert.ok(track.sections.length>=6);
  assert.deepEqual(track.channels.map(c=>c.voice),[1,2,3,4,5,6,7,8]);
  for(const c of track.channels){assert.ok(c.rms>.004,`${track.file}: voice ${c.voice} is audible`);assert.ok(c.notes>30);}
  assert.ok(track.channels.some(c=>c.instruments.includes('noise')));
  assert.ok(track.channels.some(c=>c.instruments.includes('pulse')));
  assert.ok(track.channels.some(c=>c.instruments.includes('snare')));
  assert.ok(track.channels.some(c=>c.instruments.includes('strings')));
 }
});

test('all rendered cues have stereo headroom, no DC buildup and continuous loop boundaries',()=>{
 const signatures=new Set();
 for(const meta of[combat,training])for(const track of meta.tracks){
  const b=readFileSync(new URL(track.file,root)),rate=track.sampleRate??meta.sampleRate;
  assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt16LE(22),2);assert.equal(b.readUInt32LE(24),rate);assert.equal(b.readUInt16LE(34),16);
  const frames=(b.length-44)/4;assert.ok(Math.abs(frames/rate-track.duration)<1/rate);
  for(let channel=0;channel<2;channel++){
   let sum=0,peak=0,dc=0,delta=0,last=0;
   for(let i=0;i<frames;i++){const v=b.readInt16LE(44+i*4+channel*2)/32768;sum+=v*v;peak=Math.max(peak,Math.abs(v));dc+=v;if(i)delta=Math.max(delta,Math.abs(v-last));last=v;}
   assert.ok(Math.sqrt(sum/frames)>.08,`${track.file} channel ${channel} is not silent`);assert.ok(peak<.83);assert.ok(Math.abs(dc/frames)<.005);
   assert.ok(Math.abs(b.readInt16LE(44+channel*2)/32768-last)<delta*.5,`${track.file} has no abrupt loop seam`);
  }
  const digest=createHash('sha256').update(b).digest('hex');if(track.sha256)assert.equal(digest,track.sha256);
  signatures.add(digest);
 }
 assert.equal(signatures.size,5);
});
