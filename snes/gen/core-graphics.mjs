// Retail death/status particles are converted from 3bpp on the main CPU
// when an actor is defeated. Keep their three palette encodings in ROM so
// that event only has to copy the same 50 tiles into the native WRAM buffer.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function generate({rom,outDir,xdata}){
  const source=0x11F100,tiles=50,bytes=new Uint8Array(3*tiles*32);
  for(let mode=0;mode<3;mode++)for(let tile=0;tile<tiles;tile++)for(let row=0;row<8;row++){
    const p=source+tile*24+row*3,[a,b,c]=rom.slice(p,p+3);
    const mask=~(b&c)&255;
    const planes=mode===0?[a&mask,b&mask,c&mask,0]:
      mode===1?[a^255,a^b,(c^255)&(a^b),(a&b)^c]:
      [a&mask,b^255,b^c,mask];
    const d=(mode*tiles+tile)*32+row*2;
    bytes[d]=planes[0];bytes[d+1]=planes[1];bytes[d+16]=planes[2];bytes[d+17]=planes[3];
  }
  xdata('core_gfx_death',bytes);
  writeFileSync(join(outDir,'death.bin'),bytes);
  const last=source+tiles*24-3;
  writeFileSync(join(outDir,'data.asm'),`; Generated retail particle decode.\n!CORE_GFX_DEATH_MASK = ${~(rom[last+1]&rom[last+2])&255}\n`);
}
