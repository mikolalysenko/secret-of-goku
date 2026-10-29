// Differential coverage for cb_mul16's byte fast path and full-width path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path),symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const mq=0xD8D8,mq1=mq+2,mq2=mq+4;

function machine(){
  const ram=Buffer.alloc(0x20000);let product=0;
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a===0x4216)return product&255;if(a===0x4217)return product>>8;
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a===0x4203){product=(ram[0x4202]*v)&0xFFFF;return;}
    if(a===0x4202){ram[0x4202]=v;return;}
    const r=at(a);assert(r>=0);ram[r]=v;
  }});
  const entry=symbols.get('cb_mul16');
  return (a,b)=>{
    ram.writeUInt16LE(a,mq);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([b,0x1234,0xBEEF,0x1FFD,entry&65535,0]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<1000,`cb_mul16 failed to return for ${a}*${b}`);cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.br[3],0x1FFF,'stack');assert.equal(cpu.br[5],0,'direct page');
    assert.equal((ram.readUInt16LE(mq1)+(ram.readUInt16LE(mq2)*0x10000))>>>0,(a*b)>>>0,`${a} * ${b}`);
    assert.equal(ram.readUInt16LE(mq),0,'cb_mq clear');
  };
}

test('all 65,536 byte products and representative full-width products match',()=>{
  const run=machine();
  for(let a=0;a<256;a++)for(let b=0;b<256;b++)run(a,b);
  for(const [a,b] of [[1,256],[256,1],[255,256],[256,255],[0x1234,0xabcd],[0xffff,0xffff],
    [0x8000,2],[2,0x8000],[0x8000,0x8000],[0x7fff,0x101],[0x101,0x7fff],[0xffff,0]])run(a,b);
});
