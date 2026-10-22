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
// The partial upload (core_oam_upload) reads PPU slot 0 back first; the
// fixture's PPU reads 0, so a recorded slot 0 of zeros counts as unchanged.
// Its state is !RAM_CORE_OAM (7E:D6F2, core.asm), valid with the magic word.
const partial=symbols.has('core_oam_foreign_ldx'),markAt=0xD6F2,hiddenAt=0xD6F4,printAt=0xD6F6,
  keepAt=0xD6FA,magicAt=0xD6FC;
const whole=[[0x2102,0],[0x2103,0],[0x4372,0],[0x4373,8],
  [0x4370,0],[0x4371,4],[0x4374,0],[0x4375,0x20],[0x4376,2],[0x420B,0x80]];
function upload(len){
  // the low table [0, len) when len > 0, then the high table, OAMADD back to 0
  return [[0x4370,0],[0x4371,4],[0x4372,0],[0x4373,8],[0x2102,0],[0x2103,0],[0x4374,0],
    ...(len?[[0x4375,len&255],[0x4376,len>>8],[0x420B,0x80]]:[]),
    [0x2102,0],[0x2103,1],[0x4372,0],[0x4373,0x0A],[0x4375,0x20],[0x4376,0],[0x420B,0x80],
    [0x2102,0],[0x2103,0]];
}
test('field OAM DMA preserves native CPU state and sets priority after transfer',{skip:!rotated},()=>{
  // case: [fresh commit mark, PPU hidden-from, recorded slot 0 matches, magic word present]
  // -> bytes of the low table (no magic: words from an older build, so the whole table)
  const cases=partial?[[null,null,true,512],[0x40,0x8080,true,0x80],[0xC0,0x8040,true,0xC0],
    [0,0x8000,true,0],[0x40,0x0080,true,512],[0x40,0x8080,false,512],[0x200,0x8040,true,512],
    [0x40,0x8080,true,512,false]]:[[null,null,true,512]];
  for(const [mark,hidden,same,len,magic=true] of cases)
  for(let f=0;f<256;f+=f<4?1:37)for(const b of [0,0xAB])for(const flags of [0,1,2,3,4,15]){
    seed();ram[first]=f;
    if(partial){
      ram.writeUInt16LE(mark===null?0x0200:mark|0x8000,markAt);
      ram.writeUInt16LE(hidden===null?0:hidden,hiddenAt);
      ram.writeUInt32LE(same?0:0x01020304,printAt);
      ram.writeUInt16LE(0x0123,keepAt);
      ram.writeUInt16LE(magic?0x4F41:0x4F40,magicAt);
    }
    const state={nmi:true,b,c:!!(flags&1),v:!!(flags&2),d:!!(flags&4),i:!!(flags&8)};
    call(null,0,state);
    const rotation=f?[[0x2102,(f<<1)&255],[0x2103,f&0x80]]:[];
    assert.deepEqual(writes,[...(partial?[[0x2102,0],[0x2103,0]]:[]),...(len===512?whole:upload(len)),...rotation],
      JSON.stringify({mark,hidden,same,f}));
    assert.deepEqual([...cpu.br,...cpu.r],[(b<<8)|0x80,0x220,0x5678,0x1FFD,0xC13E,0,0,symbols.has('core_oam_fast_tail')?0x80:0]);
    assert.deepEqual([cpu.c,cpu.v,cpu.d,cpu.i,cpu.m,cpu.x,cpu.n,cpu.z],
      [state.c,state.v,state.d,state.i,true,false,true,false]);
    if(partial){
      // the mark consumed; the PPU now hidden from this upload's mark on
      // (without the magic word no mark counts and the keep is dropped)
      const m=mark===null||!magic?0x200:mark;
      assert.equal(ram.readUInt16LE(markAt),m,'mark consumed');
      assert.equal(ram.readUInt16LE(hiddenAt),m|0x8000,'hidden from the mark');
      if(len)assert.equal(ram.readUInt32LE(printAt),ram.readUInt32LE(0x800),'slot 0 recorded');
      assert.equal(ram.readUInt16LE(keepAt),magic?0x0123:0,'keep');
      assert.equal(ram.readUInt16LE(magicAt),0x4F41,'magic word');
    }
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
