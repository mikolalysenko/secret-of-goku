// Execute the assembled carry gate: stale published flight state must yield
// immediately to human players, map loads, menus and scripted ownership.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const match=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8').match(/^([\dA-F]{2}):([\dA-F]{4}) fl_is_passenger$/mi);
assert(match,'flight carry gate missing');
const bank=parseInt(match[1],16),pc=parseInt(match[2],16);
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
function carried(actor,changes={}){
  const ram=new Uint8Array(65536);
  const at=a=>(a>>>16)===0x7E?a&65535:((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({
    cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
    cpuWrite:(a,v)=>{assert(at(a)>=0);ram[at(a)]=v;},
  });
  Object.assign(ram,{[0xD96C]:3,[0xD900]:7,[0xDC]:130,[0xD966]:130},changes);
  const before=ram.slice();
  cpu.reset();cpu.e=false;cpu.m=true;cpu.x=false;
  cpu.r[0]=0x7E;cpu.r[1]=bank;
  cpu.br.set([0xABCD,actor,0xBEEF,0x1FFD,pc,0]);
  ram[0x1FFE]=0xFF;ram[0x1FFF]=0x6F;
  let steps=0;
  while(cpu.br[4]!==0x7000){assert(++steps<80,'carry gate failed to return');cpu.cyclesLeft=0;cpu.cycle();}
  assert.deepEqual([...cpu.br].slice(1),[actor,0xBEEF,0x1FFF,0x7000,0]);
  assert.deepEqual([...cpu.r],[0x7E,bank]);
  assert(cpu.m&&!cpu.x,'carry gate changed register widths');
  ram.fill(0,0x1F00,0x2000);before.fill(0,0x1F00,0x2000);
  assert.deepEqual(ram,before,'carry gate mutated actor or flight state');
  return cpu.c;
}
test('only published CPU companions are carried',()=>{
  for(const actor of [0,0x200,0x400,0x600,0x800,0xA00])
    assert.equal(carried(actor),actor===0x200||actor===0x400);
  for(const actor of [0x200,0x400]){
    const bit=actor===0x200?1:2;
    assert(carried(actor,{[0xD96C]:bit}));
    assert(!carried(actor,{[0xD96C]:3^bit}));
    for(const owner of [1,2,4,0x80])assert(!carried(actor,{[0xE02C+actor]:owner}));
  }
});
test('live scene, menu, loading and map gates override a stale carry mask',()=>{
  for(const actor of [0x200,0x400])for(const change of [
    {[0xD900]:6},{[0xD900]:5},{[0xD900]:3},
    {[0xD0]:1},{[0xFF]:1},{[0x52]:1},{[0xEC]:2},{[0xED]:0x40},
    {[0xD976]:1},{[0xD977]:1},{[0xF1]:0x80},{[0xE8]:4},
    {[0xDC]:131},{[0xDD]:1},
  ])assert(!carried(actor,change),JSON.stringify(change));
  assert(carried(0x200,{[0xEC]:1,[0xED]:0x80}),'ordinary field/battle flags should allow carrying');
});
