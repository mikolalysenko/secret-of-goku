// fx_lines_load (the wave edges' row budget, fx.md "Sprites per line")
// against an independent per-line model: the sprites below the OAM cursor
// and the front sprites other modules staged that cover any line of each
// band, in 16-pixel units (large: 2), with bands clipped to OAM lines
// 0-222, hidden ($E0) and wrapping sprites, slots past the cursor and FX's
// own front sprites left out. Also prints the crowded-field cost.
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
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000,TMP=0x4A,R0=0x88;      // !d_tmp, !d_r0 in the frame (module.asm)
const CURSOR=0x6E90,FRONT_N=0x6E94,FRONT=0x6EC0,FRONT_HI=0x6F00,FX_FRONT=0x7896;

function loader(){
  const entry=symbols.get('fx_lines_load');
  assert(entry!==undefined,'fx_lines_load (a build without FX_EDGE_BUDGET_OFF)');
  const ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const rindex=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&8191:-1;
  const writes=new Set();
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=rindex(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    assert(a>>>16!==0x31,`SRAM write ${a.toString(16)}`);
    const r=rindex(a);assert(r>=0,`unexpected write ${a.toString(16)}`);ram[r]=v;writes.add(r);
  }});
  return c=>{
    ram.fill(0);sram.fill(0);writes.clear();
    ram.set(c.low,0x800);ram.set(c.high,0xA00);ram.writeUInt16LE(c.cursor,CURSOR);
    ram.writeUInt16LE(c.frontN,FRONT_N);ram.set(c.front,FRONT);ram.set(c.frontHi,FRONT_HI);
    sram.writeUInt16LE(c.fxFront,FX_FRONT);
    for(const [k,v] of [[0,c.a],[2,c.ah],[4,c.b],[6,c.bh]])ram.writeUInt16LE(v&65535,DP+TMP+k);
    const before=Buffer.from(ram);
    cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([0,0,0,0x1FFD,entry&65535,DP]);ram.writeUInt16LE(0x6FFF,0x1FFE);
    let cycles=0;
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
      assert(n<100000,'fx_lines_load did not return');
      cpu.cyclesLeft=0;cpu.cycle();cycles+=cpu.cyclesLeft+1;
    }
    assert.equal(cpu.br[3],0x1FFF);assert.equal(cpu.br[5],DP);assert.equal(cpu.r[0],0x7E);
    assert(!cpu.m&&!cpu.x,'M16/X16 on return');
    // Only the frame's !d_tmp / !d_r0 and the stack below it may change.
    for(const r of writes){
      const ok=(r>=DP+TMP&&r<DP+TMP+8)||(r>=DP+R0&&r<DP+R0+8)||(r>=0x1F00&&r<0x2000);
      assert(ok||ram[r]===before[r],`write to ${r.toString(16)}`);
    }
    return {na:ram.readUInt16LE(DP+R0),nb:ram.readUInt16LE(DP+R0+2),cycles};
  };
}
// The model: a sprite at OAM Y covers lines (Y + t) & 255, t < 16 (32 when
// large); a band is its lines from max(first, 0) to min(first + h, 223).
function model(c){
  const band=(first,h)=>{const lo=Math.max(first,0),hi=Math.min(first+h,223);return [lo,hi];};
  const bands=[band(c.a,c.ah),band(c.b,c.bh)],n=[0,0];
  const count=(y,large)=>{
    const h=large?32:16;
    bands.forEach(([lo,hi],k)=>{
      for(let t=0;t<h;t++){const l=(y+t)&255;if(l>=lo&&l<hi){n[k]+=large?2:1;break;}}
    });
  };
  for(let i=0;i*4<c.cursor;i++)count(c.low[i*4+1],(c.high[i>>2]>>((i&3)*2+1))&1);
  for(let i=0;i<c.frontN-c.fxFront;i++)count(c.front[i*4+1],(c.frontHi[i*2]>>1)&1);
  return {na:n[0],nb:n[1]};
}
let seed=12345;
const rnd=k=>{seed=(seed*1103515245+12345)>>>0;return (seed>>>8)%k;};
function randomCase(){
  const low=Buffer.alloc(512),high=Buffer.alloc(32),front=Buffer.alloc(64),frontHi=Buffer.alloc(32);
  const y=()=>{const r=rnd(10);return r<5?rnd(224):r<7?0xE0:r<8?224+rnd(32):rnd(256);};
  for(let i=0;i<128;i++){low[i*4]=rnd(256);low[i*4+1]=y();low[i*4+2]=rnd(256);low[i*4+3]=rnd(256);}
  for(let i=0;i<32;i++)high[i]=rnd(256);
  const frontN=rnd(17),fxFront=rnd(frontN+1);
  for(let i=0;i<16;i++){front[i*4+1]=y();front[i*4]=rnd(256);frontHi.writeUInt16LE(rnd(4),i*2);}
  const first=()=>rnd(320)-60,h=()=>rnd(5)===0?0:rnd(200);
  return {low,high,front,frontHi,frontN,fxFront,cursor:rnd(129)*4,a:first(),ah:h(),b:first(),bh:h()};
}
const run=loader();

test('sprites on each band match the per-line model',()=>{
  for(let k=0;k<3000;k++){
    const c=randomCase(),got=run(c),want=model(c);
    assert.deepEqual({na:got.na,nb:got.nb},want,JSON.stringify({k,cursor:c.cursor,a:c.a,ah:c.ah,b:c.b,bh:c.bh,frontN:c.frontN,fxFront:c.fxFront}));
  }
});
test('band edges, the screen edges and the wrap',()=>{
  for(const y of [0,1,14,15,16,17,30,31,32,100,206,207,208,222,223,224,239,240,241,250,255])
    for(const large of [0,1])for(const [a,ah] of [[0,1],[0,17],[-16,17],[-17,17],[100,17],[110,1],[206,17],[222,1],[223,17],[230,17],[-40,300]]){
      const low=Buffer.alloc(512,0xE0),high=Buffer.alloc(32);
      low[1]=y;high[0]=large?2:0;
      const c={low,high,front:Buffer.alloc(64),frontHi:Buffer.alloc(32),frontN:0,fxFront:0,cursor:4,a,ah,b:a,bh:0};
      assert.deepEqual((({na,nb})=>({na,nb}))(run(c)),model(c),JSON.stringify({y,large,a,ah}));
    }
});
test('a crowded field: two edge bands among 36 sprites',()=>{
  const low=Buffer.alloc(512,0xE0),high=Buffer.alloc(32);
  for(let i=0;i<36;i++)low[i*4+1]=60+((i*37)%110);
  const front=Buffer.alloc(64),frontHi=Buffer.alloc(32);front[1]=96;
  const c={low,high,front,frontHi,frontN:2,fxFront:1,cursor:36*4,a:85,ah:17,b:97,bh:17};
  const r=run(c);
  assert.deepEqual({na:r.na,nb:r.nb},model(c));
  console.log(`fx_lines_load, 36 sprites and one staged, two bands: ${r.cycles} CPU cycles`);
  assert(r.cycles<2000,`${r.cycles} cycles`);
});
