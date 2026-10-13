import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const context={window:{},Uint8Array};
vm.runInNewContext(await readFile(new URL('../engine/dialogue-patches.js',import.meta.url),'utf8'),context);
const patch=context.window.gokuDialoguePatch;
const romPath=new URL('../.local/rom/secret-of-mana-us.sfc',import.meta.url);
const spans=[[0x92691,12],[0x9306a,14],[0x9339f,11],[0x93450,18]];
const inSpan=offset=>spans.some(([start,length])=>offset>=start&&offset<start+length);

test('dialogue rejects unsupported containers and sizes before editing',()=>{
  assert.throws(()=>patch(new Uint8Array(512)),/unheadered 2 MiB/);
  assert.throws(()=>patch(new ArrayBuffer(0x200000)),/Uint8Array/);
  const blank=new Uint8Array(0x200000);
  assert.throws(()=>patch(blank),/event table/);
  assert.equal(blank.some(Boolean),false);
});

test('local US ROM: only four player glyph spans change, preserving native commands and all NPCs',
  {skip:!existsSync(romPath)},async()=>{
    const original=await readFile(romPath),unchanged=Buffer.from(original),result=patch(original);
    assert.ok(result instanceof Uint8Array);
    assert.notEqual(result.buffer,original.buffer);
    assert.equal(result.length,original.length);
    assert.deepEqual(original,unchanged,'source Buffer must not be mutated');
    const changed=[];
    for(let offset=0;offset<original.length;offset++){
      if(original[offset]!==result[offset]){
        changed.push(offset);
        assert.ok(inSpan(offset),`unexpected edit at ${offset.toString(16)}`);
        assert.ok(original[offset]>=0x80&&original[offset]<=0xd2,'original byte is printable');
        assert.ok(result[offset]>=0x80&&result[offset]<=0xd2,'replacement byte is printable');
      }
    }
    assert.ok(changed.length>30);
    for(const[start,length]of spans){
      assert.deepEqual([...result.subarray(start-2,start)],[0x57,0],'native boy-name token stays intact');
      assert.equal(result[start+length],original[start+length],'following command/newline stays in place');
    }
    // Independent expected native-font bytes: ":I'm sorry!" followed by 3 spaces.
    assert.deepEqual([...result.subarray(0x9306a,0x93078)],
      [0xc5,0xa3,0xc2,0x8d,0x80,0x93,0x8f,0x92,0x92,0x99,0xc8,0x80,0x80,0x80]);
    assert.deepEqual(patch(result),result,'applying the same patch twice is safe');
    // Changing a returned copy cannot corrupt its source or future calls.
    result[0]=0;
    assert.deepEqual(original,unchanged);
  });

test('local US ROM: conflicting event, speaker, glyph or control edits fail without partial mutation',
  {skip:!existsSync(romPath)},async()=>{
    const original=await readFile(romPath);
    for(const offset of [0x90224,0x9344e,0x93451,0x93462]){
      const conflict=new Uint8Array(original);conflict[offset]^=1;
      const before=new Uint8Array(conflict);
      assert.throws(()=>patch(conflict),/event table|player dialogue differs/);
      assert.deepEqual(conflict,before);
    }
  });
