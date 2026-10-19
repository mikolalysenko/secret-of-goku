// The native actor routine may return either accumulator width. Exercise
// both members of the pre-Goku/event pair with those return contracts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const source=readFileSync(path);
const symbols=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
const match=symbols.match(/^([0-9A-F]{2}):([0-9A-F]{4}) core_party_pair$/m);
assert(match,'core_party_pair symbol');
const entry=parseInt(match[1]+match[2],16);
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);

test('native companion pair restores its bank and stack after either actor width',()=>{
  for(const first8 of [false,true])for(const second8 of [false,true])
    for(const db of [0,0x7E,0x80])for(const event of [false,true]){
      const rom=Buffer.from(source),ram=Buffer.alloc(0x20000),sram=Buffer.alloc(0x10000);
      // CPX #$0400 / BEQ second / REP-or-SEP #$20 / RTS, for each actor.
      rom.set([0xE0,0,4,0xF0,3,first8?0xE2:0xC2,0x20,0x60,
        second8?0xE2:0xC2,0x20,0x60],hiromToPc(0x80F4CB));
      ram[0xD0]=event?1:0;sram[0x6001]=event?1:0;
      const calls=[];
      const address=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
        ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&0x1FFF:-1;
      const cpu=new context.Cpu({cpuRead:a=>{
        if(a>>>16===0x31)return sram[a&65535];
        const r=address(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
      },cpuWrite:(a,v)=>{const r=address(a);assert(r>=0);ram[r]=v;}});
      cpu.reset();cpu.e=false;cpu.m=true;cpu.x=false;
      cpu.r[0]=db;cpu.r[1]=entry>>>16;
      cpu.br.set([0xABCD,0,0xBEEF,0x1FFC,entry&65535,0]);
      ram.writeUInt16LE(0x6FFF,0x1FFD);ram[0x1FFF]=entry>>>16;
      for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
        assert(n<300,'companion pair corrupted its return');
        if(cpu.r[1]===0x80&&cpu.br[4]===0xF4CB){
          calls.push(cpu.br[1]);assert.equal(cpu.r[0],0x7E);
          assert.equal(cpu.m,true);assert.equal(cpu.x,false);
        }
        cpu.cyclesLeft=0;cpu.cycle();
      }
      assert.deepEqual(calls,[0x200,0x400]);
      assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.r[0],db);
      assert.equal(cpu.m,second8);
    }
});
