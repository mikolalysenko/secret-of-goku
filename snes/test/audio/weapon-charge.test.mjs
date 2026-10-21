// Execute the cartridge's native actor queue, including its JSL/RTS return,
// through every code mirror. Companions and unrelated cues must retain the
// retail registers, flags, pan and mailbox writes exactly.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
import {isResident7} from './cartridge.mjs';

const root=resolve(import.meta.dirname,'../../..');
const rom=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const retail=Buffer.from(rom);
retail.set([0x85,0x95,0xBF,0x20,0xE0,0x7E],hiromToPc(0xC0BB11,rom.length));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
function run(bytes,{id,actor=0,active=1,ctl=0,owner=1,bank=0x80,p=0x20,dp=0,db=0x7E}){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x2000);
  const off=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>a===0x316001?sram[1]:off(a)>=0?ram[off(a)]:bytes[hiromToPc(a,bytes.length)],
    cpuWrite:(a,v)=>{assert(off(a)>=0,`unexpected write $${a.toString(16)}`);ram[off(a)]=v;},
  });
  cpu.reset();cpu.e=false;
  for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
  sram[1]=active;ram[0xD741]=ctl;ram[0xE02C+actor]=owner;ram[0xE020+actor]=0xB3;
  ram[dp+0x95]=0xE5;ram[0x118]=0x12;ram[0x119]=0x34;
  ram.writeUInt16LE(0xEFFF,0x1FFE);
  cpu.r[0]=db;cpu.r[1]=bank;cpu.br.set([0x5A00|id,actor,0xCAFE,0x1FFD,0xBB11,dp]);
  let n=0,cycles=0;
  while(cpu.br[4]!==0xF000||cpu.r[1]!==bank){
    assert(++n<100,'native sound hook failed to return');
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  ram.fill(0,0x1F00,0x2000);
  return {ram,registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),cycles};
}

test('weapon charge filter preserves companions, native boy and all unrelated cues', {skip:!isResident7(rom)},()=>{
  for(const bank of [0,0x80,0xC0])for(const actor of [0,0x200,0x400,0x600])
    for(let id=0;id<256;id++)for(const state of [{active:0},{ctl:1},{active:1}]){
      if(actor===0&&state.active===1&&id>=0xA6&&id<=0xA8)continue;
      const opt={id,actor,bank,...state,p:0x20|((id<<1)&0xCF),dp:id&1?0x300:0,db:id&2?0:0x7E};
      const a=run(retail,opt),b=run(rom,opt);
      assert.deepEqual(b.registers,a.registers,JSON.stringify(opt));
      assert.deepEqual(b.flags,a.flags,JSON.stringify(opt));
      assert(a.ram.equals(b.ram),JSON.stringify(opt));
    }
});

test('all three weapon cues are silent for Goku in every party/controller position', {skip:!isResident7(rom)},t=>{
  let max=0;
  for(const bank of [0,0x80,0xC0])for(const owner of [0,1,2,4,0x80])for(const id of [0xA6,0xA7,0xA8])
    for(let p=0;p<256;p++)if((p&0x30)===0x20){
      const r=run(rom,{bank,owner,id,p});
      assert.equal(r.ram[0x95],0xE5,'pending unrelated effect preserved');
      assert.equal(r.ram[0x118],0x12);assert.equal(r.ram[0x119],0x34);
      assert.deepEqual(r.registers,[0x7E,bank,0x5A00|id,0,0xCAFE,0x1FFF,0xF000,0]);
      assert.deepEqual(r.flags,flags.map((_,i)=>!!(p&(1<<i))));
      max=Math.max(max,r.cycles);
    }
  t.diagnostic(`muted actor-queue call: at most ${max} CPU cycles (including RTS)`);
});
