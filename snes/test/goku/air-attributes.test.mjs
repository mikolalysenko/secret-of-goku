// Flight's palette/priority is independent of native water/ledge rows.
// Compare the full OAM emitter with its former per-row scan, including
// every animation-cell mask, miniature bodies, clipping and full buffers.
// The reference is the per-entry emitter (-DGOKU_EMIT_SLOW=1, whose full
// cells ask goku_part_attr for each row) with goku_part_attr's airborne
// shortcut jumped over: the default build's full cells take both rows from
// goku_row_attrs, which has the same shortcut.
//   GOKU_AIR_REF_ROM=<rom built with -DGOKU_EMIT_SLOW=1> (else built here)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
let refPath=process.env.GOKU_AIR_REF_ROM&&resolve(root,process.env.GOKU_AIR_REF_ROM);
if(!refPath){
  refPath=resolve(root,'.local/snes-test/roms/goku-air-emit-slow.sfc');   // (not emit-fast's: node --test runs files at once)
  mkdirSync(resolve(refPath,'..'),{recursive:true});
  const b=spawnSync(process.execPath,[resolve(root,'snes/build.mjs'),'--quiet','--strict',`--out=${refPath}`,'-DGOKU_EMIT_SLOW=1'],{cwd:root,stdio:'inherit'});
  assert.equal(b.status,0,'reference build failed');
}
assert(existsSync(refPath),refPath);
const symbolsOf=p=>new Map([...readFileSync(p.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const source=readFileSync(path),symbols=symbolsOf(path);
const reference=Buffer.from(readFileSync(refPath)),refSymbols=symbolsOf(refPath);
const fallback=refSymbols.get('goku_part_attr_native');assert(fallback);
// The fallback starts with PLA for the new guard; jump past that too.
reference.set([0x4C,(fallback+1)&255,((fallback+1)>>8)&255],hiromToPc(refSymbols.get('goku_part_attr'),reference.length));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
function machine(rom,symbols){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write ${a.toString(16)}`);ram[at(a)]=v;}});
  return (input,entry='goku_emit',a=0)=>{
    ram.set(input);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const pc=symbols.get(entry);cpu.r[0]=0x7E;cpu.r[1]=pc>>>16;
    cpu.br.set([a,0x1234,0x5678,0x1FFD,pc&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<10000,'emitter did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],0);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x,'M16/X16 return');
    const result=Buffer.from(ram);
    result.fill(0,0x1F00,0x2000);
    result.fill(0,0xD7D0,0xD7E0);            // e_* (pal_work) emit scratch
    result.fill(0,0xD7F0,0xD7F8);            // t_b/t_c/t_d row-scan scratch
    return {ram:result,value:cpu.br[0],cycles};
  };
}
const old=machine(reference,refSymbols),next=machine(source,symbols);
function setup({air=true,cell=0,small=0,x=128,y=112,lift=0,used=0,count=8}={}){
  const ram=Buffer.alloc(0x20000);ram[0xD741]=air?2:0;
  ram.writeUInt16LE(cell,0xD76A);ram[0xD769]=small;
  ram.writeUInt16LE(lift&65535,0xD76C);
  ram.writeUInt16LE(x&65535,4);ram.writeUInt16LE(y&65535,6);
  ram.writeUInt16LE(used,0x7C);ram[0x59]=1;ram[0x5A]=used>>4;
  ram[0xE083]=count;
  for(let n=0;n<15;n++){
    ram[0xE091+n*4]=(-40+(n%5)*16)&255;
    // Body rows may choose palette 1/5, every priority and either flip.
    ram[0xE093+n*4]=2|((n&1)?8:0)|((n%4)<<4)|((n%4)<<6);
  }
  ram.fill(0xA5,0x800,0xA20);return ram;
}
function compare(input){
  const ram=setup(input),a=old(ram),b=next(ram);
  if(!b.ram.equals(a.ram)){const i=b.ram.findIndex((v,k)=>v!==a.ram[k]);assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]} ${JSON.stringify(input)}`);}
  return [a.cycles,b.cycles];
}
test('airborne attributes match native water and ledge rows for every cell',t=>{
  const count=JSON.parse(readFileSync(resolve(root,'dist/snes/gen/goku/manifest.json'))).cells.length;
  for(let cell=0;cell<count;cell++)for(const small of [0,2])for(const air of [false,true])
    compare({cell,small,air,lift:cell%32});
  const cycles=compare({air:true,lift:12});
  assert(cycles[1]<cycles[0]*.9);t.diagnostic(`${count} cells and miniatures; emitter ${cycles.join(' -> ')} CPU cycles`);
});
test('clipped, empty and full OAM cases preserve native writes',()=>{
  for(const air of [false,true])for(const x of [-17,-16,-1,0,255,256,271,272])
    for(const y of [-17,-16,0,31,223,224,256])for(const used of [0,0x1FC,0x200])for(const count of [0,1,8,15])
      compare({air,x,y,used,count,cell:32});
});
