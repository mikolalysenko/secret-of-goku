// Compare the assembled replacement with the retail decoder, including
// every output byte, direct-page scratch, registers, flags and fallbacks.
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
function runner(rom){
  const ram=new Uint8Array(0x20000);
  const io=new Uint8Array(65536);
  let line=0,vread=0,dmas=0;
  const ioAt=a=>((a>>>16)&0x7F)<0x40&&(a&65535)>=0x2100&&(a&65535)<0x4380?a&65535:-1;
  const ramAt=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>{
      const r=ramAt(a);if(r>=0)return ram[r];
      const p=ioAt(a);
      if(p>=0){
        if(p===0x213F)vread=0;
        if(p===0x213D)return vread++&1?line>>8:line&255;
        return io[p];
      }
      return rom[hiromToPc(a,rom.length)];
    },
    cpuWrite:(a,v)=>{
      const r=ramAt(a);if(r>=0){ram[r]=v;return;}
      const p=ioAt(a);assert(p>=0,`unexpected write ${a.toString(16)}`);io[p]=v;
      if(p!==0x420B)return;
      assert.equal(v,0x80);assert.equal(io[0x4370],0);assert.equal(io[0x4371],0x80);
      const count=io[0x4375]|io[0x4376]<<8,src=io[0x4372]|io[0x4373]<<8|io[0x4374]<<16;
      const dest=io[0x2181]|io[0x2182]<<8|(io[0x2183]&1)<<16;
      assert(count>0&&count<=2048);assert(dest+count<=ram.length);
      assert(line<=176||line>=198&&line<=206,'DMA started outside its guarded field windows');
      for(let i=0;i<count;i++)ram[dest+i]=rom[hiromToPc(src+i,rom.length)];
      io[0x4372]=(src+count)&255;io[0x4373]=((src+count)>>8)&255;
      io[0x4375]=io[0x4376]=0;
      dmas++;
    },
  });
  return ({slot=0,p=0,dp=0,db=0x7E,bank=0xD1,source=0xF100,count=50,dest=0x0800,actor=slot*512,dmaLine,gate={},species,status,weaponShown,keepRam=false}={})=>{
    if(!keepRam)for(let i=0;i<ram.length;i++)ram[i]=(i*71+(i>>8)*17)&255;
    for(let i=0;i<io.length;i++)io[i]=(i*37+9)&255;
    line=dmaLine??0;vread=dmas=0;
    const channel=io.slice(0x4370,0x4378);
    if(dmaLine!==undefined)Object.assign(ram,{
      [0x100]:0x5C,[0x101]:0xA8,[0x102]:0xC0,[0x103]:0,
      [0x104]:0x5C,[0x105]:0xCF,[0x106]:0xC1,[0x107]:0,
      [0xD0]:0,[0xFF]:0,[0xEC]:0,[0xED]:0x80,[0x2C]:7,
    },gate);
    if(species!==undefined)ram[0xE180+actor]=species;
    if(status!==undefined){ram[0xE190+actor]=status&255;ram[0xE191+actor]=status>>>8;}
    if(weaponShown!==undefined)ram[0xE084+actor]=weaponShown;
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=db;cpu.r[1]=0xC1;
    cpu.br.set([0xAB00|bank,actor,source,0x1FFC,0xC599,dp]);
    ram[dp]=dest&255;ram[dp+1]=dest>>8;ram[dp+8]=count;ram[dp+9]=0xA7;
    ram[0x1FFD]=0xFF;ram[0x1FFE]=0x6F;ram[0x1FFF]=0xC1; // RTL sentinel
    let instructions=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC1){
      assert(++instructions<100000,'decoder did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    // Inactive stack bytes are not an output of either routine.
    ram.fill(0,0x1F00,0x2000);
    assert.deepEqual(io.slice(0x4370,0x4378),channel,'DMA channel registers were not restored');
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:ram.slice(),cycles,dmas};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input,fast=false,dmas=0){
  const a=old(input),b=next(input),before=a.cycles,after=b.cycles;
  assert.equal(b.dmas,dmas,'unexpected DMA path');
  delete a.cycles;delete b.cycles;delete a.dmas;delete b.dmas;
  assert.deepEqual(b.registers,a.registers,`registers ${JSON.stringify(input)}`);
  assert.deepEqual(b.flags,a.flags,`flags ${JSON.stringify(input)}`);
  // Avoid flooding test output with the entire 128 KiB on a mismatch.
  const mismatch=b.ram.findIndex((v,i)=>v!==a.ram[i]);
  assert.equal(mismatch,-1,`RAM $${mismatch.toString(16)}: ${a.ram[mismatch]} -> ${b.ram[mismatch]}, ${JSON.stringify(input)}`);
  if(fast)assert(after<before*.5,`cycles ${before} -> ${after}`);
  return [before,after];
}
test('predecoded death graphics exactly match all retail colour variants',t=>{
  for(let slot=0;slot<6;slot++)for(const p of [0,0x21,0xC6,0xE7])for(const dp of [0,0x100])
    compare({slot,p,dp,db:[0,0x7E,0x80][slot%3]},true);
  const [before,after]=compare({});
  t.diagnostic(`1600-byte death copy: ${before} -> ${after} CPU cycles`);
});
test('predecoded weapon sheets match all actor slots and colour variants',t=>{
  for(const source of [0,0x2FE8])for(let slot=0;slot<6;slot++)
    for(const p of [0,0x21,0xC6,0xE7])for(const dp of [0,0x100])
      compare({bank:0xD4,source,count:64,dest:0,slot,p,dp,db:[0,0x7E,0x80][slot%3]},true);
  const [before,after]=compare({bank:0xD4,source:0,count:64,dest:0});
  t.diagnostic(`2048-byte weapon copy: ${before} -> ${after} CPU cycles`);
});
test('other source sheets, layouts and decimal mode retain the retail decoder',()=>{
  for(const input of [
    {bank:0xD4,source:24,count:64,dest:0},
    {bank:0xD4,source:0xBA00,count:64},
    {bank:0xD4,source:0x2FE8,count:64,dest:0,p:8},
    {bank:0xD4,source:0x2FE8,count:63,dest:0},
    {bank:0xD0,source:0xDF00,count:64,dest:0},
    {bank:0x7E,source:0xC000,count:4},
    {source:0xF118},{count:1},{count:0},{dest:0},
    {actor:0xC00},{actor:0x601},{p:8},{p:0xE9,slot:5},
    {p:0x30,source:0x80},
  ])compare(input);
});
test('early-field DMA matches retail bytes and CPU state for all sheets and slots',()=>{
  for(const sheet of [{},{bank:0xD4,source:0,count:64,dest:0},{bank:0xD4,source:0x2FE8,count:64,dest:0}])
    for(let slot=0;slot<6;slot++)for(const dmaLine of [0,80,160,161,175,176])for(const p of [0,4,0x21,0xC6,0xE7])
      compare({...sheet,slot,dmaLine,p},true,1);
});
test('post-HUD DMA fits before NMI without waiting or changing interrupt masks',()=>{
  for(const sheet of [{},{bank:0xD4,source:0,count:64,dest:0},{bank:0xD4,source:0x2FE8,count:64,dest:0}])
    for(let slot=0;slot<6;slot++)for(const dmaLine of [198,199,205,206])for(const p of [0,4,0x21,0xC6,0xE7])
      compare({...sheet,slot,dmaLine,p},true,1);
});
test('late scanlines, other handlers, menus, loads and HDMA retain interruptible copies',()=>{
  for(const sheet of [{},{bank:0xD4,source:0,count:64,dest:0},{bank:0xD4,source:0x2FE8,count:64,dest:0}])
    for(let slot=0;slot<6;slot++)for(const dmaLine of [177,178,195,196,197,207,208,224,225,261])
      for(const p of [0,4])compare({...sheet,slot,dmaLine,p},true);
  for(const gate of [
    {[0x100]:0x40},{[0x102]:0x88},{[0x104]:0x40},{[0x106]:0x88},
    {[0xD0]:1},{[0xFF]:1},{[0xEC]:2},{[0xED]:0x40},{[0x2C]:0x80},
  ])compare({dmaLine:80,gate},true);
});

