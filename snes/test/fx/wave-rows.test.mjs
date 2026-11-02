// fx_wave_rows (a left / right wave's edges behind the natives, a side at
// a time within its lines' room; fx.md "Sprites per line") against the
// two passes it replaces, assembled from the same tree with
// -DFX_EDGE_BUDGET_OFF=1: both run fx_wave_edges on the same synthetic FX
// state (resident cells, free palettes) and natives in OAM.
//   With room on every line: the same orb, the same edge sprites (OAM words,
//   positions, X bit 8) and the same count, for every style, facing,
//   length, half-width, taper, age and clipped position.
//   Among natives: the edges are those sprites less the far end of each
//   row (per row, the cells kept are the nearest the palms), and no line
//   that carries a native passes 34 slivers with them.
// FX_REFERENCE_ROM selects a prebuilt reference cartridge.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const reference=resolve(root,process.env.FX_REFERENCE_ROM??'.local/snes-test/wave-rows/reference.sfc');
if(!process.env.FX_REFERENCE_ROM){
  mkdirSync(resolve(root,'.local/snes-test/wave-rows'),{recursive:true});
  execFileSync(process.execPath,['snes/build.mjs','--strict','--quiet',
    `--out=${reference}`,'-DFX_EDGE_BUDGET_OFF=1'],{cwd:root,stdio:'pipe'});
}
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const index=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
  ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
const DP=0x1000,CUR=0x18;
const CURSOR=0x6E90,LIMIT=0x6E92,FRONT_N=0x6E94,FRONT=0x6EC0,FRONT_HI=0x6F00;

