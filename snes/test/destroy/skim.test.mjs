// Execute the scenery/barrier scanners against a cell-by-cell model. Their
// class table is live SRAM; unknown classes must stop the scan for decoding.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const seed=Buffer.alloc(0x22000),ram=Buffer.alloc(seed.length);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x33&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
});
function run({barrier=false,start=0x4020,step=1,count=64,classes=0,hit=-1,db=0x7E,dp=0,sp=0x1FFD}={}){
  const entry=symbols.get(barrier?'dst_skim_nt':'dst_skim');
  assert(entry,'destroy scan symbol missing');
  seed.copy(ram);
  // Distinct layer patterns detect a mistaken layer or nibble selection.
  for(let i=0;i<256;i++)ram[0x21400+i]=(classes+(i>=128?0x22:0))&255;
  for(let i=0;i<count;i++)ram[0x10000+((start+i*step)&65535)]=i&255;
  if(hit>=0){
    const tile=ram[0x10000+((start+hit*step)&65535)];
    const p=0x21400+(start&0x4000?128:0)+(tile>>1),shift=(tile&1)*4;
    ram[p]=(ram[p]&~(15<<shift))|(15<<shift);
  }
  const want=Buffer.from(ram),layer=start&0x4000?128:0;
  let x=start,remaining=count,found=false,y=0;
  for(let i=0;i<count;i++){
    const tile=ram[0x10000+x];y=layer+(tile>>1);
    const cls=(ram[0x21400+y]>>((tile&1)*4))&15;
    remaining--;
    found=barrier?cls===15||(cls&3)===1:!!(cls&1);
    if(found)break;
    x=(x+step)&65535;
  }
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.r[0]=db;cpu.r[1]=entry>>>16;
  cpu.br.set([count,start,step&65535,sp,entry&65535,dp]);
  ram.writeUInt16LE(0x6FFF,sp+1);
  let n=0,cycles=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
    assert(++n<count*40+100,'tile scan did not return');
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  assert.equal(cpu.br[0],remaining,'unvisited cells');assert.equal(cpu.br[1],x,'cell cursor');
  assert.equal(cpu.br[2],y,'class index');assert.equal(cpu.c,found,'candidate carry');
  assert.equal(cpu.br[3],sp+2,'balanced stack');assert.equal(cpu.br[5],dp,'D restored');
  assert.equal(cpu.r[0],db,'DB restored');assert.equal(cpu.m,false);assert.equal(cpu.x,false);
  for(const b of [ram,want])b.fill(0,sp-20,sp+3);
  assert(ram.equals(want),'tile scan changed memory outside its stack locals');
  return cycles;
}
test('tile scans preserve both layers, all packed classes and unknown cells',t=>{
  for(const barrier of [false,true])for(const start of [0x1020,0x5020])
    for(let classes=0;classes<256;classes++)for(const step of [1,-1,128,-128])
      run({barrier,start,classes,step,count:16});
  for(const barrier of [false,true])for(const start of [0x1020,0x5020])
    for(let hit=0;hit<64;hit++)run({barrier,start,hit,classes:0,count:64});
  for(const barrier of [false,true])t.diagnostic(`64-cell ${barrier?'barrier':'scenery'} run: ${run({barrier})} CPU cycles`);
});
test('tile scans preserve caller context, run length, stride and cursor wrapping',()=>{
  for(const barrier of [false,true])for(const start of [0,1,0x3FF0,0x4000,0x7FF0,0xFFF0])
    for(const step of [1,-1,128,-128])for(const count of [1,2,3,15,16,31,64,128])
      run({barrier,start,step,count});
  for(const db of [0,0x7E,0x7F,0x33])for(const dp of [0,0x1234,0x8000])
    for(const sp of [0x1FFD,0x1F0B,0x1F09,0x1F07])for(const hit of [-1,0,31])run({db,dp,sp,hit});
});
