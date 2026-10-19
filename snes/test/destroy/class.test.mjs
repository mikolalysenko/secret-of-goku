// Execute both class-cache entries against the uncached classifier. Attack
// scans may discard descriptor scratch; floor sampling must retain it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
import {destroyAbi} from './abi.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const abi=destroyAbi(),d=abi.RAM_DESTROY&65535;
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x33&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const cache=at(abi.DQ+0x400),scratch=at(abi.DQ+0x6FC);
const seed=Buffer.alloc(0x22000),ram=Buffer.alloc(seed.length);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
let writes;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{
    const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);
    writes.add(p);ram[p]=v;
  },
});
function run(name,{tile=7,layer=0,map=128,flags=0,beh=0,code=0xC1,cached=15,dp=0,p=4}={}){
  const entry=symbols.get(name);assert(entry,`missing ${name}`);
  seed.copy(ram);writes=new Set();
  const info=hiromToPc(symbols.get('destroy_map_info')+map*8,rom.length);
  ram.writeUInt16LE(map,d);ram.writeUInt16LE(layer,d+0x44);
  ram.writeUInt16LE(rom[info],d+0x2C);ram.writeUInt16LE(rom[info]&63,d+0x2E);
  ram.writeUInt16LE(rom[info+2],d+0x30);ram.writeUInt16LE(rom[info+1],d+0x32);
  const desc=0x1B800+layer*0x400+tile*4;
  ram[desc]=flags;ram[desc+1]=beh;ram[desc+2]=code;
  const index=cache+layer*128+(tile>>1),shift=(tile&1)*4;
  ram[index]=(ram[index]&~(15<<shift))|(cached<<shift);
  const before=Buffer.from(ram);
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.c=!!(p&1);cpu.i=!!(p&4);cpu.v=!!(p&64);cpu.n=!!(p&128);
  cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
  cpu.br.set([tile|(name==='dst_class_of'?layer<<8:0xAB00),0xF1F2,0xC1C2,0x1FFD,entry&65535,dp]);
  ram.writeUInt16LE(0x6FFF,0x1FFE);
  let n=0,cycles=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
    assert(++n<1000,'class query did not return');
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],dp);assert.equal(cpu.r[0],0x7E);
  assert.equal(cpu.m,false);assert.equal(cpu.x,false);assert.equal(cpu.i,!!(p&4));
  const value=cpu.br[0];assert(value<15,'classifier emitted the unknown sentinel');
  if(name!=='dst_class_of'){
    assert.equal(cpu.br[1],tile,'tile return');
    if(name==='dst_cell_class')assert.equal(cpu.br[2],0xC1C2,'preserved Y');
    const expected=(before[index]&~(15<<shift))|(value<<shift);
    assert.equal(ram[index],expected,'class cache and neighbouring nibble');
    const volatile=new Set();
    if(name==='dst_cell_class_fast')for(const offset of [0x48,0x50,0x5A,0x5C,0x5E,0x60,0x62,0x66]){
      volatile.add(d+offset);volatile.add(d+offset+1);
    }
    for(const a of writes){
      if(a>=0x1F80&&a<0x2000||a===index||a>=scratch&&a<scratch+4||volatile.has(a))continue;
      assert.equal(ram[a],before[a],`clobbered $${a.toString(16)} in ${name}`);
    }
  }
  return {value,cycles};
}
function compare(input){
  const expected=input.cached!==undefined&&input.cached<15?input.cached:run('dst_class_of',input).value;
  const full=run('dst_cell_class',input),fast=run('dst_cell_class_fast',input);
  assert.equal(full.value,expected,JSON.stringify(input));
  assert.equal(fast.value,expected,JSON.stringify(input));
  assert(fast.cycles<=full.cycles+3,'attack path costs more than the preserving entry');
  return [full.cycles,fast.cycles];
}
test('attack and floor class queries agree across tiles, layers and map policies',t=>{
  for(const map of [128,29,271,139,313,432])for(const layer of [0,1])for(let tile=0;tile<256;tile++)
    compare({map,layer,tile,flags:(tile*31)&255,beh:(tile*71)&255,code:tile});
  for(const layer of [0,1])for(let byte=0;byte<256;byte++){
    compare({layer,flags:byte,code:0});
    compare({layer,beh:byte,code:0});
    compare({layer,code:byte});
  }
  const [before,after]=compare({});
  t.diagnostic(`cold cut-tile classification: ${before} -> ${after} CPU cycles`);
});
test('live class-cache nibbles and caller scratch survive both entry points',()=>{
  for(const layer of [0,1])for(const tile of [0,1,127,128,254,255])for(let cached=0;cached<15;cached++)
    compare({layer,tile,cached});
  for(const dp of [0,0x1234,0x8000])for(const p of [0,1,4,0xC5])for(const cached of [0,5,15])
    compare({dp,p,cached});
});
