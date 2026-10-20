// Compare every RAM/register result and ordered hardware write of the native
// field uploads through their original and FastROM paths. DMA payload sources
// and lengths must be identical, including Goku's skip/refresh continuations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path),slow=Buffer.from(rom);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const off=a=>hiromToPc(a,rom.length);
const tilemap=off(symbols.get('core_native_tilemap_uploads'));
assert.deepEqual(rom.subarray(tilemap,tilemap+0x131),rom.subarray(off(0xC0C692),off(0xC0C7C3)),
  'relocated tilemap routine differs from the cartridge');
slow.set([0x20,0x92,0xC6,0x20,0x38,0xC2],off(0xC0C148));
slow.set([0x22,0x0D,0x95,0x01],off(0xC0C14E));
const hook=off(symbols.get('goku_upload_hook'));
for(const target of [0x9678,0x95C0]){
  const needle=Buffer.from([0x5C,target&255,target>>8,0x81]);
  const p=rom.indexOf(needle,hook);
  assert(p>=hook&&p<hook+80,'Goku upload continuation missing');slow[p+3]=1;
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
function run(cart,{phase,mode,parts,replacing,refresh,scroll,air,pending=false}){
  const ram=Buffer.alloc(0x20000),io=Buffer.alloc(0x4000),writes=[];
  ram[0x56]=phase;ram[0xED]=mode;ram[0x5C]=mode&0x80;
  ram[0xD900]=air;
  ram[0x2E]=scroll;ram[0x2F]=scroll;
  ram.set([34,34,20,48],0x6C);
  for(const p of [0x76,0x78,0xA4,0xA6])ram.writeUInt16LE(0x0400+(p<<1),p);
  for(let i=0xA50;i<0xA78;i++)ram[i]=(i*13)&255;
  if(pending){
    ram[0x52]=1;ram[0x90]=0x80;ram[0x9A]=0x84;
    ram.writeUInt16LE(0x8600,0x92);ram.writeUInt16LE(0x5000,0x96);
    for(const [i,kind] of [2,4,8,13].entries()){
      const p=0x18200+i*16;ram[p]=1;ram[p+1]=kind;
      ram.writeUInt16LE(0x8800+i*64,p+10);ram.writeUInt16LE(0x5100+i*32,p+12);
      for(let j=0;j<16;j+=2)ram.writeUInt16LE(0x5000+i*32+j,0x18300+i*16+j);
    }
  }
  // Distinct cell pointers and banks exercise all native DMA source slots.
  for(let i=0xC00;i<0x1000;i+=2)ram.writeUInt16LE(0x8000+((i*17)&0x7FE0),i);
  for(let slot=0;slot<13;slot++){
    const p=0xE000+slot*0x200;
    ram[p+0x82]=slot<3?0xD5:0xD9;ram[p+0x83]=parts;
  }
  ram[0xD786]=replacing;ram[0xD785]=refresh; // !replacing, !up_flags
  let audioCalls=0;
  const ramAt=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const ioAt=a=>((a>>>16)&0x7F)<0x40&&(a&65535)>=0x2000&&(a&65535)<0x6000?(a&65535)-0x2000:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>{
      // The uploader's final audio service is unchanged. Treat that foreign
      // call as an RTL, while verifying it is reached in both executions.
      if(a===0xC20009){audioCalls++;return 0x6B;}
      return ramAt(a)>=0?ram[ramAt(a)]:ioAt(a)>=0?io[ioAt(a)]:cart[off(a)];
    },
    cpuWrite:(a,v)=>{
      if(ramAt(a)>=0)ram[ramAt(a)]=v;
      else {const p=ioAt(a);assert(p>=0,`unexpected write $${a.toString(16)}`);io[p]=v;writes.push([p+0x2000,v]);}
    },
  });
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.c=!!(parts&1);cpu.v=!!(parts&2);
  cpu.r[0]=0;cpu.r[1]=0;cpu.br.set([0x1234,0x5678,0x9ABC,0x1FFF,0xC148,0]);
  let n=0;
  while(cpu.br[4]!==0xC152||cpu.r[1]!==0){
    assert(++n<20000,'native actor upload did not return');cpu.cyclesLeft=0;cpu.cycle();
  }
  ram.fill(0,0x1F00,0x2000); // dead stack return banks legitimately differ
  return {ram,io,writes,audioCalls,registers:[...cpu.br,...cpu.r],flags:[cpu.c,cpu.v,cpu.n,cpu.z,cpu.m,cpu.x,cpu.d,cpu.i]};
}
test('FastROM field uploads preserve native DMA writes, RAM and CPU results in every phase',()=>{
  for(const phase of [0,1,2,3,4])for(const mode of [0,1,0x80])
    for(const parts of [0,1,2,3,4,6,8])for(const replacing of [0,1])for(const refresh of [0,0xE0])for(const scroll of [0,0x40,0x80,0xC0])for(const air of [0,1]){
      const state={phase,mode,parts,replacing,refresh,scroll,air};
      assert.deepEqual(run(rom,state),run(slow,state),JSON.stringify(state));
    }
  for(const phase of [0,1,2,3,4])for(const air of [0,1]){
    const state={phase,mode:0,parts:4,replacing:1,refresh:0xE0,scroll:0xC0,air,pending:true};
    assert.deepEqual(run(rom,state),run(slow,state),JSON.stringify(state));
  }
});
