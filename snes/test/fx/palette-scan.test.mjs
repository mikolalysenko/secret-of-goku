// Compare the grouped scan with an exact scalar scan and an independent
// ownership model. Tail slots and hidden sprites cannot exhaust palettes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const source=readFileSync(path),reference=Buffer.from(source);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const start=symbols.get('fx_palscan_scan_start'),front=symbols.get('fx_palscan_front');assert(start&&front);
const jump=[0x4C,front&255,(front>>8)&255];
const loop=[0xA9,0,0,0xA8,0xE2,0x20,0xC4,0x4A,0x90,3,...jump];
const again=loop.length;
for(const offset of [3])loop.push(0xB9,offset,8,0x29,14,0xAA,0x95,0x54);
// Clear B after the 16-bit cursor update. The original loop omitted this
// and wrote outside its marker table after the 64th native sprite.
loop.push(0xC2,0x21,0x98,0x69,4,0,0xA8,0xA9,0,0,0xE2,0x20,0xC4,0x4A,0x90);
loop.push((again-loop.length-1)&255,...jump);
assert(front-start>=loop.length,'test requires the unrolled default scan');
reference.set(loop,hiromToPc(start,source.length));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000;
function machine(rom){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>a>>>16===0x31?sram[a&65535]:at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{if(a>>>16===0x31)sram[a&65535]=v;else{assert(at(a)>=0,`unexpected write ${a.toString(16)}`);ram[at(a)]=v;}}});
  return (input,tight)=>{
    ram.set(input);sram.fill(0xA5);sram.writeUInt16LE(tight,0x789E);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const pc=symbols.get('fx_palscan');cpu.r[0]=0x7E;cpu.r[1]=pc>>>16;
    cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,pc&65535,DP]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<10000,'palette scan did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x,'M16/X16 return');
    ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),sram:Buffer.from(sram),cycles};
  };
}
const old=machine(reference),next=machine(source);
function compare({cursor=320,staged=0,mask=0xA5,tight=0,late=null,hidden=false}={}){
  const ram=Buffer.alloc(0x20000,0xA5);
  ram.writeUInt16LE(cursor,0x6E90);ram.writeUInt16LE(staged,0x6E94);
  const palettes=Array.from({length:8},(_,i)=>i).filter(i=>mask&(1<<i));
  // With mask=0, the unused palette-0 marker cannot reserve an FX palette.
  if(!palettes.length)palettes.push(0);
  for(let i=0;i<128;i++)ram[0x803+i*4]=(palettes[i%palettes.length]<<1)|((i*13)&0xF1);
  if(hidden)for(let i=0;i<128;i++)if(i%8===5)ram[0x801+i*4]=224;
  if(late!==null){
    for(let i=0;i<128;i++)ram[0x803+i*4]=0;
    ram[0x803+64*4]=late<<1;
  }
  for(let i=0;i<16;i++)ram[0x6EC3+i*4]=(i&7)<<1;
  let used=0;
  for(let i=0;i<Math.ceil(Math.min(cursor,512)/4);i++)used|=1<<((ram[0x803+i*4]>>1)&7);
  for(let i=0;i<staged;i++)used|=1<<((ram[0x6EC3+i*4]>>1)&7);
  used&=0xFC;
  if(used===0xFC){
    used=0;
    for(let i=0;i<Math.ceil(Math.min(cursor,512)/4);i++)if(ram[0x801+i*4]!==224)used|=1<<((ram[0x803+i*4]>>1)&7);
    for(let i=0;i<staged;i++)used|=1<<((ram[0x6EC3+i*4]>>1)&7);
  }
  const a=old(ram,tight),b=next(ram,tight),why=JSON.stringify({cursor,staged,mask,tight});
  assert(b.ram.equals(a.ram),'RAM '+why);assert(b.sram.equals(a.sram),'SRAM '+why);
  // !fx_palfree: free palettes in the low byte; bit 8 (one acquired) clear
  assert.equal(b.sram.readUInt16LE(0x7820),~used&0xFC,why);
  return [a.cycles,b.cycles];
}
test('all OAM cursor boundaries and staged groups retain palette ownership',()=>{
  for(let cursor=0;cursor<=512;cursor++)for(const staged of [0,1,4,16])for(const tight of [0,1])
    compare({cursor,staged,tight,mask:cursor&255});
  for(const cursor of [513,0x8000,0xFFFF])compare({cursor,staged:16});
});
test('all palette subsets remain drawable even in a predicted tight vblank',t=>{
  for(let mask=0;mask<256;mask++)for(const staged of [0,7,16])for(const tight of [0,1])
    compare({mask,staged,tight});
  const cycles=compare();assert(cycles[1]<cycles[0]*.8);
  t.diagnostic('80 native sprites: '+cycles.join(' -> ')+' CPU cycles');
});
test('hidden sprites cannot reserve the final free palette',()=>{
  for(const cursor of [112,116,128,256,512])compare({cursor,mask:255,hidden:true});
});
test('a palette first used after sprite 64 is reserved without stray writes',()=>{
  for(let late=2;late<8;late++)for(const cursor of [256,257,260,512])
    compare({cursor,late});
});
