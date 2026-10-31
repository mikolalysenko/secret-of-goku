// The fixed Hydra graphics copy is byte-for-byte and CPU-state compatible
// with the retail bit decoder; every nonmatching input keeps that decoder.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
function runner(rom){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write ${a.toString(16)}`);ram[at(a)]=v;},
  });
  return ({src=0xDBD989,dst=0x7F7000,count=2048,prev=0,older=0,p=0}={})=>{
    for(let i=0;i<ram.length;i++)ram[i]=(i*71+(i>>8)*17)&255;
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=0;cpu.r[1]=0xC2;
    cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,0x24F1,0x200]);
    const w=(a,v)=>ram.writeUInt16LE(v,0x200+a);
    w(0x68,count);w(0x6A,prev);w(0x6C,older);
    w(0x79,src&65535);ram[0x200+0x7B]=src>>>16;
    w(0x7C,dst&65535);ram[0x200+0x7E]=dst>>>16;
    let n=0,cycles=0;
    while(cpu.br[4]!==0x2533||cpu.r[1]!==0xC2){
      assert(++n<100000,'native decoder did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  if(!a.ram.equals(b.ram)){
    const i=b.ram.findIndex((v,i)=>v!==a.ram[i]);
    assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}, ${why}`);
  }
  return [a.cycles,b.cycles];
}
test('Hydra graphics copy preserves every decoded byte and the native CPU contract',t=>{
  const [before,after]=compare();
  assert(after<before*.2,`decoder cycles ${before} -> ${after}`);
  t.diagnostic(`2,048-byte Hydra graphics decode: ${before} -> ${after} CPU cycles`);
});
test('other streams, destinations and initial histories retain the retail decoder',()=>{
  for(const input of [
    {src:0xDBD98A,count:64},{dst:0x7E7000,count:64},{count:64},
    {prev:0x1234,count:64},{older:0x5678,count:64},
    {src:0xDBD98A,count:2048},{dst:0x7F6000,count:2048},{count:1024},
    {p:0xC1,count:64},{p:0x41,count:64},
  ])compare(input);
});
