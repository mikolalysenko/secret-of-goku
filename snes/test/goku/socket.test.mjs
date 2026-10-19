// Execute the cartridge APIs against the authored browser pose descriptors.
// Check missing cells as well as all facings, lifted anchors and CPU widths.
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
const context=vm.createContext({Uint8Array,Uint16Array,Math,window:{}});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
vm.runInContext(readFileSync(resolve(root,'engine/goku-animation-data.js'),'utf8'),context);
const forms=context.window.GokuAnimationData.forms;
const seed=Buffer.alloc(0x20000),ram=Buffer.alloc(seed.length);
for(let i=0;i<seed.length;i++)seed[i]=(i*71+(i>>8)*17)&255;
const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const cpu=new context.Cpu({
  cpuRead:a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)],
  cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;},
});
function run({hand=false,sheet=0,col=30,row=1,anchor=[128,112,0,0],p=0,db=0x7E,dp=0}={}){
  const entry=symbols.get(hand?'goku_api_hand':'goku_api_socket');
  assert(entry,'Goku socket API symbol missing');
  seed.copy(ram);
  ram[0xD76E]=sheet&255;ram[0xD76F]=col&255;ram[0xD770]=row&255;
  for(const [i,a]of [0xE020,0xE022,0xE045,0xD76C].entries())ram.writeUInt16LE(anchor[i]&65535,a);
  const want=Buffer.from(ram);
  cpu.reset();cpu.e=false;
  for(const [i,f]of ['c','z','i','d','x','m','v','n'].entries())cpu[f]=!!(p&(1<<i));
  cpu.r[0]=db;cpu.r[1]=entry>>>16;
  const x=p&16?col&255:col,y=p&16?row&255:row;
  cpu.br.set([sheet,x,y,0x1FFC,entry&65535,dp]);
  ram.writeUInt16LE(0x6FFF,0x1FFD);ram[0x1FFF]=0x80;
  let n=0,cycles=0;
  while(cpu.br[4]!==0x7000||cpu.r[1]!==0x80){
    assert(++n<1000,'socket API did not return');
    cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
  }
  const form=hand?sheet&255:sheet&3,column=hand?col&255:x;
  const socket=form<2?forms[form?'ssj':'goku'].sockets[column]?.[(hand?row:y)&3]:null;
  assert.equal(cpu.c,!!socket,`socket availability ${hand}/${sheet}/${col}/${row}`);
  if(socket){
    const [sx,sy]=socket;
    assert.equal(cpu.br[0],(sx-16+(hand?anchor[0]:0))&65535,'hand x');
    assert.equal(cpu.br[1],(sy-31+(hand?anchor[1]-anchor[2]-anchor[3]:0))&65535,'hand y');
  }
  assert.equal(cpu.br[2],y,'Y preserved');
  assert.equal(cpu.br[3],0x1FFF,'balanced stack');
  assert.equal(cpu.br[5],dp,'D preserved');
  assert.equal(cpu.r[0],db,'DB preserved');
  assert.equal(cpu.m,false,'M16 exit');assert.equal(cpu.x,false,'X16 exit');
  for(const b of [ram,want]){
    b.fill(0,0x1F00,0x2000);
    for(const a of [0xD77E,0xD7F0,0xD7F2,0xD7F6])b.fill(0,a,a+2);
  }
  assert(ram.equals(want),'only call-local socket scratch may change');
  return cycles;
}
test('socket APIs match every authored and missing byte column in both forms',t=>{
  for(const hand of [false,true])for(let sheet=0;sheet<4;sheet++)
    for(let col=0;col<256;col++)for(let row=0;row<4;row++)run({hand,sheet,col,row});
  for(const col of [22,30])t.diagnostic(`hand column ${col}: ${run({hand:true,col})} CPU cycles`);
});
test('socket APIs preserve lifted/wrapped anchors, row masking and caller context',()=>{
  for(const hand of [false,true])for(const sheet of [0,1,2,3,4,5,255,256,257,65535])
    for(const col of [18,22,30,31,32,255,256,65535])for(const row of [0,3,4,255,256,65535])
      run({hand,sheet,col,row});
  for(const db of [0,0x7E,0x7F,0xFF])for(const dp of [0,0x1234,0x8000])
    for(const p of [0,1,4,0x10,0x20,0x30,0xC5,0xF7])for(const hand of [false,true])
      for(const anchor of [[128,112,0,0],[0,0,255,24],[65535,65535,17,-6]])
        run({hand,db,dp,p,anchor});
});
