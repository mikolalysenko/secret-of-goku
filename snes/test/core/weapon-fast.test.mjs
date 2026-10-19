// Execute the actual patched JSL sites with and without FastROM mirrors.
// Compare CPU state, palette/actor buffers, scratch and multiplier writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const sites=[[0x8193C9,0x00EA3D],[0x8193DC,0x00E9F4],[0x80EA38,0x0185E4]];
const old=Buffer.from(source);
for(const [site,target] of sites){
  const off=hiromToPc(site,old.length);
  assert.equal(source[off],0x22);
  assert.equal(source.readUIntLE(off+1,3),target|0x800000);
  old.writeUIntLE(target,off+1,3);
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;

function runner(bytes){
  const rom=Buffer.from(bytes),ram=Buffer.alloc(0x20000);
  let multiplicand=0,product=0,slow=0,writes=[];
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a===0x4216)return product&255;
    if(a===0x4217)return product>>>8;
    const p=at(a);if(p>=0)return ram[p];
    if(a<0x800000&&(a>>>16)<0x40&&(a&65535)>=0x8000)slow++;
    return rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a===0x4202){multiplicand=v;writes.push([a,v]);return;}
    if(a===0x4203){product=multiplicand*v;writes.push([a,v]);return;}
    const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;
  }});
  return ({site,slot=3,weapon=0,arg=0,p=0x20})=>{
    seed.copy(ram);slow=0;writes=[];multiplicand=product=0;
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const actor=slot*512;
    ram.writeUInt16LE(actor,0x14);
    ram[0xE1E3+actor]=weapon;ram[0xE069+actor]=arg;
    ram.writeUInt16LE(0x100+slot*32,0xE0F8+actor);
    ram.writeUInt16LE(0x110+slot*32,0xE0FA+actor);
    cpu.r[0]=0x7E;cpu.r[1]=site>>>16;
    cpu.br.set([0xABCD,actor,0xBEEF,0x1FFF,site&65535,0]);
    let n=0,cycles=0;
    while(((cpu.r[1]<<16)|cpu.br[4])!==site+4){
      assert(++n<60000,`native call failed to return at $${site.toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000); // inactive stack bytes are not outputs
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,writes,cycles,slow};
  };
}
const before=runner(old),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  assert.deepEqual(b.writes,a.writes,`I/O ${why}`);
  assert.equal(b.cycles,a.cycles,`CPU cycles ${why}`);
  assert(b.slow<a.slow,`no slow-bus reduction ${why}`);
  return {before:a.slow,after:b.slow};
}

test('weapon setup, decoding and palettes preserve all six actor slots',t=>{
  for(const [site]of sites)for(let slot=0;slot<6;slot++)
    for(let weapon=0;weapon<72;weapon++)for(const p of [0x20,0xE5])
      compare({site,slot,weapon,p,arg:weapon&31});
  t.diagnostic(JSON.stringify(compare({site:0x8193DC}))+' slow ROM reads for weapon setup');
});

test('every weapon palette selector retains its native CPU and I/O contract',()=>{
  for(let arg=0;arg<256;arg++)for(let slot=0;slot<6;slot++)for(const p of [0x20,0xE5])
    compare({site:0x80EA38,arg,slot,p});
});
