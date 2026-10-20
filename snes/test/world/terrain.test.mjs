// Execute the cartridge's row copier, checking every tile against the
// independent research decoder, all eight ROM blocks and ring wrapping.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
import {readWorldMap} from '../../../tools/rom/world.mjs';

const root=resolve(import.meta.dirname,'../../..');
const romPath=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(romPath);
const sym=readFileSync(romPath.replace(/\.sfc$/,'.sym'),'utf8');
const label=name=>{const m=sym.match(new RegExp(`^([\\dA-F]{2}):([\\dA-F]{4}) ${name}$`,'mi'));assert(m,`missing ${name}`);return parseInt(m[1]+m[2],16);};
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);

test('world row machine code preserves all 262144 terrain tiles and ring boundaries',()=>{
  const expected=readWorldMap(readFileSync(resolve(root,'rom/secret-of-mana-us.sfc'))).tiles;
  const ram=new Uint8Array(0x20000),entry=label('world_copy_row');
  const ramAt=a=>(a>>>16)===0x7E?a&0xFFFF:(a>>>16)===0x7F?0x10000+(a&0xFFFF):
    ((a>>>16)&0x7F)<0x40&&(a&0xFFFF)<0x2000?a&0x1FFF:-1;
  let lo=0,hi=0;
  const cpu=new context.Cpu({
    cpuRead:a=>{const r=ramAt(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const r=ramAt(a);assert((r>=lo&&r<hi)||(r>=0x1F00&&r<0x2000),`unexpected write ${a.toString(16)}`);ram[r]=v;},
  });
  for(let row=0;row<512;row++)for(const extra of [0,512,0xFE00]){
    ram.fill(0xA5);lo=0x10000+(row&127)*512;hi=lo+512;
    cpu.reset();cpu.e=false;cpu.m=cpu.x=true;
    cpu.r[0]=[0,0x7E,0x80][row%3];cpu.r[1]=entry>>>16;
    cpu.br.set([row+extra,0x23,0x45,0x1FFD,entry&0xFFFF,0]);
    ram[0x1FFE]=0xFF;ram[0x1FFF]=0x6F; // RTS sentinel in the same bank
    let instructions=0;
    while(cpu.br[4]!==0x7000){assert(++instructions<600,'copier did not return');cpu.cyclesLeft=0;cpu.cycle();}
    assert.deepEqual(ram.slice(lo,hi),Uint8Array.from(expected.slice(row*512,(row+1)*512)),`row ${row}, wrap ${extra}`);
    assert.equal(cpu.r[0],[0,0x7E,0x80][row%3],'DB preserved');
    assert.equal(cpu.br[3],0x1FFF,'balanced stack');
    assert.equal(cpu.br[5],0,'D restored');
    assert.equal(cpu.m,false);assert.equal(cpu.x,false);
  }
});
