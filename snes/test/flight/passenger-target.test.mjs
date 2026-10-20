// A skipped native render must not leave carried companions targetable at
// their old screen position. Execute both original AI visibility predicates.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const rom=readFileSync(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);

function actors(changes={}){
  const ram=Buffer.alloc(0x20000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{const r=at(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;}});
  for(let actor=0;actor<0xC00;actor+=0x200){
    ram[0xE000+actor]=1;
    ram.writeUInt16LE(400,0xE002+actor);ram.writeUInt16LE(300,0xE004+actor);
    ram.writeUInt16LE(128,0xE020+actor);ram.writeUInt16LE(112,0xE022+actor);
  }
  Object.assign(ram,{[0xD96C]:3,[0xD900]:7,[0xDC]:130,[0xD966]:130},changes);
  function run(entry,x,dp=0){
    cpu.reset();cpu.e=false;cpu.m=true;cpu.x=false;
    cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([0xABCD,x,0xE600,0x1FFD,entry&65535,dp]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    for(let n=0;;n++){
      const pc=cpu.r[1]<<16|cpu.br[4];
      if(pc===(entry&0xFF0000|0x7000)||pc===0x80E3D3)break;
      assert(n<400,`routine did not return: ${entry.toString(16)}`);
      cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.br[1],x);assert.equal(cpu.br[2],0xE600);assert.equal(cpu.br[5],dp);
    assert.equal(cpu.r[0],0x7E);assert(cpu.m&&!cpu.x);
    return {pc:cpu.r[1]<<16|cpu.br[4],a:cpu.br[0]&255};
  }
  return {ram,render:actor=>run(0x80E3CF,actor),visible:(actor,entry,dp)=>run(entry,0xE000+actor,dp).a===0};
}

test('carried actors stay alive but both native AI predicates reject their screen position',()=>{
  for(const actor of [0x200,0x400])for(const dp of [0,0x1234,0x8000]){
    const a=actors();
    for(const entry of [0xC10526,0xC1054A])assert(a.visible(actor,entry,dp));
    const before=Buffer.from(a.ram);
    assert.equal(a.render(actor).pc,0x807000);
    assert.equal(a.ram.readUInt16LE(0xE020+actor),0x8000);
    assert.equal(a.ram.readUInt16LE(0xE022+actor),0x8000);
    for(const entry of [0xC10526,0xC1054A])assert(!a.visible(actor,entry,dp));
    for(const b of [before,a.ram]){b.fill(0,0x1F00,0x2000);b.fill(0,0xE020+actor,0xE024+actor);}
    assert(a.ram.equals(before),'carry changed world position, actor status or ownership');
  }
});

test('landing, human ownership and live scene locks retain native screen-coordinate refresh',()=>{
  for(const actor of [0x200,0x400])for(const change of [
    {[0xD96C]:0},{[0xD900]:6},{[0xE02C+actor]:2},
    {[0xD0]:1},{[0xFF]:1},{[0x52]:1},{[0xEC]:2},{[0xED]:0x40},
    {[0xD976]:1},{[0xF1]:0x80},{[0xE8]:4},{[0xDC]:131},
  ]){
    const a=actors(change);
    assert.equal(a.render(actor).pc,0x80E3D3);
    assert.equal(a.ram.readUInt16LE(0xE020+actor),128);
    assert.equal(a.ram.readUInt16LE(0xE022+actor),112);
  }
  for(const actor of [0,0x600,0x800,0xA00])assert.equal(actors().render(actor).pc,0x80E3D3);
});
