// Execute the retail and optimized emitter/contact code, including flags,
// partial OAM writes, the high table and all live actor RAM. Optional real
// inputs come from gameplay --record-native; recordings stay private.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const ctx=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),ctx);
const flags=['c','z','i','d','x','m','v','n'];
const slow=new Set((process.env.NATIVE_EXPECT_SLOW??'').split(','));
let rng=0x65816;
function rand(){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;}
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=rand()&255;
function runner(path){
  const rom=readFileSync(path),symPath=path.replace(/\.sfc$/,'.sym');
  const sym=existsSync(symPath)?readFileSync(symPath,'utf8'):'';
  const body=sym.match(/^([\dA-F]{2}):([\dA-F]{4}) core_native_body$/mi);
  const ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new ctx.Cpu({cpuRead:a=>{const p=at(a);return p>=0?ram[p]:rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;}});
  return (input)=>{
    seed.copy(ram);if(input.ram)input.ram.copy(ram);
    cpu.reset();cpu.e=false;
    const {kind='emitter',a=0xABCD,x=0xE090,y=0,sp=0x1EFD,d=0,dbr=0x7E,ps=0x24}=input;
    for(const [i,f]of flags.entries())cpu[f]=!!(ps&(1<<i));
    const sprite=kind==='emitter'||kind==='body';
    const bank=sprite?0x80:0x81,entry=kind==='body'&&body?parseInt(body[1]+body[2],16):
      (bank<<16)|(sprite?0xE640:kind==='contact'?0xCE72:0xD14A);
    cpu.r.set([dbr,entry>>>16]);cpu.br.set([a,x,y,sp,entry&65535,d]);
    input.setup?.(ram);ram.writeUInt16LE(0x6FFF,sp+1);
    const stops=sprite?[0x7000]:kind==='contact'?[0xCF19]:[0x7000,0xD154,0xD206];
    let cycles=0,n=0;
    while(cpu.r[1]!==bank||!stops.includes(cpu.br[4])){
      assert(++n<100000,`did not return: ${kind} $${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    // Only dead callee stack bytes may differ. Keep the live parent stack.
    ram.fill(0,Math.max(0,sp-32),sp+1);
    if(kind==='body')ram.fill(0,0x6FFC,0x6FFE); // existing private packed anchor
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:Buffer.from(ram),cycles};
  };
}
const before=runner(resolve(root,process.env.NATIVE_BASELINE_ROM??'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  if(input.setup){
    const ram=Buffer.from(input.ram??seed);input.setup(ram);
    input={...input,ram,setup:undefined};
  }
  const a=before(input),b=after(input);
  assert.deepEqual(b.registers,a.registers,`registers: ${input.kind??'emitter'}`);
  assert.deepEqual(b.flags,a.flags,`flags: ${input.kind??'emitter'}`);
  if(!a.ram.equals(b.ram)){
    const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);
    assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}`);
  }
  return [a.cycles,b.cycles];
}
test('emitter retains clipped/visible pieces, OAM exhaustion and randomized native contexts',t=>{
  for(let i=0;i<12000;i++){
    const d=i%3?0:0x100,ps=rand()&~16,count=i%31===0?0:1+rand()%16;
    const x=0xE090+(i%8)*0x200;
    const cursor=[0,12,248,252,256,500,504,508,512][i%9];
    compare({d,ps,x,a:rand()&65535,setup(ram){
      ram[d+2]=count;ram.writeUInt16LE(cursor,d+0x7C);
      ram.writeUInt16LE(i%3?rand()%500-128&65535:rand()&65535,d+4);
      ram.writeUInt16LE(i%3?rand()%500-128&65535:rand()&65535,d+6);
      for(let p=0;p<(count||256)*4;p++)ram[x+p&65535]=rand()&255;
    }});
  }
  const cycles=compare({setup(ram){ram[2]=6;ram.writeUInt16LE(128,4);ram.writeUInt16LE(112,6);ram.writeUInt16LE(0,0x7C);ram.fill(0,0xE090,0xE0A8);}});
  assert(slow.has('emitter')?cycles[1]===cycles[0]:cycles[1]<cycles[0]);
  t.diagnostic(`six-piece generic emitter: ${cycles.join(' -> ')} CPU cycles`);
});
test('empty contact boxes and both nonempty continuations retain RAM, registers and native P states',t=>{
  for(let i=0;i<12000;i++){
    const d=[0,0x100,0x1201][i%3],x=[0,0x200,0x400][i%3],y=0x600+(i%9)*0x200;
    compare({kind:'overlap',d,x,y,ps:rand()&~16,a:rand()&65535,setup(ram){
      ram.writeUInt16LE(i%5===0?rand()&65535:0,0xE0C2+x);
      ram.writeUInt16LE(i%7===0?rand()&65535:0,0xE0C2+y);
      ram.writeUInt16LE(rand()&65535,d+6);
    }});
  }
  const cycles=compare({kind:'overlap',x:0,y:0x600,setup(ram){ram.writeUInt16LE(0,0xE0C2);ram.writeUInt16LE(0,0xE6C2);}});
  assert(slow.has('overlap')?cycles[1]===cycles[0]:cycles[1]<cycles[0]);
  t.diagnostic(`empty contact pair: ${cycles.join(' -> ')} CPU cycles`);
});
test('recorded gameplay inputs match the assembled retail routines',t=>{
  const paths=(process.env.NATIVE_INPUTS??'').split(':').filter(Boolean);
  if(!paths.length){t.skip('set NATIVE_INPUTS to gameplay native-inputs.json paths');return;}
  const stats={};
  for(const path of paths)for(const record of JSON.parse(readFileSync(path))){
    if(!['emitter','body','contact','overlap'].includes(record.kind))continue;
    const data=readFileSync(resolve(dirname(path),record.file)),ram=Buffer.from(seed);
    data.copy(ram,0,0,0x2000);data.copy(ram,0xE000,0x2000);
    const [a,b]=compare({...record.cpu,kind:record.kind,ram});
    const s=stats[record.kind]??={calls:0,before:0,after:0,maxBefore:0,maxAfter:0};
    s.calls++;s.before+=a;s.after+=b;s.maxBefore=Math.max(a,s.maxBefore);s.maxAfter=Math.max(b,s.maxAfter);
  }
  for(const [kind,s]of Object.entries(stats))t.diagnostic(`${kind}: ${JSON.stringify(s)}`);
});
