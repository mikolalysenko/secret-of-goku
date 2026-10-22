// Compare the rewritten relative jump (C1:0245) and the wrappers that enter it
// with the retail routine: every operand byte pair, entry widths and flags
// (decimal included), D, DB, Y and wrapped script pointers. The stack frame
// retail built below S is dead after the return and is not compared.
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
// The jump body and the wrappers that reach it after 1-5 operand bytes.
const entries=[[0x0245,0],[0x0285,1],[0x028D,2],[0x0296,3],[0x02A0,4],[0x02AB,5]];
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
function runner(rom){
  const ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;}});
  return ({entry=0x0245,prefix=0,script=0x1234,b0=0x85,b1=0x12,p=0x20,dp=0,db=0x7E,y=0xE600}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const bank=db===0x7F?0x10000:0;
    ram.writeUInt16LE(script,bank+((y+0x144)&0xFFFF));
    cpu.r[0]=db;cpu.r[1]=0xC1;
    // The body is entered with X = the operand address; wrappers load it.
    const x=entry===0x0245?script:0xBEEF;
    cpu.br.set([0xABCD,x,y,0x1FFD,entry,dp]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    const operand=(script+prefix)&65535;
    const o0=hiromToPc(0xD04F15+operand,rom.length),o1=hiromToPc(0xD04F15+((operand+1)&65535),rom.length);
    const old0=rom[o0],old1=rom[o1];rom[o0]=b0;rom[o1]=b1;
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==0xC1;n++){
      assert(n<1000,'relative jump did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    rom[o0]=old0;rom[o1]=old1;
    ram.fill(0,0x1F00,0x2000); // inactive stack bytes are not live outputs
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:Buffer.from(ram),cycles};
  };
}
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const reference=Buffer.from(source),retail=readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
// Keep the port's script data and wrappers in both machines; restore the body.
retail.copy(reference,0x10245,0x10245,0x10285);
const before=runner(reference),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,'registers '+why);
  assert.deepEqual(b.flags,a.flags,'flags '+why);
  assert(a.ram.equals(b.ram),'RAM '+why);
  assert(b.cycles<a.cycles,'no cycle reduction '+why);
  return [a.cycles,b.cycles];
}
test('relative jump retains every operand pair and script pointer',t=>{
  for(let b0=0;b0<256;b0++)for(let b1=0;b1<256;b1++)compare({b0,b1});
  for(const script of [0,1,0x7F,0x80,0xFF,0x100,0x7FFF,0x8000,0xFF7F,0xFFFD,0xFFFE,0xFFFF])
    for(const b0 of [0x00,0x01,0x3F,0x40,0x7F,0x80,0x81,0xBF,0xC0,0xFF])for(const b1 of [0,0x7F,0x80,0xFF])
      compare({script,b0,b1});
  t.diagnostic('short forward '+compare({b0:0x85}).join(' -> ')+', short back '+compare({b0:0xF0}).join(' -> ')+
    ', long forward '+compare({b0:0x01,b1:0x20}).join(' -> ')+', long back '+compare({b0:0x7F,b1:0xF0}).join(' -> ')+' CPU cycles');
});
test('relative jump keeps entry widths, flags (decimal too), D, DB and Y',()=>{
  // X16 only: retail's frame pushes two index bytes and its caller guarantees X16.
  for(let p=0;p<256;p++)if(!(p&16))for(const b0 of [0x05,0x45,0x85,0xC5,0xFF])for(const b1 of [0x00,0x99,0xFF])
    for(const script of [0x0099,0x1234,0xFFFE])compare({p,b0,b1,script});
  for(const dp of [0,0x1201,0x1EFF,0x0400])for(const db of [0x7E,0x7F])for(const y of [0xE000,0xE600,0xEA00,0x0080])
    for(const b0 of [0x05,0x85,0xC5])compare({dp,db,y,b0,p:0x20});
});
test('wrappers reach the jump with the same results',()=>{
  for(const [entry,prefix] of entries)for(let b0=0;b0<256;b0++)for(const b1 of [0,0x40,0x80,0xFF])
    for(const p of [0x20,0x00,0x28,0xE3])compare({entry,prefix,b0,b1,p});
});
