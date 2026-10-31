// Object-name VRAM streaming: the unrolled replacement must be byte-for-byte
// identical at the native continuation, including flags and the final Y.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const romPath=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const patched=readFileSync(romPath);
const symbols=new Map([...readFileSync(romPath.replace(/\.sfc$/,'.sym'),'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
function machine(rom,entry){
  const ram=new Uint8Array(0x20000),writes=[];
  const cpu=new context.Cpu({cpuRead:a=>{
    const bank=a>>>16;if(bank===0x7E)return ram[a&0xFFFF];if(bank===0x7F)return ram[0x10000+(a&0xFFFF)];
    return rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a===0x2180){writes.push(v);return;}
    const bank=a>>>16;if(bank===0x7E)ram[a&0xFFFF]=v;else if(bank===0x7F)ram[0x10000+(a&0xFFFF)]=v;
  }});
  return source=>{
    ram.set(source,0x100);ram[0x76]=0;ram[0x77]=1;ram[0x78]=0x7F;
    cpu.reset();cpu.e=false;cpu.m=true;cpu.x=true;cpu.r[0]=0xC2;cpu.r[1]=entry>>>16;
    cpu.br.set([0xA5,0xBEEF,0x1234,0x1FFD,entry&0xFFFF,0]);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x0E90;n++){
      assert(n<500,`object-name stream did not reach continuation: ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    return{writes,registers:[...cpu.r,...cpu.br],flags:['c','z','i','d','x','m','v','n','e'].map(f=>cpu[f]),cycles};
  };
}
const old=machine(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')),0xC20E83);
const next=machine(patched,symbols.get('core_native_obj_names'));
test('object-name streaming preserves all VRAM writes and CPU results',()=>{
  let before=0,after=0;
  for(let seed=0;seed<256;seed++){
    const source=Uint8Array.from({length:77},(_,i)=>(Math.imul(seed+1,73)+i*151+i*i*17)&255);
    const a=old(source),b=next(source);before+=a.cycles;after+=b.cycles;
    assert.deepEqual(b.writes,a.writes,`source ${seed} VRAM bytes`);
    assert.deepEqual(b.registers,a.registers,`source ${seed} registers`);
    assert.deepEqual(b.flags,a.flags,`source ${seed} flags`);
  }
  assert(after<before*.75,`cycles ${before} -> ${after}`);
});
