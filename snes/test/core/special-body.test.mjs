// Assembled old/new differential for C2:1FB5-2004. Compare the complete
// native state at 1FAC, including every OAM byte and its ordered byte writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const ctx=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),ctx);
const flagNames=['c','z','i','d','x','m','v','n'];
let rng=0x1FB5C2;
function rand(){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;}
const seed=Buffer.alloc(0x20000);
for(let i=0;i<seed.length;i++)seed[i]=rand()&255;
function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  return input=>{
    seed.copy(ram);if(input.ram)input.ram.copy(ram);
    const writes=[];
    const cpu=new ctx.Cpu({cpuRead:a=>{const p=at(a);return p>=0?ram[p]:rom[hiromToPc(a,rom.length)];},
      cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}; registers ${[...cpu.br]}`);ram[p]=v;
        if(p>=0x0800&&p<0x1000)writes.push([a,v]);}});
    cpu.reset();cpu.e=false;
    const {a=0xA55A,x=0,y=0xBEEF,sp=0x1EFD,d=0x0200,dbr=0x7E,ps=0x04}=input;
    for(const [i,f]of flagNames.entries())cpu[f]=!!(ps&(1<<i));
    cpu.r.set([dbr,0xC2]);cpu.br.set([a,x,y,sp,0x1FB5,d]);
    input.setup?.(ram);ram.writeUInt16LE(0x1FAB,sp+1); // original JSR at 1FA9
    let cycles=0,n=0;const stop=input.stop??0x1FAC;
    while(cpu.r[1]!==0xC2||cpu.br[4]!==stop){
      assert(++n<100000,`did not reach $${stop.toString(16)}: $${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    // Callee temporaries below the entry SP are dead. The JSR return and all
    // older caller bytes remain live and are compared without masking.
    ram.fill(0,Math.max(0,sp-64),sp+1);
    return {registers:[...cpu.r,...cpu.br],flags:flagNames.map(f=>cpu[f]),ram:Buffer.from(ram),writes,cycles};
  };
}
const before=runner(resolve(root,process.env.NATIVE_BASELINE_ROM??'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  if(input.setup){const ram=Buffer.from(input.ram??seed);input.setup(ram);input={...input,ram,setup:undefined};}
  const a=before(input),b=after(input);
  const where=`C2:${(input.stop??0x1FAC).toString(16).toUpperCase().padStart(4,'0')}`;
  assert.deepEqual(b.registers,a.registers,`registers at ${where}`);
  assert.deepEqual(b.flags,a.flags,`flags at ${where}`);
  assert.deepEqual(b.writes,a.writes,'ordered low/high OAM byte writes');
  if(!a.ram.equals(b.ram)){
    const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);
    assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}`);
  }
  return [a.cycles,b.cycles];
}
function descriptor(x,y,attr){return [x&255,y&255,attr&255,attr>>>8];}
function input({list,cursor=0,ax=0,ay=0,mode=0,x=0,y=0xBEEF,ps=0x04,d=0x0200,dbr=0x7E,pointer=0x0400,stop}={}){
  return {x,y,ps,d,dbr,stop,setup(ram){
    const dp=offset=>(d+offset)&65535;
    ram.writeUInt16LE(cursor,dp(0x7F));ram.writeUInt16LE(cursor,dp(0x95));
    ram.writeUInt16LE(list.length,dp(0x85));ram.writeUInt16LE(pointer,dp(0x79));
    ram.writeUInt16LE(ax,dp(0x8F));ram.writeUInt16LE(ay,dp(0x91));
    ram.writeUInt16LE(0,dp(0x66));ram.writeUInt16LE(0,0x66+x);ram[(0x70+x)&65535]=mode?8:0;
    list.forEach((v,i)=>ram.set(v,(pointer+i*4)&65535));
  }};
}
const visible=(x,y,attr)=>descriptor(x,y,attr);
test('special body preserves mixed streams, both attributes, cursor wrap and exact write order',t=>{
  const cursors=[0,1,2,3,31,63,126,127,128,129,254,255,256,300,511];
  for(const mode of [0,8])for(const cursor of cursors){
    const list=[
      descriptor(-33,20,0x1234),       // X reject, no OAM write
      descriptor(40,-33,0xE735),       // Y reject, X then E0/attr-neighbor writes
      visible(-32,-32,0x2000),         // both lower boundaries, size set
      visible(127,127,0xE1FF),         // signed offsets, flip/priority bits
      descriptor(127,127,0x0000),
    ];
    compare(input({list,cursor,mode,ax:128,ay:128})); // X/Y = 255 accepted
    compare(input({list:list.slice(0,2),cursor,mode,y:0x1234}));
  }
  // The second coordinate's upper acceptance boundary is also 255, not 224.
  for(const [anchor,offset]of [[128,127],[129,127],[0,-32],[0,-33]]){
    compare(input({list:[visible(offset,20,0x2000)],ax:anchor,ay:0,mode:0}));
    compare(input({list:[visible(20,offset,0x2000)],ax:0,ay:anchor,mode:8}));
  }
  // The last backward-pointer subtraction can overflow even in the live mode.
  compare(input({list:[visible(0,0,0x2000)],pointer:0x8000,ax:32,ay:32}));
  const list=Array.from({length:8},(_,i)=>visible(i*4-16,16-i*4,i&1?0xE000:0x2000));
  const cycles=compare(input({list,cursor:126,mode:0,ax:128,ay:128}));
  assert(cycles[1]<cycles[0],`visible fused loop is not cheaper: ${cycles}`);
  t.diagnostic(`eight visible pieces: ${cycles.join(' -> ')} CPU cycles`);
});
test('special body randomized live native contexts retain full WRAM and final CPU state',t=>{
  let oldTotal=0,newTotal=0,slower=0;
  for(let i=0;i<6000;i++){
    const count=1+rand()%12,cursor=[0,1,126,127,128,129,255,256,300,rand()%384][i%10];
    const list=[];
    for(let j=0;j<count;j++){
      let x=rand()&255,y=rand()&255;
      if(j%3===0)x=[0x20,0x7F,0x60,0xE0][rand()%4];
      if(j%4===0)y=[0x20,0x7F,0x60,0xE0][rand()%4];
      list.push(descriptor(x,y,rand()&65535));
    }
    const ax=[0,1,127,128,129,255,rand()&65535][i%7];
    const ay=[0,1,127,128,129,255,rand()&65535][(i+3)%7],yEntry=rand()&65535;
    const cycles=compare(input({list,cursor,mode:i&8,ax,ay,y:yEntry}));
    oldTotal+=cycles[0];newTotal+=cycles[1];if(cycles[1]>cycles[0])slower++;
  }
  assert(newTotal<oldTotal,`aggregate fused cost is not cheaper: ${oldTotal} -> ${newTotal}`);
  t.diagnostic(`6,000 randomized streams: ${oldTotal} -> ${newTotal} CPU cycles; ${slower} reject-heavy streams slower`);
});
test('special body falls back for decimal, narrow registers, DP and DB variants',()=>{
  for(const ps of [0x04,0x20,0x10,0x08,0x24,0x2C,0x34,0x3C])for(const [d,dbr]of [[0x0200,0x7E],[0,0x7E],[0x0100,0x7E],[0x0200,0],[0x0200,0x80]]){
    compare(input({list:[visible(-32,-32,0x2000),descriptor(-33,0,0x1234),visible(20,30,0xE000)],
      cursor:127,mode:8,ps,d,dbr,ax:10,ay:20,y:ps&0x10?0xEF:0xBEEF,stop:ps!==0x04||d!==0x0200||dbr!==0x7E?0x1FCD:undefined}));
  }
});
test('recorded special-actor descriptor streams match retail',t=>{
  const paths=(process.env.NATIVE_INPUTS??'').split(':').filter(Boolean);
  if(!paths.length){t.skip('set NATIVE_INPUTS to gameplay native-inputs.json paths');return;}
  let calls=0,oldCycles=0,newCycles=0,maxBefore=0,maxAfter=0;
  for(const path of paths)for(const record of JSON.parse(readFileSync(path))){
    if(record.kind!=='special')continue;
    const data=readFileSync(resolve(dirname(path),record.file)),ram=Buffer.from(seed);
    data.copy(ram,0,0,0x2000);data.copy(ram,0xE000,0x2000);
    const [a,b]=compare({...record.cpu,kind:undefined,ram});
    calls++;oldCycles+=a;newCycles+=b;maxBefore=Math.max(maxBefore,a);maxAfter=Math.max(maxAfter,b);
  }
  assert(calls>0,'recordings contained no special-actor calls');
  t.diagnostic(JSON.stringify({calls,before:oldCycles,after:newCycles,maxBefore,maxAfter}));
});
