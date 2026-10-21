// Compare the assembled resident-aura path with the generic renderer,
// including palette/cache failures and partial OAM capacity at screen edges.
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
const reference=Buffer.from(rom);
reference.set([0x18,0x60],hiromToPc(at('fx_aura_rows'))); // C clear: generic fallback
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000,FX=0x7800,HASH=at('fx_hash_address')&65535,HASH_SIZE=at('fx_hash_size');
const auraBase=rom.readUInt16LE(hiromToPc(at('fx_aura_asm_id')));
const ptr=hiromToPc(at('fx_asm_ptr')),data=hiromToPc(at('fx_asm_data'));

function renderer(bytes){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const index=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=index(a);return r>=0?ram[r]:bytes[hiromToPc(a,bytes.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=index(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  return ({tone=0,height=32,clock=0,power=256,x=128,y=112,goku=false,size=0,
    cursor=0,front=0,limit=512,white=0,palettes=0xFC,resident=7,budget=0,
    fail=0,pending=0,slot=0,followup=false}={})=>{
    ram.fill(0);sram.fill(0);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const word=(off,v)=>ram.writeUInt16LE(v&65535,DP+off);
    word(0x18,0x11|(goku?0x8000:0));word(0x1A,x);word(0x1C,y);
    ram[DP+0x1F]=tone;word(0x20,power);word(0x22,height);word(0x26,clock);
    word(0x44,size);word(0x46,white);word(0x90,0xFFFF);word(0x40,0xFFFF);
    word(0x0C,Math.max(0,limit-Math.ceil(front/4)*16-3));
    // A Goku anchor at (80,75), with 12 px of lift and a 15 px body offset.
    ram.writeUInt16LE(80,0xE020);ram.writeUInt16LE(102,0xE022);ram.writeUInt16LE(12,0xE045);
    ram.writeUInt16LE(cursor,0x6E90);ram.writeUInt16LE(limit,0x6E92);ram.writeUInt16LE(front,0x6E94);
    sram.fill(255,FX+0x40,FX+0x60);sram.fill(255,FX+0x22,FX+0x29);
    sram.fill(255,HASH,HASH+HASH_SIZE);
    sram.writeUInt16LE(17,FX+0x84);sram.writeUInt16LE(budget,FX+0x82);
    sram.writeUInt16LE(palettes,FX+0x20);sram.writeUInt16LE(fail,FX+0x228);
    sram.writeUInt16LE(pending,FX+0x80);
    const id=auraBase+(tone<3?tone:0)*4+(height<21?0:2)+((clock>>2)&1);
    const record=data+rom.readUInt16LE(ptr+id*2),cells=rom[record+1];
    for(let c=0;c<cells;c++)if(resident&(1<<c)){
      const cell=rom.readUInt16LE(record+6+c*2)&511,i=(slot+c)%15;
      sram.writeUInt16LE(cell,FX+0x40+i*2);
      sram[FX+0x254+(cell>>3)]|=1<<(cell&7);
      sram[HASH+(cell&(HASH_SIZE-1))]=i*2;
      sram.writeUInt16LE(1,FX+0x242);
    }
    let cycles=0;
    function call(name,a=0){
      const entry=at(name);cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
      cpu.br.set([a,0,0,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
      for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
        assert(n<10000,`${name} did not return`);
        cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
      }
      assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
      assert(!cpu.m&&!cpu.x);
    }
    call('fx_k_aura_obj');
    if(followup){word(0x14,160);word(0x16,140);call('fx_emit',id);call('fx_stamp_cell',8);}
    ram.fill(0,DP,DP+0x94);ram.fill(0,0x1E00,0x2000);
    return {ram:Buffer.from(ram),sram:Buffer.from(sram),cycles};
  };
}
const fast=renderer(rom),generic=renderer(reference);
let comparisons=0;
function compare(input){
  const a=generic(input),b=fast(input);comparisons++;
  for(const key of ['ram','sram'])if(!a[key].equals(b[key])){
    const i=a[key].findIndex((v,i)=>v!==b[key][i]);
    assert.fail(`${key} $${i.toString(16)}: ${a[key][i]} -> ${b[key][i]} ${JSON.stringify(input)}`);
  }
  return [a.cycles,b.cycles];
}

test('aura poses, tones, miniature sizes and actor anchors retain exact OAM',t=>{
  for(const tone of [0,1,2,3,255])for(const height of [0,16,20,21,32,40,65535])
    for(const clock of [0,1,2,4,6,65534,65535])for(const goku of [false,true])
      for(const size of [0,2])compare({tone,height,clock,goku,size,x:goku?0:128,y:goku?0:112});
  const [before,after]=compare({});
  assert(after<before*.8,`aura cost ${before} -> ${after}`);
  t.diagnostic(`full resident aura: ${before} -> ${after} CPU cycles`);
});

test('aura clipping and OAM reservations preserve edge and partial assemblies',()=>{
  for(const x of [-33,-16,-1,0,15,16,17,128,239,240,255,256,65535])
    for(const y of [-33,-1,0,31,32,33,34,112,223,224,225,255,65535])
      for(const clock of [0,4])compare({x,y,clock});
  for(const front of [0,1,4,11,12,15,16])for(const free of [0,1,2,3,4,5,6,7])
    for(const clock of [0,4])for(const limit of [256,512])
      compare({front,clock,limit,cursor:limit-Math.ceil(front/4)*16-free*4});
});

test('aura cache failures, pending uploads and palette exhaustion remain atomic',()=>{
  for(const tone of [0,1,2])for(const resident of [0,1,2,3,4,5,6,7])
    for(const budget of [0,1,2,3,8])for(const palettes of [0,4,8,0xFC])
      for(const white of [0,1])compare({tone,resident,budget,palettes,white});
  for(let slot=0;slot<15;slot++)for(let c=0;c<3;c++){
    const bit=1<<((slot+c)%15);
    compare({slot,fail:bit});compare({slot,pending:bit});compare({slot,followup:true});
  }
  for(const resident of [0,1,3,7])for(const budget of [0,1,3])
    for(const palettes of [0,0xFC])compare({resident,budget,palettes,followup:true});
  for(const power of [0,1,65535])for(const clock of [0,1,4,5])compare({power,clock});
});

test('resident full aura has six sprites at the requested coordinates',t=>{
  const result=fast({});assert.equal(result.ram.readUInt16LE(0x6E90),24);
  for(let i=0;i<6;i++){
    assert.equal(result.ram[0x800+i*4],112+(i%2)*16);
    assert.equal(result.ram[0x801+i*4],80+Math.floor(i/2)*16);
    assert.equal((result.ram.readUInt16LE(0x802+i*4)>>14)&1,i%2);
  }
  t.diagnostic(`${comparisons} assembled comparisons`);
});
