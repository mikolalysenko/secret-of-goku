import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
test('original Frieza cues have bounded stereo energy and continuous loop boundaries',()=>{
 const root=new URL('../assets/audio/music/',import.meta.url),meta=JSON.parse(readFileSync(new URL('score.json',root)));
 const training=JSON.parse(readFileSync(new URL('vegeta-score.json',root)));
 assert.equal(meta.tracks.length,3);assert.equal(training.tracks.length,2);assert.ok(training.tracks[1].bpm>training.tracks[0].bpm);const signatures=new Set();
 for(const track of [...meta.tracks,...training.tracks]){
  const b=readFileSync(new URL(track.file,root));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt16LE(22),2);assert.equal(b.readUInt32LE(24),22050);
  const frames=(b.length-44)/4;let sum=0,peak=0,dc=0,delta=0;
  for(let i=0;i<frames;i++){const v=b.readInt16LE(44+i*4)/32768;sum+=v*v;peak=Math.max(peak,Math.abs(v));dc+=v;if(i)delta=Math.max(delta,Math.abs(v-b.readInt16LE(40+i*4)/32768));}
  assert.ok(Math.sqrt(sum/frames)>.08);assert.ok(peak<.83);assert.ok(Math.abs(dc/frames)<.005);
  assert.ok(Math.abs(b.readInt16LE(44)-b.readInt16LE(44+(frames-1)*4))/32768<delta*.5,`${track.file} has no abrupt loop seam`);
  signatures.add(b.subarray(100000,100100).toString('hex'));
 }
 assert.equal(signatures.size,5);
});
