import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeEffectTile,decodeEffectFrame,decodeEffectAtlas,createNativeEffects} from '../engine/native-effects.js';
import {combustionCells,combustionFrames} from '../engine/native-combustion-data.js';
import {createNativeCombustion} from '../engine/native-combustion.js';
import {createOrbitEffects} from '../engine/orbit-effects.js';
import {orbitVector} from '../engine/orbit-pixels.js';

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

test('montage explosions match native Exploder/Fireball captures and rotate without resampling',async t=>{
  let rom;try{rom=new Uint8Array(await readFile(new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url)));}catch{t.skip('Local US ROM required');return;}
  for(const cell of combustionCells){
    const {rgba}=decodeEffectFrame(rom,cell);
    assert.equal(createHash('sha256').update(rgba).digest('hex'),cell.sha256,JSON.stringify(cell.source));
  }
  const draw=createNativeCombustion(rom);
  for(const[kind,frames]of Object.entries(combustionFrames))for(let i=0;i<frames.length;i++){
    const normal=new Map();draw(kind,i,0,0,(x,y,c)=>normal.set(`${x},${y}`,c));assert.ok(normal.size>0);
    for(let turn=0;turn<4;turn++)for(const flip of[false,true]){
      const transformed=new Map();draw(kind,i,64,64,(x,y,c)=>{
        assert.ok(Number.isInteger(x)&&Number.isInteger(y));
        let u=x-64,v=y-64;
        [u,v]=turn===1?[v,-u]:turn===2?[-u,-v]:turn===3?[-v,u]:[u,v];
        transformed.set(`${flip?-u:u},${v}`,c);
      },{turn,flip});
      assert.deepEqual(transformed,normal);
    }
  }
});

test('orbital beams use native strip colors at fixed headings with whole-pixel spell effects',async t=>{
 let rom;try{rom=new Uint8Array(await readFile(new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url)));}catch{t.skip('Local US ROM required');return;}
 const manifest=JSON.parse(await readFile(new URL('../engine/native-effects.json',import.meta.url),'utf8')),effects=createNativeEffects(rom,manifest),colors=new Set(effects['beam-body'].flatMap(f=>[...f]));
 for(const c of effects['charge-orb'][4])colors.add(c);
 let count=0,checkColors=true;
 const fx=createOrbitEffects({cart:{data:rom}},{spriteLayer:{effects}},(x,y,c)=>{
  assert.ok(Number.isInteger(x)&&Number.isInteger(y));assert.ok(c>0&&c<=0x8000);if(checkColors)assert.ok(colors.has(c));count++;
 });
 for(let heading=0;heading<16;heading++){
  const{dx,dy}=orbitVector(heading),before=count;fx.beam(128.2,112.1,128+dx*100,112+dy*100,24,0);
  assert.ok(count-before>1000,'A large continuous beam keeps its area across all fixed headings');
 }
 checkColors=false;
 for(let age=0;age<80;age++){fx.burst(80,90,age,{large:true});fx.aura(80,90,age);fx.disc(80,90,age);fx.beam(80,90,220,90,12,age,true);}
});
