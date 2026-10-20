// Execute the empty native status-effect scan against retail. Nonempty
// masks must reach its original loop with exactly the original CPU/RAM.
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
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
function runner(rom){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const r=at(a);assert(r>=0,`unexpected status write $${a.toString(16)}`);ram[r]=v;},
  });
  return ({mask=0,p=0,dp=0,db=0x7E}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=db;cpu.r[1]=0xC0;
    let sp=0x1FFF;
    const push=v=>{ram[sp--]=(v>>>8)&255;ram[sp--]=v&255;};
    ram[sp--]=0x80;push(0x6FFF);
    if(p&16){ram[sp--]=0x68;ram[sp--]=0xCD;}else{push(0x8168);push(0xABCD);}
    ram.writeUInt16LE(mask,dp+0xD8);
    cpu.br.set([0x1234,p&16?0x68:0x8168,p&16?0xCD:0xABCD,sp,0x5AA7,dp]);
    const stop=mask?0xC05AAE:0x807000;
    let n=0,cycles=0;
    while(((cpu.r[1]<<16)|cpu.br[4])!==stop){
      assert(++n<300,'status helper did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  return {before:a.cycles,after:b.cycles};
}
test('empty status scans preserve all CPU flags and scratch',t=>{
  for(let p=0;p<256;p++)for(const dp of [0,0x20,0x1234])for(const db of [0,0x7E,0x7F,0xC0])
    compare({p,dp,db});
  const r=compare({});assert(r.after<r.before*.25,JSON.stringify(r));
  t.diagnostic(`empty native status scan: ${r.before} -> ${r.after} CPU cycles`);
});
test('every nonempty status mask retains the retail loop',()=>{
  for(let mask=1;mask<65536;mask++)compare({mask,p:mask&255,dp:mask&1?0:0x1234});
});
