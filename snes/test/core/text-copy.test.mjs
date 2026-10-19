// Compare the assembled message-graphics copy with the retail byte loop,
// including its accumulator high byte, flags, indexes and nonstandard paths.
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
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write ${a.toString(16)}`);ram[at(a)]=v;},
  });
  return ({src=0x9000,dst=0x9400,groups=56,db=0x7E,p=0x20,dp=0,entry=0x14C6,pattern=null}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=db;cpu.r[1]=0xC0;
    cpu.br.set([0xABCD,dst,src,0x1FFD,entry,dp]);
    ram[(db===0x7F?0x10000:0)+0xA171]=groups;
    if(pattern!==null)for(let i=0;i<384;i++)ram[(db===0x7F?0x10000:0)+0x9000+i]=(i*pattern+(i>>4)*19)&255;
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC0){
      assert(++n<50000,`text copy did not return ${JSON.stringify({src,dst,groups,db,p,dp})}`);
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
  if(!a.ram.equals(b.ram)){
    const i=b.ram.findIndex((v,i)=>v!==a.ram[i]);
    assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}, ${why}`);
  }
  return [a.cycles,b.cycles];
}
test('message block copies retain every byte and the retail CPU contract',t=>{
  for(let groups=1;groups<=56;groups++)
    for(let src=0x9000;src+groups*16<=0x9400;src+=16)compare({groups,src});
  for(let p=0x20;p<256;p++)if((p&0x30)===0x20)
    for(const dp of [0,0x1234,0x8000])compare({p,dp});
  const [before,after]=compare({});
  assert(after<before*.35,`text copy cycles ${before} -> ${after}`);
  t.diagnostic(`896-byte message copy: ${before} -> ${after} CPU cycles`);
});
test('nonstandard message copy inputs retain the original loop',()=>{
  for(const src of [0,0x8FFF,0x9001,0x93E1,0x93FF,0x9400,0xFFF0])
    for(const dst of [0x7000,0x93FF,0x9400,0x9800])
      for(const groups of [1,2,56])compare({src,dst,groups});
  compare({groups:0,dst:0x7000});
  compare({groups:57,dst:0x7000});
  compare({groups:56,db:0x7F});
  for(const p of [0x30,0x38,0xF1,0xF9])compare({src:0x80,dst:0x40,groups:2,p});
});
test('message glyph expansion and outline preserve all tiles and CPU state',t=>{
  for(let pattern=0;pattern<256;pattern++)compare({entry:0x15B9,pattern});
  for(let p=0x20;p<256;p++)if((p&0x30)===0x20)
    for(const dp of [0,0x1234,0x8000])compare({entry:0x15B9,p,dp});
  compare({entry:0x15B9,db:0x7F});
  const [before,after]=compare({entry:0x15B9});
  assert(after<before*.5,`glyph cycles ${before} -> ${after}`);
  t.diagnostic(`32 native message glyphs: ${before} -> ${after} CPU cycles`);
});
test('horizontal text outlines preserve carry between rows and glyphs',t=>{
  for(let pattern=0;pattern<256;pattern++)
    for(const p of [0x20,0x21])compare({entry:0x162C,pattern,p});
  for(let p=0x20;p<256;p++)if((p&0x30)===0x20)
    for(const dp of [0,0x1234,0x8000])compare({entry:0x162C,p,dp});
  compare({entry:0x162C,db:0x7F});
  const [before,after]=compare({entry:0x162C});
  assert(after<before*.75,`outline cycles ${before} -> ${after}`);
  t.diagnostic(`32 native horizontal outlines: ${before} -> ${after} CPU cycles`);
});
