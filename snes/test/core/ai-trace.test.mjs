// Replay recorded enemy AI calls (80:F8E9 JSL $81D942, the whole native AI
// pass for one actor) through the cartridge and through the same cartridge
// with the rewritten interpreter handlers put back to their retail bytes.
// Every live result must match: bank $7E/$7F WRAM, SRAM, CPU registers and
// flags, and I/O writes; only the dead stack below the caller's S may differ.
// Recordings are private real inputs (.local/snes-test/ai-trace, or
// AI_TRACE_DIR), written by the snes/test/lua/ai-record.lua prelude over
// gameplay cases and presets; without them the test reports a skip.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const ctx=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),ctx);
const flags=['c','z','i','d','x','m','v','n'];
// Retail byte ranges (bank $C1 offsets) of the rewritten handlers.
const AI_REWRITES=[
  [0x0245,0x0285], // CORE_NATIVE_JUMP_SLOW: the relative jump
];
const traceDir=resolve(root,process.env.AI_TRACE_DIR??'.local/snes-test/ai-trace');
function recordings(){
  const out=[];
  if(!existsSync(traceDir))return out;
  const walk=d=>{for(const n of readdirSync(d)){const p=join(d,n);
    if(statSync(p).isDirectory())walk(p);
    else if(/^airec.*\.json$/.test(n))for(const r of JSON.parse(readFileSync(p,'utf8')))out.push({...r,path:join(d,r.file)});}};
  walk(traceDir);
  return out;
}
function runner(rom){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x8000),io=Buffer.alloc(0x10000);let writes=[];
  const at=a=>{
    const b=a>>>16,o=a&65535;
    if(b===0x7e)return o;
    if(b===0x7f)return 0x10000+o;
    if((b&0x7f)<0x40&&o<0x2000)return o;
    return -1;
  };
  const sramAt=a=>{const b=(a>>>16)&0x7f,o=a&65535;
    return b>=0x30&&b<0x34&&o>=0x6000&&o<0x8000?((b&3)<<13)+o-0x6000:-1;};
  const isIo=a=>(a>>>16&0x7f)<0x40&&(a&65535)>=0x2000&&(a&65535)<0x6000;
  const cpu=new ctx.Cpu({
    cpuRead:a=>{
      const r=at(a);if(r>=0)return ram[r];
      const s=sramAt(a);if(s>=0)return sram[s];
      return isIo(a)?io[a&65535]:rom[hiromToPc(a,rom.length)];
    },
    cpuWrite:(a,v)=>{
      const r=at(a),o=a&65535;
      if(r>=0){ram[r]=v;return;}
      const s=sramAt(a);if(s>=0){sram[s]=v;return;}
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
  return rec=>{
    const wram=readFileSync(rec.path);
    ram.fill(0x55);wram.copy(ram,0,0,0x10000);sram.fill(0);io.fill(0);writes=[];
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(rec.ps&(1<<i));
    cpu.r.set([rec.dbr,0x80]);cpu.br.set([rec.a,rec.x,rec.y,rec.sp,0xF8E9,rec.d]);
    let cycles=0,n=0;
    while(cpu.r[1]!==0x80||cpu.br[4]!==0xF8ED){
      assert(++n<2000000,`AI call did not return (${rec.path})`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    // Dead stack below the caller's S (the JSL return and the callees' frames).
    ram.fill(0,Math.max(0x108,rec.sp-0xF0),rec.sp+1);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:Buffer.from(ram),
      sram:Buffer.from(sram),writes:JSON.stringify(writes),cycles};
  };
}
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
// AI_TRACE_REFERENCE: a cartridge built with *_SLOW defines instead (covers
// rewrites outside bank $C1, such as core's shortcuts).
const reference=process.env.AI_TRACE_REFERENCE?readFileSync(resolve(root,process.env.AI_TRACE_REFERENCE)):Buffer.from(source);
const retail=readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
if(!process.env.AI_TRACE_REFERENCE)
  for(const [start,end] of AI_REWRITES)retail.copy(reference,0x10000+start,0x10000+start,0x10000+end);
test('recorded AI calls give the same state with and without the rewritten handlers',t=>{
  const recs=recordings();
  if(!recs.length){t.skip('no recordings under '+traceDir);return;}
  const before=runner(reference),after=runner(source);
  let saved=0,total=0;
  for(const rec of recs){
    const a=before(rec),b=after(rec),why=rec.path;
    assert.deepEqual(b.registers,a.registers,'registers '+why);
    assert.deepEqual(b.flags,a.flags,'flags '+why);
    assert(a.ram.equals(b.ram),'WRAM '+why);
    assert(a.sram.equals(b.sram),'SRAM '+why);
    assert.equal(b.writes,a.writes,'I/O writes '+why);
    assert(b.cycles<=a.cycles,'more CPU cycles '+why);
    saved+=a.cycles-b.cycles;total+=a.cycles;
  }
  t.diagnostic(`${recs.length} recorded calls: ${total} -> ${total-saved} CPU cycles (${(100*saved/total).toFixed(1)}% less)`);
});
