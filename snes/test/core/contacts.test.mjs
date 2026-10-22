// A party member's contact pass over the enemy slots (C1:CE20-CE58, $ED bit
// 7 set; core_native_contacts) against the same build without it
// (-DCORE_NATIVE_CONTACTS_SLOW=1): registers, flags (program bank folded
// onto its FastROM mirror), every byte of WRAM and low RAM (dead callee
// stack aside) and any write outside them, from random actor tables with
// pairs out of range, in range, within 24 px, wrapped across the map, with
// attack boxes, inactive or other-layer slots, other members and decimal
// mode.
//   SNES_ROM (default dist/snes/secret-of-goku.sfc)
//   CORE_CONTACTS_REF_ROM=<rom built with -DCORE_NATIVE_CONTACTS_SLOW=1> (else built here)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
let refPath=process.env.CORE_CONTACTS_REF_ROM&&resolve(root,process.env.CORE_CONTACTS_REF_ROM);
if(!refPath){
  refPath=resolve(root,'.local/snes-test/roms/core-contacts-slow.sfc');
  mkdirSync(resolve(refPath,'..'),{recursive:true});
  const b=spawnSync(process.execPath,[resolve(root,'snes/build.mjs'),'--quiet','--strict',`--out=${refPath}`,'-DCORE_NATIVE_CONTACTS_SLOW=1'],{cwd:root,stdio:'inherit'});
  assert.equal(b.status,0,'reference build failed');
}
assert(existsSync(refPath),refPath);
const ctx=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),ctx);
const flags=['c','z','i','d','x','m','v','n'];
let rng=0xCE20;
const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)%n;};
function runner(romPath){
  const rom=readFileSync(romPath),ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&127)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const lost=[];
  const cpu=new ctx.Cpu({cpuRead:a=>{const p=at(a);if(p>=0)return ram[p];const o=hiromToPc(a,rom.length);return o>=0?rom[o]:0;},
    cpuWrite:(a,v)=>{const p=at(a);if(p>=0)ram[p]=v;else lost.push([a&0x7FFFFF,v]);}});
  return input=>{
    input.ram.copy(ram);lost.length=0;cpu.reset();cpu.e=false;
    for(const [i,f]of flags.entries())cpu[f]=!!(input.ps&(1<<i));
    const sp=input.sp??0x1EFD;
    cpu.r.set([input.dbr,input.k??0xC1]);cpu.br.set([input.a,input.x,input.y,sp,0xCE20,input.dp]);
    ram.writeUInt16LE(0x6FFF,sp+1);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<200000,`${romPath.split('/').pop()} did not return ${JSON.stringify({...input,ram:undefined})} pc ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    const out=Buffer.from(ram);out.fill(0,sp-0xFD,sp+1);   // the dead callee stack
    const regs=[...cpu.r,...cpu.br];regs[1]&=0x3F;   // C1 and its FastROM mirror 81
    return {registers:regs,flags:flags.map(f=>cpu[f]),ram:out,lost:[...lost],cycles};
  };
}
const before=runner(refPath),after=runner(path);
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify({...input,ram:undefined});
  assert.deepEqual(b.registers,a.registers,`registers ${why}`);
  assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  assert.deepEqual(b.lost,a.lost,`writes outside RAM ${why}`);
  if(!a.ram.equals(b.ram)){
    const i=b.ram.findIndex((v,k)=>v!==a.ram[k]);
    assert.fail(`RAM $${i.toString(16)}: ${a.ram[i]} -> ${b.ram[i]}, ${why}`);
  }
  return [a.cycles,b.cycles];
}
const pick=a=>a[rand(a.length)];
// A field: three party members, three enemy slots near the member or anywhere
// on a map of $C0 x $C2 pixels ($18/$1A their halves, as C1:CD4E sets them).
// Direct-page fields follow D; actor tables follow DB ($7E or $7F).
function field({member,boxes,near,dp,dbr}){
  const ram=Buffer.alloc(0x20000);for(let i=0;i<ram.length;i++)ram[i]=rand(256);
  const d8=(o,v)=>{ram[(dp+o)&0xFFFF]=v;},d16=(o,v)=>{d8(o,v&255);d8(o+1,v>>8);};
  const base=dbr===0x7F?0x10000:0;
  const a8=(o,v)=>{ram[base+o]=v;},a16=(o,v)=>{a8(o,v&255);a8(o+1,(v>>8)&255);},r8=o=>ram[base+o];
  const w=pick([256,512,1024,2048,rand(65536)]),h=pick([256,512,1024,2048,rand(65536)]);
  d16(0xC0,w);d16(0xC2,h);
  d16(0x18,rand(8)?w>>1:rand(65536));d16(0x1A,rand(8)?h>>1:rand(65536));
  d8(0xED,ram[(dp+0xED)&0xFFFF]|0x80);
  d16(0x0E,0);    // no contact recorded yet (C1:CD5A; a second one reaches C1:D017 in 16-bit A)
  const mx=rand(w||1),my=rand(h||1),layer=rand(2)?0x80:0,terrain=rand(4);
  a16(0xE002+member,mx);a16(0xE004+member,my);
  a8(0xE00B+member,(r8(0xE00B+member)&0x7C)|layer|terrain);
  if(!boxes||rand(3))a16(0xE0C2+member,0);
  const close=near?pick([0x600,0x800,0xA00]):-1;   // at most one pair within 24 px
  for(const slot of [0x600,0x800,0xA00]){
    const r=rand(10);
    a8(0xE000+slot,r===0?0:r===1?0x80|rand(128):1+rand(127));
    const dx=slot===close?rand(40)-20:pick([rand(64)+40,-40-rand(64),rand(256)-128,rand(1024)-512,rand(65536)]);
    const dy=slot===close?rand(40)-20:pick([rand(64)-32,rand(256)-128,rand(1024)-512,rand(65536)]);
    a16(0xE002+slot,((rand(6)===0?mx+(w>>1)+dx:mx+dx)+65536)&65535);
    a16(0xE004+slot,((rand(6)===0?my+(h>>1)+dy:my+dy)+65536)&65535);
    if(rand(8))a8(0xE00B+slot,(r8(0xE00B+slot)&0x7C)|(rand(8)?layer:layer^0x80)|(rand(4)?terrain:rand(4)));
    if(!boxes||rand(3))a16(0xE0C2+slot,0);
    // (C1:CF58-CF63 -> CFD2 with E03F & $70 = $10 reaches C1:D017 in 16-bit
    // A, a path the game never takes and neither build survives)
    if((r8(0xE03F+slot)&0x70)===0x10)a8(0xE03F+slot,r8(0xE03F+slot)^0x30);
  }
  return ram;
}
// M8/X16 as C1:CE20 is entered (C1:CD5C), now and then decimal mode. (An
// 8-bit index would misparse the retail LDY #$0600 at CE26 as well; the
// fast path declines it the same way.)
const pflags=()=>{let p=(rand(256)&~0x38)|0x20;if(!rand(12))p|=0x08;return p;};
test('contact passes keep the retail distances, touch bits and CPU state',t=>{
  let cyc=[0,0],n=0;
  for(let i=0;i<6000;i++){
    const member=rand(12)?pick([0,0x200,0x400]):pick([0x100,0x600,0x800]);
    const boxes=rand(4)===0,near=rand(4)===0,ps=pflags(),dbr=rand(16)?0x7E:0x7F,dp=rand(16)?0:pick([0x100,0x1234]);
    const input={ram:field({member,boxes,near,dp,dbr}),dbr,dp,ps,a:rand(65536),x:member,y:rand(65536)};
    const [a,b]=compare(input);
    if(!boxes&&!near&&!(ps&0x18)&&[0,0x200,0x400].includes(member)&&input.dbr===0x7E&&input.dp===0){cyc[0]+=a;cyc[1]+=b;n++;}
  }
  t.diagnostic(`${n} ordinary passes: ${Math.round(cyc[0]/n)} -> ${Math.round(cyc[1]/n)} CPU cycles`);
  assert(cyc[1]<cyc[0]*0.9,'not faster');
});
// Real entries from gameplay (private, never committed): a Lua prelude that
// saves the registers (.json) and all 128 KiB of WRAM (.bin) at C1:CE20.
const records=process.env.CORE_CONTACTS_RECORDS&&resolve(root,process.env.CORE_CONTACTS_RECORDS);
test('recorded contact passes from gameplay',{skip:!records&&'set CORE_CONTACTS_RECORDS'},t=>{
  let cyc=[0,0],n=0;
  for(const name of readdirSync(records).filter(f=>f.endsWith('.json'))){
    const r=JSON.parse(readFileSync(resolve(records,name),'utf8'));
    const ram=readFileSync(resolve(records,name.replace(/\.json$/,'.bin')));
    const [a,b]=compare({ram,a:r.a,x:r.x,y:r.y,sp:r.sp,dp:r.d,dbr:r.dbr,ps:r.ps,k:r.k});
    cyc[0]+=a;cyc[1]+=b;n++;
  }
  assert(n>0,'no records');
  t.diagnostic(`${n} recorded passes: ${Math.round(cyc[0]/n)} -> ${Math.round(cyc[1]/n)} CPU cycles`);
});
