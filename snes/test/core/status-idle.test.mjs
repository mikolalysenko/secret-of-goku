// Execute C8:E301's idle status helper against the same ROM with only its
// four original entry bytes restored. The fast path must retain every scratch
// byte and flag, including the retail comparison's final carry.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const retail=readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
const reference=Buffer.from(source);
retail.copy(reference,0x8E301,0x8E301,0x8E305);
const flags=['c','z','i','d','x','m','v','n'];
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;

function runner(rom){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const r=at(a);assert(r>=0,`unexpected status write ${a.toString(16)}`);ram[r]=v;},
  });
  return ({x=0x400,e190=0,e1aa=0x800,e1ee=0,v9a=0,p=0x10,dp=0x300,db=0x7E}={})=>{
    seed.copy(ram);
    ram.writeUInt16LE(e190,0xE190+x);
    ram.writeUInt16LE(e1aa,0xE1AA+x);
    ram.writeUInt16LE(e1ee,0xE1EE+x);
    ram.writeUInt16LE(v9a,dp+0x9A);
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.m=true;cpu.x=false;cpu.r[0]=db;cpu.r[1]=0xC8;
    let sp=0x1FFF;
    ram[sp--]=0xC0;ram[sp--]=0x3B;ram[sp--]=0x24;
    cpu.br.set([0x1234,x,0xBEEF,sp,0xE301,dp]);
    let cycles=0,n=0;
    while(((cpu.r[1]<<16)|cpu.br[4])!==0xC03B25){
      assert(++n<300,`status helper did not return at ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles};
  };
}
const before=runner(reference),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  return {before:a.cycles,after:b.cycles};
}

test('idle status helper preserves all scratch and flags, including final carry',t=>{
  for(const x of [0,0x200,0x400,0x600])for(const e1aa of [0,1,0x800,0x7FFC,0xFFFF])
    for(const p of [0,1,2,4,8,0x10,0x20,0x40,0x80,0xFF])compare({x,e1aa,p});
  for(const dp of [0,0x20,0x300,0x1234])compare({dp});
  const r=compare({});
  assert.equal(r.before-r.after,59);
  assert(after({}).flags[0]===true,'retail idle exit leaves carry set');
  t.diagnostic(`idle native status helper: ${r.before} -> ${r.after} CPU cycles`);
});

test('nonzero status and pending words rejoin the retail helper exactly',t=>{
  const cases=[
    {e190:1},{e190:2},{e190:4,e1aa:4},{e190:0x800,e1aa:0x800},
    {v9a:1,e1aa:1},{v9a:0x800,e1aa:0x800},
  ];
  for(const input of cases)for(const x of [0,0x200,0x400,0x600])compare({...input,x});
  const r=compare({e190:1});
  assert.equal(r.after-r.before,27);
  t.diagnostic(`nonzero input retains retail work: ${r.before} -> ${r.after} CPU cycles`);
});
