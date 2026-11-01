// The field NMI's bank-$00 prologue must enter its identical FastROM mirror
// with exactly the retail register, flag and stack state at C0B3.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const rom=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const names=['c','z','i','d','x','m','v','n'];

test('the field NMI prologue preserves its contract into FastROM',()=>{
  for(const p of [0,1,4,8,0x40,0x80,0xC5,0xFF]){
    const ram=new Uint8Array(0x2000);
    const cpu=new context.Cpu({
      cpuRead:a=>((a>>>16)===0||(a>>>16)===0x7E)&&(a&0xFFFF)<0x2000?ram[a&0x1FFF]:rom[hiromToPc(a,rom.length)],
      cpuWrite:(a,v)=>{assert((a>>>16)===0&&(a&0xFFFF)<0x2000);ram[a&0x1FFF]=v;},
    });
    cpu.reset();cpu.e=false;
    for(const [i,f] of names.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=0x7E;cpu.r[1]=0;
    cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,0xC0A8,0x2345]);
    for(let n=0;cpu.r[1]!==0x80||cpu.br[4]!==0xC0B3;n++){
      assert(n<20,'NMI prologue did not reach its FastROM mirror');
      cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.deepEqual([...cpu.br],[0,0x1234,0x5678,0x1FF4,0xC0B3,0]);
    assert.equal(cpu.r[0],0x7E,'data bank');
    for(const f of ['c','i','d','v'])assert.equal(cpu[f],!!(p&(1<<names.indexOf(f))),f);
    assert(cpu.z&&!cpu.n,'the retail LDA #$0000 sets Z and clears N');
    assert(!cpu.m&&!cpu.x,'NMI must enter the mirror in 16-bit mode');
  }
});
