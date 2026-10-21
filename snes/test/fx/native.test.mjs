// The cache yields the entries the game's actor streamer writes or shows
// (fx/native.asm, fx.md "Native effect cells"). Runs the assembled code and
// checks its model against the original streamer's code in the ROM.
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
const DP=0x1000,FX=0x7800;
const CELL=0x40,USED=0x60,PENDING=0x80,BUDGET=0x82,FRAME=0x84,FAIL=0x228,DIRTY=0x242,BITS=0x254;
const NATIVE=at('fx_native_address')&65535,STAMP=NATIVE-2;
const HASH=at('fx_hash_address')&65535,HASH_SIZE=at('fx_hash_size');
const tile=i=>rom.readUInt16LE(hiromToPc(at('fx_entry_tile'))+i*2);
const vramOf=i=>rom.readUInt16LE(hiromToPc(at('fx_entry_vram'))+i*2);
const C1=a=>0x010000+(a&0xFFFF);

// The model: piece k of a slot streams while its cell count (+$84) is at
// least 2k-1; the fifth also on a request (+$8D) or while its weapon effect
// runs (+$61). Slot 5 pieces 1-4 cover entries 0 / 1-2 / 3-4 / 5-6, slots 1
// and 2 pieces 4-5 cover entries 7-8 / 9-10 and 11-12 / 13-14.
const slot5=({c5=0})=>(c5>=1?0x0001:0)|(c5>=3?0x0006:0)|(c5>=5?0x0018:0)|(c5>=7?0x0060:0);
const slots12=({c1=0,c2=0,r1=0,r2=0,e1=0,e2=0})=>(c1>=7?0x0180:0)|(c1>=9||r1||e1?0x0600:0)|(c2>=7?0x1800:0)|(c2>=9||r2||e2?0x6000:0);
const model=f=>slot5(f)|slots12(f);
// The streamer runs phase $56: slot 5's pieces in phase 2, slots 1 and 2's
// in phase 4. A frame drops slot 5's in phases 1-2 (its own vblank, or a
// lag vblank of the next frame) and slots 1-2's in phase 4.
const dropped=(f,phase)=>[1,2].includes(phase)?slot5(f):phase===4?slots12(f):0;
const FIELDS={c5:0xEA84,c1:0xE284,c2:0xE484,r1:0xE28D,r2:0xE48D,e1:0xE261,e2:0xE461};

