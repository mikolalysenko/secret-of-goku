import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {synthesizeKiSound,durations,cues} from '../engine/ki-sound.js';

test('ki sound samples are finite, bounded, distinct and deterministic in both forms',()=>{
  const signatures=new Set();
  for(const superSaiyan of [false,true])for(const name of Object.keys(durations)){
    const pcm=synthesizeKiSound(name,{superSaiyan}),again=synthesizeKiSound(name,{superSaiyan});
    assert.deepEqual(pcm,again);assert.ok(pcm.length>1000);
    let power=0,peak=0;for(const v of pcm){assert.ok(Number.isFinite(v));power+=v*v;peak=Math.max(peak,Math.abs(v));}
    assert.ok(peak<.7);assert.ok(Math.sqrt(power/pcm.length)>.025,`${name} is audible`);
    signatures.add(Array.from(pcm.slice(10,30)).join(','));
  }
  assert.ok(signatures.size>=Object.keys(durations).length);
});

test('every DBZ cue has a bounded prepared sample; sustained beds contain no silent loop seam',()=>{
  const root=new URL('../assets/audio/dbz/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
  for(const clip of new Set(Object.values(cues).flatMap(c=>c.clips))){
    const entry=manifest.clips.find(c=>c.name===clip);assert.ok(entry,clip);
    assert.match(entry.sourceUrl,/^https:\/\/(soundsverse.com|soundeffects.fandom.com)\//);assert.equal(entry.sha256.length,64);
    const b=readFileSync(new URL(entry.file,root));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt32LE(24),manifest.rate);
    const a=Array.from({length:(b.length-44)/2},(_,i)=>b.readInt16LE(44+i*2)/32768),peak=Math.max(...a);
    assert.equal(manifest.rate,16000);assert.equal(manifest.bits,10);
    assert.ok(a.every(v=>Number.isInteger(v*512)),`${clip} has the shared 10-bit treatment`);
    assert.ok(peak<=.801);assert.ok(Math.min(...a)>=-.801);
    if(entry.loop){
      for(let i=0;i<a.length-3200;i+=1600){const chunk=a.slice(i,i+3200),rms=Math.sqrt(chunk.reduce((sum,x)=>sum+x*x,0)/chunk.length);assert.ok(rms>.025,`${clip} has a silent section`);}
      const differences=a.slice(1).map((v,i)=>Math.abs(v-a[i])).sort((a,b)=>a-b);
      assert.ok(Math.abs(a[0]-a.at(-1))<differences[Math.floor(differences.length*.999)],`${clip} discontinuity at loop point`);
    }else{assert.equal(a[0],0);assert.equal(a.at(-1),0);}
  }
});

test('strikes and flight use TV-anime air without looping power-up vocals; speech keeps its sample-bank treatment',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/audio/dbz/manifest.json',import.meta.url)));
  for(const name of['swing','swing-2','kick-swing']){
    const c=manifest.clips.find(c=>c.name===name);
    assert.match(c.sourceUrl,/Anime_Whoosh_Sound_(16|20)$/);assert.ok(c.duration<.4);
    assert.equal(c.leadIn,undefined,'a punch whoosh has no ki power-up');
  }
  const flight=manifest.clips.find(c=>c.name==='flight'),air=manifest.clips.find(c=>c.name==='air');
  assert.equal(flight.leadIn.source,'charge');assert.ok(flight.leadIn.end-flight.leadIn.start<.25);
  assert.match(flight.sourceUrl,/Anime_Whoosh_Sound_20$/);assert.ok(flight.duration<.65);
  assert.match(air.sourceUrl,/Anime_Whoosh_Sound_20$/);assert.ok(air.loop>0);assert.ok(air.rms<flight.rms);
  for(const name of['charge','release']){
    const b=readFileSync(new URL(`../assets/audio/kamehameha-${name}.wav`,import.meta.url));
    assert.equal(b.readUInt32LE(24),16000);
    for(let i=44;i<b.length;i+=2)assert.equal(Math.abs(b.readInt16LE(i)%64),0);
    assert.ok((b.length-44)/32000>(name==='charge'?3.5:2),'retain the unhurried Japanese delivery');
  }
});
