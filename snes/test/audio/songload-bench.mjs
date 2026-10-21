// Receiver/copy ceilings, without S-CPU instruction overhead. The producer
// holds constant payload ports so even retail's early acknowledgement cannot
// race the next packet. Clock-skew/data-integrity checks are in songload.test.
// node snes/test/audio/songload-bench.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assemble} from '../../gen/audio-spc700.mjs';
import {createApu} from './apu.mjs';
const loader=assemble(readFileSync(new URL('../../src/modules/audio/spc/songload.s',import.meta.url),'utf8'));
const n=6000,rows=[];
for(const kind of ['retail','safe-native','unrolled']){
 const h=createApu({extension:kind!=='retail'});h.ms(60);
 if(kind==='unrolled'){
  for(const s of loader.segments)h.ram.set(s.bytes,s.addr);
  for(const [mode,name] of [[4,'song_receive'],[7,'song_copy']]){
   const a=loader.symbols.get(name);h.ram[0x1418+2*mode]=a&255;h.ram[0x1419+2*mode]=a>>8;
  }
 }
 const begin=(mode,at)=>{h.nativeCmd(0xFE,mode,at&255,at>>8);h.waitFor(()=>h.cpuRead(0)===0);};
 const end=()=>{h.cpuWrite(1,0);h.cpuWrite(0,0);h.waitFor(()=>h.cpuRead(0)===0);};
 begin(kind==='unrolled'?4:3,0x5001);
 const start=h.cycles;
 for(let i=0;i<n;i+=3){
  for(let p=1;p<=3;p++)h.cpuWrite(p,0x5A);
  const c=i/3%255+1;h.cpuWrite(0,c);h.waitFor(()=>h.cpuRead(0)===c);
 }
 end();const receive=(h.cycles-start)/n;
 assert.ok(h.ram.slice(0x5001,0x5001+n).every(v=>v===0x5A));
 begin(7,0x5001);
 h.cpuWrite(2,0);h.cpuWrite(3,0x4F);h.cpuWrite(0,1);h.waitFor(()=>h.cpuRead(0)===1);
 const copyStart=h.cycles;
 h.cpuWrite(2,n&255);h.cpuWrite(3,n>>8);h.cpuWrite(0,2);h.waitFor(()=>h.cpuRead(0)===2);end();
 const copy=(h.cycles-copyStart)/n;
 assert.ok(h.ram.slice(0x4F00,0x4F00+n).every(v=>v===0x5A));
 rows.push({kind,receiveCyclesPerByte:+receive.toFixed(3),copyCyclesPerByte:+copy.toFixed(3),
  receiveBytesPerFrame:Math.floor(1024000/60.0988/receive)});
}
console.log(JSON.stringify(rows,null,2));
