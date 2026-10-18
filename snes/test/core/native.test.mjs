// Execute the original and replacement machine code on all 16-bit inputs.
// This catches width/flag/stack contracts that a JS reimplementation would miss.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
function runner(rom){
  const ram=new Uint8Array(65536);
  const cpu=new context.Cpu({cpuRead:a=>a<65536?ram[a]:rom[hiromToPc(a,rom.length)],cpuWrite:(a,v)=>{assert(a<65536);ram[a]=v;}});
  return (input,flags=0,dp=0)=>{
    cpu.reset();cpu.e=false;
    for(const [i,f]of ['c','z','i','d','x','m','v','n'].entries())cpu[f]=!!(flags&(1<<i));
    cpu.r[0]=0x7E;cpu.r[1]=0xC1;
    cpu.br.set([0xABCD,input,flags&16?0xEF:0xBEEF,0x1FFD,0x2710,dp]);
    ram[0x1FFE]=0xFF;ram[0x1FFF]=0x6F; // RTS sentinel C1:7000
    let instructions=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC1){
      assert(++instructions<200,'routine did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    return {registers:[...cpu.r,...cpu.br],flags:['c','z','i','d','x','m','v','n','e'].map(f=>cpu[f]),cycles};
  };
}
test('native high-bit helper preserves the retail CPU contract for every input',()=>{
  const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
  const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
  for(let input=0;input<65536;input++){
    // Cover all P combinations, decimal included, plus different PLD NZ.
    const flags=(input>>8)&~16,dp=[0,0x1234,0x8000][input%3];
    const a=old(input,flags,dp),b=next(input,flags,dp);
    delete a.cycles;delete b.cycles;
    assert.deepEqual(b,a,`input ${input}`);
  }
  for(let flags=0;flags<256;flags++)for(const input of [0,1,2,63,127,128,255]){
    const a=old(input,flags,0x80),b=next(input,flags,0x80);
    delete a.cycles;delete b.cycles;assert.deepEqual(b,a,`flags ${flags}, input ${input}`);
  }
  // Target masks in real AI are usually zero or small, not uniform words.
  let smallBefore=0,smallAfter=0;
  for(let input=0;input<256;input++){smallBefore+=old(input).cycles;smallAfter+=next(input).cycles;}
  assert(smallAfter<smallBefore*.7,`small-mask cycles ${smallBefore} -> ${smallAfter}`);
});
