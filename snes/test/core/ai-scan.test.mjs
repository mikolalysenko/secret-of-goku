// Compare the fused target scans (party C1:0A11 class <= 4, 0A5A <= 8;
// enemies C1:0C08 <= 2, 0C51 <= 4, 0C9A <= 8) with the retail loops over
// C1:054A/058B and C1:0358. Random and edge actor states (active flags,
// positions, heights, statuses, $0180, the asking actor among them) and
// entry flags; registers, flags and all live RAM must match.
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
let rng=0x2C0FFEE;
function rand(){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;}
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
  return ({entry,actors,asker=0xE600,p=0x20,dp=0,db=0x7E,a=0xABCD,x=0x1357}={})=>{
    seed.copy(ram);cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(p&(1<<i));
    const bank=db===0x7F?0x10000:0;
    for(const [i,s] of actors.entries())if(s){
      const slot=0xE000+i*0x200;
      ram[bank+slot]=s.active;
      ram.writeUInt16LE(s.x&65535,bank+slot+0x20);
      ram.writeUInt16LE(s.y&65535,bank+slot+0x22);
      ram[bank+slot+0x45]=s.height;
      ram[bank+slot+0x180]=s.kind??0;
      ram.writeUInt16LE(s.status,bank+slot+0x190);
    }
    cpu.r[0]=db;cpu.r[1]=0xC1;
    cpu.br.set([a,x,asker,0x1FFD,entry,dp]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==0xC1){
      assert(++n<5000,`scan did not return: ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    ram.fill(0,0x1F00,0x2000); // dead stack below the return
    return {registers:[...cpu.r,...cpu.br],flags:flags.map(f=>cpu[f]),ram:Buffer.from(ram),cycles};
  };
}
const source=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const reference=Buffer.from(source),retail=readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'));
// Restore only the scans' entries: both machines keep the port's 054A/0358.
const entries=[0x0A11,0x0A5A,0x0C08,0x0C51,0x0C9A];
for(const start of entries)retail.copy(reference,0x10000+start,0x10000+start,0x10000+start+4);
const before=runner(reference),after=runner(source);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);
  assert.deepEqual(b.registers,a.registers,'registers '+why);
  assert.deepEqual(b.flags,a.flags,'flags '+why);
  assert(a.ram.equals(b.ram),'RAM '+why);
  return [a.cycles,b.cycles];
}
const pick=list=>list[rand()%list.length];
function actor(near){
  // Mostly on-screen actors near the asker, with every rejection reason mixed in.
  const r=rand()%16;
  return {
    active:r===0?pick([0,2,128,255]):1,
    x:r===1?pick([256,257,0x8000,0xFFFF]):near.x+((rand()%400)-200),
    y:r===2?pick([0,223,224,0x8000,0xFFFF]):near.y+((rand()%400)-200),
    height:r===3?pick([0,255,224]):rand()%40,
    status:r===4?pick([0x20,0x40,0x400,0x8000,0x8460]):r===5?(rand()&0x7B9F):0,
    kind:r===6?pick([0x80,0x81,0xFF]):rand()%0x80,
  };
}
test('target scans pick the same actor as retail in random and edge states',t=>{
  let tested=0,cyclesBefore=0,cyclesAfter=0;
  for(const entry of entries)for(let i=0;i<16000;i++){
    const asker={x:rand()%256,y:rand()%224};
    const actors=Array.from({length:6},()=>actor(asker));
    // The asking actor: any slot, usually an enemy; it sits at its own spot.
    const askerSlot=0xE000+(rand()%6)*0x200;
    actors[(askerSlot-0xE000)>>9]={...actors[(askerSlot-0xE000)>>9],x:asker.x,y:asker.y};
    const [a,b]=compare({entry,actors,asker:askerSlot});
    cyclesBefore+=a;cyclesAfter+=b;tested++;
  }
  t.diagnostic(`${tested} scans: ${(cyclesBefore/tested).toFixed(0)} -> ${(cyclesAfter/tested).toFixed(0)} CPU cycles on average`);
  assert(cyclesAfter<cyclesBefore,'no cycle reduction');
});
test('target scans keep entry widths, flags (decimal falls back), D, DB, A and X',()=>{
  const near=[{active:1,x:100,y:100,height:10,status:0},{active:1,x:140,y:90,height:20,status:0},
    {active:1,x:60,y:150,height:0,status:0}];
  const base=[...near,...near];
  for(const entry of entries)for(const asker of [0xE000,0xE600,0xEA00]){
    for(let p=0;p<256;p++)if(!(p&16))for(const dp of [0,0x1201,0x8000])compare({entry,actors:base,asker,p,dp,db:p&2?0x7F:0x7E});
    for(const a of [0,0xFFFF,0x1234])for(const x of [0,0xE000,0xFFFF])compare({entry,actors:base,asker,a,x});
    // none visible, only the last of each group, far ones (class 8), $0180 rejections
    const off={...near[0],x:300};
    compare({entry,asker,actors:[off,off,off,off,off,off]});
    compare({entry,asker,actors:[off,off,near[2],off,off,near[2]]});
    compare({entry,asker,actors:[{...near[0],x:20},{...near[1],x:250},{...near[2],y:220},{...near[0],kind:0x80},{...near[1],kind:0xFF},near[2]]});
  }
});
