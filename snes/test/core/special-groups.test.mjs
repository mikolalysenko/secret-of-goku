// Compare complete C2 multipart actor assemblies with the retail routine.
// The optimized binary-mode loop must retain clipping, OAM high bits, live
// scratch, register results and the original decimal-mode instruction path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flagNames=['c','z','i','d','x','m','v','n'];
const seed=Buffer.alloc(0x20000);
let rng=0xC21FA9;
function rand(){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;}
for(let i=0;i<seed.length;i++)seed[i]=rand()&255;

function runner(path){
  const rom=readFileSync(path),ram=Buffer.alloc(seed.length);
  const at=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write $${a.toString(16)}`);ram[p]=v;}});
  return input=>{
    seed.copy(ram);
    const {count,index,parts,height,flags,p,initialY}=input;
    ram.writeUInt16LE(height,0x0066);ram.writeUInt16LE(flags,0x0070);
    ram.writeUInt16LE(0x1000,0x0279);ram.writeUInt16LE(index,0x027F);
    ram.writeUInt16LE(count,0x0285);ram.writeUInt16LE(input.x&65535,0x028F);
    ram.writeUInt16LE(input.y&65535,0x0291);ram.writeUInt16LE(index,0x0295);
    ram.writeUInt16LE(0,0x0266);
    for(let i=0;i<count;i++){
      const part=parts[i];
      ram.writeUInt16LE((part.dx&255)|((part.dy&255)<<8),0x1000+i*4);
      ram.writeUInt16LE(part.attr,0x1002+i*4);
    }
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    for(const [i,f] of flagNames.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    cpu.r.set([0x7E,0xC2]);cpu.br.set([0xABCD,0,initialY,0x1EFD,0x1FA9,0x0200]);
    ram.writeUInt16LE(0x6FFF,0x1EFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x7000;n++){
      assert(n<10000,`special group did not return at $${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)} ${JSON.stringify(input)}`);cpu.cyclesLeft=0;
      try{cpu.cycle();}catch(e){throw Error(`${e.message}; at $${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);}
      cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1EF0,0x1F00);
    return {ram:Buffer.from(ram),registers:[...cpu.r,...cpu.br],flags:flagNames.map(f=>cpu[f]),cycles};
  };
}
const before=runner(resolve(root,'rom/secret-of-mana-us.sfc'));
const after=runner(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  if(!a.ram.equals(b.ram)){
    const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);assert.fail(`RAM $${i.toString(16)} ${a.ram[i]} -> ${b.ram[i]} ${why}`);
  }
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  return [a,b];
}

test('complete multipart groups retain every output and cost fewer CPU cycles',t=>{
  let oldTotal=0,newTotal=0,accepted=0;
  for(let i=0;i<4000;i++){
    const count=1+i%8,edge=i<1024;
    const parts=Array.from({length:count},(_,j)=>({
      dx:[0,1,127,128,255][(i+j)%5],dy:[0,1,127,128,255][(i+j*2)%5],attr:rand()&65535}));
    const input={count,index:i&127,parts,height:rand()&65535,flags:rand()&65535,
      p:rand()&~0x30,initialY:rand()&65535,
      x:edge?[-33,-32,-1,0,223,255,256,65535][i&7]:rand()&65535,
      y:edge?[-33,-32,-1,0,191,223,224,65535][(i>>3)&7]:rand()&65535};
    const [a,b]=compare(input);oldTotal+=a.cycles;newTotal+=b.cycles;
    accepted+=ramAccepted(a.ram);
  }
  t.diagnostic(`4000 groups; ${accepted} emitted pieces: ${oldTotal} -> ${newTotal} CPU cycles`);
  assert(accepted>0,'expected visible pieces');
  assert(newTotal<oldTotal*.95,`group cycles ${oldTotal} -> ${newTotal}`);
});
function ramAccepted(ram){return ram.readUInt16LE(0x0266);}

test('visible multipart groups preserve the loop and save per-piece work',t=>{
  let oldTotal=0,newTotal=0,accepted=0;
  for(let i=0;i<512;i++){
    const count=1+i%8;
    const parts=Array.from({length:count},(_,j)=>({
      dx:(i+j)%5-2,dy:(i+j*3)%5-2,attr:rand()&65535}));
    const input={count,index:(i*7)&127,parts,height:i&63,flags:(i&1)*8,
      p:i&2?8:0,initialY:rand()&65535,x:(i*13%257)-32,y:(i*7%193)-32};
    const [a,b]=compare(input);oldTotal+=a.cycles;newTotal+=b.cycles;
    accepted+=ramAccepted(a.ram);
  }
  t.diagnostic(`512 visible groups; ${accepted} emitted pieces: ${oldTotal} -> ${newTotal} CPU cycles`);
  assert(accepted>500,'expected many visible pieces');
  assert(newTotal<oldTotal*.9,`visible group cycles ${oldTotal} -> ${newTotal}`);
});
