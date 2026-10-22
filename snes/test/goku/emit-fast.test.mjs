// goku_emit's four-entry fast path and one-pass row attributes against the
// per-entry emitter and two part scans (-DGOKU_EMIT_SLOW=1). Both machine
// codes run on the same RAM: every OAM byte, the high table, $7C/$59/$5A
// and all other live RAM must match (goku_emit's private scratch aside),
// across cells, part layouts, clipping, the OAM limit and odd bit pairs.
//   GOKU_EMIT_REF_ROM=<rom built with -DGOKU_EMIT_SLOW=1> (else built here)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
let refPath=process.env.GOKU_EMIT_REF_ROM&&resolve(root,process.env.GOKU_EMIT_REF_ROM);
if(!refPath){
  refPath=resolve(root,'.local/snes-test/roms/goku-emit-slow.sfc');
  mkdirSync(resolve(refPath,'..'),{recursive:true});
  const b=spawnSync(process.execPath,[resolve(root,'snes/build.mjs'),'--quiet','--strict',`--out=${refPath}`,'-DGOKU_EMIT_SLOW=1'],{cwd:root,stdio:'inherit'});
  assert.equal(b.status,0,'reference build failed');
}
assert(existsSync(refPath),refPath);
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
function machine(romPath){
  const rom=readFileSync(romPath);
  const symbols=new Map([...readFileSync(romPath.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write ${a.toString(16)}`);ram[at(a)]=v;}});
  const pc=symbols.get('goku_emit');assert(pc);
  return input=>{
    ram.set(input);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    cpu.r[0]=0x7E;cpu.r[1]=pc>>>16;
    cpu.br.set([0x1111,0x2222,0x3333,0x1FFD,pc&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<20000,'emitter did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],0);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x,'M16/X16 return');
    const result=Buffer.from(ram);
    result.fill(0,0x1F00,0x2000);            // dead callee stack
    result.fill(0,0xD7D0,0xD7E0);            // e_* (pal_work) emit scratch
    result.fill(0,0xD7F0,0xD7F8);            // t_b/t_c/t_d part-scan scratch
    return {ram:result,cycles};
  };
}
const old=machine(refPath),next=machine(path);
let rng=0x60C0;
const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)%n;};
function setup({air=false,cell=0,small=0,x=128,y=112,lift=0,shadow=6,used=0,b59=1,count=3,parts=null,fill=0xA5}={}){
  const ram=Buffer.alloc(0x20000);
  for(let i=0;i<ram.length;i++)ram[i]=rand(256);
  ram[0xD741]=(air?2:0)|(rand(256)&~2);     // goku_ctl: only the airborne bit matters here
  ram.writeUInt16LE(cell,0xD76A);ram[0xD769]=small|(rand(256)&~2);
  ram.writeUInt16LE(lift&65535,0xD76C);
  ram.writeUInt16LE(x&65535,4);ram.writeUInt16LE(y&65535,6);
  ram.writeUInt16LE(used,0x7C);ram[0x59]=b59;ram[0x5A]=used>>4;
  ram[0xE074]=shadow;ram[0xE083]=count|(rand(16)<<4);
  for(let n=0;n<15;n++){
    const p=parts?.[n];
    ram[0xE091+n*4]=(p?p[0]:-48+rand(96))&255;
    ram[0xE093+n*4]=p?p[1]:rand(256);
  }
  ram.fill(fill,0x800,0xA20);
  return ram;
}
function compare(input){
  const ram=setup(input),a=old(ram),b=next(ram);
  if(!b.ram.equals(a.ram)){
    for(let i=0;i<a.ram.length;i++)if(a.ram[i]!==b.ram[i])
      assert.fail(`${JSON.stringify(input)}: $${i.toString(16)} ${a.ram[i]} -> ${b.ram[i]}`);
  }
  return [a.cycles,b.cycles];
}
const cells=JSON.parse(readFileSync(resolve(root,'dist/snes/gen/goku/manifest.json'))).cells.length;
test('every cell, part count and lift matches the per-entry emitter',t=>{
  for(let cell=0;cell<cells;cell++)for(const small of [0,2])for(const air of [false,true])
    for(const count of [0,1,3,15])compare({cell,small,air,count,lift:(cell*7)%40-8});
  const [a,b]=compare({cell:0,count:3,parts:[[-30,0x22],[-14,0x02],[2,0x32]]});
  t.diagnostic(`${cells} cells; ground three-part body ${a} -> ${b} CPU cycles`);
  const [c,d]=compare({cell:0,air:true});
  t.diagnostic(`airborne body ${c} -> ${d} CPU cycles`);
  assert(b<a*0.7&&d<c*0.7,'the fast path is not faster');
});
test('clipping, the OAM limit and every high-table bit pair', ()=>{
  for(const x of [-17,-16,-1,0,15,16,17,128,239,240,255,256,271,272])
    for(const y of [-60,-17,-16,-15,0,31,207,208,223,224,256])
      for(const used of [0,0x1EC,0x1F0,0x1F4,0x1FC,0x200])
        compare({x,y,used,cell:x&63,lift:0,shadow:y&15});
  for(let b59=0;b59<256;b59++)compare({b59,used:0x40});
});
test('random part layouts, lifts and anchors', ()=>{
  for(let i=0;i<20000;i++){
    const count=rand(16);
    compare({cell:rand(cells),small:rand(5)?0:2,air:!rand(4),x:rand(320)-40,y:rand(300)-40,
      lift:rand(4)?rand(48)-8:rand(65536),shadow:rand(256),used:rand(0x81)*4,b59:[1,4,16,64][rand(4)],count});
  }
});
