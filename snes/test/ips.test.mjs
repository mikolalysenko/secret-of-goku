import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIps,applyIps} from '../tools/ips.mjs';

test('IPS matches literal and RLE format fixtures',()=>{
  assert.equal(createIps(Uint8Array.of(1,2,3),Uint8Array.of(1,4,3)).toString('hex'),'5041544348000001000104454f46');
  assert.equal(createIps(new Uint8Array(4),new Uint8Array(4).fill(7)).toString('hex'),'50415443480000000000000407454f46');
  assert.deepEqual(applyIps(Buffer.alloc(4),Buffer.from('50415443480000000000000407454f46','hex')),Buffer.alloc(4,7));
});

test('IPS expands zero-filled tails without a nonstandard footer',()=>{
  const source=Buffer.from([1,2]),target=Buffer.alloc(0x800000);target.set(source);target[0x400001]=12;
  const patch=createIps(source,target);
  assert.equal(patch.subarray(-3).toString(),'EOF');
  assert.deepEqual(applyIps(source,patch),target);
});

test('IPS splits large literal/RLE records and escapes the EOF offset',()=>{
  const source=Buffer.alloc(0x470000),target=Buffer.from(source);
  for(let i=0;i<0x20010;i++)target[i]=(i%255)+1;
  target.fill(5,0x30000,0x50010);
  target[0x454F46]=0x12;target[0x454F47]=0x34;
  assert.deepEqual(applyIps(source,createIps(source,target)),target);
  const last=Buffer.alloc(0x1000000);last[last.length-1]=9;
  assert.deepEqual(applyIps(Buffer.alloc(0),createIps(Buffer.alloc(0),last)),last);
});

test('IPS round trips mixed edits and rejects malformed records',()=>{
  let seed=12345;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let run=0;run<32;run++){
    const source=Buffer.from(Array.from({length:1024+run},()=>next()&255)),target=Buffer.alloc(source.length+run*29);target.set(source);
    for(let i=0;i<100;i++)target[next()%target.length]=next()&255;
    assert.deepEqual(applyIps(source,createIps(source,target)),target);
  }
  for(const hex of ['','5041544348','50415443480000000001','50415443480000000000000007454f46','5041544348454f4600'])assert.throws(()=>applyIps(Buffer.alloc(0),Buffer.from(hex,'hex')));
  assert.throws(()=>createIps(Buffer.alloc(2),Buffer.alloc(1)));
  assert.throws(()=>createIps(Buffer.alloc(0),Buffer.alloc(0x1000001)));
});
