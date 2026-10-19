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
const CELL=0x40,USED=0x60,PENDING=0x80,BUDGET=0x82,FRAME=0x84,FAIL=0x228,HASH=0x242,BITS=0x262;
const tile=i=>rom.readUInt16LE(hiromToPc(at('fx_entry_tile'))+i*2);

function cache(){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const rindex=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=rindex(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=rindex(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  const word=(off,v)=>sram.writeUInt16LE(v,FX+off);
  const read=off=>sram.readUInt16LE(FX+off);
  sram.fill(255,FX+CELL,FX+USED);
  sram.fill(255,FX+0x24,FX+0x2A);
  sram.fill(255,FX+HASH,FX+HASH+16);
  word(FRAME,17);word(0x22,0xFC);
  function resident(slot,cell,age=0){
    word(CELL+slot*2,cell);word(USED+slot*2,age);
    sram[FX+BITS+(cell>>3)]|=1<<(cell&7);
    sram[FX+HASH+(cell&15)]=slot*2;
  }
  function call(name,a=0,x=0){
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const entry=at(name);cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([a,x,0xBEEF,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
      assert(n<10000,`${name} did not return`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x);
    return {a:cpu.br[0],x:cpu.br[1],carry:cpu.c,cycles};
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
  const c=cache();c.resident(3,17);c.resident(7,33);
  assert.equal(c.get(17).a,0x3600|tile(3));
  assert.equal(c.get(33).a,0x3600|tile(7));
  assert.equal(c.get(17).a,0x3600|tile(3));
  const full=cache();for(let i=0;i<15;i++)full.resident(i,i,i);
  full.word(FRAME,20);full.word(BUDGET,1);
  assert.equal(full.get(200).a,0x3600|tile(0));
  assert.equal(full.read(CELL),200);assert.equal(full.read(PENDING),1);
  assert.equal(full.read(BUDGET),0);
  assert(full.get(0).carry,'evicted cell used its stale hash hint');
  assert.equal(full.read(0x3C),1);
});

test('pending uploads and exhausted palettes never draw a cached cell',()=>{
  for(let slot=0;slot<15;slot++){
    const c=cache();c.resident(slot,slot);c.word(FAIL,1<<slot);
    assert(c.get(slot).carry);assert.equal(c.read(USED+slot*2),0);
    c.word(FAIL,0);c.word(0x22,0);
    assert(c.get(slot).carry);
    c.word(0x22,8);assert.equal(c.get(slot).a,0x3600|tile(slot));
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
    assert(c.sram.subarray(FX+HASH,FX+HASH+16).every(v=>v===255));
    assert(c.get(cell).carry,'old art was used after residency invalidation');
    c.word(BUDGET,1);assert(!c.get(cell).carry);
    assert.notEqual(c.read(PENDING),0,'cell must be uploaded again');
  }
});
