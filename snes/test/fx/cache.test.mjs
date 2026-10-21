// Exercise the assembled cache, including stale hints after eviction and
// conservative VRAM invalidation. A hash match must never expose old art.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path),symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const at=n=>{assert(symbols.has(n),n);return symbols.get(n);};
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000,FX=0x7800;
const CELL=0x40,USED=0x60,PENDING=0x80,BUDGET=0x82,FRAME=0x84,FAIL=0x228,DIRTY=0x242,BITS=0x254;
const HASH=at('fx_hash_address')&65535,HASH_SIZE=at('fx_hash_size');
const tile=i=>rom.readUInt16LE(hiromToPc(at('fx_entry_tile'))+i*2);

function cache(){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const rindex=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    if(a>>>16===0x33)return 0; // destruction record sequence at initialization
    const r=rindex(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=rindex(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  const word=(off,v)=>sram.writeUInt16LE(v,FX+off);
  const read=off=>sram.readUInt16LE(FX+off);
  sram.fill(255,FX+CELL,FX+USED);
  sram.fill(255,FX+0x22,FX+0x29);
  sram.fill(255,HASH,HASH+HASH_SIZE);
  word(FRAME,17);word(0x20,0xFC);
  function resident(slot,cell,age=0){
    word(CELL+slot*2,cell);word(USED+slot*2,age);
    sram[FX+BITS+(cell>>3)]|=1<<(cell&7);
    sram[HASH+(cell&(HASH_SIZE-1))]=slot*2;
    word(DIRTY,1);
  }
  function call(name,a=0,x=0){
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const entry=at(name);cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([a,x,0xBEEF,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0,scans=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
      assert(n<10000,`${name} did not return`);
      if(((cpu.r[1]<<16)|cpu.br[4])===at('fx_cache_get_scan'))scans++;
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x);
    return {a:cpu.br[0],x:cpu.br[1],carry:cpu.c,cycles,scans};
  }
  return {ram,sram,word,read,resident,call,get:cell=>call('fx_cache_get',cell)};
}

test('resident cells resolve every cache slot and palette class',t=>{
  for(let slot=0;slot<15;slot++)for(let cls=0;cls<6;cls++)for(const white of [0,1]){
    const c=cache(),cell=slot+160;c.resident(slot,cell);
    c.ram.writeUInt16LE(white,DP+0x46);
    const first=c.get(cell|(cls<<9));
    assert(!first.carry);assert.equal(first.a,0x3600|tile(slot));
    assert.equal(c.read(USED+slot*2),17);assert.equal(c.read(PENDING),0);
    assert.equal(c.read(BUDGET),0);assert.equal(c.read(0x3C),0);
    const second=c.get(cell|(cls<<9));assert.equal(second.a,first.a);assert(!second.carry);
    if(slot===0&&cls===0&&!white)t.diagnostic(`warm resident cache hit: ${second.cycles} CPU cycles`);
  }
});

test('hash collisions and stale evicted hints cannot select the wrong tile',()=>{
  const c=cache();c.resident(3,1);c.resident(7,1+HASH_SIZE);
  assert.equal(c.get(1).a,0x3600|tile(3));
  assert.equal(c.get(1+HASH_SIZE).a,0x3600|tile(7));
  assert.equal(c.get(1).a,0x3600|tile(3));
  const full=cache();for(let i=0;i<15;i++)full.resident(i,i,i);
  full.word(FRAME,20);full.word(BUDGET,1);
  assert.equal(full.get(200).a,0x3600|tile(0));
  assert.equal(full.read(CELL),200);assert.equal(full.read(PENDING),1);
  assert.equal(full.read(BUDGET),0);
  assert(full.get(0).carry,'evicted cell used its stale hash hint');
  assert.equal(full.read(0x3C),1);
});

test('replacement protects this frame across every slot, age wrap and ties',t=>{
  let cycles=0;
  for(let victim=0;victim<15;victim++){
    const c=cache();
    for(let i=0;i<15;i++)c.resident(i,i,1);
    c.word(FRAME,1);c.word(USED+victim*2,0xFFFE);c.word(BUDGET,1);
    const r=c.get(200);
    assert(!r.carry);assert.equal(r.a,0x3600|tile(victim));
    for(let i=0;i<15;i++)assert.equal(c.read(CELL+i*2),i===victim?200:i);
    cycles+=r.cycles;
  }
  const tied=cache();for(let i=0;i<15;i++)tied.resident(i,i,3);
  tied.word(BUDGET,1);
  assert.equal(tied.get(200).a,0x3600|tile(14),'equal ages retain the later-slot tie break');
  const protectedCache=cache();for(let i=0;i<15;i++)protectedCache.resident(i,i,17);
  protectedCache.word(BUDGET,1);
  assert(protectedCache.get(200).carry,'a completely protected cache cannot evict');
  assert.equal(protectedCache.read(BUDGET),1);assert.equal(protectedCache.read(PENDING),0);
  t.diagnostic(`full replacement scan: ${Math.round(cycles/15)} CPU cycles including allocation`);
});

test('assembly setup resolves every generated cell and preserves missing flip variants',()=>{
  const ptr=hiromToPc(at('fx_asm_ptr')),data=hiromToPc(at('fx_asm_data'));
  for(let id=0;id<(data-ptr)/2;id++)for(const missing of [false,true]){
    const c=cache(),offset=rom.readUInt16LE(ptr+id*2),record=data+offset;
    const parts=rom[record],n=rom[record+1],expected=[];
    assert(n<=6,'assembly exceeds its six-cell frame capacity');
    for(let i=0;i<n;i++){
      const word=rom.readUInt16LE(record+6+i*2);
      if(!missing)c.resident(i,word&511);
      expected.push(missing?0xFFFF:c.get(word).a);
    }
    c.ram.writeUInt16LE(0xFFFF,DP+0x40);
    const result=c.call('fx_emit_setup',id);
    assert.equal(result.carry,parts===0);
    if(!parts)continue;
    assert.equal(c.ram.readUInt16LE(DP+0x84),parts);
    assert.equal(c.ram.readUInt16LE(DP+0x86),offset+6+n*2);
    for(let i=0;i<n;i++)for(let flip=0;flip<4;flip++)
      assert.equal(c.ram.readUInt16LE(DP+0x54+i*8+flip*2),missing?0xFFFF:expected[i]|[0,0x4000,0x8000,0xC000][flip],`assembly ${id}, cell ${i}, flip ${flip}`);
  }
});

test('pending uploads and exhausted palettes never draw a cached cell',()=>{
  for(let slot=0;slot<15;slot++){
    const c=cache();c.resident(slot,slot);c.word(FAIL,1<<slot);
    assert(c.get(slot).carry);assert.equal(c.read(USED+slot*2),0);
    c.word(FAIL,0);c.word(0x20,0);
    assert(c.get(slot).carry);
    c.word(0x20,8);assert.equal(c.get(slot).a,0x3600|tile(slot));
  }
});

test('residency resets invalidate matching hints, including untouched regions',()=>{
  for(const region of [null,0,1,2]){
    const c=cache(),slot=region===2?0:14,cell=123;
    c.resident(slot,cell);
    const result=region===null?c.call('fx_clear_rbits',0x1234,0x5678):c.call('fx_region_mark',0xFFFE,region);
    if(region===null){assert.equal(result.a,0x1234);assert.equal(result.x,0x5678);}
    else assert.equal(result.x,region);
    assert.equal(c.read(CELL+slot*2),cell,'other region should retain its cell metadata');
    assert(c.sram.subarray(FX+BITS,FX+BITS+44).every(v=>v===0));
    assert(c.sram.subarray(HASH,HASH+HASH_SIZE).every(v=>v===255));
    assert(c.get(cell).carry,'old art was used after residency invalidation');
    c.word(BUDGET,1);assert(!c.get(cell).carry);
    assert.notEqual(c.read(PENDING),0,'cell must be uploaded again');
  }
});

test('nearby animation banks keep independent warm hints',t=>{
  const c=cache();
  for(let i=0;i<8;i++)c.resident(i,1+i*16);
  let first=0,second=0,scans=0;
  for(let i=0;i<8;i++)first+=c.get(1+i*16).cycles;
  for(let i=0;i<8;i++){const hit=c.get(1+i*16);second+=hit.cycles;scans+=hit.scans;}
  if(HASH_SIZE===128)assert.equal(scans,0,'warm animation cells fell back to a cache scan');
  t.diagnostic(`eight warm animation cells: ${second} CPU cycles (initial pass ${first})`);
});

test('repeated region resets are cheap and preserve adjacent shared work',t=>{
  const c=cache();
  c.sram.fill(0xA5,0x7520,0x756C);c.sram.fill(0x5A,0x75EC,0x7800);
  c.resident(0,1);c.resident(14,351);
  const first=c.call('fx_clear_rbits',0x1234,0x5678);
  const second=c.call('fx_clear_rbits',0x5678,0x1234);
  assert.equal(second.a,0x5678);assert.equal(second.x,0x1234);
  assert.equal(c.read(DIRTY),0);
  assert(second.cycles<first.cycles/4);
  assert(c.sram.subarray(0x7520,0x756C).every(v=>v===0xA5));
  assert(c.sram.subarray(0x75EC,0x7800).every(v=>v===0x5A));
  c.word(BUDGET,1);assert(!c.get(129).carry);assert.equal(c.read(DIRTY),1);
  c.call('fx_clear_rbits');assert.equal(c.read(DIRTY),0);
  assert(c.sram.subarray(HASH,HASH+HASH_SIZE).every(v=>v===255));
  t.diagnostic(`residency reset: ${first.cycles} CPU cycles; repeated reset: ${second.cycles}`);
});

test('cold or older SRAM invalidates the separate hint block before use',()=>{
  for(const magic of [0,0xF0C6,0xA5A5]){
    const c=cache();
    c.sram.fill(0xA5,FX,FX+0x400);c.sram.fill(0,HASH,HASH+HASH_SIZE);
    c.word(0x8C,magic);
    c.call('fx_ensure_init',0x1234,0x5678);
    assert.equal(c.read(DIRTY),1);
    c.call('fx_clear_rbits');
    assert(c.sram.subarray(HASH,HASH+HASH_SIZE).every(v=>v===255));
    assert.equal(c.read(DIRTY),0);
    assert(c.get(0).carry,'an unclaimed cache entry was treated as resident');
  }
});
