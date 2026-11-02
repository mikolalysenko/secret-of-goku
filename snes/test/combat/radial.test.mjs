// Verify the generated radial launch table against every exact offset.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';
import {FEEL} from '../../gen/snes-feel.mjs';
import {radialComponent} from '../../gen/combat.mjs';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path),symbols=readFileSync(resolve(root,'dist/snes/gen/xdata.asm'),'utf8');
const address=name=>parseInt(symbols.match(new RegExp(`!XDATA_COMBAT_RADIAL_${name} = \\$([0-9A-F]+)`))[1],16);

test('all 12,769 radial table entries match both forms exactly',()=>{
  for(const axis of ['X','Y'])for(const [name,form,launch] of [['BASE',0,FEEL.launch[0]],['SSJ',1,FEEL.launch[1]]]){
    const base=hiromToPc(address(axis+'_'+name),rom.length);
    for(let y=-56;y<=56;y++)for(let x=-56;x<=56;x++){
      const d2=x*x+y*y,d=Math.floor(Math.sqrt(d2*65536)),v=axis==='X'?x:y;
      const expected=radialComponent(launch,v,d),stored=rom.readInt16LE(base+((y+56)*113+x+56)*2);
      assert.equal(stored,expected,`x=${x} y=${y} form=${form} axis=${axis}`);
      assert.equal(Math.sign(stored),Math.sign(v),`launch away from Goku: x=${x} y=${y} form=${form} axis=${axis}`);
    }
  }
});

test('the assembled radial routine returns every table result in both forms',()=>{
  const context=vm.createContext({Uint8Array,Uint16Array,Math});
  vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
  const ram=Buffer.alloc(0x20000),entry=parseInt(readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
    .match(/^([\dA-F]{2}):([\dA-F]{4}) cb_radial_component$/mi).slice(1).join(''),16);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];},
    cpuWrite:(a,v)=>{const r=at(a);assert(r>=0);ram[r]=v;}});
  for(const [form,launch] of [[0,FEEL.launch[0]],[1,FEEL.launch[1]]]){
    ram[0xD811]=form;
    for(const axis of ['X','Y'])for(let y=-56;y<=56;y++)for(let x=-56;x<=56;x++){
      ram.writeInt16LE(x,0xD8F8);ram.writeInt16LE(y,0xD8FA);
      cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
      cpu.br.set([axis==='X'?x:y,0x1234,0xBEEF,0x1FFD,entry&65535,0]);ram.writeUInt16LE(0x6FFF,0x1FFE);
      for(let n=0;cpu.br[4]!==0x7000;n++){
        assert(n<100,`radial routine failed to return: x=${x} y=${y} form=${form}`);cpu.cyclesLeft=0;cpu.cycle();
      }
      assert.equal(cpu.br[3],0x1FFF,'stack');
      const d2=x*x+y*y,d=Math.floor(Math.sqrt(d2*65536)),v=axis==='X'?x:y;
      const expected=radialComponent(launch,v,d);
      assert.equal(cpu.br[0],expected&0xFFFF,`x=${x} y=${y} form=${form} index=${cpu.br[1].toString(16)}`);
    }
  }
});
