// Exercise the actual IPL transfer, which createApu's fast RAM fixture skips.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApu,driverChunks} from './apu.mjs';
import {uploadSegments} from './cartridge.mjs';

const rom=readFileSync(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
test('cold IPL upload survives power-on RAM patterns and port-write delays',()=>{
  const chunks=[...driverChunks(rom),...uploadSegments(rom)];
  for(const pattern of ['zero','ff','noise']){
    const h=createApu({rom});h.apu.reset();
    let seed=1993;
    for(let a=0;a<65536;a++){
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      h.ram[a]=pattern==='zero'?0:pattern==='ff'?255:seed&255;
    }
    const put=(port,value)=>{h.cpuWrite(port,value);h.step(pattern==='zero'?0:pattern==='ff'?17:(value+port*7)&31);};
    h.waitFor(()=>h.cpuRead(0)===0xAA&&h.cpuRead(1)===0xBB);
    let kick=0xCC;
    for(const {addr,bytes} of chunks){
      put(2,addr);put(3,addr>>8);put(1,kick);put(0,kick);
      h.waitFor(()=>h.cpuRead(0)===kick);
      for(let i=0;i<bytes.length;i++){
        put(1,bytes[i]);put(0,i&255);
        h.waitFor(()=>h.cpuRead(0)===(i&255));
      }
      kick=(bytes.length+3)&255;if(!kick)kick=1;
    }
    put(2,0);put(3,2);put(1,0);put(0,kick);
    h.waitFor(()=>h.cpuRead(0)===kick);h.cpuWrite(0,0);
    h.waitFor(()=>h.apu.spc.br[0]===0x0200);
    // Last writers win at native driver patch sites. Check before startup
    // intentionally clears DP or the driver touches mutable voice state.
    const expected=new Map();
    for(const {addr,bytes} of chunks)for(let i=0;i<bytes.length;i++)expected.set(addr+i,bytes[i]);
    for(const [a,v] of expected)assert.equal(h.ram[a],v,`${pattern}: IPL byte $${a.toString(16)}`);
    h.ms(60);assert.equal(h.apu.dspRomReadable,false,'native startup mapped IPL out');
    h.take();h.nativeCmd(2,0xE5,15,0x88);h.ms(500);
    assert.ok(h.take().l.some(v=>Math.abs(v)>500),`${pattern}: effect is audible after a real IPL boot`);
    const helper=chunks.find(c=>c.addr===0x180);
    if(helper)assert.deepEqual(Buffer.from(h.ram.subarray(helper.addr,helper.addr+helper.bytes.length)),Buffer.from(helper.bytes));
  }
});
