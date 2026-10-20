// Compare the assembled actor palette loader with retail, including both
// WRAM mirrors, every caller register/flag, and the unusual-loop fallback.
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
  let multiplicand=0,product=0;
  const cpu=new context.Cpu({
    cpuRead:a=>{
      if(a===0x4216)return product&255;
      if(a===0x4217)return product>>>8;
      const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
    },
    cpuWrite:(a,v)=>{
      if(a===0x4202){multiplicand=v;return;}
      if(a===0x4203){product=multiplicand*v;return;}
      const r=at(a);assert(r>=0,`unexpected palette write $${a.toString(16)}`);ram[r]=v;
    },
  });
  return ({species=0,actor=0x600,status=0,destination=0x62,p=0,db=0x7E,dp=0,
    loop=false,x=0,y=0,count=15}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;multiplicand=product=0;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const base=db===0x7F?0x10000:0;
    cpu.r[0]=db;cpu.r[1]=0x81;
    let sp=0x1FFF;
    // Both entry points use RTS; the loop entry also has saved X and Y.
    const push=v=>{ram[sp--]=(v>>>8)&255;ram[sp--]=v&255;};
    push(0x6FFF);
    if(loop){
      if(p&16){ram[sp--]=0xBC;ram[sp--]=0x7A;}else{push(0xABCD);push(0x5678);}
      ram.writeUInt16LE(count,dp);
    }else{
      ram[base+0xE180+actor]=species;ram[base+0xE191+actor]=status;
      ram.writeUInt16LE(destination,base+0xE0F8+actor);
    }
    cpu.br.set([0x1234,loop?x:actor,loop?y:0xABCD,sp,loop?0xE05A:0xE022,dp]);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0x81){
      assert(++n<10000,'palette helper did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,product,cycles};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert.equal(b.product,a.product,`hardware multiply ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  return {before:a.cycles,after:b.cycles};
}
test('native palette loader preserves every species and party status palette',t=>{
  for(let species=0;species<256;species++)for(const actor of [0,0x200,0x400,0x600,0x800,0xA00])
    for(const status of [0,0x20,0xFF])compare({species,actor,status,destination:2+(actor>>4)});
  const r=compare({species:12});
  assert(r.after<r.before*.8,JSON.stringify(r));
  t.diagnostic(`native actor palette: ${r.before} -> ${r.after} CPU cycles`);
});
test('native palette copy retains CPU context, word boundaries and narrow-index fallback',()=>{
  for(let p=0;p<256;p++)if(!(p&16))for(const db of [0x7E,0x7F])for(const dp of [0,0x1234,0x1800])
    for(const destination of [0,2,0x62,0xFF,0x100,0x201])compare({p,db,dp,destination});
  for(const count of [1,2,14,15,16,31])for(const x of [0,0x1DE2,0xFFE2,0xFFE3,0xFFE4,0xFFFF])
    for(const y of [0,0x62,0xFFE2,0xFFE3,0xFFE4,0xFFFF])compare({loop:true,count,x,y});
  for(const count of [1,15,31])for(const x of [0,1,254,255])for(const y of [0,1,254,255])
    for(const p of [0x10,0x19,0xD7])compare({loop:true,count,x,y,p});
});