function machine(){
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const rindex=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    if(a>>>16===0x33)return 0;
    const r=rindex(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=rindex(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  const word=(off,v)=>sram.writeUInt16LE(v,FX+off);
  const read=off=>sram.readUInt16LE(FX+off);
  sram.fill(255,FX+CELL,FX+USED);
  sram.fill(255,FX+0x22,FX+0x29);
  sram.fill(255,HASH,HASH+HASH_SIZE);
  sram.writeUInt16LE(0xFFFF,STAMP);
  word(FRAME,17);word(0x20,0xFC);
  function resident(slot,cell,age=0){
    word(CELL+slot*2,cell);word(USED+slot*2,age);
    sram[FX+BITS+(cell>>3)]|=1<<(cell&7);
    sram[HASH+(cell&(HASH_SIZE-1))]=slot*2;
    word(DIRTY,1);
  }
  // High bytes of the request/effect words hold unrelated fields.
  function native(fields){
    for(const [k,a] of Object.entries(FIELDS)){ram[a]=fields[k]??0;ram[a+1]=0xA5;}
  }
  // JSR/RTS routines return to $7000 of their own bank; RTL routines too.
  function call(name,a=0,x=0,long=false){
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const entry=at(name);cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    if(long){ram.writeUInt16LE(0x6FFF,0x1FFD);ram[0x1FFF]=entry>>>16;}
    else ram.writeUInt16LE(0x6FFF,0x1FFE);
    cpu.br.set([a,x,0xBEEF,long?0x1FFC:0x1FFD,entry&65535,long?0:DP]);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
      assert(n<20000,`${name} did not return`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x);
    return {a:cpu.br[0],x:cpu.br[1],y:cpu.br[2],carry:cpu.c,cycles};
  }
  return {ram,sram,word,read,resident,native,call};
}

test('the ROM streams the entries and phases the model claims',()=>{
  // Every VRAM batch of the original streamer (C1:950D): LDA #vram / STA
  // $2116, gated by the closest preceding long load of a count (+$84).
  const seen=new Map();
  let count=null;
  for(let i=0x01950D;i<0x01B000;i++){
    if(rom[i]===0xAF&&rom[i+3]===0x7E)count=rom[i+1]|(rom[i+2]<<8);
    if(rom[i]===0xA9&&rom[i+3]===0x8D&&rom[i+4]===0x16&&rom[i+5]===0x21){
      const v=rom[i+1]|(rom[i+2]<<8);
      for(let e=0;e<15;e++){
        const top=vramOf(e),hit=[top,top+0x100].some(w=>w>=v&&w<v+0x40);
        if(hit)seen.set(e,[...(seen.get(e)??[]),{vram:v,count,at:i}]);
      }
    }
  }
  const slotOf={0xEA84:5,0xE284:1,0xE484:2};
  const pieces={5:[0x7200,0x7240,0x7280,0x72C0,0x7400],1:[0x7680,0x76C0,0x7800,0x7840,0x7880],2:[0x78C0,0x7A00,0x7A40,0x7A80,0x7AC0]};
  for(let e=0;e<15;e++){
    const batches=seen.get(e);
    assert(batches?.length,`entry ${e} is not in any native effect piece (model out of date)`);
    for(const b of batches)assert(b.count in slotOf,`entry ${e}: VRAM $${b.vram.toString(16)} gated by $7E:${b.count?.toString(16)}`);
    const b=batches[0],slot=slotOf[b.count],k=pieces[slot].indexOf(b.vram)+1;
    assert(k>0,`entry ${e}: unexpected piece address $${b.vram.toString(16)}`);
    const one=n=>slot===5?{c5:n}:slot===1?{c1:n}:{c2:n};
    assert((model(one(2*k-1))>>e)&1,`entry ${e}: slot ${slot} piece ${k} at ${2*k-1} cells not claimed`);
    assert(!((model(one(2*k-2))>>e)&1),`entry ${e}: claimed below ${2*k-1} cells`);
  }
  // Each piece after the first sits behind two DEX gates: 2k-1 cells.
  for(const p of [0x01A81C,0x01A877,0x01A8D2,0x019AE7,0x019CC0])
    assert.deepEqual([...rom.subarray(p-9,p)],[0xCA,0xD0,0x03,0x82,rom[p-5],rom[p-4],0xCA,0xF0,0xFA]);
  // The fifth piece's request is consumed by the streamer, which then
  // streams it: C1:9B91 (slot 1) and C1:9D6A (slot 2) end with BRL to it.
  for(const [at8d,slotHi,piece5] of [[0x019B91,0xE2,0x9B3F],[0x019D6A,0xE4,0x9D18]]){
    assert.deepEqual([...rom.subarray(at8d,at8d+4)],[0xAF,0x8D,slotHi,0x7E]);
    const brl=at8d+16;assert.equal(rom[brl],0x82);
    assert.equal((brl+3+rom.readInt16LE(brl+1))&0xFFFF,piece5);
  }
  // Phases: C1:9530 LDA $56 / ASL / TAX, then JMP (table,X) by mode. Phase 4
  // is C1:99CB (slots 1 and 2's effects) in all three tables; slot 5's
  // effect (C1:A7B6) follows its body in mode B's phase 2 (C1:A58B) and is
  // mode C's phase 2 branch (C1:9574 sets X = $0A00, then BRL $A7B6).
  assert.deepEqual([...rom.subarray(C1(0x9530),C1(0x9530)+5)],[0xAD,0x56,0x00,0x0A,0xAA]);
  const table=(t,i)=>rom.readUInt16LE(C1(t)+i*2);
  for(const t of [0x955C,0x9548,0x9552])assert.equal(table(t,4),0x99CB);
  assert.equal(table(0x9548,2),0xA58B);assert.equal(table(0x9552,2),0x9574);
  assert.deepEqual([...rom.subarray(C1(0x9576),C1(0x9576)+3)],[0xA2,0x00,0x0A]);
  assert.equal((0x95A6+rom.readInt16LE(C1(0x95A4)))&0xFFFF,0xA7B6);
  // Phase 4's slots: no other count gates a batch between C1:99CB and the RTL.
  const gates=[];for(let i=C1(0x99CB);i<C1(0x9D7F);i++)if(rom[i]===0xAF&&rom[i+3]===0x7E&&rom[i+1]===0x84)gates.push(rom[i+2]);
  assert.deepEqual([...new Set(gates)],[0xE2,0xE4]);
  // The field loop advances $56 only after its frame's vblank (C0:B077 TSB
  // $EC, wait, then INC mod 5): lag vblanks stream the same phase.
  assert.deepEqual([...rom.subarray(0x00B077,0x00B08A)],[0x04,0xEC,0x24,0xEC,0xD0,0xFC,0xA5,0x56,0x1A,0x85,0x56,0xC9,0x05,0x90,0x04,0xA9,0x00,0x85,0x56]);
});

test('the claim mask follows counts, requests and running effects',t=>{
  let cycles=0,n=0;
  const values={c5:[0,1,2,3,4,5,6,7,8,9,255],c1:[0,6,7,8,9,255],c2:[0,6,7,8,9,255],r:[0,1],e:[0,1]};
  for(const c5 of values.c5)for(const c1 of values.c1)for(const c2 of values.c2)
    for(const r1 of values.r)for(const r2 of values.r)for(const e1 of values.e)for(const e2 of values.e){
      const f={c5,c1,c2,r1,r2,e1,e2},m=machine();m.native(f);
      const r=m.call('fx_native_mask');
      assert.equal(r.a,model(f),JSON.stringify(f));
      assert.equal(m.sram.readUInt16LE(NATIVE),model(f));
      cycles+=r.cycles;n++;
    }
  const m=machine();m.native({c5:3});
  const first=m.call('fx_native_mask');
  m.native({});
  const again=m.call('fx_native_mask');
  assert.equal(again.a,7,'the mask is computed once per FX frame');
  m.word(FRAME,18);assert.equal(m.call('fx_native_mask').a,0);
  t.diagnostic(`claim mask on an allocation: ${Math.round(cycles/n)} CPU cycles on average, ${again.cycles} cached`);
});

test('every frame drops the cells of the phases it streams, and only those',t=>{
  const costs=[];
  const cases=[{c5:1},{c5:3},{c5:7},{c1:7},{e1:1},{c2:9},{r2:1},{c5:5,e2:1},{c1:9,c2:8,c5:2}];
  for(let phase=0;phase<5;phase++){
    for(const f of cases){
      const m=machine();
      for(let i=0;i<15;i++)m.resident(i,100+i,1);
      m.word(CELL+4*2,0x8123);          // a UI lease
      m.word(CELL+6*2,0xFFFE);          // a region FX does not hold
      m.word(PENDING,0x7FFF);m.word(FAIL,0x5555);
      m.native(f);
      m.call('fx_native_drop',phase);
      const gone=dropped(f,phase);
      for(let i=0;i<15;i++){
        const out=(gone>>i)&1,was=i===4?0x8123:i===6?0xFFFE:100+i;
        assert.equal(m.read(CELL+i*2),out&&i!==6?0xFFFF:was,`entry ${i}, phase ${phase}, ${JSON.stringify(f)}`);
        if(i!==4&&i!==6){
          const bit=(m.sram[FX+BITS+((100+i)>>3)]>>((100+i)&7))&1;
          assert.equal(bit,out?0:1,`residency of entry ${i}`);
        }
      }
      const kept=~gone|0x0040;          // the unheld entry keeps its bits
      assert.equal(m.read(PENDING),0x7FFF&kept);
      assert.equal(m.read(FAIL),0x5555&kept);
    }
    const idle=machine();idle.native({});costs.push(idle.call('fx_native_drop',phase).cycles);
  }
  t.diagnostic(`frame drop check with no claim, phases 0-4: ${costs.join(', ')} CPU cycles`);
});

test('neither FX nor UI leases allocate a claimed entry',()=>{
  for(const [f,first] of [[{c5:1},1],[{c5:3},3],[{c5:7},7],[{c5:7,c1:7},9],[{c5:7,c1:9},11],[{c5:7,c1:9,c2:7},13],[{e1:1},0],[{c5:7,e1:1},7]]){
    const m=machine();
    m.native(f);m.word(BUDGET,1);
    const got=m.call('fx_cache_get',300);
    assert(!got.carry);assert.equal(got.a&0x1FF,tile(first),JSON.stringify(f));
    assert.equal(m.read(CELL+first*2),300);
    const ui=machine();
    ui.native(f);
    const lease=ui.call('fx_overlay_cell',0x8001,1,true);
    assert(!lease.carry);assert.equal(lease.x,first*2,`UI lease, ${JSON.stringify(f)}`);
  }
  const full=machine();full.native({c5:9,c1:9,c2:9});
  full.word(BUDGET,1);
  assert(full.call('fx_cache_get',300).carry,'every entry is the game\'s: nothing may be allocated');
  assert(full.call('fx_overlay_cell',0x8001,1,true).carry);
});
