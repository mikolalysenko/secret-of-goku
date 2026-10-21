// Execute the charging-only binding and the complete combat state API.
// CPU context and RAM agree except combat's call-local flags accumulator.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const reference=resolve(root,process.env.FLIGHT_REFERENCE_ROM??'.local/snes-test/charge-state/reference.sfc');
if(!process.env.FLIGHT_REFERENCE_ROM){
  mkdirSync(resolve(root,'.local/snes-test/charge-state'),{recursive:true});
  execFileSync(process.execPath,['snes/build.mjs','--strict','--quiet',
    `--out=${reference}`,'-DFLIGHT_CHARGE_STATE_SLOW=1'],{cwd:root,stdio:'pipe'});
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
function machine(path){
  const rom=readFileSync(path),sym=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
  const match=sym.match(/^([\dA-F]{2}):([\dA-F]{4}) fl_bind_charging$/m);assert(match);
  const entry=parseInt(match[1]+match[2],16),ram=Buffer.alloc(0x20000);
  const index=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{const r=index(a);return r<0?rom[hiromToPc(a,rom.length)]:ram[r];},
    cpuWrite:(a,v)=>{const r=index(a);assert(r>=0,`unexpected I/O ${a.toString(16)}`);ram[r]=v;}});
  return ({charging=1,can=1,form=0,action=17,full=0,charge=45,p=0,noise=0xA6}={})=>{
    ram.fill(noise);cpu.reset();cpu.e=false;
    for(const [i,f] of flags.entries())cpu[f]=!!(p&(1<<i));
    ram[0xD828]=charging;ram[0xD812]=can;ram[0xD811]=form;
    ram[0xD814]=action;ram[0xD81D]=full;ram.writeUInt16LE(charge,0xD826);
    cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<500,'binding did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[0],charging?2:0);assert.equal(cpu.c,!!charging);
    ram.fill(0,0xD870,0xD872);ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),cycles};
  };
}
const old=machine(reference),fast=machine(path);
test('charging binding preserves complete API result and context',t=>{
  let count=0;
  for(let charging=0;charging<256;charging++)for(const form of [0,1,255])
    for(const action of [0,17,18,255])for(const p of [0,1,4,0xC5]){
      const input={charging,form,action,p,can:charging^255,full:charging&4,charge:charging*257};
      const a=old(input),b=fast(input);count++;
      assert.deepEqual(b.ram,a.ram,JSON.stringify(input));
      assert.deepEqual(b.registers,a.registers);assert.deepEqual(b.flags,a.flags);
    }
  const a=old(),b=fast();assert(b.cycles<a.cycles*.25);
  t.diagnostic(`${count} assembled comparisons; charging query ${a.cycles} -> ${b.cycles} CPU cycles`);
});
