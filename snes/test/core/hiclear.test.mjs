// C0:BCCC, the field frame's OAM reset: the retail high-table loop and the
// unrolled FastROM clear (core_native_hiclear) must leave the same registers,
// flags and RAM, from random RAM, flags and data banks, through the retail
// tail. ($7E:CFF7 stays clear: its C1:0034 call runs unpatched code.)
//   SNES_ROM (default dist/snes/secret-of-goku.sfc); NATIVE_BASELINE_ROM (retail)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const ctx=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),ctx);
const flags=['c','z','i','d','x','m','v','n'];
let rng=0x0A00;
const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)%n;};
function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const io=new Map();
  const cpu=new ctx.Cpu({cpuRead:a=>{const p=at(a);if(p>=0)return ram[p];const o=hiromToPc(a,rom.length);return o>=0?rom[o]:0;},
    cpuWrite:(a,v)=>{const p=at(a);if(p>=0)ram[p]=v;else io.set(a&0xFFFFFF,v);}});
  return input=>{
    input.ram.copy(ram);io.clear();cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(input.ps&(1<<i));
    cpu.r.set([input.dbr,0x00]);cpu.br.set([input.a,input.x,input.y,0x1EFD,0xBCCC,0]);
    ram.writeUInt16LE(0x6FFF,0x1EFE);                 // RTS -> 00:7000 sentinel
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<200000,'BCCC did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    const out=Buffer.from(ram);out.fill(0,0x1E00,0x1EFE);   // dead callee stack
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:out,io:[...io],cycles};
  };
}
const before=runner(resolve(root,process.env.NATIVE_BASELINE_ROM??'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function input(cfff7){
  const ram=Buffer.alloc(0x20000);for(let i=0;i<ram.length;i++)ram[i]=rand(256);
  ram[0xCFF7]=cfff7;
  return {ram,a:rand(65536),x:rand(65536),y:rand(65536),dbr:[0x7E,0x00,0x80][rand(3)],ps:rand(256)&~0x30};
}
test('the high-table clear leaves the retail state', t=>{
  let cyc=[0,0],n=0;
  for(let i=0;i<400;i++){
    const inp=input(0);
    const a=before(inp),b=after(inp);
    assert.deepEqual(b.registers,a.registers,'registers');assert.deepEqual(b.flags,a.flags,'flags');
    assert.deepEqual(b.io,a.io,'I/O writes');
    if(!a.ram.equals(b.ram)){for(let k=0;k<a.ram.length;k++)if(a.ram[k]!==b.ram[k])assert.fail(`RAM $${k.toString(16)}: ${a.ram[k]} -> ${b.ram[k]}`);}
    cyc[0]+=a.cycles;cyc[1]+=b.cycles;n++;
  }
  t.diagnostic(`OAM reset ${Math.round(cyc[0]/n)} -> ${Math.round(cyc[1]/n)} CPU cycles (cpu.js counts, all banks alike)`);
});
