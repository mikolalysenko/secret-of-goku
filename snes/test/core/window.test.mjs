// Opening a native window: the 1,792-byte buffer clear at C0:091A
// (core_native_window_wipe) against retail machine code: registers,
// flags, every byte of WRAM and low RAM (dead callee stack aside), from
// random RAM, data banks and processor flags, including the case the fast
// path declines.
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
let rng=0x1BC0;
const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)%n;};
function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const lost=[];                     // writes to ROM (another data bank): dropped, compared
  const cpu=new ctx.Cpu({cpuRead:a=>{const p=at(a);if(p>=0)return ram[p];const o=hiromToPc(a,rom.length);return o>=0?rom[o]:0;},
    cpuWrite:(a,v)=>{const p=at(a);if(p>=0)ram[p]=v;else lost.push([a,v]);}});
  return input=>{
    input.ram.copy(ram);lost.length=0;cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(input.ps&(1<<i));
    cpu.r.set([input.dbr,0xC0]);cpu.br.set([input.a,input.x,input.y,0x1EFD,input.entry,0]);
    ram.writeUInt16LE(0x6FFF,0x1EFE);
    let cycles=0;
    for(let n=0;!(cpu.br[4]===input.stop&&cpu.r[1]===input.stopBank);n++){
      assert(n<400000,`${path.split('/').pop()} did not return ${JSON.stringify({...input,ram:undefined})} row ${input.ram[0xA165]} col ${input.ram[0xA166]}/${input.ram[0xA158]} width ${input.ram[0xA16C]} pc ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    const out=Buffer.from(ram);out.fill(0,0x1E00,0x1EFE);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:out,lost:[...lost],cycles};
  };
}
const before=runner(resolve(root,process.env.NATIVE_BASELINE_ROM??'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify({...input,ram:undefined});
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert.deepEqual(b.lost,a.lost,`dropped writes ${why}`);
  if(!a.ram.equals(b.ram)){
    const i=b.ram.findIndex((v,k)=>v!==a.ram[k]);
    assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}, ${why}`);
  }
  return [a.cycles,b.cycles];
}
const pick=a=>a[rand(a.length)];
// M8/X16 as both routines are entered; decimal mode now and then.
const pflags=()=>(rand(256)&~0x38)|0x20|(rand(8)?0:0x08);
test('the window buffer clear keeps the retail bytes and MVN state',t=>{
  let cyc=[0,0],n=0;
  for(let i=0;i<60;i++){
    const ram=Buffer.alloc(0x20000);for(let k=0;k<ram.length;k++)ram[k]=rand(256);
    const dbr=i%4===3?pick([0x00,0x7F,0x80]):0x7E,ps=pflags();
    const [a,b]=compare({ram,entry:0x091A,stop:0x092B,stopBank:0xC0,dbr,ps,a:rand(65536),x:rand(65536),y:rand(65536)});
    if(dbr===0x7E){cyc[0]+=a;cyc[1]+=b;n++;}
  }
  t.diagnostic(`1,793-byte clear: ${Math.round(cyc[0]/n)} -> ${Math.round(cyc[1]/n)} CPU cycles`);
  assert(cyc[1]<cyc[0]*0.6,'not faster');
});
