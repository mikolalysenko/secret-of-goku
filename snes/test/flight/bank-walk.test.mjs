// The bank rule's lean shore walker (fl_bank_shores, default build) against
// the shared walker it replaces (fl_between_shores with fl_pred_banklily,
// -DFLIGHT_BANK_WALK_SLOW=1): fl_lowobs on random layouts of bank, lily,
// shore and other cells, both layers, every cell including the map's edges,
// on one map of every tileset with a bank rule. Each machine loads the map's
// context itself (fl_ctx_load) from its own ROM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const fastPath=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const slowPath=resolve(root,process.env.FLIGHT_REFERENCE_ROM??'.local/snes-test/bank-walk/reference.sfc');
if(!process.env.FLIGHT_REFERENCE_ROM){
  mkdirSync(dirname(slowPath),{recursive:true});
  execFileSync(process.execPath,['snes/build.mjs','--strict','--quiet',`--out=${slowPath}`,'-DFLIGHT_BANK_WALK_SLOW=1'],{cwd:root,stdio:'pipe'});
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);

function machine(path){
  const rom=readFileSync(path);
  const symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const ram=Buffer.alloc(0x22000);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    (a>>>16)===0x33&&(a&65535)>=0x6000&&(a&65535)<0x8000?0x20000+(a&8191):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const read=a=>at(a)>=0?ram[at(a)]:rom[hiromToPc(a,rom.length)];
  const cpu=new context.Cpu({cpuRead:read,cpuWrite:(a,v)=>{assert(at(a)>=0,`unexpected write $${a.toString(16)}`);ram[at(a)]=v;}});
  function invoke(name,{a=0,x=0}={}){
    const entry=symbols.get(name);assert(entry,`missing ${name}`);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.d=false;
    cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([a,x,0xABCD,0x1FFD,entry&65535,0]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);
    let n=0,cycles=0;
    while(cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16){
      assert(++n<400000,`${name} did not return`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF,'balanced stack');assert.equal(cpu.br[5],0,'D preserved');
    assert.equal(cpu.r[0],0x7E,'DB preserved');assert(!cpu.m&&!cpu.x,'widths preserved');
    return {pass:cpu.c,x:cpu.br[1],cycles};
  }
  return {ram,read,invoke,symbols};
}
const fast=machine(fastPath),slow=machine(slowPath);
assert(fast.symbols.has('fl_bank_shores'),'the default build has the lean walker');
assert(!slow.symbols.has('fl_bank_shores'),'the reference keeps the shared walker');

// A small LCG: the layouts are the same on every run.
let seed=0x2468ACE1;
const rnd=n=>{seed=(Math.imul(seed,1103515245)+12345)>>>0;return (seed>>>8)%n;};
const pick=list=>list[rnd(list.length)];
const W=24,H=20;
// A map of every tileset whose bank rule can take the lean path (no dungeon
// context or ferry, not tileset 10): the 192 metatile offset on either
// layer or on none, blank ground 0, the forest's 5-cell span. Tilesets 10,
// 17, 27 and 31 have dungeon contexts on every map; they and map 25 (16
// cells) keep the shared walker in both builds.
const MAPS=[131,16,128,57,256,67,22,64,169,150,76,110,74,146,103,113,89,178,437,25,21,17,100];

function setMap(m,map){
  const {ram}=m;ram.fill(0);
  ram.writeUInt16LE(map,0xDC);ram.writeUInt16LE(W*16,0xC0);ram.writeUInt16LE(H*16,0xC2);
  m.invoke('fl_ctx_load');
}
// A metatile set of the tileset (48-byte bitsets in the data bank, fl_inset).
function bitset(m,table,ts){
  const at=m.symbols.get(table)+ts*2,p=m.read(at)|m.read(at+1)<<8;
  const out=new Set();
  if(p)for(let meta=0;meta<384;meta++)if(m.read((at&0xFF0000)+p+(meta>>3))&(1<<(meta&7)))out.add(meta);
  return out;
}

test('the lean bank-shore walker answers lowObstacle exactly like the shared walker',t=>{
  let maps=0,lean=0,cells=0,bankCells=0,fastCycles=0,slowCycles=0,lows=0;
  for(const map of MAPS){
    setMap(fast,map);setMap(slow,map);
    // !fl_ts, !fl_ofs0/1 and !fl_mflags (FLIGHT_RAM $D900)
    const mflags=fast.ram.readUInt16LE(0xD910),ts=fast.ram.readUInt16LE(0xD908);
    const ofs=[fast.ram.readUInt16LE(0xD90C),fast.ram.readUInt16LE(0xD90E)];
    assert.equal(mflags,slow.ram.readUInt16LE(0xD910),`map ${map}: same context`);
    maps++;if(!(mflags&3)&&ts!==10)lean++;
    const bank=bitset(fast,'fl_cat_bank',ts),lily=bitset(fast,'fl_cat_lily',ts);
    for(let layout=0;layout<12;layout++){
      // tile ids by role (metatile = tile + the layer's offset, kept < 384)
      const ids=[];
      for(const l of [0,1]){
        const okMeta=meta=>meta>=ofs[l]&&meta-ofs[l]<256&&meta<384;
        const banks=[...bank].filter(okMeta),lilies=[...lily].filter(okMeta);
        const roles=[];
        for(let i=0;i<14;i++)if(banks.length)roles.push({tile:pick(banks)-ofs[l],role:'bank'});
        for(let i=0;i<4;i++)if(lilies.length)roles.push({tile:pick(lilies)-ofs[l],role:'lily'});
        for(let i=0;i<14;i++)roles.push({tile:rnd(Math.min(256,384-ofs[l])),role:'any'});
        roles.push({tile:0,role:'any'});
        ids.push(roles);
      }
      for(const m of [fast,slow]){
        const {ram}=m;
        // descriptors: mostly plain cells, with every special flag, behaviour and code
        for(const l of [0,1])for(let i=0;i<256;i++)ram.set([0,0,0,0],0x1B800+l*0x400+i*4);
      }
      const desc=[[],[]];
      for(const l of [0,1])for(const {tile,role} of ids[l]){
        const d={flags:pick([0,0,0,1,2,3,3,3,4,7,8,0x12,0x13,0x10,0x0B]),beh:pick([0,0,0,2,6,6,0x10,0x80,0x90,0x40,0x20]),
          code:role==='any'?pick([0,0,0,0x21,0x37,0xC1,0xC1,0x05,0x80,0x10,0x14,0x17,0x18,0x0F,0xFF]):pick([0,0,0,0,0x10,0x13,0x17]),
          rep:pick([0,0,1,0x40])};
        desc[l][tile]=d;
      }
      for(const m of [fast,slow]){
        const {ram}=m;
        for(const l of [0,1])for(const [tile,d] of desc[l].entries())if(d)ram.set([d.flags,d.beh,d.code,d.rep],0x1B800+l*0x400+tile*4);
      }
      const grid=[[],[]];
      for(const l of [0,1])for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++){
        const roles=ids[l],r=rnd(10);
        // runs of banks between shores make the walks long
        grid[l][ty*W+tx]=(r<6?pick(roles.filter(q=>q.role!=='any').concat(roles.slice(0,1))):pick(roles)).tile;
      }
      for(const m of [fast,slow]){
        const {ram}=m;
        for(const l of [0,1])for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++)ram[0x10000+l*0x4000+ty*128+tx]=grid[l][ty*W+tx];
      }
      for(const l of [0,1])for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++){
        const x=l*0x4000+ty*128+tx;
        const a=fast.invoke('fl_lowobs',{x}),b=slow.invoke('fl_lowobs',{x});
        cells++;
        const tile=grid[l][ty*W+tx],d=desc[l][tile]??{flags:0,beh:0,code:0};
        const isBank=!(d.flags&8)&&!(d.beh&0x90)&&(d.code===0&&bank.has(tile+ofs[l])||d.code>=0x10&&d.code<=0x17);
        if(isBank){bankCells++;fastCycles+=a.cycles;slowCycles+=b.cycles;}
        if(a.pass)lows++;
        assert.equal(a.pass,b.pass,JSON.stringify({map,ts,layout,layer:l,tx,ty,tile,d}));
        assert.equal(a.x,x,'tile index preserved');
      }
    }
  }
  t.diagnostic(`${maps} maps (${lean} on the lean path), ${cells} cells (${bankCells} bank cells, ${lows} low obstacles): bank cells ${Math.round(slowCycles/bankCells)} -> ${Math.round(fastCycles/bankCells)} CPU cycles each`);
  assert.equal(lean,19,'maps on the lean path');
});
