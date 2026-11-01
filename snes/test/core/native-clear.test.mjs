// Differential coverage for the assembled native FE00 work-buffer clear.
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
 const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write ${a.toString(16)}`);ram[at(a)]=v;}});
 return ({p=0,a=0xABCD,x=0x1234,y=0x5678,sp=0x1FFD,dp=0x24F1,db=0x80}={})=>{
  seed.copy(ram);cpu.reset();cpu.e=false;
  for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
  cpu.r[0]=db;cpu.r[1]=0xC0;cpu.br.set([a,x,y,sp,0x5D46,dp]);
  let n=0,cycles=0;
  while(cpu.br[4]!==0x5D68||cpu.r[1]!==0xC0){
   assert(++n<10000,'native clear did not reach continuation');
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
 if(!a.ram.equals(b.ram)){const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}, ${why}`);}
 return [a.cycles,b.cycles];
}
test('native FE00 clear preserves RAM, stack, registers and flags for all caller states',t=>{
 let before=0,after=0;
 for(let p=0;p<256;p++)for(const dp of [0,0x1234,0x8000])for(const db of [0,0x7E,0xFF]){
  const [a,b]=compare({p,dp,db,a:p*257,x:p*513,y:p*1025});before+=a;after+=b;
 }
 for(const sp of [0x1F01,0x1EFA,0x1EFB,0x1EFC,0x1EFD,0x1EFE,0x1EFF,0x1F00])compare({sp});
 const [a,b]=compare();
 assert(b<a*.35,`cycles ${a} -> ${b}`);
 t.diagnostic(`512-byte clear: ${a} -> ${b} CPU cycles; aggregate ${before} -> ${after}`);
});
