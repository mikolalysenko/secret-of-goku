// Compare fast field emission with the per-part clipping/placement path.
// OAM capacity and missing cells must never wrap a zero-length counter or
// hide a later resident piece while there is still room to display it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path),sym=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
const symbols=new Map([...sym.matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)]
  .map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const address=n=>{assert(symbols.has(n),n);return symbols.get(n);};
const ptr=hiromToPc(address('fx_asm_ptr')),data=hiromToPc(address('fx_asm_data'));
const count=(data-ptr)/2;
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000;

function renderer(entryName){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536),entry=address(entryName);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=at(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  return ({id,x=128,y=112,cursor=0,limit=512,front=0,frontUsed=0,depth=0,size=0,missing=0})=>{
    ram.fill(0);sram.fill(0);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const offset=rom.readUInt16LE(ptr+id*2),record=data+offset,n=rom[record],cells=rom[record+1];
    const word=(off,v)=>ram.writeUInt16LE(v&65535,DP+off);
    word(0x14,x);word(0x16,y);word(0x3E,depth);word(0x44,size);
    word(0x0C,Math.max(0,limit-Math.ceil(front/4)*16-3));
    word(0x0E,(address('fx_asm_data')+offset)&65535);ram[DP+0x10]=address('fx_asm_data')>>>16;
    word(0x84,n);word(0x86,offset+6+cells*2);
    for(let c=0;c<cells;c++)for(let flip=0;flip<4;flip++)
      word(0x54+c*8+flip*2,missing&(1<<c)?0xFFFF:0x3100+c*2+(flip<<14));
    ram.writeUInt16LE(cursor,0x6E90);ram.writeUInt16LE(limit,0x6E92);ram.writeUInt16LE(front,0x6E94);
    sram.writeUInt16LE(frontUsed,0x7896);
    cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([id,0,0,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let i=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;i++){
      assert(i<10000,`${entryName} did not return: ${JSON.stringify({id,cursor,limit,front,missing})}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x);
    const end=ram.readUInt16LE(0x6E90),nf=ram.readUInt16LE(0x6E94);
    assert(end<=limit-Math.ceil(nf/4)*16,`OAM overflow ${end}/${limit}, ${nf} front`);
    return {cycles,result:{end,nf,fxFront:sram.readUInt16LE(0x7896),
      low:Buffer.from(ram.subarray(0x800,0x800+end)),high:Buffer.from(ram.subarray(0xA00,0xA20)),
      front:Buffer.from(ram.subarray(0x6EC0,0x6EC0+nf*4)),
      frontHigh:Buffer.from(ram.subarray(0x6F00,0x6F00+nf*2))}};
  };
}
const fast=renderer('fx_emit_place'),slow=renderer('fx_emit_slow');
function compare(input){
  const a=slow(input),b=fast(input);
  assert.deepEqual(b.result,a.result,JSON.stringify(input));return [a.cycles,b.cycles];
}
const ids=Array.from({length:count},(_,i)=>i).filter(i=>rom[data+rom.readUInt16LE(ptr+i*2)]>0);

test('the last available sprite slot is safe for every generated assembly',()=>{
  for(const id of ids)for(const free of [0,1,2,4])compare({id,cursor:512-free*4});
});
test('missing cells do not consume space needed by later resident pieces',()=>{
  for(const id of ids){
    const cells=rom[data+rom.readUInt16LE(ptr+id*2)+1];
    if(cells<2)continue;
    for(const missing of [1,(1<<cells)-2,(1<<cells)-1])
      for(const free of [1,2,4])compare({id,cursor:512-free*4,missing});
  }
});
test('screen edges, front reservations and large sprites match the general path',()=>{
  const sample=[...new Set([ids[0],...ids.filter((_,i)=>i%137===0)])];
  for(const id of sample)for(const [x,y] of [[-12,112],[0,0],[128,112],[255,223],[280,240]])
    for(const front of [0,1,4,11,12,15])for(const depth of [0,1])for(const size of [0,2]){
      const cursor=512-Math.ceil(front/4)*16-4;
      compare({id,x,y,front,frontUsed:front,depth,size,cursor});
    }
});
