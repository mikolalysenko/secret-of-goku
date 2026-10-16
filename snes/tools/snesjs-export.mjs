#!/usr/bin/env node
// Converts a private SnesJs probe state (browser mod, .local/**.json) into an
// import bundle for Mesen tests: the state is advanced in the vendored core
// until the field main loop waits for NMI (C0:B079), then WRAM, VRAM, CGRAM,
// OAM, SRAM, APU RAM/DSP and the register file are written to <outDir>.
// snes/test/lua/harness.lua's H.importSnesJs(<outDir>) applies the bundle to a
// running cartridge that is itself waiting at C0:B079.
//   node snes/tools/snesjs-export.mjs <state.json> <outDir>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..');
const {restore,hash}=await import(resolve(repo,'engine/state.js'));

export function loadCore(rom){
  const context={console,Uint8Array,Uint16Array,Int8Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math,Map,clearArray:a=>a.fill(0),log:()=>{},getByteRep:x=>x.toString(16),getWordRep:x=>x.toString(16),getLongRep:x=>x.toString(16)};
  vm.createContext(context);
  for(const name of['cart','dsp','spc','apu','pipu','cpu','snes'])vm.runInContext(readFileSync(resolve(repo,`vendor/snes/${name}.js`),'utf8'),context);
  const snes=new context.Snes();snes.loadRom(rom,true);snes.reset(true);return snes;
}
// The bus starts the next CPU instruction when cpuCyclesLeft reaches 0.
const atWait=s=>s.cpuCyclesLeft===0&&!s.dmaBusy&&!(s.hdmaTimer>0)&&!s.cpu.waiting&&(s.cpu.r[1]&0x3f)===0&&s.cpu.br[4]===0xB079;

