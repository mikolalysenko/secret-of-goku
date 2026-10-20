// Exercise the assembled native OBJ emitter against the retail routine.
// Exhaustive signed-byte offsets cover clipping, partial writes and X high
// bits, with mixed lists checking a fast-to-retail handoff mid-assembly.
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
  const ramAt=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>{const r=ramAt(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const r=ramAt(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;},
  });
  return ({x=128,y=112,p=0,dp=0,cursor=0,pieces=[[0,0,0xA123]],count=pieces.length,shake=0}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.r[0]=0x7E;cpu.r[1]=0x80;
    cpu.br.set([y&65535,0,0xE090,0x1FFD,0xE60D,dp]);
    ram[0xE00D]=shake;
    ram.writeUInt16LE(x&65535,dp+4);ram.writeUInt16LE(y&65535,dp+6);
    ram.writeUInt16LE(cursor,dp+0x7C);ram[dp+2]=count&255;
    ram[dp+0x59]=1<<((cursor>>2&3)*2);ram[dp+0x5A]=cursor>>4;
    for(const [i,[dx,dy,tile]]of pieces.entries()){
      ram[0xE090+i*4]=dx&255;ram[0xE091+i*4]=dy&255;ram.writeUInt16LE(tile,0xE092+i*4);
    }
    ram[0x1FFE]=0xFF;ram[0x1FFF]=0x6F; // RTS sentinel 80:7000
    let instructions=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0x80){
      assert(++instructions<30000,`emitter did not return ${JSON.stringify({x,y,p,dp,cursor,pieces,count})}, PC ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    ram.fill(0,0x6FFC,0x6FFE); // replacement's private main-thread staging word
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
test('native OBJ construction matches every pair of signed-byte offsets',()=>{
  for(let xy=0;xy<65536;xy++){
    const piece=[xy&255,xy>>8,0xA123],inside=[0,0,0x5123];
    compare({pieces:[piece,inside,inside]});
    compare({pieces:[inside,inside,piece]});
  }
});
test('native OBJ edges, crowded lists, decimal mode and mixed-width callers match',t=>{
  const pieces=[[-16,-24,0xC110],[0,-24,0x4112],[-16,-8,0x8114],[0,-8,0x0116],
    [32,-33,0x4118],[-128,127,0x411A],[31,31,0x411C],[-1,-1,0x411E]];
  for(const x of [-32768,-128,-16,-1,0,31,32,128,224,225,255,256,32767])
    for(const y of [-32768,-128,-16,-1,0,31,32,112,192,193,223,224,32767])
      for(const cursor of [0,12,484,508,512])compare({x,y,cursor,pieces});
  for(let p=0;p<256;p++)if(!(p&16))for(const dp of [0,0x100])
    for(const cursor of [0,504,512])compare({p,dp,cursor,pieces});
  for(let shake=0;shake<256;shake++)compare({pieces,shake});
  compare({count:0,pieces:Array.from({length:256},(_,i)=>[i&255,(i*17)&255,0x5123])});
  const [before,after]=compare({pieces:Array.from({length:6},(_,i)=>[(i%3-1)*16,(i%2-1)*16,0x5123])});
  assert(after<before*.8,`interior emitter cycles ${before} -> ${after}`);
  t.diagnostic(`six-piece interior emitter: ${before} -> ${after} CPU cycles`);
  for(const n of [1,2,3,4])t.diagnostic(`${n} pieces: ${compare({pieces:pieces.slice(0,n)}).join(' -> ')} cycles`);
});
