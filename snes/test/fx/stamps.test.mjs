// Single-cell stamps must allocate the same tiles/palettes and emit the
// same OAM as generic assemblies, including clipping and full front lists.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path),symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const at=n=>{assert(symbols.has(n),n);return symbols.get(n);};
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000,records=hiromToPc(at('fx_stamp_cells'));
const count=(at('fx_stamp_cells_end')-at('fx_stamp_cells'))/4;

function renderer(name){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536),entry=at(name);
  const rindex=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=rindex(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=rindex(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  return ({id,x=128,y=112,depth=1,size=0,cursor=0,front=0,frontUsed=0,
    resident=true,budget=0,palettes=0xFC,white=0,sequence=[id]}={})=>{
    ram.fill(0);sram.fill(0);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const cell=rom.readUInt16LE(records+id*4)&511;
    const word=(off,v)=>ram.writeUInt16LE(v&65535,DP+off);
    word(0x14,x);word(0x16,y);word(0x3E,depth);word(0x44,size);word(0x46,white);
    word(0x0C,Math.max(0,512-Math.ceil(front/4)*16-3));
    word(0x90,0xFFFF);word(0x40,0xFFFF);word(0x42,0xFFFF);
    ram.writeUInt16LE(cursor,0x6E90);ram.writeUInt16LE(512,0x6E92);ram.writeUInt16LE(front,0x6E94);
    sram.writeUInt16LE(frontUsed,0x7896);sram.writeUInt16LE(17,0x7884);
    sram.fill(255,0x7840,0x7860);sram.fill(255,0x7822,0x7829);
    sram.writeUInt16LE(palettes,0x7820);sram.writeUInt16LE(budget,0x7882);
    if(resident){
      sram.writeUInt16LE(cell,0x7840);sram[0x7A54+(cell>>3)]=1<<(cell&7);
    }
    let cycles=0;
    for(const stamp of sequence){
      cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
      cpu.br.set([stamp,0,0,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
      for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
        assert(n<10000,`${name} failed to return, stamp ${stamp}`);
        cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
      }
      assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
      assert(!cpu.m&&!cpu.x);
    }
    ram.fill(0,DP,DP+0x94);ram.fill(0,0x1F00,0x2000);
    return {ram:Buffer.from(ram),sram:Buffer.from(sram),cycles};
  };
}
const generic=renderer('fx_emit'),single=renderer('fx_stamp_cell');
function compare(input){
  const a=generic(input),b=single(input),why=JSON.stringify(input);
  for(const field of ['ram','sram'])if(!a[field].equals(b[field])){
    const i=a[field].findIndex((v,i)=>v!==b[field][i]);
    assert.fail(`${field} $${i.toString(16)}: ${a[field][i]} -> ${b[field][i]} ${why}`);
  }
  return [a.cycles,b.cycles];
}
test('every rotated stamp matches generic OAM and cache allocation',t=>{
  for(let id=0;id<count;id++)for(const depth of [0,1])for(const size of [0,2]){
    compare({id,depth,size});
    compare({id,depth,size,resident:false,budget:0});
    compare({id,depth,size,resident:false,budget:1});
  }
  const [before,after]=compare({id:8});
  // Generic setup also got faster; keep the stamp's absolute budget so
  // improving the reference path cannot turn into a performance failure.
  assert(after<before&&after<=670,`single-cell cycles ${before} -> ${after}`);
  t.diagnostic(`resident front stamp: ${before} -> ${after} CPU cycles`);
});
test('stamp clipping, palette exhaustion and full OAM keep exact behavior',()=>{
  for(let id=0;id<count;id+=17)for(const [x,y] of [[-32,112],[-8,0],[0,0],[255,223],[280,240]])
    for(const front of [0,1,11,12,15,16])for(const depth of [0,1]){
      compare({id,x,y,front,frontUsed:front,depth,cursor:512-Math.ceil(front/4)*16-4});
    }
  for(let id=0;id<count;id++)for(const palettes of [0,4,8])for(const white of [0,1])
    compare({id,palettes,white});
});

// Explicit expected behavior, independent of either renderer's output.
test('unavailable rotated cells emit nothing, while resident cells are visible',()=>{
  for(let id=0;id<count;id++){
    if(rom.readUInt16LE(records+id*4)===0xFFFF)continue;
    for(const name of [generic,single]){
      for(const input of [{resident:false,budget:0},{resident:true,palettes:0}]){
        const result=name({id,...input});
        assert.equal(result.ram.readUInt16LE(0x6E90),0,`missing back stamp ${id}`);
        assert.equal(result.ram.readUInt16LE(0x6E94),0,`missing front stamp ${id}`);
      }
      const visible=name({id});
      assert.equal(visible.ram.readUInt16LE(0x6E94),1,`resident front stamp ${id}`);
    }
  }
});

test('successive stamps preserve palette, tile-cache and front-list state',()=>{
  for(const resident of [false,true])for(const budget of [0,2,8])for(const depth of [0,1]){
    for(const sequence of [[0,0,0,2,0,1,2,3,0],Array.from({length:40},(_,i)=>(i*19)%count)])
      compare({id:sequence[0],sequence,resident,budget,depth});
  }
});
