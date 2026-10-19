// Compare the assembled shared flight classifier with independent floor
// rules, including height bands, cache collisions and special-map fallbacks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const rom=readFileSync(path);
const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
  .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const classify=symbols.has('fl_land_class')?'fl_land_class':'fl_class';
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const ram=Buffer.alloc(0x22000);
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  (a>>>16)===0x33&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
});
function invoke(name,{a=0,x=0}={}){
  const entry=symbols.get(name);assert(entry,`missing ${name}`);
  cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
  cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
  cpu.br.set([a,x,0xABCD,0x1FFD,entry&65535,0]);
  ram.writeUInt16LE(0x6FFF,0x1FFE);
  let n=0,cycles=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
    assert(++n<100000,`${name} did not return`);
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  assert.equal(cpu.br[3],0x1FFF,'balanced stack');assert.equal(cpu.br[5],0,'D preserved');
  assert.equal(cpu.r[0],0x7E,'DB preserved');assert(!cpu.m&&!cpu.x,'widths preserved');
  if(name===classify)assert.equal(cpu.br[1],x,'tile index preserved');
  return {value:cpu.br[0],pass:cpu.c,cycles};
}
function setup(){
  ram.fill(0);
  ram.writeUInt16LE(130,0xDC);ram.writeUInt16LE(130,0xD906);
  for(const p of [0xD912,0xD914])ram.writeUInt16LE(16,p);
  for(const p of [0xD916,0xD918])ram.writeUInt16LE(256,p);
  ram.writeUInt16LE(0xFFFF,0x21B84);
  invoke('fl_cache_clear');
}
function descriptor(id,{flags=0,beh=0,code=0,rep=0}={},layer=0){
  ram.set([flags,beh,code,rep],0x1B800+layer*0x400+id*4);
}
function expected({flags=0,code=0,rep=0}={}){
  const h=flags&7;
  if((flags&8)||h===3)return 1;
  const band=h===1?8:h===2?16:0;
  const clear=code===0||(code&0xF0)===0x20||(code&0xF0)===0x30||(code===0xC1&&rep===0);
  return 1|band|(clear?6:0);
}
function check(fields,layer=0){
  const x=layer*0x4000+129;
  descriptor(255,fields,layer);ram[0x10000+x]=255;invoke('fl_cache_clear');
  for(let warm=0;warm<2;warm++){
    const result=invoke(classify,{x});
    assert.equal(result.value&31,expected(fields),JSON.stringify({fields,layer,warm}));
  }
}

test('shared flight classification matches every flag, movement code and behaviour byte',()=>{
  for(const layer of [0,1]){
    setup();
    for(let flags=0;flags<256;flags++)for(const code of [0,0x21,0x37,0xC1,0xFF])for(const rep of [0,255])
      check({flags,code,rep},layer);
    for(let code=0;code<256;code++)for(let flags=0;flags<8;flags++)for(const rep of [0,7])
      check({flags,code,rep},layer);
    for(let beh=0;beh<256;beh++)for(const flags of [0,1,2,3,7,8])
      check({flags,beh},layer);
  }
});

test('blocked tiles retain low-obstacle facts and changing tile keys replaces old classes',()=>{
  setup();descriptor(1,{flags:8});descriptor(2,{flags:2});
  ram[0x10000+129]=1;
  invoke('fl_cache_put',{a:0x300,x:129});
  assert.equal(invoke(classify,{x:129}).value&0x31F,0x301);
  for(const id of [2,0,1,2,0]){
    ram[0x10000+129]=id;
    const result=invoke(classify,{x:129});
    assert.equal(result.value&31,id===1?1:id===2?23:7);
    if(id!==1)assert.equal(result.value&0x300,0,'new tile cannot inherit a low-obstacle result');
    // Same cache slot, different location.
    ram[0x10000+193]=1;invoke(classify,{x:193});
    assert.equal(invoke(classify,{x:129}).value&31,id===1?1:id===2?23:7);
  }
});

test('caves, protected dungeon cells and the ferry preserve their special rules',()=>{
  setup();ram.writeUInt16LE(10,0xD908);
  assert.equal(invoke(classify,{x:129}).value&31,1,'cave layer-zero filler is solid');
  assert.equal(invoke(classify,{x:0x4081}).value&31,7,'layer one is not cave filler');
  setup();ram.writeUInt16LE(1|0x200,0xD910); // dungeon context + Joch
  ram.writeUInt16LE(64,0xD912);ram.writeUInt16LE(64,0xD914);
  assert.equal(invoke(classify,{x:129}).value&31,1,'Joch protects ordinary layer-zero tiles');
  ram[0x10000+129]=70;
  assert.equal(invoke(classify,{x:129}).value&31,7,'Joch tile 70 is open');
  setup();ram.writeUInt16LE(2,0xD910);ram.writeUInt16LE(64,0xD914);
  descriptor(1,{flags:2},1);
  for(const y of [17,44])ram[0x10000+0x4000+y*128+24]=1;
  assert.equal(invoke(classify,{x:0x4000+20*128+24}).value&31,3,'ferry gap is air only');
});

test('ground footprints keep all height bands and pixel-edge decisions',t=>{
  setup();
  let cold=0,warm=0;
  for(const layer of [0,1])for(const flags of [0,1,2,3,4,7,8]){
    descriptor(0,{flags},layer);
    for(const terrain of [0,1,2,3])for(const x of [7,8,9,15,16,17,24,248,249])
      for(const y of [7,8,9,15,16,17,24,248,249]){
        ram.writeUInt16LE(x,0xD940);ram.writeUInt16LE(y,0xD942);
        ram.writeUInt16LE(layer,0xD944);ram.writeUInt16LE(terrain,0xD946);
        invoke('fl_cache_clear');
        const h=flags&7,clear=x>=8&&y>=8&&x<=248&&y<=248&&!(flags&8)&&h!==3&&
          !(h===1&&terrain===2)&&!(h===2&&terrain===1);
        const result=invoke('fl_can_land');
        assert.equal(result.pass,clear,JSON.stringify({layer,flags,terrain,x,y}));
        if(!layer&&!flags&&!terrain&&x===24&&y===24){
          cold=result.cycles;warm=invoke('fl_can_land').cycles;
        }
      }
  }
  t.diagnostic(`ordinary single-cell landing: ${cold} cold / ${warm} warm CPU cycles`);
});