test('ordinary dead F9 enemies leave their unused weapon buffer alone with the same return contract',t=>{
  const sheet={bank:0xD4,source:0,count:64,dest:0,species:0xF9,status:0x8000,weaponShown:0};
  for(const slot of [3,4,5])for(const p of [0,4,0x21,0xC6,0xE7])
    for(const dp of [0,0x100])for(const dmaLine of [0,80,177,198,206,224]){
      const input={...sheet,slot,p,dp,dmaLine};
      const a=old(input),b=next(input),why=JSON.stringify(input);
      assert.deepEqual(b.registers,a.registers,`registers ${why}`);
      assert.deepEqual(b.flags,a.flags,`flags ${why}`);
      assert.equal(b.dmas,0,'unused weapon must not start DMA');
      const base=0x2000+slot*0x1000;
      for(let i=base;i<base+2048;i++)assert.equal(b.ram[i],(i*71+(i>>8)*17)&255,`buffer $${i.toString(16)}`);
      a.ram.fill(0,base,base+2048);b.ram.fill(0,base,base+2048);
      assert.deepEqual(b.ram,a.ram,`other RAM ${why}`);
      assert(b.cycles<a.cycles*.1,`unused copy cost ${a.cycles} -> ${b.cycles}`);
    }
  const a=old({...sheet,slot:3}),b=next({...sheet,slot:3});
  t.diagnostic(`unused death weapon: ${a.cycles} -> ${b.cycles} CPU cycles, no DMA`);
});

test('other actors, death styles, active weapons and decimal mode still receive their sheet',()=>{
  const sheet={bank:0xD4,source:0,count:64,dest:0,species:0xF9,status:0x8000,weaponShown:0};
  for(const slot of [0,1,2])compare({...sheet,slot,dmaLine:80},true,1);
  for(const species of [0,1,0x80,0xE9,0xEA,0xF8,0xFA,0xFB,0xFF])
    compare({...sheet,slot:3,species,dmaLine:80},true,1);
  for(const status of [0,1,0x7FFF])compare({...sheet,slot:4,status,dmaLine:80},true,1);
  for(const weaponShown of [1,2,255])compare({...sheet,slot:5,weaponShown,dmaLine:80},true,1);
  compare({...sheet,slot:3,p:8,dmaLine:80});
});

test('reloading a reused death slot replaces every previously skipped weapon byte',()=>{
  for(const slot of [3,4,5])for(const source of [0,0x2FE8]){
    const sheet={bank:0xD4,source:0,count:64,dest:0,slot,species:0xF9,status:0x8000,weaponShown:0};
    old(sheet);next(sheet);
    compare({...sheet,source,species:0xEA,status:0,keepRam:true,dmaLine:80},true,1);
  }
});
