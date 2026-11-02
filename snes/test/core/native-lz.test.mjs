// The predecoded Mana Beast stream must retain every output byte, pointer,
// scratch value and CPU result. Other shapes retain the retail decoder.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const names=['c','z','i','d','x','m','v','n'];
const seed=Buffer.alloc(0x20000);for(let i=0;i<seed.length;i++)seed[i]=(i*79+(i>>8)*23)&255;

function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;}});
  return ({dest=0xBC00,p=0,source=0x5D22,count=72,row=12}={})=>{
    seed.copy(ram);
    ram.writeUInt16LE(source,0x0276);ram[0x0278]=0xC1;
    ram.writeUInt16LE(dest,0x027C);ram[0x027E]=0x7F;
    ram.writeUInt16LE(row,0x0272);ram.writeUInt16LE(count,0x0274);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    for(const [i,f] of names.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    cpu.r.set([0,0xC2]);cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,0x1D7A,0x0200]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x7000;n++){
      assert(n<20000,`decoder did not return at $${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)} count ${ram.readUInt16LE(0x0274)} source ${ram.readUInt16LE(0x0276).toString(16)}`);
      if(process.env.DEBUG_LZ&&n<20)console.log(n,cpu.r[1].toString(16),cpu.br[4].toString(16),cpu.br[0].toString(16),ram.readUInt16LE(0x0276).toString(16));
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),registers:[...cpu.r,...cpu.br],flags:names.map(f=>cpu[f]),cycles};
  };
}
const before=runner(resolve(root,'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  if(!a.ram.equals(b.ram)){
    const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);
    assert.fail(`RAM $${i.toString(16)} ${a.ram[i]} -> ${b.ram[i]} ${why}; old ${a.ram.subarray(0x18000,0x1800C).toString('hex')} new ${b.ram.subarray(0x18000,0x1800C).toString('hex')}`);
  }
  return [a.cycles,b.cycles];
}

test('predecoded Beast graphics preserve the entire decoder contract',t=>{
  for(const dest of [0x8000,0xBC00,0xFA00])for(const p of [0,1,4,8,0x40,0x80,0xCF])compare({dest,p});
  const [oldCycles,newCycles]=compare({});
  assert(newCycles<oldCycles*.35,`decode cycles ${oldCycles} -> ${newCycles}`);
  // A different output count declines the fast path and runs retail code.
  compare({count:64});
  t.diagnostic(`72-byte decode: ${oldCycles} -> ${newCycles} CPU cycles`);
});

test('zero Beast graphics preserve the sparse rows and complete decoder state',t=>{
  for(const dest of [0x8000,0xBC00,0xFA00])for(const p of [0,1,4,8,0x40,0x80,0xCF])
    compare({dest,p,source:0x5DE8,count:256,row:16});
  const [oldCycles,newCycles]=compare({source:0x5DE8,count:256,row:16});
  assert(newCycles<oldCycles*.35,`zero decode cycles ${oldCycles} -> ${newCycles}`);
  compare({source:0x5DE8,count:64,row:16});
  t.diagnostic(`256-byte zero decode: ${oldCycles} -> ${newCycles} CPU cycles`);
});
