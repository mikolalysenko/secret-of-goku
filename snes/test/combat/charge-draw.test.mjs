// Execute both assembled presentation paths through the real FX draw API.
// Gameplay state and complete requests must agree, including a full/stale
// draw list and cold FX SRAM. Only dead math scratch may differ.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const reference=resolve(root,process.env.COMBAT_REFERENCE_ROM??'.local/snes-test/charge-draw/reference.sfc');
if(!process.env.COMBAT_REFERENCE_ROM){
  mkdirSync(resolve(root,'.local/snes-test/charge-draw'),{recursive:true});
  execFileSync(process.execPath,['snes/build.mjs','--strict','--quiet',
    `--out=${reference}`,'-DCOMBAT_CHARGE_DRAW_SLOW=1'],{cwd:root,stdio:'pipe'});
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const flags=['c','z','i','d','x','m','v','n'];
const index=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;

function renderer(path){
  const rom=readFileSync(path),symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536),io=Buffer.alloc(0x10000);
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=index(a);if(r>=0)return ram[r];
    if((a>>>16&0x7F)<0x40&&(a&65535)<0x8000)return io[a&65535];
    return rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=index(a);if(r>=0){ram[r]=v;return;}
    assert([0x4202,0x4203].includes(a),`unexpected write ${a.toString(16)}`);
    io[a]=v;if(a===0x4203)io.writeUInt16LE(io[0x4202]*v,0x4216);
  }});
  return ({charge=30,form=0,clock=0,action=17,power=48,count=0,stale=false,cold=false,
    sequence=['cb_fx_aura','cb_fx_orb'],p=0,high=0}={})=>{
    ram.fill(0x57);sram.fill(0xA6);io.fill(0);cpu.reset();cpu.e=false;
    for(const [i,f] of flags.entries())cpu[f]=!!(p&(1<<i));
    ram.writeUInt16LE((charge&255)|(high<<8),0xD826);ram[0xD811]=form;
    ram.writeUInt16LE(clock,0xD80C);ram[0xD814]=action;ram.writeUInt16LE(power,0xD82E);
    ram.writeUInt16LE(321,0xD72C);sram.writeUInt16LE(stale?320:321,0x7810);
    sram.writeUInt16LE(count*16,0x781C);sram.writeUInt16LE(cold?0:0xF0C7,0x788C);
    let cycles=0;
    for(const name of sequence){
      const entry=symbols.get(name);assert(entry,name);
      cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
      cpu.br.set([0xABCD,0x1234,0x5678,0x1FFD,entry&65535,0]);
      ram.writeUInt16LE(0x6FFF,0x1FFE);
      for(let n=0;cpu.br[4]!==0x7000;n++){
        assert(n<15000,`${name} did not return`);
        cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
      }
      assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.r[0],0x7E);assert.equal(cpu.br[5],0);
      assert(!cpu.m&&!cpu.x);
    }
    // Multiplication's scratch and inactive stack bytes are not outputs.
    ram.fill(0,0xD8D8,0xD8E0);ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),sram:Buffer.from(sram),registers:[...cpu.r,...cpu.br],
      flags:flags.map(f=>cpu[f]),cycles};
  };
}
const before=renderer(reference),after=renderer(path);
let comparisons=0;
function compare(input){
  const a=before(input),b=after(input),why=JSON.stringify(input);comparisons++;
  for(const key of ['ram','sram'])if(!a[key].equals(b[key])){
    const i=a[key].findIndex((v,i)=>v!==b[key][i]);
    assert.fail(`${key} $${i.toString(16)} ${a[key][i]} -> ${b[key][i]} ${why}`);
  }
  assert.deepEqual(b.registers,a.registers,`CPU ${why}`);assert.deepEqual(b.flags,a.flags,`flags ${why}`);
  return [a,b];
}

test('every charge byte and full-charge phase preserves both FX records',t=>{
  for(const form of [0,1,2,255])for(let charge=0;charge<256;charge++)for(let clock=0;clock<8;clock++){
    const [,b]=compare({charge,form,clock,high:charge});
    const strength=Math.floor(Math.min(charge,form?45:90)*256/(form?45:90));
    assert.equal(b.sram.readUInt16LE(0x79A8),64+(strength>>1));
    assert.equal(b.sram.readUInt16LE(0x79B8),strength===256?3+((clock>>2)&1):Math.floor(strength*5/256));
  }
  const [a,b]=compare({});assert(b.cycles<a.cycles*.8,`${a.cycles} -> ${b.cycles}`);
  t.diagnostic(`partial charge aura + orb: ${a.cycles} -> ${b.cycles} CPU cycles`);
});

test('focus, transformation, draw-list exhaustion and initialization keep their contracts',t=>{
  for(const sequence of [['cb_fx_aura'],['cb_fx_orb'],['cb_fx_aura','cb_fx_orb']])
    for(const action of [0,17,21,22,24])for(const power of [0,1,48,96,128,255,65535])
      for(const count of [0,6,7,8])for(const stale of [false,true])for(const cold of [false,true])
        compare({sequence,action,power,count,stale,cold,form:1,charge:17});
  // Binary arithmetic, M16/X16, as entered from the field dispatch.
  for(const p of [0,1,4,0x40,0x80,0xC5])for(const clock of [0,7,65535])
    for(const charge of [0,44,45,89,90,255])compare({p,clock,charge});
  t.diagnostic(`${comparisons} assembled comparisons`);
});
