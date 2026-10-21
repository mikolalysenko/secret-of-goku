import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assemble} from '../../gen/audio-spc700.mjs';
import {createApu} from './apu.mjs';

const loader=assemble(readFileSync(new URL('../../src/modules/audio/spc/songload.s',import.meta.url),'utf8'));
function setup(){
 const h=createApu();h.ms(60);
 for(const s of loader.segments)h.ram.set(s.bytes,s.addr);
 for(const [mode,name] of [[4,'song_receive'],[7,'song_copy']]){
  const a=loader.symbols.get(name);h.ram[0x1418+mode*2]=a&255;h.ram[0x1419+mode*2]=a>>8;
 }
 return h;
}
function begin(h,mode,dst){h.nativeCmd(0xFE,mode,dst&255,dst>>8);h.waitFor(()=>h.cpuRead(0)===0);}
function end(h){h.cpuWrite(1,0);h.cpuWrite(0,0);h.waitFor(()=>h.cpuRead(0)===0);}

test('song transfer holds every byte until acknowledgement, with independent clocks',()=>{
 for(const gap of [0,1,7,40,300])for(const dst of [0x5000,0x50FD]){
  const h=setup(),bytes=Uint8Array.from({length:1545},(_,i)=>(i*73+(i>>8)*17)&255);
  begin(h,4,dst);
  for(let i=0;i<bytes.length;i+=3){
   for(let p=1;p<=3;p++){h.step(gap);h.cpuWrite(p,bytes[i+p-1]);}
   h.step(gap);const token=(i/3)%255+1;h.cpuWrite(0,token);
   h.waitFor(()=>h.cpuRead(0)===token);
   // A CPU can run arbitrarily far ahead immediately after the echo.
   // Poison all data ports before the SPC takes even one more cycle.
   for(let p=1;p<=3;p++)h.cpuWrite(p,0xCD);
  }
  end(h);
  assert.deepEqual(h.ram.slice(dst,dst+bytes.length),bytes,`gap ${gap}, destination ${dst.toString(16)}`);
 }
});

test('native bootstrap modes acknowledge all bytes, across pages and counter wrap',()=>{
 for(const mode of [2,3]){
  const h=setup(),bytes=Uint8Array.from({length:1548},(_,i)=>i*73&255);begin(h,mode,0x50FD);
  for(let i=0;i<bytes.length;i+=mode){
   for(let j=0;j<mode;j++)h.cpuWrite(4-mode+j,bytes[i+j]);
   const c=i/mode%255+1;h.cpuWrite(0,c);h.waitFor(()=>h.cpuRead(0)===c);
   for(let p=1;p<=3;p++)h.cpuWrite(p,0xCD);
  }
  end(h);assert.deepEqual(h.ram.slice(0x50FD,0x50FD+bytes.length),bytes);
 }
});

test('a transfer may end after any unrolled packet, without writing a following byte',()=>{
 for(const n of [3,6,9,12,15,249,252,255,258]){
  const h=setup();h.ram.fill(0xCD,0x5000,0x5200);begin(h,4,0x5001);
  for(let i=0;i<n;i+=3){
   for(let p=1;p<=3;p++)h.cpuWrite(p,0x5A);
   h.cpuWrite(0,i/3+1);h.waitFor(()=>h.cpuRead(0)===i/3+1);
  }
  end(h);assert.equal(h.ram[0x5000],0xCD);assert.equal(h.ram[0x5001+n],0xCD);
 }
});

test('fast compaction preserves unaligned overlapping moves and consecutive copies',()=>{
 for(const n of [1,9,255,256,257,4014,6714])for(const gap of [0,41]){
  const h=setup();
  const original=Uint8Array.from({length:n},(_,i)=>(i*131+(i>>8)*23)&255);
  h.ram.set(original,0x5203);begin(h,7,0x5203);
  const word=(v,c)=>{h.cpuWrite(2,v);h.step(gap);h.cpuWrite(3,v>>8);h.step(gap);h.cpuWrite(0,c);h.waitFor(()=>h.cpuRead(0)===c);};
  word(0x5101,1);word(n,2);
  // Queue the next source while the first copy is still executing.
  word(0x5101,3);word(0x5000,4);word(n,5);end(h);
  assert.deepEqual(h.ram.slice(0x5000,0x5000+n),original,`length ${n}, gap ${gap}`);
 }
});
