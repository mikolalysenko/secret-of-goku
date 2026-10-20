// Compare the actual operand-advance entry and its ten tail wrappers with
// the retail routines. Cover both operand encodings and CPU/index wrapping.
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
const entries=[0x01F7,0x0213,0x021B,0x0224,0x022E,0x0239,
  0x0285,0x028D,0x0296,0x02A0,0x02AB];
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
function runner(rom){
  const ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;}});
  return ({entry=0x0213,script=0x1234,arg=null,p=0x20,dp=0,db=0x7E}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const x=p&16?script&255:script,y=p&16?0x80:0xE600;
    const bank=db===0x7F?0x10000:0;
    ram.writeUInt16LE(script,bank+y+0x144);
    cpu.r[0]=db;cpu.r[1]=0xC1;
    cpu.br.set([0xABCD,x,y,0x1FFD,entry,dp]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    const prefix=entry===0x01F7?0:((entries.indexOf(entry)-1)%5)+1;
    const operand=p&16?(script+prefix)&255:(script+prefix)&65535;
    const offset=hiromToPc(0xD04F15+operand,rom.length);
    const old=rom[offset];if(arg!==null)rom[offset]=arg;
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==0xC1;n++){
      assert(n<1000,'operand advance did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    rom[offset]=old;
    ram.fill(0,0x1F00,0x2000); // inactive stack bytes are not live outputs
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram,cycles};
  };
}
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const reference=Buffer.from(source),retail=readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
// Keep the port's script data in both machines; restore only these helpers.
for(const [start,end]of [[0x01F7,0x0245],[0x0285,0x02B7]])
  retail.copy(reference,0x10000+start,0x10000+start,0x10000+end);
const before=runner(reference),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,'registers '+why);
  assert.deepEqual(b.flags,a.flags,'flags '+why);
  assert(a.ram.equals(b.ram),'RAM '+why);
  assert(b.cycles<a.cycles,'no cycle reduction '+why);
  return [a.cycles,b.cycles];
}
test('operand advance retains every script position and wrapped pointer',t=>{
  for(let script=0;script<65536;script++)compare({entry:0x01F7,script});
  t.diagnostic('65536 script positions; '+compare({entry:0x01F7}).join(' -> ')+' CPU cycles');
});
test('tail wrappers preserve operand encodings, widths, flags, DB and D',t=>{
  for(const entry of entries)for(let arg=0;arg<256;arg++)for(const p of [0,0x20,0x10,0x30,0xFF])
    // Retail's relative-branch helper saves two index bytes. Its caller
    // guarantees X16; X8 is meaningful only for the forward helpers.
    if(entry<0x0285||!(p&16))compare({entry,arg,p});
  for(const entry of entries)for(let p=0;p<256;p++)for(const script of [0,0xFC,0xFF,0xFFFC,0xFFFF])
    if(entry<0x0285||!(p&16))compare({entry,p,script,dp:p&1?0x1201:0x400,db:p&2?0x7F:0x7E});
  t.diagnostic('forward wrapper '+compare({entry:0x0213}).join(' -> ')+' CPU cycles; branch wrapper '+compare({entry:0x0285}).join(' -> '));
});
