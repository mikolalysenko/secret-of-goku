// Execute the native companion party-target setup against a build with only
// the C1:2466 fast-path bytes restored. Compare all live CPU/RAM state; dead
// callee stack is excluded, as in the other native interpreter checks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const retail=readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
const reference=Buffer.from(source);
retail.copy(reference,0x12466,0x12466,0x1246A);
const flags=['c','z','i','d','x','m','v','n'];

function runner(rom){
  const ram=Buffer.alloc(0x20000),io=Buffer.alloc(0x10000);
  let writes=[];
  const at=a=>{
    const b=a>>>16,o=a&65535;
    if(b===0x7E)return o;
    if(b===0x7F)return 0x10000+o;
    if((b&0x7F)<0x40&&o<0x2000)return o;
    return -1;
  };
  const isIo=a=>((a>>>16)&0x7F)<0x40&&(a&65535)>=0x2000&&(a&65535)<0x6000;
  const cpu=new context.Cpu({
    cpuRead:a=>{
      const r=at(a);if(r>=0)return ram[r];
      return isIo(a)?io[a&65535]:rom[hiromToPc(a,rom.length)];
    },
    cpuWrite:(a,v)=>{
      const r=at(a),o=a&65535;
      if(r>=0){ram[r]=v;return;}
      assert(isIo(a),`unexpected write ${a.toString(16)}`);
      io[o]=v;writes.push([a,v]);
      if(o===0x4203)io.writeUInt16LE(io[0x4202]*v,0x4216);
      if(o===0x4206){
        const num=io.readUInt16LE(0x4204);
        io.writeUInt16LE(v?Math.floor(num/v):65535,0x4214);
        io.writeUInt16LE(v?num%v:num,0x4216);
      }
    },
  });
  return ({actor=0xE400,d9=1,da=0,db=0,status=[0,0,0],e011=0xF0,e01c=0x43,initialFlags=0xAA,p=0x10,stack=0x1FFF}={})=>{
    ram.fill(0);io.fill(0);writes=[];
    ram[0xD9]=d9;ram[0xDA]=da;ram[0xDB]=db;
    for(let i=0;i<3;i++){
      const x=i*0x200;
      ram.writeUInt16LE(status[i],0xE190+x);
      ram[0xE011+x]=e011;ram[0xE01C+x]=e01c;
      ram[0xE180+x]=1;
    }
    ram[actor+0x14C]=initialFlags;
    cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    cpu.m=true;cpu.x=false;cpu.r[0]=0x7E;cpu.r[1]=0xC1;
    ram[stack]=0x25;ram[stack-1]=0x73;
    cpu.br.set([0,actor,0xBEEF,stack-2,0x2457,0]);
    let cycles=0,n=0;
    while(cpu.br[4]!==0x2574||cpu.r[1]!==0xC1){
      assert(++n<1000,`setup did not return at ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1800,stack+1);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,io,writes,cycles};
  };
}
const before=runner(reference),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  for(const key of ['registers','flags','ram','io','writes'])
    assert.deepEqual(b[key],a[key],`${key} ${why}`);
  return {before:a.cycles,after:b.cycles};
}

test('empty party-target setup takes the direct path with identical live state',t=>{
  for(const actor of [0xE200,0xE400])for(const initialFlags of [0x20,0xAA,0xFF])
    for(const p of [0,1,2,4,8,0x10,0x20,0x40,0x80,0xFF])
      compare({actor,initialFlags,p});
  const r=compare({});
  assert.equal(r.before-r.after,506);
  t.diagnostic(`empty companion party-target setup: ${r.before} -> ${r.after} CPU cycles`);
});

test('status and alternate target masks retain the retail setup',()=>{
  for(const status of [[1,0,0],[0,0x80,0],[0,0,0x4000],[0x800,0x800,0x800]])
    compare({status});
  for(const d9 of [0,2,4,8,9])compare({d9});
  for(const da of [1,2,4,8])compare({d9:0,da});
  for(const db of [1,2,4,8])compare({d9:0,db});
  compare({e011:2,e01c:1});
  compare({d9:2,e011:2,e01c:1});
});

test('the retail fallback keeps the $C57B status mask',()=>{
  // statuses outside the mask (poison $2000 and others) with each fallback cause
  for(const status of [[0x2000,0,0],[0,0x0004,0],[0,0,0x1000],[0x0080,0x0200,0x0800]]){
    compare({status,d9:2});
    compare({status,e011:2,e01c:0});
    compare({status,d9:0,da:1});
  }
});

test('a valid party target retains script setup and target flags',()=>{
  for(const actor of [0xE200,0xE400])for(const initialFlags of [0x20,0x22,0xAA])
    compare({actor,initialFlags,e011:2,e01c:0});
});

test('stack and direct-page page boundaries preserve the parent frame',()=>{
  for(const stack of [0x1EFA,0x1EFB,0x1EFC,0x1EFD,0x1EFE,0x1EFF,0x1F00,0x1F01,0x1F02,0x1F03,0x1F10])
    compare({stack});
});
