// Compare fast field emission with the per-part clipping/placement path.
// OAM capacity and missing cells must never wrap a zero-length counter or
// hide a later resident piece while there is still room to display it.
// FX_EMITTER_BASELINE optionally supplies the previous ROM for run-level
// old/new differentials; SNES_ROM selects the current build as usual.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
function cartridge(path){
  const rom=readFileSync(path),sym=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
  const symbols=new Map([...sym.matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gm)]
    .map(m=>[m[3],parseInt(m[1]+m[2],16)]));
  const address=n=>{assert(symbols.has(n),n);return symbols.get(n);};
  const ptr=hiromToPc(address('fx_asm_ptr')),data=hiromToPc(address('fx_asm_data'));
  return {rom,address,ptr,data,count:(data-ptr)/2};
}
const current=cartridge(resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc'));
const baseline=process.env.FX_EMITTER_BASELINE?
  cartridge(resolve(root,process.env.FX_EMITTER_BASELINE)):null;
const {rom,address,ptr,data,count}=current;
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000;

function renderer(entryName,cart=current){
  const {rom,address,ptr,data}=cart;
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536),entry=address(entryName);
  const at=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=at(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=at(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;
  }});
  return ({id,a=id,x=128,y=112,dx=0,dy=0,step=16,cursor=0,limit=512,front=0,frontUsed=0,depth=0,size=0,missing=0})=>{
    ram.fill(0);sram.fill(0);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const offset=rom.readUInt16LE(ptr+id*2),record=data+offset,n=rom[record],cells=rom[record+1];
    const word=(off,v)=>ram.writeUInt16LE(v&65535,DP+off);
    word(0x14,x);word(0x16,y);word(0x38,dx);word(0x3A,dy);word(0x3E,depth);word(0x44,size);word(0x92,step);
    word(0x0C,Math.max(0,limit-Math.ceil(front/4)*16-3));
    word(0x0E,(address('fx_asm_data')+offset)&65535);ram[DP+0x10]=address('fx_asm_data')>>>16;
    word(0x84,n);word(0x86,offset+6+cells*2);
    for(let c=0;c<cells;c++)for(let flip=0;flip<4;flip++)
      word(0x54+c*8+flip*2,missing&(1<<c)?0xFFFF:0x3100+c*2+(flip<<14));
    ram.writeUInt16LE(cursor,0x6E90);ram.writeUInt16LE(limit,0x6E92);ram.writeUInt16LE(front,0x6E94);
    sram.writeUInt16LE(frontUsed,0x7896);
    cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([a,0,0,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let i=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;i++){
      assert(i<10000,`${entryName} did not return: ${JSON.stringify({id,cursor,limit,front,missing})}`);
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x);
    const end=ram.readUInt16LE(0x6E90),nf=ram.readUInt16LE(0x6E94);
    assert(end<=limit-Math.ceil(nf/4)*16,`OAM overflow ${end}/${limit}, ${nf} front`);
    return {cycles,result:{end,nf,fxFront:sram.readUInt16LE(0x7896),
      low:Buffer.from(ram.subarray(0x800,0x800+end)),high:Buffer.from(ram.subarray(0xA00,0xA20)),
      front:Buffer.from(ram.subarray(0x6EC0,0x6EC0+nf*4)),
      frontHigh:Buffer.from(ram.subarray(0x6F00,0x6F00+nf*2))}};
  };
}
const fast=renderer('fx_emit_place'),slow=renderer('fx_emit_slow');
function compare(input){
  const a=slow(input),b=fast(input);
  assert.deepEqual(b.result,a.result,JSON.stringify(input));return [a.cycles,b.cycles];
}
const ids=Array.from({length:count},(_,i)=>i).filter(i=>rom[data+rom.readUInt16LE(ptr+i*2)]>0);

