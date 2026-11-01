// Native palette expansion must retain all three planes, pointer advancement,
// source registers and final flags while reading each color only once.
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
const seed=Buffer.alloc(0x20000);for(let i=0;i<seed.length;i++)seed[i]=(i*89+(i>>8)*31)&255;
function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;}});
  return ({count=32,source=0x7000,dest=0x8000,p=0,initialX=0xABCD,initialY=0x1234}={})=>{
    seed.copy(ram);ram.writeUInt16LE(source,0x0276);ram.writeUInt16LE(dest,0x0279);ram.writeUInt16LE(count,0x0266);
    ram.writeUInt16LE(0,0x02C5);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    for(const [i,f] of names.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    cpu.r.set([0x7F,0xC2]);cpu.br.set([0x5555,initialX,initialY,0x1FFD,0x28C6,0x0200]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x7000;n++){
      assert(n<10000,`palette expansion did not return at $${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)} Y ${cpu.br[2].toString(16)}`);cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),registers:[...cpu.r,...cpu.br],flags:names.map(f=>cpu[f]),cycles};
  };
}
const before=runner(resolve(root,'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  if(!a.ram.equals(b.ram)){const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);assert.fail(`RAM $${i.toString(16)} ${a.ram[i]} -> ${b.ram[i]} ${why}`);}
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  return [a.cycles,b.cycles];
}

test('native palette expansion preserves every output and CPU result',t=>{
  for(const count of [2,4,16,32,48,254])for(const p of [0,1,4,8,0x40,0x80,0xCF])compare({count,p});
  for(const source of [0x6000,0x7000,0xFF00])for(const dest of [0x8000,0xBC00])compare({source,dest,count:32});
  const [oldCycles,newCycles]=compare({});
  assert(newCycles<oldCycles*.95,`palette cycles ${oldCycles} -> ${newCycles}`);
  t.diagnostic(`16 colors: ${oldCycles} -> ${newCycles} CPU cycles`);
});
