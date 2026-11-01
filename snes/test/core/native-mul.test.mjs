// The two constant-$80 terrain products must match C2:2AA6's hardware path;
// its other callers and factors are untouched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const names=['c','z','i','d','x','m','v','n'];
const seed=Buffer.alloc(0x20000);for(let i=0;i<seed.length;i++)seed[i]=(i*73+(i>>8)*19)&255;

function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(seed.length),io=Buffer.alloc(0x10000);
  const ramAt=a=>((a>>>16)===0||(a>>>16)===0x7E)&&(a&0xFFFF)<0x2000?a&0x1FFF:
    (a>>>16)===0x7F?0x10000+(a&0xFFFF):-1;
  const ioAt=a=>((a>>>16)&0x7F)<0x40&&(a&0xFFFF)>=0x4200&&(a&0xFFFF)<0x4220?a&0xFFFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    const r=ramAt(a);if(r>=0)return ram[r];const p=ioAt(a);return p>=0?io[p]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    const r=ramAt(a);if(r>=0){ram[r]=v;return;}const p=ioAt(a);assert(p>=0);io[p]=v;
    if(p===0x4203)io.writeUInt16LE(io[0x4202]*v,0x4216);
  }});
  return ({a=1,dp=0x0200,p=0,entry=0x1690,stop=0x1697}={})=>{
    seed.copy(ram);io.fill(0xA5);ram[dp+0x46]=a;ram[dp+0x4E]=0x80;
    cpu.reset();cpu.e=false;cpu.m=true;cpu.x=false;
    for(const [i,f] of names.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    cpu.r.set([0,0xC2]);cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,entry,dp]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==stop;n++){
      assert(n<100,'multiplier did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),io:Buffer.from(io),registers:[...cpu.r,...cpu.br],
      flags:names.map(f=>cpu[f]),cycles};
  };
}
const before=runner(resolve(root,'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.ram,a.ram,`RAM ${why}`);assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert.equal(b.ram[(input.dp??0x0200)+0x56]|b.ram[(input.dp??0x0200)+0x57]<<8,
    (input.a??1)*0x80,`product ${why}`);
  return [a.cycles,b.cycles];
}

test('native constant-x128 terrain products preserve the complete call contract',t=>{
  for(const [entry,stop] of [[0x1690,0x1697],[0x16C3,0x16CA]]){
    for(let a=0;a<256;a++)compare({a,entry,stop});
    for(const dp of [0,0x0200,0x1234])for(const p of [0,1,4,8,0x40,0x80,0xCF])
      compare({a:203,dp,p,entry,stop});
    const [oldCycles,newCycles]=compare({a:203,entry,stop});
    assert(newCycles<oldCycles*.8,`x128 cycles ${oldCycles} -> ${newCycles}`);
    t.diagnostic(`call $${entry.toString(16)}: ${oldCycles} -> ${newCycles} CPU cycles`);
  }
});