test('the last available sprite slot is safe for every generated assembly',()=>{
  for(const id of ids)for(const free of [0,1,2,4])compare({id,cursor:512-free*4});
});
test('missing cells do not consume space needed by later resident pieces',()=>{
  for(const id of ids){
    const cells=rom[data+rom.readUInt16LE(ptr+id*2)+1];
    if(cells<2)continue;
    for(const missing of [1,(1<<cells)-2,(1<<cells)-1])
      for(const free of [1,2,4])compare({id,cursor:512-free*4,missing});
  }
});
test('screen edges, front reservations and large sprites match the general path',()=>{
  const sample=[...new Set([ids[0],...ids.filter((_,i)=>i%137===0)])];
  for(const id of sample)for(const [x,y] of [[-12,112],[0,0],[128,112],[255,223],[280,240]])
    for(const front of [0,1,4,11,12,15])for(const depth of [0,1])for(const size of [0,2]){
      const cursor=512-Math.ceil(front/4)*16-4;
      compare({id,x,y,front,frontUsed:front,depth,size,cursor});
    }
});

// A one-part run is equivalent to placing that part at each successive
// anchor. This reference deliberately has no run-specific edge shortcuts.
function runReference({id,a=1,x=128,y=112,dx=0,dy=0,step=16,cursor=0,limit=512,missing=0}){
  const offset=rom.readUInt16LE(ptr+id*2),record=data+offset,cells=rom[record+1];
  assert.equal(rom[record],1);assert.equal(cells,1);
  const part=record+8,px=rom[part]-128,py=rom[part+1]-128,flip=(rom[part+2]>>1)&3;
  const tile=0x3100+(flip<<14),endLimit=Math.max(0,limit-3);
  const low=Buffer.alloc(0x200),high=Buffer.alloc(0x20);
  for(let i=0;i<a;i++,x+=dx*step,y+=dy*step){
    const sx=x+px,sy=y+py;
    if(missing||sx<-15||sx>255||sy<-15||sy>223||cursor>=endLimit)continue;
    low.writeUInt16LE(((sy&255)<<8)|(sx&255),cursor);low.writeUInt16LE(tile,cursor+2);
    if(sx<0)high[cursor>>4]|=1<<(((cursor>>2)&3)*2);
    cursor+=4;
  }
  return {end:cursor,nf:0,fxFront:0,low:low.subarray(0,cursor),high,
    front:Buffer.alloc(0),frontHigh:Buffer.alloc(0)};
}
const onePartIds=ids.filter(id=>rom[data+rom.readUInt16LE(ptr+id*2)]===1);
const run=renderer('fx_emit_run'),previousRun=baseline&&renderer('fx_emit_run',baseline);
function compareRun(input){
  const after=run(input),label=JSON.stringify(input);
  assert.deepEqual(after.result,runReference(input),`run reference: ${label}`);
  if(!previousRun)return [0,after.cycles];
  const before=previousRun(input);
  assert.deepEqual(after.result,before.result,`previous ROM: ${label}`);
  return [before.cycles,after.cycles];
}
function runInput(id,vertical,along,direction,a=3){
  return {id,a,x:vertical?128:along,y:vertical?along:112,
    dx:vertical?0:direction,dy:vertical?direction:0,step:16};
}

test('one-part runs preserve exact along-edge clipping at both limits',t=>{
  let comparisons=0,before=0,after=0;
  for(const id of onePartIds)for(const vertical of [false,true]){
    const limit=vertical?223:255;
    for(const [along,direction,skip] of [
      [-16,1,true],[-16,-1,true],[-15,1,false],[-15,-1,false],
      [limit,1,false],[limit,-1,false],[limit+1,1,true],[limit+1,-1,true]
    ]){
      const cycles=compareRun(runInput(id,vertical,along,direction),skip);
      before+=cycles[0];after+=cycles[1];comparisons++;
    }
  }
  t.diagnostic(`${onePartIds.length} one-part assemblies, ${comparisons} edge runs`+
    (previousRun?`: ${before} -> ${after} CPU cycles`:''));
  if(previousRun)assert(after<=before,`one-part edge runs were slower: ${before} -> ${after}`);
});

test('one-part edge skips preserve missing-cell and OAM-full behavior',()=>{
  const sample=[...new Set(onePartIds.filter((_,i)=>i%47===0))];
  for(const id of sample)for(const vertical of [false,true]){
    const limit=vertical?223:255;
    for(const along of [-16,-15,limit,limit+1])for(const missing of [0,1])for(const cursor of [0,508])
      compareRun({...runInput(id,vertical,along,1,2),missing,cursor});
  }
});
