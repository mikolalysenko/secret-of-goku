// Native field and world builders own different OBJ slots. A mode handoff
// must see the old mode before storing the new one, or it skips cleanup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const ram=Buffer.alloc(0x22000),writes=[];
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x31&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const io=a=>((a>>>16)&0x7F)<0x40&&(a&65535)>=0x2000&&(a&65535)<0x6000;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:io(a)?0:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{
    if(at(a)>=0)ram[at(a)]=v;
    else {assert(io(a),`unexpected write $${a.toString(16)}`);writes.push([a&65535,v]);}
  },
});
function seed(){
  for(let i=0;i<ram.length;i++)ram[i]=(i*71+(i>>8)*17)&255;
  ram.writeUInt16LE(0x5343,0x21498); // valid volatile core state
  writes.length=0;
}
function call(label,a){
  const entry=symbols.get(label);assert(entry,`missing ${label}`);
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
  cpu.br.set([a,0x1234,0x5678,0x1FFD,entry&65535,0]);
  ram.writeUInt16LE(0x6FFF,0x1FFE);
  let instructions=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
    assert(++instructions<20000,`${label} did not return`);cpu.cyclesLeft=0;cpu.cycle();
  }
  assert.equal(cpu.br[3],0x1FFF,'balanced stack');
}
function sprite(slot){
  return [...ram.subarray(0x800+slot*4,0x804+slot*4),
    (ram[0xA00+(slot>>2)]>>((slot&3)*2))&3];
}
test('mode changes use the previous mode and hide only relinquished OBJ slots',()=>{
  seed();ram.writeUInt16LE(1,0xD720);ram.writeUInt16LE(400,0x21494);ram.writeUInt16LE(400,0x21492);
  const kept=Buffer.from(ram.subarray(0x800,0x800+84*4));
  call('core_frame_begin',2);
  assert.equal(ram.readUInt16LE(0xD720),2);
  assert.deepEqual(ram.subarray(0x800,0x800+84*4),kept);
  for(let j=84;j<100;j++)assert.equal(sprite(j)[1],0xE0,`field -> world slot ${j}`);
  seed();ram.writeUInt16LE(2,0xD720);ram.writeUInt16LE(512,0x21492);ram.writeUInt16LE(400,0x7C);
  const field=Buffer.from(ram.subarray(0x800,0x800+100*4));
  call('core_frame_begin',1);
  assert.equal(ram.readUInt16LE(0xD720),1);
  assert.deepEqual(ram.subarray(0x800,0x800+100*4),field);
  for(let j=100;j<128;j++)assert.equal(sprite(j)[1],0xE0,`world -> field slot ${j}`);
  seed();ram.writeUInt16LE(2,0xD720);ram.writeUInt16LE(512,0x21492);
  call('core_frame_begin',4);
  assert.equal(ram.readUInt16LE(0xD720),4);
  for(let j=88;j<128;j++)assert.equal(sprite(j)[1],0xE0,`world -> ring slot ${j}`);
});
