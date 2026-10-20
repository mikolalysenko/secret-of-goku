// Compare the assembled rejection sampler against the retail helper,
// including every RNG byte, scratch write, CPU flag and return register.
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
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  let draws=0;
  const cpu=new context.Cpu({cpuRead:a=>{
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    const r=at(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
    if(r===0x3CC)draws++;
  }});
  return ({limit=1,index=0,state=Array(15).fill(0),p=0,dp=0,db=0x7E}={})=>{
    seed.copy(ram);draws=0;cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const y=p&16?0xA0:0xE000,script=0x1000;
    cpu.r[0]=db;cpu.r[1]=0xC1;
    cpu.br.set([0xABCD,p&16?0x40:0xE200,y,0x1FFD,0x16F4,dp]);
    ram.writeUInt16LE(script,(db===0x7F?0x10000:0)+y+0x144);
    rom[hiromToPc(0xD04F16+script,rom.length)]=limit;
    rom[hiromToPc(0xD04F16,rom.length)]=limit;
    ram[0x3F0]=index;ram.set(state,0x3F1);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==0xC1;n++){
      assert(n<20000,`random helper did not return ${JSON.stringify({limit,index,state,p,dp,db})}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles,draws};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  assert.equal(b.draws,a.draws,`RNG draws ${why}`);
  return {before:a.cycles,after:b.cycles,draws:a.draws};
}
test('AI random choices preserve the exact sequence for every limit and state index',t=>{
  let longest={draws:0};
  const states=[Array(15).fill(0),Array(15).fill(255),Array.from({length:15},(_,i)=>i)];
  let random=0x17526;
  for(let n=0;n<128;n++)states.push(Array.from({length:15},()=>{
    random^=random<<13;random^=random>>>17;random^=random<<5;return random&255;
  }));
  for(let limit=0;limit<16;limit++)for(let index=0;index<15;index++)for(const state of states){
    const result=compare({limit,index,state});
    if(limit===0)assert.equal(result.draws,0);
    else assert(result.draws>0);
    if(result.draws>longest.draws)longest=result;
  }
  assert(longest.draws>=32,`insufficient rejection coverage: ${longest.draws}`);
  assert(longest.after<longest.before*.45,JSON.stringify(longest));
  t.diagnostic(`longest rejection sequence (${longest.draws} draws): ${longest.before} -> ${longest.after} CPU cycles`);
});
test('AI random choices retain CPU state, argument masking and native fallbacks',t=>{
  for(let p=0;p<256;p++)for(const dp of [0,0x1234,0x8000])for(const db of [0x7E,0x7F])
    for(const limit of [0,1,0xF0,0xFF])compare({p,dp,db,limit});
  const result=compare({limit:15,state:Array(15).fill(3)});
  assert.equal(result.draws,1);assert(result.after<result.before*.7,JSON.stringify(result));
  t.diagnostic(`single random draw: ${result.before} -> ${result.after} CPU cycles`);
});
