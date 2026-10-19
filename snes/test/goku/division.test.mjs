// Execute the assembled pose divider against mathematical division and the
// previous sixteen-step helper, including its CPU flags and scratch state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const entry=symbols.get('goku_div16');assert(entry,'missing goku_div16');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
const reference=Buffer.from(rom);
// STX divisor; STZ remainder; LDY #16; then the original shift/subtract
// loop, ending with LDX remainder; RTS. No optimized helper is called.
reference.set([
  0x8E,0xF8,0xD7,0x9C,0xFA,0xD7,0xA0,0x10,0x00,
  0x0A,0x2E,0xFA,0xD7,0x48,0xAD,0xFA,0xD7,0xCD,0xF8,0xD7,
  0x90,0x0C,0xED,0xF8,0xD7,0x8D,0xFA,0xD7,0x68,0x09,0x01,0x00,
  0x80,0x01,0x68,0x88,0xD0,0xE3,0xAE,0xFA,0xD7,0x60,
],hiromToPc(entry,rom.length));
function runner(bytes){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  let scratch;
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:bytes[hiromToPc(a,bytes.length)],
    cpuWrite:(a,v)=>{
      const r=at(a);
      assert(r>=0&&((r>=scratch&&r<scratch+4)||(r>=0x1F00&&r<0x2000)),
        `unexpected divider write $${a.toString(16)}`);
      ram[r]=v;
    },
  });
  return ({dividend,divisor,p=0,db=0x7E,dp=0})=>{
    scratch=(db===0x7F?0x10000:0)+0xD7F8;
    ram.fill(0xA5,scratch,scratch+4);
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=db;cpu.r[1]=entry>>>16;
    cpu.br.set([dividend,divisor,0xABCD,0x1FFD,entry&65535,dp]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
      assert(++n<1000,'divider did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),
      scratch:[...ram.subarray(scratch,scratch+4)],quotient:cpu.br[0],remainder:cpu.br[1],cycles};
  };
}
const old=runner(reference),next=runner(rom);
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert.deepEqual(b.scratch,a.scratch,`scratch ${why}`);
  if(input.divisor&&!(input.p&8)){
    assert.equal(b.quotient,Math.floor(input.dividend/input.divisor),`quotient ${why}`);
    assert.equal(b.remainder,input.dividend%input.divisor,`remainder ${why}`);
  }
  return {before:a.cycles,after:b.cycles};
}
test('pose division preserves every byte dividend/divisor and all word dividends',t=>{
  for(let dividend=0;dividend<256;dividend++)for(let divisor=1;divisor<256;divisor++)
    compare({dividend,divisor});
  const divisors=[1,2,3,5,6,7,8,12,16,24,30,32,60,120,255,256,257,0x7FFF,0x8000,0x8001,0xFFFF];
  for(let dividend=0;dividend<65536;dividend++)
    compare({dividend,divisor:divisors[dividend%divisors.length]});
  for(const divisor of divisors)for(const dividend of [0,1,divisor-1,divisor,Math.min(65535,divisor+1),255,256,257,0x7FFF,0x8000,0xFFFF])
    compare({dividend,divisor});
  for(const dividend of [0,7,24,120,255,256,65535]){
    const r=compare({dividend,divisor:24});
    if(dividend<256)assert(r.after<r.before*.6,JSON.stringify({dividend,...r}));
    t.diagnostic(`${dividend}/24: ${r.before} -> ${r.after} CPU cycles`);
  }
});
test('pose division preserves CPU context, decimal behavior and zero-divisor fallback',()=>{
  // The helper's contract requires sixteen-bit A/X; all other flags vary.
  for(let p=0;p<256;p++)if(!(p&0x30))for(const db of [0x7E,0x7F])for(const dp of [0,0x1234,0x8000])
    for(const dividend of [0,1,7,24,99,255,256,999,0x7FFF,0x8000,0xFFFF])
      for(const divisor of [0,1,3,24,255,256,0x8000,0xFFFF])compare({dividend,divisor,p,db,dp});
});
