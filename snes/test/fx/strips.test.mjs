// Execute the cartridge's HDMA builder and compare every visible scanline
// with the generated strip art, including clipping and transparent gaps.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {hiromToPc} from '../../tools/w65816.mjs';

const root=resolve(import.meta.dirname,'../../..');
const path=resolve(root,process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const source=readFileSync(path),text=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
const symbols=new Map([...text.matchAll(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)$/gm)]
  .map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const at=name=>{assert(symbols.has(name),name);return symbols.get(name);};
const context=vm.createContext({Uint8Array,Uint16Array,Math});
vm.runInContext(readFileSync(resolve(root,'vendor/snes/cpu.js'),'utf8'),context);
const DP=0x1000,BACKDROP=0x1234;

function renderer(synthetic=false){
  const rom=Buffer.from(source),ram=Buffer.alloc(0x20000),sram=Buffer.alloc(65536);
  const ptr=hiromToPc(at('fx_strip_ptr')),data=hiromToPc(at('fx_strip_data'));
  if(synthetic){
    rom.writeUInt16LE(0,ptr);
    rom.set([0xFD,8,4,0,2,2,4,0,6,3,8,0],data);
  }
  const rindex=a=>(a>>>16)===0x7E?a&65535:(a>>>16)===0x7F?0x10000+(a&65535):
    ((a>>>16)&0x7F)<0x40&&(a&65535)<0x2000?a&0x1FFF:-1;
  const cpu=new context.Cpu({cpuRead:a=>{
    if(a>>>16===0x31)return sram[a&65535];
    const r=rindex(a);return r>=0?ram[r]:rom[hiromToPc(a,rom.length)];
  },cpuWrite:(a,v)=>{
    if(a>>>16===0x31){sram[a&65535]=v;return;}
    const r=rindex(a);assert(r>=0,`unexpected hardware write ${a.toString(16)}`);ram[r]=v;
  }});
  const word=(off,v)=>ram.writeUInt16LE(v&65535,DP+off);
  const table=(start,bytes)=>{
    const out=[];let p=start;
    while(out.length<224){
      const n=sram[p++];assert(n>0&&n<128,'run must cover visible rows without repeat mode');
      const value=sram.readUInt16LE(p+(bytes===4?2:0));
      for(let j=0;j<n;j++)out.push(value);
      p+=bytes;assert(p<=0x7A8E+185,'HDMA back-buffer overflow');
    }
    return out.slice(0,224);
  };
  return (index,x,y,len)=>{
    ram.fill(0);sram.fill(0);cpu.reset();cpu.e=false;cpu.m=false;cpu.x=false;
    const entry=at('fx_poly_rows');cpu.r[0]=0x7E;cpu.r[1]=entry>>>16;
    cpu.br.set([index,0,0,0x1FFD,entry&65535,DP]);
    ram.writeUInt16LE(0x6FFF,0x1FFE);ram.writeUInt16LE(BACKDROP,0x600);
    sram.writeUInt16LE(0xFFFF,0x7A5A);
    word(0x18,0x80);word(0x1A,x);word(0x1C,y);word(0x1E,index&1?2:1);
    word(0x58,len);word(0x5A,7);word(0x5C,0);
    const cls=index<28?0:index<56?32:index<84?96:32;
    word(0x36,cls);
    for(let n=0;cpu.br[4]!==0x7000||cpu.r[1]!==entry>>>16;n++){
      assert(n<15000,'strip builder did not return');cpu.cyclesLeft=0;cpu.cycle();
    }
    assert.equal(cpu.c,false);assert.equal(cpu.br[3],0x1FFF);
    assert.equal(sram.readUInt16LE(0x788E),2,'polygon requested');
    const rec=data+rom.readUInt16LE(ptr+index*2),first=y+(rom[rec]<<24>>24),rows=[];
    for(let i=0;i<rom[rec+2];i++){
      const end=rom[rec+4+i*2],colour=rom[rec+5+i*2];
      while(rows.length<end)rows.push(colour);
    }
    assert.equal(rows.length,rom[rec+1]);
    const lo=index&1?x-len+1:x,hi=index&1?x:x+len-1;
    const span=hi<0||lo>255||lo>hi?0xFF:Math.max(0,lo)|(Math.min(255,hi)<<8);
    const colours=[],windows=[],palette=hiromToPc(at('fx_class_palettes'))+cls;
    for(let line=0;line<224;line++){
      const c=rows[line-first]??0;
      colours.push(c?rom.readUInt16LE(palette+c*2):BACKDROP);
      windows.push(c?span:0xFF);
    }
    const why=JSON.stringify({index,x,y,len,synthetic});
    assert.deepEqual(table(sram.readUInt16LE(0x7A3C),4),colours,'colours '+why);
    assert.deepEqual(table(sram.readUInt16LE(0x7A3A),2),windows,'windows '+why);
  };
}

test('all beam-strip records produce exact clipped colour and window scanlines',()=>{
  const draw=renderer();
  for(let i=0;i<88;i++)for(const x of [-180,-1,0,128,255,300])
    for(const y of [-40,-3,0,1,112,220,223,240])draw(i,x,y,160);
  for(const len of [1,16,127,256,640])for(const i of [0,1,26,27,84,85,86,87])draw(i,128,112,len);
});
test('transparent strip runs retain gaps at the top and bottom clipping edges',()=>{
  const draw=renderer(true);
  for(const y of [-10,-3,0,1,112,220,223,240])draw(0,40,y,160);
});