function machine(path){
  const rom=readFileSync(path),symbols=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8')
    .matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const at=n=>{assert(symbols.has(n),n);return symbols.get(n);};
  const r8=n=>rom[hiromToPc(n,rom.length)],r16=n=>rom.readUInt16LE(hiromToPc(n,rom.length));
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536),io=Buffer.alloc(0x10000);
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=index(a);if(r>=0)return ram[r];
    if((a>>>16&0x7F)<0x40&&(a&65535)<0x8000)return io[a&65535];
    return rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=index(a);if(r>=0){ram[r]=v;return;}
    const q=a&0xFFFF;
    assert([0x4202,0x4203,0x4204,0x4205,0x4206].includes(q),`unexpected write ${a.toString(16)}`);
    io[q]=v;
    if(q===0x4203)io.writeUInt16LE(io[0x4202]*v,0x4216);
    if(q===0x4206){const n=io.readUInt16LE(0x4204);io.writeUInt16LE(v?Math.floor(n/v):0xFFFF,0x4214);io.writeUInt16LE(v?n%v:n,0x4216);}
  }});
  const entry=at('fx_wave_edges');
  // A stamp group's cell at a frame and turn (fx_stamp_id + fx_stamp_cells).
  const stampCell=(group,frame,turn)=>{
    const frames=r8(at('fx_stamp_frames')+group),base=r16(at('fx_stamp_base')+group*2);
    const id=base+(frame%frames)*4+turn;
    return r16(at('fx_stamp_cells')+id*4)&0x1FF;
  };
  return {at,r16,run(c){
    ram.fill(0);sram.fill(0);io.fill(0);
    ram.fill(0xE0,0x800,0xA00);                 // hidden, X = $E0 (harmless)
    for(let i=0;i<128;i++)ram[0x800+i*4]=0xFF;
    const turn=r16(at('fx_dir_turn')+(c.dir&3)*2),gold=(c.style===2)?2:0;
    const cells=[stampCell(r16(at('fx_wave_edges_orb')+gold),4,turn),
      stampCell(r16(at('fx_wave_edges_spark')+gold),c.age>>1&1,turn),
      stampCell(r16(at('fx_wave_edges_arc')+gold),c.age>>1&1,turn)];
    sram.fill(0xFF,0x7840,0x7860);               // cache entries free, then ours
    cells.forEach((cell,e)=>{sram.writeUInt16LE(cell,0x7840+e*2);sram[0x7A54+(cell>>3)]|=1<<(cell&7);});
    sram.fill(0xFF,0x756C,0x75EC);               // no hints: the residency scan
    sram.fill(0xFF,0x7822,0x7829);               // classes without palettes yet
    sram.writeUInt16LE(0xFC,0x7820);             // OBJ palettes 2-7 free
    sram.writeUInt16LE(17,0x7884);               // fx frame
    // Natives below the cursor: {x, y, large}.
    for(const [i,n] of c.natives.entries()){
      ram[0x800+i*4]=n.x&255;ram[0x801+i*4]=n.y&255;ram[0x802+i*4]=0x40;ram[0x803+i*4]=0x31;
      ram[0xA00+(i>>2)]|=(n.large?2:0)<<((i&3)*2);
    }
    const cursor=c.natives.length*4;
    ram.writeUInt16LE(cursor,CURSOR);ram.writeUInt16LE(512,LIMIT);ram.writeUInt16LE(0,FRONT_N);
    const word=(off,v)=>ram.writeUInt16LE(v&65535,DP+off);
    word(0x0C,512-3);word(0x40,0xFFFF);word(0x42,0xFFFF);word(0x90,0xFFFF);word(0x44,0);word(0x46,0);word(0x94,0);
    word(CUR+0,0x80|c.style);word(CUR+2,c.x);word(CUR+4,c.y);word(CUR+6,c.dir&3);
    word(CUR+8,c.length);word(CUR+0xA,c.hw);word(CUR+0xC,c.taper);word(CUR+0xE,c.age);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([0,0,0,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
      assert(n<400000,'fx_wave_edges did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert(!cpu.m&&!cpu.x);
    const end=ram.readUInt16LE(CURSOR),edges=[];
    for(let off=cursor;off<end;off+=4){
      const slot=off>>2,hi=(ram[0xA00+(slot>>2)]>>((slot&3)*2))&3;
      edges.push({x:ram[0x800+off],y:ram[0x801+off],w:ram.readUInt16LE(0x802+off),hi});
    }
    const nf=ram.readUInt16LE(FRONT_N);
    return {edges,front:Buffer.from(ram.subarray(FRONT,FRONT+nf*4)).toString('hex')+'/'+Buffer.from(ram.subarray(FRONT_HI,FRONT_HI+nf*2)).toString('hex'),cycles};
  }};
}
const now=machine(path),old=machine(reference);
let seed=987654321;
const rnd=k=>{seed=(seed*1103515245+12345)>>>0;return (seed>>>8)%k;};
function randomWave(){
  const style=1+rnd(3),dir=rnd(5)===0?rnd(4):1+rnd(2);
  return {style,dir,x:rnd(320)-32,y:rnd(260)-18,length:rnd(5)===0?rnd(60):20+rnd(400),
    hw:rnd(4)===0?rnd(12):rnd(90),taper:[0,0,36,44,9,60,120][rnd(7)],age:rnd(300),natives:[]};
}
const key=e=>`${e.x},${e.y},${e.w.toString(16)},${e.hi}`;
const bag=list=>{const m=new Map();for(const e of list)m.set(key(e),(m.get(key(e))??0)+1);return m;};

test('with room on every line the edges are the two passes\' sprites',()=>{
  let compared=0,sprites=0,cyclesNow=0,cyclesOld=0;
  for(let k=0;k<1500;k++){
    const c=randomWave(),a=now.run(c),b=old.run(c);
    assert.equal(a.front,b.front,`orb ${JSON.stringify(c)}`);
    assert.deepEqual(bag(a.edges),bag(b.edges),`edges ${JSON.stringify(c)}`);
    compared++;sprites+=b.edges.length;
    if((c.dir&3)===1||(c.dir&3)===2){cyclesNow+=a.cycles;cyclesOld+=b.cycles;}
  }
  console.log(`${compared} waves, ${sprites} edge sprites; left / right waves: ${cyclesNow} CPU cycles against ${cyclesOld} for the two passes`);
});
// Lines (OAM Y space, 0-223) a sprite covers, with its on-screen columns.
function cover(lines,x,y,h,cols){for(let t=0;t<h;t++){const l=(y+t)&255;if(l<224)lines[l]=(lines[l]??0)+cols;}}
const columns=(x,size)=>{let n=0;for(let xx=x;xx<x+size;xx+=8)if(xx+8>0&&xx<256)n++;return n;};
test('among natives no line passes 34 slivers and each row loses its far end first',()=>{
  let dropped=0,cases=0;
  for(let k=0;k<1500;k++){
    const c=randomWave();c.dir=1+rnd(2);
    const n=rnd(40),cx=c.x;
    for(let i=0;i<n;i++)c.natives.push({x:rnd(240),y:(c.y-60+rnd(120))&255,large:rnd(12)===0});
    const a=now.run(c),b=old.run(c),want=bag(b.edges),got=bag(a.edges);
    for(const [k2,v] of got)assert(v<=(want.get(k2)??0),`not one of the passes' sprites: ${k2} ${JSON.stringify(c)}`);
    dropped+=b.edges.length-a.edges.length;cases++;
    // Rows: the kept sprites of each Y are the nearest the palms.
    const rows=new Map();
    for(const e of b.edges){const r=rows.get(e.y)??{all:[],kept:[]};r.all.push(e);rows.set(e.y,r);}
    for(const e of a.edges)rows.get(e.y).kept.push(e);
    const dist=e=>Math.abs(((e.hi&1)?e.x-256:e.x)+8-cx);
    for(const [y,r] of rows){
      const all=r.all.map(dist).sort((p,q)=>p-q),kept=r.kept.map(dist).sort((p,q)=>p-q);
      assert.deepEqual(kept,all.slice(0,kept.length),`row ${y} keeps a far cell: ${JSON.stringify(c)}`);
    }
    // Every line that carries a native: natives and the edges fit.
    const natives=[],withEdges=[];
    for(const nv of c.natives){const size=nv.large?32:16;cover(natives,nv.x,nv.y,size,columns(nv.x,size));cover(withEdges,nv.x,nv.y,size,columns(nv.x,size));}
    for(const e of a.edges){const x=(e.hi&1)?e.x-256:e.x;cover(withEdges,x,e.y,16,columns(x,16));}
    for(let l=0;l<224;l++)if(natives[l]&&natives[l]<=34)
      assert(withEdges[l]<=34,`line ${l}: ${natives[l]} native slivers, ${withEdges[l]} with the edges ${JSON.stringify(c)}`);
  }
  assert(dropped>0,'no edge cell was ever left out');
  console.log(`${cases} crowded waves, ${dropped} far edge cells left out`);
});
