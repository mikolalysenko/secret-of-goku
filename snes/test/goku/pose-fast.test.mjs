// goku_pose against the former machine code (-DGOKU_POSE_SLOW=1) on the same
// RAM: every pose output and state word (p_*, st_*), the rest of WRAM and the
// return widths must match, from random native actor states, pose requests,
// map/frame/position histories, control-gate bytes and pads. Excluded: the
// pose/emit scratch words (p_tmp, t_b, t_c, t_d, the divider's, pal_work)
// and dead callee stack. The goku Mesen suite (actions, api) replays the
// same code against engine/goku-animation.js.
//   GOKU_POSE_REF_ROM=<rom built with -DGOKU_POSE_SLOW=1> (else built here)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
let refPath=process.env.GOKU_POSE_REF_ROM&&resolve(root,process.env.GOKU_POSE_REF_ROM);
if(!refPath){
  refPath=resolve(root,'.local/snes-test/roms/goku-pose-slow.sfc');
  mkdirSync(resolve(refPath,'..'),{recursive:true});
  const b=spawnSync(process.execPath,[resolve(root,'snes/build.mjs'),'--quiet','--strict',`--out=${refPath}`,'-DGOKU_POSE_SLOW=1'],{cwd:root,stdio:'inherit'});
  assert.equal(b.status,0,'reference build failed');
}
assert(existsSync(refPath),refPath);
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
function machine(romPath){
  const rom=readFileSync(romPath);
  const symbols=new Map([...readFileSync(romPath.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x8000);let pad=0;
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const sramAt=a=>{const b=(a>>>16)&0x7F,o=a&0xFFFF;return b>=0x30&&b<0x34&&o>=0x6000&&o<0x8000?((b-0x30)<<13)|(o-0x6000):-1;};
  const cpu=new context.Cpu({cpuRead:a=>{
      const p=at(a);if(p>=0)return ram[p];
      const s=sramAt(a);if(s>=0)return sram[s];
      const lo=a&0xFFFF,b=(a>>>16)&0x7F;
      if(b<0x40&&lo===0x4218)return pad&255;if(b<0x40&&lo===0x4219)return pad>>8;
      assert(!(b<0x40&&lo<0x8000),`unexpected read $${a.toString(16)}`);
      return rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const p=at(a);assert(p>=0,`unexpected write ${a.toString(16)}`);ram[p]=v;}});
  const pc=symbols.get('goku_pose');assert(pc);
  return input=>{
    ram.set(input.ram);sram.set(input.sram);pad=input.pad;cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(input.ps&(1<<i));
    cpu.r[0]=0x7E;cpu.r[1]=pc>>>16;
    cpu.br.set([input.a,input.x,input.y,0x1FFD,pc&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<50000,'pose did not return');cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.r[0],0x7E);
    const result=Buffer.from(ram);
    result.fill(0,0x1F00,0x2000);                 // dead callee stack
    result.fill(0,0xD77A,0xD780);                 // p_tmp (t_age, t_row, t_clip, t_a)
    result.fill(0,0xD7F0,0xD7F4);                 // t_b, t_c
    result.fill(0,0xD7F6,0xD7FC);                 // t_d, div_d, div_r
    result.fill(0,0xD7D0,0xD7F0);                 // pal_work
    return {ram:result,m:cpu.m,x:cpu.x,d:cpu.d,i:cpu.i,cycles};
  };
}
const old=machine(refPath),next=machine(path);
let rng=0x9051;
const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)%n;};
const pick=a=>a[rand(a.length)];
const rom=readFileSync(path),sym=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
// Real sequence pointers of the native actions, so validation passes too.
const count=Number(readFileSync(resolve(root,'dist/snes/gen/goku/data.asm'),'utf8').match(/!GOKU_ACTION_COUNT = \$([0-9A-F]+)/i)?.[1]?.replace(/^/,'0x')??0);
const ptrs=[];
for(let k=0;k<count;k++){
  const off=rom.readUInt16LE(hiromToPc(sym.get('goku_action_ptr')+k*2,rom.length));
  const base=hiromToPc(sym.get('goku_action_data'),rom.length)+off;
  ptrs.push([k,[5,7,9].map(o=>rom.readUInt16LE(base+o))]);
}
function state(kind){
  const ram=Buffer.alloc(0x20000);for(let i=0;i<ram.length;i++)ram[i]=rand(256);
  const sram=Buffer.alloc(0x8000);for(let i=0;i<sram.length;i++)sram[i]=rand(256);
  const w16=(o,v)=>ram.writeUInt16LE(v&65535,o);
  // pose requests: mostly none, sometimes each kind
  w16(0xD74E,rand(8)?0:rand(470));                          // goku_cell_req
  ram[0xD742]=rand(3)?0:pick([0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,rand(256)]);
  ram[0xD748]=rand(3)?0:pick([0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,rand(256)]);
  ram[0xD740]=rand(2);ram[0xD741]=rand(256)&(rand(2)?0x1F:0x0A);
  w16(0xD74C,rand(3)?0:rand(40));                           // goku_lift
  w16(0xD744,rand(4)?rand(40):rand(65536));w16(0xD74A,rand(80));
  // history: the same or the next frame, the same or another map, nearby
  const frame=rand(65536);w16(0xD700,frame);w16(0xD750,kind&1?frame:(frame-1)&65535);
  const map=rand(512);w16(0xDC,map);w16(0xD752,kind&2?map:rand(512));
  const x=rand(4096),y=rand(4096);w16(0xE002,x);w16(0xE004,y);
  w16(0xD754,(x+rand(31)-15)&65535);w16(0xD756,(y+rand(31)-15)&65535);
  w16(0xD762,rand(4)?rand(8):rand(65536));                    // st_stat
  // native animation, action and the control gate
  ram[0xE010]=pick([0,1,2,0x80,0x81,0x82,rand(256)]);
  ram[0xE011]=pick([0,1,2,0x88,0x8C,0x8D,0x8F,0xA0,0xA1,0xA2,0xAD,0xAE,0xAF,rand(256)]);
  if(ptrs.length&&rand(2)){const [k,p]=pick(ptrs);ram[0xE031]=k|(rand(2)<<7);w16(0xE018,pick(p));}
  ram[0xE045]=rand(3)?0:rand(256);ram[0xE180]=rand(8)?rand(256):0xF6;
  ram[0xE190]=rand(3)?0:rand(256);ram[0xE191]=rand(3)?0:rand(256);
  ram[0xE4]=pick([1,1,1,0,2]);ram[0xE5]=pick([1,1,1,0,2]);
  ram[0xEC]=rand(2)?0:rand(256);ram[0xED]=rand(2)?0:rand(256);
  ram[0xE000]|=rand(4)?1:0;ram[0xE02C]|=rand(4)?1:0;ram[0xD0]=rand(3)?0:rand(256);
  return {ram,sram,pad:rand(65536),a:rand(65536),x:rand(65536),y:rand(65536),ps:rand(256)&~0x08};
}
function compare(input){
  const a=old(input),b=next(input);
  assert.deepEqual([b.m,b.x,b.d,b.i],[a.m,a.x,a.d,a.i],'P');
  if(!b.ram.equals(a.ram)){
    for(let i=0;i<a.ram.length;i++)if(a.ram[i]!==b.ram[i])assert.fail(`$${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}`);
  }
  return [a.cycles,b.cycles];
}
test('goku_pose keeps every output and state word', t=>{
  assert(ptrs.length>40,'native action table');
  let sum=[0,0];
  for(let i=0;i<30000;i++){const [a,b]=compare(state(i&3));sum[0]+=a;sum[1]+=b;}
  t.diagnostic(`30,000 states: mean ${Math.round(sum[0]/30000)} -> ${Math.round(sum[1]/30000)} CPU cycles`);
});
