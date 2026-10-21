// Compare the production charge API + field callback with the full path.
// UI_TEST's policy driver intentionally wakes every frame, so execute the
// real idle path here as well as running the browser-policy Mesen suite.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const reference=resolve(root,process.env.UI_REFERENCE_ROM??'.local/snes-test/charge-idle/reference.sfc');
if(!process.env.UI_REFERENCE_ROM){
  mkdirSync(resolve(root,'.local/snes-test/charge-idle'),{recursive:true});
  execFileSync(process.execPath,['snes/build.mjs','--quiet','--strict',
    `--out=${reference}`,'-DUI_CHARGE_IDLE_SLOW=1'],{cwd:root,stdio:'pipe'});
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const U=0x7E40;
const index=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
function machine(path){
  const rom=readFileSync(path),symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x40000),io=[];
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16>=0x30&&a>>>16<=0x33)return sram[a-0x300000];
    const r=index(a);if(r>=0)return ram[r];
    if((a>>>16&0x7F)<0x40&&(a&65535)<0x8000)return 0;
    return rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16>=0x30&&a>>>16<=0x33){sram[a-0x300000]=v;return;}
    const r=index(a);if(r>=0){ram[r]=v;return;}io.push([a,v]);
  }});
  return ({input=0,age=31,hidden=[],inputs=0,active=1,frames=1,release=false,
    event=0,pad=0,superAfter=false,messageAfter=false,apiP=0,db=0x7E,dp=0,
    magic=0x4B41,state=0x18,queue=0}={})=>{
    ram.fill(0);sram.fill(0);io.length=0;cpu.reset();cpu.e=false;
    ram.writeUInt16LE(state,U);ram.writeUInt16LE(magic,U+0x82);ram.writeUInt16LE(queue,U+0x0C);
    ram.writeUInt16LE(age,U+0xAC);ram.writeUInt16LE(inputs,U+0x20);
    ram.writeUInt16LE(1,0xD720);ram.writeUInt16LE(0xA85C,0x100);ram[0x102]=0xC0;
    ram.writeUInt16LE(0x0101,0xE4);ram[0xE000]=1;ram[0xE02C]=1;
    ram[0xD0]=event;sram[0x16001]=active;
    ram.writeUInt16LE(pad,0xD702);
    for(const [addr,value,size=1] of hidden)size===2?ram.writeUInt16LE(value,addr):ram[addr]=value;
    let cycles=0;
    function call(name,a=0,p=0,bank=0x7E,direct=0){
      const entry=symbols.get(name);assert(entry,name);
      for(const [i,f] of ['c','z','i','d','x','m','v','n'].entries())cpu[f]=!!(p&(1<<i));
      cpu.r[0]=bank;cpu.r[1]=entry>>>16;
      cpu.br.set([a,p&16?0x34:0x1234,p&16?0x78:0x5678,0x1FFC,entry&65535,direct]);
      ram.writeUInt16LE(0x6FFF,0x1FFD);ram[0x1FFF]=0x80;
      for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==0x80;n++){
        assert(n<30000,`${name} did not return`);cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
      }
      assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],direct);assert.equal(cpu.r[0],bank);
      if(name.startsWith('ui_charge_')){
        assert.equal(cpu.m,!!(p&32));assert.equal(cpu.x,!!(p&16));
        assert.equal(cpu.br[1],p&16?0x34:0x1234);assert.equal(cpu.br[2],p&16?0x78:0x5678);
      }
    }
    for(let i=0;i<frames;i++){
      call('ui_charge_tick',input,apiP,db,dp);
      if(release)call('ui_charge_release',0,apiP,db,dp);
      call('ui_field_frame');
    }
    if(superAfter){call('ui_charge_tick',3);call('ui_field_frame');}
    if(messageAfter){
      ram.writeUInt16LE(1,U+0x1C); // hidden: only policy, no window DMA
      call('ui_say',0);assert.equal(ram.readUInt16LE(U)&16,0,'a message wakes the full UI');
      call('ui_charge_tick',input);call('ui_field_frame');
    }
    ram.fill(0,U+0x26,U+0x35);ram.fill(0,0x1E00,0x2000); // call-local scratch / dead stack
    return {ram:Buffer.from(ram),sram:Buffer.from(sram),io:[...io],cycles};
  };
}
const old=machine(reference),fast=machine(path);let comparisons=0;
function compare(input){
  const a=old(input),b=fast(input);comparisons++;
  for(const key of ['ram','sram'])if(!a[key].equals(b[key])){
    const i=a[key].findIndex((v,i)=>v!==b[key][i]);
    assert.fail(`${key} $${i.toString(16)} ${a[key][i]} -> ${b[key][i]} ${JSON.stringify(input)}`);
  }
  assert.deepEqual(b.io,a.io);return [a.cycles,b.cycles];
}
test('quiet charge/beam keeps full-path state, visibility, release and later wakeups',t=>{
  for(const input of [0,2,4,6,1,3,7])for(const age of [0,1,30,31,255])
    for(const active of [0,1])for(const inputs of [0,1,2,4])
      for(const release of [false,true])compare({input,age,active,inputs,release});
  for(const input of [0,2,4])for(const frames of [2,32,100])
    for(const superAfter of [false,true])for(const messageAfter of [false,true])
      compare({input,frames,superAfter,messageAfter});
  for(const hidden of [[[0x2C,1]],[[0x1D04,0x20]],[[0x29,4]],[[0x3E,1]],[[0x40,1]],
    [[U+0x1C,1]],[[0x100,0]],[[0xE4,0]],[[0xEC,2]],[[0xED,0x40]],[[0xE000,0]],
    [[0xE02C,0]],[[0xE190,0x10]],[[0xE191,0x80]],[[0xE011,0x8C]]])compare({hidden});
  for(const apiP of [0,1,0x10,0x20,0x30,0xC5,0xF5])for(const db of [0,0x7E,0x7F])
    for(const dp of [0,0x1234])compare({apiP,db,dp});
  for(const event of [0,1,0x80])for(const pad of [0,0x10,0x30])compare({event,pad});
  for(const input of [0,2,4])for(const invalid of [{magic:0},{state:0x8018},{queue:0xFFFF}])
    compare({input,...invalid});
  const [before,after]=compare({});assert(after<before*.6,`${before} -> ${after}`);
  t.diagnostic(`quiet base charge API + field callback: ${before} -> ${after} CPU cycles`);
  t.diagnostic(`${comparisons} assembled comparisons`);
});