export function exportState(statePath,outDir,{rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc'))),maxSteps=4e6}={}){
  const st=JSON.parse(readFileSync(statePath,'utf8'));
  if(st.format!=='SnesJs-probe-v1')throw Error('not a SnesJs probe state');
  const s=loadCore(rom);
  restore(s,{...st,romHash:hash(s.cart.data)});
  let steps=0;
  while(!atWait(s)){if(++steps>maxSteps)throw Error('field wait loop (C0:B079) not reached; not a field state?');s.cycle(false);}
  // The APU runs lazily; bring it up to the same instant before capture.
  if(typeof s.catchUpApu==='function')s.catchUpApu();
  mkdirSync(outDir,{recursive:true});
  const p=s.ppu,a=s.apu,spc=a.spc;
  const w=(name,bytes)=>writeFileSync(resolve(outDir,name),Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));
  w('wram.bin',s.ram);
  const vram=new Uint8Array(0x10000);for(let i=0;i<0x8000;i++){vram[i*2]=p.vram[i]&255;vram[i*2+1]=p.vram[i]>>8;}w('vram.bin',vram);
  const cgram=new Uint8Array(512);for(let i=0;i<256;i++){cgram[i*2]=p.cgram[i]&255;cgram[i*2+1]=p.cgram[i]>>8;}w('cgram.bin',cgram);
  const oam=new Uint8Array(544);for(let i=0;i<256;i++){oam[i*2]=p.oam[i]&255;oam[i*2+1]=p.oam[i]>>8;}for(let i=0;i<16;i++){oam[512+i*2]=p.highOam[i]&255;oam[512+i*2+1]=p.highOam[i]>>8;}w('oam.bin',oam);
  w('sram.bin',s.cart.sram);
  w('aram.bin',a.ram);
  w('dsp.bin',a.dsp.ram);
  // PPU register writes ($21xx), in an order that leaves latches consistent.
  const b=v=>v?1:0,ppu=[];
  const reg=(r,v)=>ppu.push([r,v&255]);
  reg(0x2100,(b(p.forcedBlank)<<7)|p.brightness);
  reg(0x2101,(p.sprAdr1>>13)|((p.sprAdr2>>9)-8)|(p.objSize<<5));
  reg(0x2105,p.mode|(b(p.layer3Prio)<<3)|(b(p.bigTiles[0])<<4)|(b(p.bigTiles[1])<<5)|(b(p.bigTiles[2])<<6)|(b(p.bigTiles[3])<<7));
  reg(0x2106,b(p.mosaicEnabled[0])|(b(p.mosaicEnabled[1])<<1)|(b(p.mosaicEnabled[2])<<2)|(b(p.mosaicEnabled[3])<<3)|((p.mosaicSize-1)<<4));
  for(let i=0;i<4;i++)reg(0x2107+i,(p.tilemapAdr[i]>>8)|b(p.tilemapWider[i])|(b(p.tilemapHigher[i])<<1));
  reg(0x210B,(p.tileAdr[0]>>12)|((p.tileAdr[1]>>12)<<4));
  reg(0x210C,(p.tileAdr[2]>>12)|((p.tileAdr[3]>>12)<<4));
  for(let i=0;i<4;i++){
    let h=p.bgHoff[i],v=p.bgVoff[i];
    if(i===0&&p.mode===7){h=p.mode7Hoff&0x1fff;v=p.mode7Voff&0x1fff;}
    reg(0x210D+i*2,h);reg(0x210D+i*2,h>>8);reg(0x210E+i*2,v);reg(0x210E+i*2,v>>8);
  }
  reg(0x211A,(b(p.mode7LargeField)<<7)|(b(p.mode7Char0fill)<<6)|(b(p.mode7FlipY)<<1)|b(p.mode7FlipX));
  for(const[r,v]of[[0x211B,p.mode7A],[0x211C,p.mode7B],[0x211D,p.mode7C],[0x211E,p.mode7D],[0x211F,p.mode7X],[0x2120,p.mode7Y]]){reg(r,v);reg(r,v>>8);}
  const win=(i,j)=>b(p.window1Inversed[i])|(b(p.window1Enabled[i])<<1)|(b(p.window2Inversed[i])<<2)|(b(p.window2Enabled[i])<<3)|(b(p.window1Inversed[j])<<4)|(b(p.window1Enabled[j])<<5)|(b(p.window2Inversed[j])<<6)|(b(p.window2Enabled[j])<<7);
  reg(0x2123,win(0,1));reg(0x2124,win(2,3));reg(0x2125,win(4,5));
  reg(0x2126,p.window1Left);reg(0x2127,p.window1Right);reg(0x2128,p.window2Left);reg(0x2129,p.window2Right);
  reg(0x212A,p.windowMaskLogic[0]|(p.windowMaskLogic[1]<<2)|(p.windowMaskLogic[2]<<4)|(p.windowMaskLogic[3]<<6));
  reg(0x212B,p.windowMaskLogic[4]|(p.windowMaskLogic[5]<<2));
  const bits=arr=>{let v=0;for(let i=0;i<5;i++)if(arr[i])v|=1<<i;return v;};
  reg(0x212C,bits(p.mainScreenEnabled));reg(0x212D,bits(p.subScreenEnabled));
  reg(0x212E,bits(p.mainScreenWindow));reg(0x212F,bits(p.subScreenWindow));
  reg(0x2130,(p.colorClip<<6)|(p.preventMath<<4)|(b(p.addSub)<<1)|b(p.directColor));
  let m=0;for(let i=0;i<6;i++)if(p.mathEnabled[i])m|=1<<i;
  reg(0x2131,(b(p.subtractColors)<<7)|(b(p.halfColors)<<6)|m);
  reg(0x2132,0x20|p.fixedColorR);reg(0x2132,0x40|p.fixedColorG);reg(0x2132,0x80|p.fixedColorB);
  reg(0x2133,(b(p.mode7ExBg)<<6)|(b(p.pseudoHires)<<3)|(b(p.overscan)<<2)|(b(p.objInterlace)<<1)|b(p.interlace));
  const vinc=p.vramInc===1?0:p.vramInc===32?1:p.vramInc===128?3:0;
  reg(0x2115,vinc|(p.vramRemap<<2)|(b(p.vramIncOnHigh)<<7));
  reg(0x2116,p.vramAdr);reg(0x2117,p.vramAdr>>8);
  reg(0x2121,p.cgramAdr);
  reg(0x2102,p.oamRegAdr);reg(0x2103,b(p.oamRegInHigh)|(b(p.objPriority)<<7));
  // CPU-side registers.
  const cpu=[];
  const creg=(r,v)=>cpu.push([r,v&255]);
  for(let c=0;c<8;c++){
    const base=0x4300+c*16;
    creg(base,s.dmaMode[c]|(b(s.dmaFixed[c])<<3)|(b(s.dmaDec[c])<<4)|(b(s.dmaUnusedBit[c])<<5)|(b(s.hdmaInd[c])<<6)|(b(s.dmaFromB[c])<<7));
    creg(base+1,s.dmaBadr[c]);creg(base+2,s.dmaAadr[c]);creg(base+3,s.dmaAadr[c]>>8);creg(base+4,s.dmaAadrBank[c]);
    creg(base+5,s.dmaSize[c]);creg(base+6,s.dmaSize[c]>>8);creg(base+7,s.hdmaIndBank[c]);
    creg(base+8,s.hdmaTableAdr[c]);creg(base+9,s.hdmaTableAdr[c]>>8);creg(base+10,s.hdmaRepCount[c]);
  }
  creg(0x4207,s.hTimer);creg(0x4208,s.hTimer>>8);creg(0x4209,s.vTimer);creg(0x420A,s.vTimer>>8);
  let hdma=0;for(let c=0;c<8;c++)if(s.hdmaActive[c])hdma|=1<<c;
  creg(0x420C,hdma);creg(0x420D,b(s.fastMem));
  creg(0x4200,(b(s.nmiEnabled)<<7)|(b(s.vIrqEnabled)<<5)|(b(s.hIrqEnabled)<<4)|b(s.autoJoyRead));
  const c=s.cpu;
  const P=(c.n?0x80:0)|(c.v?0x40:0)|(c.m?0x20:0)|(c.x?0x10:0)|(c.d?0x08:0)|(c.i?0x04:0)|(c.z?0x02:0)|(c.c?0x01:0);
  const regs={
    source:statePath,steps,
    cpu:{a:c.br[0],x:c.br[1],y:c.br[2],sp:c.br[3],pc:c.br[4],d:c.br[5],dbr:c.r[0],k:c.r[1],ps:P,e:!!c.e},
    ppu,io:cpu,
    spc:{a:spc.r[0],x:spc.r[1],y:spc.r[2],sp:spc.r[3],pc:spc.br[0],ps:spc.getP(),
      cpuToApu:[...a.spcReadPorts.slice(0,4)],apuToCpu:[...a.spcWritePorts],dspAdr:a.dspAdr,romReadable:!!a.dspRomReadable,
      timers:[1,2,3].map(n=>({enabled:!!a[`timer${n}enabled`],target:a[`timer${n}target`],stage1:a[`timer${n}div`],output:a[`timer${n}counter`]}))},
    map:s.ram[0xdc]|(s.ram[0xdd]<<8)
  };
  writeFileSync(resolve(outDir,'regs.json'),JSON.stringify(regs,null,1));
  // Lua-friendly flat register list.
  const lua=['return {',
    `cpu={a=${regs.cpu.a},x=${regs.cpu.x},y=${regs.cpu.y},sp=${regs.cpu.sp},d=${regs.cpu.d},dbr=${regs.cpu.dbr},ps=${regs.cpu.ps}},`,
    'ppu={'+ppu.map(([r,v])=>`{${r},${v}}`).join(',')+'},',
    'io={'+cpu.map(([r,v])=>`{${r},${v}}`).join(',')+'},',
    `spc={a=${regs.spc.a},x=${regs.spc.x},y=${regs.spc.y},sp=${regs.spc.sp},pc=${regs.spc.pc},ps=${regs.spc.ps},dspAdr=${regs.spc.dspAdr},romReadable=${regs.spc.romReadable},`+
    `cpuToApu={${regs.spc.cpuToApu.join(',')}},apuToCpu={${regs.spc.apuToCpu.join(',')}},`+
    'timers={'+regs.spc.timers.map(t=>`{enabled=${t.enabled},target=${t.target},stage1=${t.stage1},output=${t.output}}`).join(',')+'}},',
    `map=${regs.map}`,'}'];
  writeFileSync(resolve(outDir,'regs.lua'),lua.join('\n'));
  return regs;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [state,out]=process.argv.slice(2);
  const r=exportState(state,out);
  console.log(`exported ${state} -> ${out}: map ${r.map}, ${r.steps} steps to C0:B079`);
}
