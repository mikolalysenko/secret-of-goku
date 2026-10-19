// Run the assembled native visibility helpers against the cartridge code.
// These select AI targets, so compare CPU context and all live RAM too.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
function runner(rom){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>{const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const r=at(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;},
  });
  return ({entry=0x054A,x=128,y=112,height=17,active=1,status=0,p=0x20,dp=0,db=0x7E,self=false}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const actor=p&16?0x40:0xE000,target=self?actor:p&16?0xA0:0xE600;
    cpu.r[0]=db;cpu.r[1]=0xC1;
    cpu.br.set([0xABCD,actor,target,0x1FFD,entry,dp]);
    const offset=(db===0x7F?0x10000:0)+actor;
    ram[offset]=active;
    ram.writeUInt16LE(x&65535,offset+0x20);
    ram.writeUInt16LE(y&65535,offset+0x22);
    ram[offset+0x45]=height;
    ram.writeUInt16LE(status,offset+0x190);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC1){
      assert(++n<200,`visibility helper did not return: ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000);
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles};
  };
}
const old=runner(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc')));
const next=runner(readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')));
function compare(input){
  const a=old(input),b=next(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert(a.ram.equals(b.ram),`RAM ${why}`);
  return [a.cycles,b.cycles];
}
test('native AI visibility retains every vertical coordinate and wrapped height',()=>{
  for(const entry of [0x0526,0x054A])for(let y=0;y<65536;y++)
    compare({entry,y,height:17});
});
test('native AI visibility retains screen edges, status, self exclusion and CPU flags',t=>{
  for(const entry of [0x0526,0x054A]){
    for(let height=0;height<256;height++)for(const adjusted of [-1,0,223,224,255,256])
      compare({entry,y:(height+adjusted)&65535,height});
    for(const x of [0,1,255,256,257,32767,32768,65535])
      for(const y of [0,1,223,224,225,256,32767,32768,65535])
        for(const height of [0,1,16,127,128,255])
          for(const status of [0,0x20,0x40,0x400,0x8000,0x8460,0x7B9F])
            compare({entry,x,y,height,status});
    for(let p=0;p<256;p++)if(p&0x20)
      for(const active of [0,1,2,128,255])for(const self of [false,true])
        for(const dp of [0,0x1201,0x8000])
          compare({entry,p,active,self,dp,db:p&1?0x7F:0x7E});
    const [before,after]=compare({entry});
    assert(after<before,`visible target cycles ${before} -> ${after}`);
    t.diagnostic(`$${entry.toString(16)} visible target: ${before} -> ${after} CPU cycles`);
  }
});
