import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesizeKiSound,durations} from '../engine/ki-sound.js';

test('ki sound samples are finite, bounded, distinct and deterministic in both forms',()=>{
  const signatures=new Set();
  for(const superSaiyan of [false,true])for(const name of Object.keys(durations)){
    const pcm=synthesizeKiSound(name,{superSaiyan}),again=synthesizeKiSound(name,{superSaiyan});
    assert.deepEqual(pcm,again);assert.ok(pcm.length>2000);
    let power=0,peak=0;for(const v of pcm){assert.ok(Number.isFinite(v));power+=v*v;peak=Math.max(peak,Math.abs(v));}
    assert.ok(peak<.7);assert.ok(Math.sqrt(power/pcm.length)>.025,`${name} is audible`);
    signatures.add(Array.from(pcm.slice(10,30)).join(','));
  }
  assert.ok(signatures.size>=Object.keys(durations).length);
});
