// Compare the assembled replacement with the retail decoder, including
// every output byte, direct-page scratch, registers, flags and fallbacks.
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
  const ram=new Uint8Array(0x20000);
  const ramAt=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>{const r=ramAt(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const r=ramAt(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;},
  });
  return ({slot=0,p=0,dp=0,db=0x7E,bank=0xD1,source=0xF100,count=50,dest=0x0800,actor=slot*512}={})=>{
    for(let i=0;i<ram.length;i++)ram[i]=(i*71+(i>>8)*17)&255;
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=db;cpu.r[1]=0xC1;
    cpu.br.set([0xAB00|bank,actor,source,0x1FFC,0xC599,dp]);
    ram[dp]=dest&255;ram[dp+1]=dest>>8;ram[dp+8]=count;ram[dp+9]=0xA7;
    ram[0x1FFD]=0xFF;ram[0x1FFE]=0x6F;ram[0x1FFF]=0xC1; // RTL sentinel
    let instructions=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC1){
      assert(++instructions<100000,'decoder did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    // Inactive stack bytes are not an output of either routine.
    ram.fill(0,0x1F00,0x2000);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:ram.slice(),cycles};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input,fast=false){
  const a=old(input),b=next(input),before=a.cycles,after=b.cycles;
  delete a.cycles;delete b.cycles;
  assert.deepEqual(b.registers,a.registers,`registers ${JSON.stringify(input)}`);
  assert.deepEqual(b.flags,a.flags,`flags ${JSON.stringify(input)}`);
  // Avoid flooding test output with the entire 128 KiB on a mismatch.
  const mismatch=b.ram.findIndex((v,i)=>v!==a.ram[i]);
  assert.equal(mismatch,-1,`RAM $${mismatch.toString(16)}: ${a.ram[mismatch]} -> ${b.ram[mismatch]}, ${JSON.stringify(input)}`);
  if(fast)assert(after<before*.5,`cycles ${before} -> ${after}`);
}
test('predecoded death graphics exactly match all retail colour variants',()=>{
  for(let slot=0;slot<6;slot++)for(const p of [0,0x21,0xC6,0xE7])for(const dp of [0,0x100])
    compare({slot,p,dp,db:[0,0x7E,0x80][slot%3]},true);
});
test('other source sheets, layouts and decimal mode retain the retail decoder',()=>{
  for(const input of [
    {bank:0xD4,source:0,count:64,dest:0},
    {bank:0xD4,source:0xBA00,count:64},
    {bank:0xD0,source:0xDF00,count:64,dest:0},
    {bank:0x7E,source:0xC000,count:4},
    {source:0xF118},{count:1},{count:0},{dest:0},
    {actor:0xC00},{actor:0x601},{p:8},{p:0xE9,slot:5},
    {p:0x30,source:0x80},
  ])compare(input);
});
