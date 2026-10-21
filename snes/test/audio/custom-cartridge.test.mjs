import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCustom,buildCustomBank,customSettings,customEdlCaps,CUSTOM_IDS} from '../../gen/audio-custom.mjs';
import {buildSongs} from '../../gen/audio.mjs';
import {loadRom,driverChunks,romSong} from './apu.mjs';
import {isCustom,isResident7,uploadSegments} from './cartridge.mjs';
const root=new URL('../../../',import.meta.url).pathname;
const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');

test('custom reservation and all selectable takes fit without touching the loader ring',()=>{
 const bank=buildCustomBank();
 for(let n=0;n<81;n++){
  let v=n;const takes={};for(const cue of Object.keys(CUSTOM_IDS)){takes[cue]=['custom','alt1','alt2'][v%3];v=Math.floor(v/3);}
  const c=buildCustom({bank,settings:{takes,levels:{hit:0,kick:0,impact:0,beam:0}}});
  assert.ok(c.sequenceBytes<=135);assert.equal(c.segments.find(s=>s.addr===0x4DF1).bytes.length,2048);
  for(const s of c.segments)assert.ok(s.addr+s.bytes.length<=0xFA00||s.addr===0xFFFB);
 }
 assert.throws(()=>customSettings({AUDIO_CUSTOM_TAKES:'hit:typo'}));
 assert.throws(()=>customSettings({AUDIO_CUSTOM_LEVELS:'beam:12'}));
 assert.throws(()=>customSettings({AUDIO_CUSTOM_LEVELS:'beam:NaN'}));
 assert.throws(()=>customSettings({AUDIO_CUSTOM_LEVELS:'constructor:0'}));
});

test('every song/preset cap is safe and only changes EDL when its required samples collide',async()=>{
 const retail=loadRom(),songs=await buildSongs(root,retail),caps=customEdlCaps(retail,songs);
 for(const s of caps)for(let preset=0;preset<16;preset++){
  const original=songs.find(x=>x.id===s.id)?.echo.edl??retail[0x30708+4*preset];
  const edl=Math.min(original,s.maxEdl),esa=0xFA00-Math.max(1,edl)*2048;
  assert.ok(s.end<esa,`${s.id}/${preset}`);
  assert.equal(edl<original,s.end>=0xFA00-Math.max(1,original)*2048);
 }
 // Long retail sequences + native word/triple padding cannot reach BRR.
 for(let id=0;id<64;id++)assert.ok(0x1A00+romSong(retail,id).blob.length+3<0x4800);
 if(!isCustom(rom))return;
 assert.equal(rom.readUInt16LE(0x3054A),32);assert.equal(rom.readUInt16LE(0x3056C),64);assert.equal(rom.readUInt16LE(0x3058E),32);
 if(isResident7(rom))return; // round-seven pointers/controls are checked in beds.test.mjs
 const segments=uploadSegments(rom),aram=new Uint8Array(65536);
 for(const s of driverChunks(rom))aram.set(s.bytes,s.addr);
 for(const s of segments)aram.set(s.bytes,s.addr);
 for(const [cue,id] of Object.entries(CUSTOM_IDS))for(let v=0;v<2;v++){
  const p=0x2C00+4*id+2*v,a=aram[p]|aram[p+1]<<8;
  assert.ok(a>=0x54F9&&a<0x5580,`${cue}/${v} points into its reserved sequences`);
 }
});
