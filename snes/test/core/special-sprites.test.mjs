// Mounted actors use C2's separate multi-piece sprite emitter. Compare its
// complete live state with retail over visible/clipped pieces and CPU modes.
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
let rng=0xC2206D;
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
    const {alternate=false,index=0,x=0,y=0,dx=0,dy=0,attr=0,count=20,p=0,initialY=0x1234}=input;
    ram.writeUInt16LE(0x1000,0x0279);
    ram.writeUInt16LE((dx&255)|((dy&255)<<8),0x1000);
    ram.writeUInt16LE(attr,0x1002);
    for(const [a,v] of [[0x0295,index],[0x028F,x],[0x0291,y],[0x0285,count]])
      ram.writeUInt16LE(v&0xFFFF,a);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    for(const [i,f] of flagNames.entries())if(f!=='m'&&f!=='x')cpu[f]=!!(p&(1<<i));
    const entry=alternate?0xC22081:0xC2206D;
    cpu.r.set([0x7E,entry>>>16]);cpu.br.set([0xABCD,0x2345,initialY,0x1EFD,entry&0xFFFF,0x0200]);
    ram.writeUInt16LE(0x6FFF,0x1EFE);
    let cycles=0;
    for(let n=0;cpu.r[1]!==0xC2||cpu.br[4]!==0x7000;n++){
      assert(n<1000,'special piece did not return');cpu.cyclesLeft=0;
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
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  if(!a.ram.equals(b.ram)){
    const i=a.ram.findIndex((v,i)=>v!==b.ram[i]);assert.fail(`RAM $${i.toString(16)} ${a.ram[i]} -> ${b.ram[i]} ${why}`);
  }
  return [a,b];
}

test('mounted sprite pieces retain every output and cost fewer CPU cycles',t=>{
  let visible=0,oldVisible=0,newVisible=0;
  for(let i=0;i<4000;i++){
    const edge=i<512;
    const input={alternate:!!(i&1),index:i&127,p:rand()&~0x30,
      x:edge?[-33,-32,-1,0,255,287,288,65535][i&7]:rand()&65535,
      y:edge?[-33,-32,-1,0,223,224,255,65535][(i>>3)&7]:rand()&65535,
      dx:[0,1,127,128,255][i%5],dy:[0,1,127,128,255][(i/5|0)%5],
      attr:rand()&65535,count:1+rand()%30,initialY:rand()&65535};
    const [a,b]=compare(input);
    if(!a.flags[0]){visible++;oldVisible+=a.cycles;newVisible+=b.cycles;}
  }
  t.diagnostic(`4000 pieces; ${visible} visible: ${oldVisible} -> ${newVisible} CPU cycles`);
  assert(visible>0,'expected visible pieces');
  assert(newVisible<oldVisible*.9,`visible cycles ${oldVisible} -> ${newVisible}`);
});
