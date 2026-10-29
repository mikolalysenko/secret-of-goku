// Exercise the assembled no-multitap cache and its BIOS fallback.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const source=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const probe=0x7480+0x1B; // CORE_SAFE + $1B, in bank $31 SRAM

function machine(multitap=false){
  const rom=Buffer.from(source),ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x10000);
  // A minimal MULTI5 stub: count the call, publish the auto-read pads and
  // return absent/present with the caller's flags intact, as the real BIOS.
  const bios=0xCFFE00,pc=hiromToPc(bios,rom.length);
  rom.set([0x08,0xE2,0x20,0xEE,0x00,0x10,0xC2,0x20,0xAD,0x18,0x42,0x8D,0x42,0x00,
    0xAD,0x1A,0x42,0x8D,0x44,0x00,0xE2,0x20,0xA9,multitap?0xFF:0,0x28,0x6B],pc);
  let pad1=0x1280,pad2=0x3440;
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a===0x4212)return 0;
    if(a===0x4218)return pad1&255;if(a===0x4219)return pad1>>8;
    if(a===0x421A)return pad2&255;if(a===0x421B)return pad2>>8;
    if(a>>>16===0x31)return sram[a&65535];
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{if(a>>>16===0x31){sram[a&65535]=v;return;}const r=at(a);assert(r>=0);ram[r]=v;}});
  function run(p1=pad1,p2=pad2){
    pad1=p1;pad2=p2;const entry=symbols.get('core_pad_bios');cpu.reset();cpu.e=false;cpu.setP(0xA5);
    cpu.r[0]=0;cpu.r[1]=entry>>>16;cpu.br.set([0xABCD,0x1234,0xBEEF,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    for(let n=0;cpu.br[4]!==0x7000;n++){
      assert(n<400,`core_pad_bios failed to return: ${cpu.r[1].toString(16)}:${cpu.br[4].toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.br[3],0x2000,'RTL stack');assert.equal(cpu.br[5],0,'direct page');
    assert.equal(cpu.getP(),0xA5,'caller flags');
    return ram.readUInt16LE(0x1000);
  }
  return {ram,sram,run};
}

test('absent multitap uses fresh auto-read pads between rare probes',()=>{
  const {ram,sram,run}=machine();
  assert.equal(run(),1);assert.equal(ram.readUInt16LE(0x42),0x1280);assert.equal(ram.readUInt16LE(0x44),0x3440);
  assert.equal(sram[probe],255);
  assert.equal(run(0x0810,0x4020),1);assert.equal(ram.readUInt16LE(0x42),0x0810);assert.equal(ram.readUInt16LE(0x44),0x4020);
  assert.equal(sram[probe],254);assert.equal(ram.readUInt16LE(0x46),0);
  sram[probe]=1;assert.equal(run(0x0200,0x0100),1);assert.equal(sram[probe],0);
  assert.equal(run(0x8000,0x4000),2);assert.equal(ram.readUInt16LE(0x42),0x8000);assert.equal(sram[probe],255);
});

test('a present multitap keeps the serial BIOS on every poll',()=>{
  const {ram,sram,run}=machine(true);
  assert.equal(run(),1);assert.equal(run(0x1110,0x2220),2);
  assert.equal(sram[probe],0);assert.equal(ram.readUInt16LE(0x42),0x1110);assert.equal(ram.readUInt16LE(0x44),0x2220);
});
