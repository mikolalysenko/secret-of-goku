// Validate sprite insertion against a slot-level model, including overlap,
// partial high bytes, padding and the last available OBJ slot.
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
const entry=symbols.get('core_oam_commit_field');
const rotation=symbols.has('core_oam_commit_rotated');
assert(entry,'core_oam_commit_field symbol missing');
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const seed=Buffer.alloc(0x22000),ram=Buffer.alloc(seed.length);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x31&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
});
const cursorAt=0x6E90,frontN=0x6E94,front=0x6EC0,hi=0x6F00,watermark=0x21494,first=0x21497;
function run(n,cursor,pattern=0,flight=0){
  seed.copy(ram);ram.writeUInt16LE(n,frontN);ram.writeUInt16LE(cursor,cursorAt);
  ram[0xD900]=flight;
  for(let i=0;i<n;i++)ram.writeUInt16LE((pattern>>((i&3)*2))&3,hi+i*2);
  const want=Buffer.from(ram),group=(n+3)&~3,shift=group*4;
  const rotated=rotation&&!(flight&&symbols.has('core_oam_commit_ground'));
  if(rotation)want[first]=0;
  if(rotated){
    want[first]=n?0x80|(cursor/4):0;
    for(let i=0;i<n;i++){
      const slot=cursor/4+i,bit=(slot&3)*2,p=0xA00+(slot>>2);
      ram.copy(want,0x800+slot*4,front+i*4,front+(i+1)*4);
      want[p]=(want[p]&~(3<<bit))|((ram.readUInt16LE(hi+i*2)&3)<<bit);
    }
    for(let i=n;i<group;i++){
      const slot=cursor/4+i;
      want.writeUInt16LE(0xE0FF,0x800+slot*4);
      want[0xA00+(slot>>2)]&=~(3<<((slot&3)*2));
    }
  }else if(n){
    ram.copy(want,0x800+shift,0x800,0x800+cursor);
    if(cursor)ram.copy(want,0xA00+group/4,0xA00,0xA00+Math.ceil(cursor/16));
    want.fill(0,0xA00,0xA00+group/4);
    for(let i=0;i<n;i++){
      ram.copy(want,0x800+i*4,front+i*4,front+(i+1)*4);
      want[0xA00+(i>>2)]|=(ram.readUInt16LE(hi+i*2)&3)<<((i&3)*2);
    }
    for(let i=n;i<group;i++)want.writeUInt16LE(0xE0FF,0x800+i*4);
  }
  want.writeUInt16LE(0,frontN);want.writeUInt16LE(cursor+shift,cursorAt);
  want.writeUInt16LE(cursor+shift,0x120);want.writeUInt16LE(cursor+shift,watermark);
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
  cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,entry&65535,0]);
  ram.writeUInt16LE(0x6FFF,0x1FFE);
  let instructions=0,cycles=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
    assert(++instructions<10000,`commit did not return ${n}/${cursor}/${pattern}`);
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  assert.equal(cpu.br[0],cursor+shift,'cursor return');
  assert.equal(cpu.br[3],0x1FFF,'balanced stack');
  assert.equal(cpu.r[0],0x7E,'data bank');
  assert.equal(cpu.br[5],0,'direct page');
  assert.equal(cpu.m,false);assert.equal(cpu.x,false);
  for(const b of [ram,want]){b.fill(0,0x1F00,0x2000);b.fill(0,0x6E9A,0x6EA0);}
  if(!ram.equals(want)){
    const i=ram.findIndex((v,i)=>v!==want[i]);
    assert.fail(`commit ${n}/${cursor}/${pattern}: $${i.toString(16)} expected ${want[i]}, got ${ram[i]}`);
  }
  return cycles;
}
test('foreground OAM insertion preserves every valid capacity and packed high byte',t=>{
  for(let n=0;n<=16;n++)for(let cursor=0;cursor+((n+3)&~3)*4<=512;cursor+=4)
    for(const pattern of [0,0x55,0xAA,0xFF])for(const flight of [0,1])run(n,cursor,pattern,flight);
  for(let pattern=0;pattern<256;pattern++)for(let n=1;n<=16;n++)run(n,256,pattern);
  for(const n of [1,6,16])t.diagnostic(`${n} front sprites + 192 native bytes: ${run(n,192,0xE4)} CPU cycles`);
  if(rotation)assert(run(16,192,0xE4)<1200,'rotated foreground commit CPU budget');
  else if(symbols.has('core_oam_shift_low'))assert(run(16,192,0xE4)<2200,'foreground commit CPU budget');
});
