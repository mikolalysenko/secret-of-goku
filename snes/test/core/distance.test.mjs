// Execute both 65816 implementations. Compare the helper's complete CPU
// contract and all RAM outside dead stack locals, not just a JS formula.
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
  let multiplicand=0,product=0;
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a===0x4216)return product&255;
    if(a===0x4217)return product>>8;
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a===0x4202){multiplicand=v;return;}
    if(a===0x4203){product=multiplicand*v;return;}
    const r=at(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  return ({a=[128,112,0],b=[128,112,0],p=0,dp=0}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const x=p&16?0x40:0xE000,y=p&16?0xA0:0xE200;
    cpu.r[0]=0x7E;cpu.r[1]=0xC1;
    cpu.br.set([0xABCD,x,y,0x1FFD,0x0358,dp]);
    for(const [base,[px,py,h]]of [[x,a],[y,b]]){
      ram.writeUInt16LE(px&65535,base+0x20);
      ram.writeUInt16LE(py&65535,base+0x22);ram[base+0x45]=h&255;
    }
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC1){
      assert(++n<1000,`distance helper did not return ${JSON.stringify({a,b,p,dp})}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  return [a.cycles,b.cycles];
}
test('AI distance lookup matches every pair of byte magnitudes',()=>{
  for(let xy=0;xy<65536;xy++){
    const dx=xy&255,dy=xy>>8;
    compare({a:[512+(dy&1?-dx:dx),512+(dx&1?-dy:dy)+17,17],b:[512,512+83,83]});
  }
});
test('AI distance preserves wrapping, height, far, width and flag behavior',t=>{
  for(const x of [0,1,16,32,48,64,96,127,128,181,182,255,256,32767,32768,65535])
    for(const y of [0,1,16,32,48,64,96,127,128,181,182,255,256,32767,32768,65535])
      for(const h of [0,1,17,127,255]){
        compare({a:[x,y,h],b:[0,0,0]});
        compare({a:[0,0,0],b:[x,y,h]});
      }
  for(let p=0;p<256;p++)for(const dp of [0,0x1234,0x8000])
    compare({p,dp,a:[192,140,13],b:[128,112,29]});
  const [before,after]=compare({a:[192,140,13],b:[128,112,29]});
  assert(after<before*.75,`distance cycles ${before} -> ${after}`);
  t.diagnostic(`native distance classification: ${before} -> ${after} CPU cycles`);
});
