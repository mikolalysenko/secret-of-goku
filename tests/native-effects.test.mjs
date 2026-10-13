import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeEffectTile,decodeEffectAtlas,createNativeEffects} from '../engine/native-effects.js';

test('native effect row encoding recovers transparency, plane order and left-to-right bits',()=>{
  const bytes=new Uint8Array(24);
  // These original row codes represent eight transparent, index-7 and
  // index-8 pixels respectively. The fourth row mixes index 0 and index 7.
  bytes.set([255,255,255],0);bytes.set([0,255,0],3);bytes.set([255,255,0],6);
  bytes.set([0x80,255,0x80],9);
  const pixels=decodeEffectTile(bytes,0);
  assert.deepEqual([...pixels.slice(0,8)],Array(8).fill(0));
  assert.deepEqual([...pixels.slice(8,16)],Array(8).fill(7));
  assert.deepEqual([...pixels.slice(16,24)],Array(8).fill(8));
  assert.deepEqual([...pixels.slice(24,32)],[0,7,7,7,7,7,7,7]);
  assert.equal(decodeEffectTile(bytes,null).some(Boolean),false);
  assert.throws(()=>decodeEffectTile(bytes,1),/outside ROM/);
  assert.throws(()=>decodeEffectTile(bytes,-1),/outside ROM/);
});

test('all 34 ROM effect frames match the independently captured native VRAM/CGRAM atlas',async t=>{
  let bytes;try{bytes=new Uint8Array(await readFile(new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url)));}catch{t.skip('Local US ROM required');return;}
  const manifest=JSON.parse(await readFile(new URL('../engine/native-effects.json',import.meta.url),'utf8'));
  assert.equal(manifest.frames.length,34);
  const atlas=decodeEffectAtlas(bytes,manifest);
  // Hash of the original emulator's decoded 4bpp VRAM + CGRAM captures,
  // separately checked by .local/effects-research/verify.mjs during extraction.
  assert.equal(createHash('sha256').update(atlas.rgba).digest('hex'),'9c2d79bdf8ab8f513a1bfec54a87a98d009a9f2cd9858a3fe4308094cce621f2');
  const effects=createNativeEffects(bytes,manifest);
  assert.equal(effects['charge-orb'].length,5);assert.equal(effects['gold-charge-orb'].length,5);
  assert.equal(effects['beam-body'].length,2);assert.equal(effects['impact-spark'].length,6);
  for(const frames of Object.values(effects))for(const frame of frames){assert.equal(frame.length,256);assert.ok(frame.some(Boolean));assert.ok(frame.every(color=>color<=0x8000));}
  for(const frame of manifest.frames){assert.equal(frame.native.objectPalette,0);assert.equal(frame.native.priority,3);assert.equal(frame.native.colorMathEligible,false);}
});
