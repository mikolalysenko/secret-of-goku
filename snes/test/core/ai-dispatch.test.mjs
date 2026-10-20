// Compare every native AI opcode and the complete command loop. The field
// interpreter enters with M8/X16 and binary arithmetic. Hardware multiply
// and divide complete synchronously in this CPU-level fixture.
import {test} from 'node:test';
import {resolve} from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const ctx=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(fs.readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),ctx);
const flags=['c','z','i','d','x','m','v','n'];
const source=fs.readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const reference=Buffer.from(source),retail=fs.readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
for(const [a,n] of [[0x1257a,3],[0x1252f,5]])retail.copy(reference,a,a,a+n);
function runner(rom){
 const ram=Buffer.alloc(0x28000),io=Buffer.alloc(0x10000);let writes=[];
 const at=a=>{
  const b=a>>>16,o=a&65535;
  if(b===0x7e)return o;
  if(b===0x7f)return 0x10000+o;
  if((b&0x7f)<0x40&&o<0x2000)return o;
  if((b&0x7f)>=0x30&&(b&0x7f)<0x34&&o>=0x6000&&o<0x8000)
   return 0x20000+((b&3)<<13)+o-0x6000;
  return -1;
 };
 const isIo=a=>(a>>>16&0x7f)<0x40&&(a&65535)>=0x2000&&(a&65535)<0x6000;
 const cpu=new ctx.Cpu({
  cpuRead:a=>{
   const r=at(a);
   if(r>=0)return ram[r];
   return isIo(a)?io[a&65535]:rom[hiromToPc(a,rom.length)];
  },
  cpuWrite:(a,v)=>{
   const r=at(a),o=a&65535;
   if(r>=0){ram[r]=v;return;}
   assert(isIo(a),`write ${a.toString(16)}`);
   io[o]=v;writes.push([a,v]);
   if(o===0x4203)io.writeUInt16LE(io[0x4202]*v,0x4216);
   if(o===0x4206){
    const num=io.readUInt16LE(0x4204);
    io.writeUInt16LE(v?Math.floor(num/v):65535,0x4214);
    io.writeUInt16LE(v?num%v:num,0x4216);
   }
  },
 });
 return ({op=0,p=0x20,actor=0xE600,arg=0,stack=0x1F80,program=null,variant=0}={})=>{
  ram.fill(0);io.fill(0);writes=[];cpu.reset();cpu.e=false;
  for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
  const s=stack,d=s+1;
  cpu.r[0]=0x7e;cpu.r[1]=0xc1;
  cpu.br.set([0xABCD,actor,actor,s,program?0x2578:0x257a,d]);
  for(let b=0xE000;b<0xFE00;b+=0x200){
   ram[b]=1;ram[b+0x180]=1;
   ram.writeUInt16LE(variant===3?256:100+(b&0xe00)/32,b+0x20);
   ram.writeUInt16LE(112,b+0x22);ram[b+0x45]=13;
   if(variant===1)ram[b+0x1ac]=0xFF;
   if(variant===2)ram.writeUInt16LE(0x8460,b+0x190);
  }
  for(let i=0;i<15;i++)ram[0x3f1+i]=i*17+7;
  const script=0x1000;ram.writeUInt16LE(script,actor+0x144);
  const bytes=program??[op,...Array(7).fill(arg)];
  const off=hiromToPc(0xD04F15+script,rom.length),old=Buffer.from(rom.subarray(off,off+bytes.length));
  Buffer.from(bytes).copy(rom,off);
  let n=0,cycles=0,commands=0;
  try{
   while(cpu.br[4]!==(program?0x2588:0x257d)||cpu.r[1]!==0xc1){
    assert(++n<50000,`timeout ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
    if(cpu.br[4]===0x251a&&cpu.r[1]===0xc1)commands++;
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
   }
   ram.fill(0,0x1800,s+1);
   return {regs:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:Buffer.from(ram),io:Buffer.from(io),writes,cycles,commands};
  }finally{old.copy(rom,off);}
 };
}
const before=runner(reference),after=runner(source);
function compare(input){
 const a=before(input),b=after(input),why=JSON.stringify(input);
 for(const key of ['regs','flags','ram','io','writes','commands'])
  assert.deepEqual(b[key],a[key],key+' '+why);
 assert.equal(a.cycles-b.cycles,9*a.commands,'dispatch cycles '+why);
 return a;
}
test('native dispatcher retains all 256 opcode results and operand variants',()=>{
 for(let op=0;op<256;op++)for(const arg of [0,1,2,127,128,255])
  for(const actor of [0xE000,0xE200,0xE600,0xEA00])compare({op,arg,actor});
 for(let op=0;op<256;op++)for(const variant of [0,1,2,3])compare({op,variant});
});
test('native dispatcher preserves flags and live parent stack across page boundaries',()=>{
 for(let op=0;op<256;op++){
  for(let p=0;p<256;p++)if((p&0x38)===0x20)compare({op,p});
  for(const stack of [0x1EFA,0x1EFB,0x1EFC,0x1EFD,0x1EFE,0x1EFF,0x1F00,0x1F01,0x1F02,0x1F03,0x1F10]){
   // Crossing a direct-page boundary changes the cost of some temporary
   // locals. Output equality is required even when that cost differs.
   const input={op,stack},a=before(input),b=after(input),why=JSON.stringify(input);
   for(const key of ['regs','flags','ram','io','writes','commands'])
    assert.deepEqual(b[key],a[key],key+' '+why);
  }
 }
});
test('native command loop preserves termination and its 256-command limit',t=>{
 for(const length of [0,1,2,15,16,31,255,256,280]){
  // Increment variable 0, then advance one byte. Opcode 0
  // terminates; 256 continuing commands exercise the native reset path.
  const program=[...Array(length).fill(0x1A),0];
  const a=compare({program});
  assert.equal(a.commands,Math.min(length+1,256));
  if(length===16)t.diagnostic(`17 command dispatches save ${9*a.commands} CPU cycles`);
 }
});
