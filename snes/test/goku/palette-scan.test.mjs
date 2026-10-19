// Compare the full palette tracker with its previous fixed fifteen-word loop.
// Individual native color writes, status tints, petrify, form changes and
// water-slot transitions must retain their colors and return state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;

function machine(slow=false){
  const rom=readFileSync(path),ram=Buffer.alloc(0x20000);
  if(slow){
    // Original LDA/CMP, X/Y increments and CPY/BCC loop, with the same
    // absorption continuation. Replace only the new comparison helper.
    const absorb=symbols.get('goku_palette_absorb'),scan=symbols.get('goku_palette_scan');
    assert(scan&&absorb);
    rom.set([0xBD,0,0,0xD9,0xB0,0xD7,0xD0,10,0xE8,0xE8,0xC8,0xC8,
      0xC0,0x20,0,0x90,0xEF,0x60,0x4C,absorb&255,(absorb>>8)&255],hiromToPc(scan,rom.length));
  }
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
  });
  return input=>{
    ram.set(input);
    const entry=symbols.get('goku_palette');
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([0x3456,0x789A,0xBCDE,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<25000,'palette tracker did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    const result=Buffer.from(ram);
    result.fill(0,0x1E00,0x2000); // inactive return addresses are not live state
    return {ram:result,registers:[...cpu.r,...cpu.br],
      flags:['c','z','i','d','x','m','v','n','e'].map(f=>cpu[f]),cycles};
  };
}

test('palette scan preserves every color, status, slot and return value',t=>{
  const baseline=machine(true),fast=machine();
  const original=readFileSync(path).subarray(0x81EFE,0x81F1E);
  let count=0,quiet;
  const changes=[-4,-3,-2,-1,...Array.from({length:15},(_,i)=>i+1)];
  for(const slot of [1,5])for(let id=0;id<8;id++)for(const stone of [0,64])for(const change of changes){
    const ram=Buffer.alloc(0x20000),palette=0x700+slot*32;
    ram[0xE093]=slot*2;ram[0xD7FD]=slot;ram[0xD788]=id;ram[0xE190]=stone;
    original.copy(ram,palette);
    // Let the actual tracker establish its shadow before altering the game buffer.
    const prepared=baseline(ram).ram;
    if(change===-4)prepared[0xE093]=(slot===1?5:1)*2;
    if(change===-3)prepared[0xE190]^=64;
    if(change===-2)prepared[0xD788]=(id+1)%8;
    if(change>0){
      const offset=palette+change*2;
      prepared.writeUInt16LE((prepared.readUInt16LE(offset)^0x3DEF)&0x7FFF,offset);
    }
    const a=baseline(prepared),b=fast(prepared),why=`${slot}/${id}/${stone}/${change}`;
    assert.deepEqual(b.ram,a.ram,'RAM '+why);
    assert.deepEqual(b.registers,a.registers,'registers '+why);
    assert.deepEqual(b.flags,a.flags,'flags '+why);
    count++;
    if(change===-1)quiet=[a.cycles,b.cycles];
  }
  assert(quiet[1]<quiet[0]*.7);
  t.diagnostic(`${count} full-state comparisons; quiet palette ${quiet[0]} -> ${quiet[1]} CPU cycles`);
});
