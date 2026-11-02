// C2:29CE's fused 96-byte add and 32-byte packed output.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;}});
  return ({p=0,initialY=0x1234,seed=0,record=0xE600}={})=>{
    for(let i=0;i<ram.length;i++)ram[i]=(i*73+seed*29+11)&255;
    ram.writeUInt16LE(0x2000,0x76);ram.writeUInt16LE(0x3000,0x79);
    ram.writeUInt16LE(96,0x66);ram.writeUInt16LE(0,0xC5);ram.writeUInt16LE(record,0x87);
    ram.writeUInt16LE(0x4000,record+0x29);ram.writeUInt16LE(1,record+0x9A);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    for(const [i,f] of flags.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    cpu.r.set([0x7E,0xC2]);cpu.br.set([0xABCD,record,initialY,0x1EFD,0x29CE,0]);
    ram.writeUInt16LE(0x6FFF,0x1EFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x7000;n++){
      assert(n<10000,'native add/pack did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1EF0,0x1F00);
    return {ram:Buffer.from(ram),registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),cycles};
  };
}
const before=runner(resolve(root,'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  if(!a.ram.equals(b.ram)){
    const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);assert.fail(`RAM $${i.toString(16)} ${a.ram[i]} -> ${b.ram[i]} ${why}`);
  }
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  return [a,b];
}

test('fused native add/pack preserves every output and reduces hot-path cost',t=>{
  let oldTotal=0,newTotal=0;
  for(const p of [0,1,4,8,0xC5,0xF5])for(const seed of [0,1,2,255])for(const record of [0xE600,0xE800]){
    const [a,b]=compare({p,seed,record});oldTotal+=a.cycles;newTotal+=b.cycles;
  }
  t.diagnostic(`96-byte add + pack: ${oldTotal} -> ${newTotal} CPU cycles`);
  assert(newTotal<oldTotal*.85,`add/pack cycles ${oldTotal} -> ${newTotal}`);
});
