// Run the assembled OAM DMA hook and mode handoff. Compare CPU state and
// ordered hardware writes, plus ownership and priority across mode changes.
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
const rotated=symbols.has('core_oam_commit_rotated');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const ram=Buffer.alloc(0x22000),writes=[];
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x31&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const io=a=>((a>>>16)&0x7F)<0x40&&(a&65535)>=0x2000&&(a&65535)<0x6000;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:io(a)?0:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{
    if(at(a)>=0)ram[at(a)]=v;
    else {assert(io(a),`unexpected write $${a.toString(16)}`);writes.push([a&65535,v]);}
  },
});
const first=0x21497;
function seed(){
  for(let i=0;i<ram.length;i++)ram[i]=(i*71+(i>>8)*17)&255;
  ram.writeUInt16LE(0x5343,0x21498); // valid volatile core state
  writes.length=0;
}
function call(label,a=0,{nmi=false,clear=false,b=0,c=false,v=false,d=false,i=true}={}){
  const entry=nmi?0xC11E:symbols.get(label);
  assert(entry,`missing ${label}`);
  cpu.reset();cpu.e=false;cpu.m=nmi;cpu.x=false;cpu.d=d;cpu.c=c;cpu.v=v;cpu.i=i;
  cpu.r[0]=nmi?0:0x7E;cpu.r[1]=entry>>>16;
  cpu.br.set([nmi?(b<<8)|0x41:a,0x1234,0x5678,0x1FFD,entry&65535,0]);
  ram.writeUInt16LE(0x6FFF,0x1FFE);
  const end=nmi?0xC13E:clear?0xE35A:0x7000;
  const bank=clear||(nmi&&symbols.has('core_oam_fast_tail'))?0x80:entry>>>16;
  let instructions=0;
  while(cpu.br[4]!==end||cpu.r[1]!==bank){
    assert(++instructions<20000,`${label} did not return`);cpu.cyclesLeft=0;cpu.cycle();
  }
  assert.equal(cpu.br[3],nmi||clear?0x1FFD:0x1FFF,'balanced stack');
}
test('field OAM DMA preserves native CPU state and sets priority after transfer',{skip:!rotated},()=>{
  for(let f=0;f<256;f++)for(const b of [0,0xAB])for(const flags of [0,1,2,3,4,15]){
    seed();ram[first]=f;
    const state={nmi:true,b,c:!!(flags&1),v:!!(flags&2),d:!!(flags&4),i:!!(flags&8)};
    call(null,0,state);
    assert.deepEqual(writes,[[0x2102,0],[0x2103,0],[0x4372,0],[0x4373,8],
      [0x4370,0],[0x4371,4],[0x4374,0],[0x4375,0x20],[0x4376,2],
      [0x420B,0x80],...(f?[[0x2102,(f<<1)&255],[0x2103,f&0x80]]:[])]);
    assert.deepEqual([...cpu.br,...cpu.r],[(b<<8)|0x80,0x220,0x5678,0x1FFD,0xC13E,0,0,symbols.has('core_oam_fast_tail')?0x80:0]);
    assert.deepEqual([cpu.c,cpu.v,cpu.d,cpu.i,cpu.m,cpu.x,cpu.n,cpu.z],
      [state.c,state.v,state.d,state.i,true,false,true,false]);
  }
});
test('native OBJ clears retire field priority before ring/map rendering',{skip:!rotated},()=>{
  seed();ram[first]=0xBC;
  const before=Buffer.from(ram);
  before.writeUInt16LE(0x6FFF,0x1FFE);
  call('core_oam_native_clear',0xBCDE,{clear:true});
  before[first]=0;
  // Only the private priority byte changes before the original clear body.
  assert.deepEqual(ram,before);
  assert.equal(cpu.br[1],0);assert.equal(cpu.m,false);assert.equal(cpu.x,false);
  assert.equal(writes.length,0);
});
