// C2:2CE6's high-zero 32/32 cases reduce exactly to hardware 16/8.
// Every other shape, zero and decimal mode retain the software routine.
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
const seed=Buffer.alloc(0x20000);for(let i=0;i<seed.length;i++)seed[i]=(i*83+(i>>8)*29)&255;
function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(seed.length),io=Buffer.alloc(0x10000);
  const ramAt=a=>((a>>>16)===0||(a>>>16)===0x7E)&&(a&0xFFFF)<0x2000?a&0x1FFF:
    (a>>>16)===0x7F?0x10000+(a&0xFFFF):-1;
  const ioAt=a=>((a>>>16)&0x7F)<0x40&&(a&0xFFFF)>=0x4200&&(a&0xFFFF)<0x4220?a&0xFFFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    const r=ramAt(a);if(r>=0)return ram[r];const p=ioAt(a);return p>=0?io[p]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    const r=ramAt(a);if(r>=0){ram[r]=v;return;}const p=ioAt(a);assert(p>=0);io[p]=v;
    if(p===0x4206){const n=io.readUInt16LE(0x4204);io.writeUInt16LE(v?Math.floor(n/v):0xFFFF,0x4214);io.writeUInt16LE(v?n%v:n,0x4216);}
  }});
  return ({dividend=12345,highDividend=0,divisor=80,highDivisor=0,dp=0x0200,p=0}={})=>{
    seed.copy(ram);io.fill(0);
    for(const [a,v] of [[0x46,dividend],[0x48,highDividend],[0x4E,divisor],[0x50,highDivisor]])ram.writeUInt16LE(v,dp+a);
    ram.writeUInt16LE(0,dp+0xC5);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    for(const [i,f] of names.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    cpu.r.set([0,0xC2]);cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,0x2CE6,dp]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x7000;n++){
      assert(n<4000,'divider did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
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

test('native high-zero 32-bit division preserves the complete call contract',t=>{
  for(const divisor of [1,2,3,7,15,16,31,127,128,254,255])
    for(const dividend of [0,1,255,256,12345,32768,65535])compare({dividend,divisor});
  for(const input of [{highDividend:1},{highDivisor:1},{divisor:0},{divisor:0,highDivisor:1},
    {divisor:256},{divisor:0xFFFF},{highDividend:0x8000}])compare(input);
  for(const dp of [0,0x0200,0x1234])for(const p of [0,1,4,8,0x40,0x80,0xCF])compare({dp,p});
  const [oldCycles,newCycles]=compare({});
  assert(newCycles<oldCycles*.3,`division cycles ${oldCycles} -> ${newCycles}`);
  t.diagnostic(`12345/80: ${oldCycles} -> ${newCycles} CPU cycles`);
});
