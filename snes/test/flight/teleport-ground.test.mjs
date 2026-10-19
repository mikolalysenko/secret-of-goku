// Execute the assembled ground landing query. The independent model covers
// descriptor rules, all terrain bands, footprint edges and live cache keys.
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
    assert(++n<10000,`${name} did not return`);
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  assert.equal(cpu.br[3],0x1FFF,'balanced stack');assert.equal(cpu.br[5],0,'D preserved');
  assert.equal(cpu.r[0],0x7E,'DB preserved');assert(!cpu.m&&!cpu.x,'register widths preserved');
  return {pass:cpu.c,value:cpu.br[0],cycles};
}
function setup(){
  ram.fill(0);
  ram.writeUInt16LE(130,0xDC);ram.writeUInt16LE(130,0xD906);
  for(const p of [0xD912,0xD914])ram.writeUInt16LE(16,p);
  for(const p of [0xD916,0xD918])ram.writeUInt16LE(256,p);
  ram.writeUInt16LE(0xFFFF,0x21B84); // no hero grid, for the slow comparison path
  invoke('fl_cache_clear');
}
function descriptor(id,{flags=0,beh=0,code=0,rep=0}={},layer=0){
  ram.set([flags,beh,code,rep],0x1B800+layer*0x400+id*4);
}
function query({x=24,y=24,layer=0,terrain=0,stairs=0}={}){
  ram.writeUInt16LE(x&65535,0xD940);ram.writeUInt16LE(y&65535,0xD942);
  ram.writeUInt16LE(layer,0xD944);ram.writeUInt16LE(terrain,0x21B74);
  let expected=x>=8&&y>=8&&x<=248&&y<=248;
  if(expected)for(let ty=(y-4)>>4;ty<=(y+4)>>4;ty++)for(let tx=(x-6)>>4;tx<=(x+6)>>4;tx++){
    const id=ram[0x10000+layer*0x4000+ty*128+tx],p=0x1B800+layer*0x400+id*4;
    const [flags,beh,code,rep]=ram.subarray(p,p+4),height=flags&7;
    const floor=code===0||(code&0xF0)===0x20||(code&0xF0)===0x30||(code===0xC1&&rep===0);
    expected&&=!(flags&8)&&height<3&&(!height||(height^terrain)!==3)&&floor&&!(beh&(stairs?0x10:0x90))&&(stairs||(code&0xF0)!==0x20);
  }
  const before=Buffer.from(ram),result=invoke('fl_tp_clear',{a:stairs});
  assert.equal(result.pass,!!expected,JSON.stringify({x,y,layer,terrain,stairs}));
  assert.equal(ram.readUInt16LE(0xD940),x&65535,'query x preserved');
  assert.equal(ram.readUInt16LE(0xD942),y&65535,'query y preserved');
  // Only terrain/query scratch, cache/grid bookkeeping and dead stack may change.
  const actual=Buffer.from(ram);
  for(const b of [before,actual]){
    b.fill(0,0x1F00,0x2000);b.fill(0,0xD934,0xD964);
    b.fill(0,0x21800,0x21980);b.fill(0,0x21B80,0x21BA6);
  }
  assert(actual.equals(before),'query changed actor, map or unrelated memory');
  return result.cycles;
}
test('ground teleport agrees with descriptor rules for every flag, code and behaviour byte',t=>{
  for(const layer of [0,1]){
    setup();ram[0x10000+layer*0x4000+129]=1;
    for(let flags=0;flags<256;flags++){
      descriptor(1,{flags},layer);invoke('fl_cache_clear');
      for(const terrain of [0,1,2,3])for(const stairs of [0,1])query({layer,terrain,stairs});
    }
    for(let code=0;code<256;code++)for(const rep of [0,7]){
      descriptor(1,{code,rep},layer);invoke('fl_cache_clear');
      for(const stairs of [0,1])query({layer,stairs});
    }
    for(let beh=0;beh<256;beh++)for(const code of [0,0x21,0x30]){
      descriptor(1,{beh,code},layer);invoke('fl_cache_clear');
      for(const stairs of [0,1])query({layer,stairs});
    }
  }
  setup();const cold=query(),warm=query();
  t.diagnostic(`single-cell ground endpoint: ${cold} cold / ${warm} warm CPU cycles`);
});
test('all footprint cells, map boundaries and height transitions constrain landing',()=>{
  for(const layer of [0,1])for(const blocked of [0,1,2,3]){
    setup();descriptor(1,{beh:0x10},layer);
    const cells=[129,130,257,258];ram[0x10000+layer*0x4000+cells[blocked]]=1;
    for(const terrain of [0,1,2,3])for(const stairs of [0,1])query({x:31,y:31,layer,terrain,stairs});
  }
  setup();
  for(const x of [-1,0,7,8,9,15,16,17,247,248,249,255,256])
    for(const y of [-1,0,7,8,9,15,16,17,247,248,249,255,256])query({x,y});
  setup();descriptor(1,{flags:1});descriptor(2,{flags:2});
  ram[0x10000+129]=1;ram[0x10000+130]=2;
  for(const terrain of [0,1,2,3])query({x:31,terrain});
});
test('warm teleport facts survive other classifiers and expire on tile changes or cache collisions',()=>{
  setup();descriptor(1,{beh:0x10});descriptor(2,{code:0x21});descriptor(3,{flags:2});
  for(const tile of [0,1,0,2,3,0]){
    ram[0x10000+129]=tile;
    for(const terrain of [0,1,2,3])for(const stairs of [0,1]){
      query({terrain,stairs});invoke('fl_class',{x:129});query({terrain,stairs});
    }
  }
  // A location 64 columns away has the same cache slot but a different key.
  ram[0x10000+193]=1;
  for(let i=0;i<3;i++){
    invoke('fl_class',{x:193});query();
    invoke('fl_cache_clear');query();
  }
});
