// Common retail death and weapon sheets otherwise convert from 3bpp during
// combat. Keep all three colour encodings in ROM for an interruptible copy.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function generate({rom,outDir,xdata}){
  const sheets=[['death',0x11F100,50],['weapon_0',0x140000,64],['weapon_511',0x142FE8,64]];
  const asm=['; Generated retail actor graphics.'];
  for(const [name,source,tiles]of sheets){
    const bytes=new Uint8Array(3*tiles*32);
    for(let mode=0;mode<3;mode++)for(let tile=0;tile<tiles;tile++)for(let row=0;row<8;row++){
      const p=source+tile*24+row*3,[a,b,c]=rom.slice(p,p+3);
      const mask=~(b&c)&255;
      const planes=mode===0?[a&mask,b&mask,c&mask,0]:
        mode===1?[a^255,a^b,(c^255)&(a^b),(a&b)^c]:
        [a&mask,b^255,b^c,mask];
      const d=(mode*tiles+tile)*32+row*2;
      bytes[d]=planes[0];bytes[d+1]=planes[1];bytes[d+16]=planes[2];bytes[d+17]=planes[3];
    }
    xdata('core_gfx_'+name,bytes);
    writeFileSync(join(outDir,name+'.bin'),bytes);
    const last=source+tiles*24-3;
    asm.push(`!CORE_GFX_${name.toUpperCase()}_MASK = ${~(rom[last+1]&rom[last+2])&255}`);
  }
  writeFileSync(join(outDir,'data.asm'),asm.join('\n')+'\n');
}
