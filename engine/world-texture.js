// Native C0:9A00 world-row RLE, also independently decoded by tools/rom/world.
// Keep the browser decoder free of the research tools' Node/PNG dependencies.
export function decodePlanetTexture(rom){
  if(!(rom instanceof Uint8Array)||rom.length<0x200000)throw Error('Planet view requires the loaded US cartridge');
  const tiles=new Uint8Array(512*512);
  for(let y=0;y<512;y++){
    const bank=6+((rom[0x67fc0+(y>>3)]>>(y&7))&1);
    let at=(bank<<16)+(rom[0x68000+y*2]|rom[0x68001+y*2]<<8),x=0;
    while(x<512){
      const op=rom[at++],count=op<0xc0?1:op-0xbf,value=op<0xc0?op:rom[at++];
      if(at>0x74284||x+count>512||value>=240)throw Error('Invalid world row in planet view');
      tiles.fill(value,y*512+x,y*512+x+count);x+=count;
    }
  }
  return{sample(x,y,night=false){
    x=Math.floor(x)&4095;y=Math.floor(y)&4095;
    const tile=tiles[(y>>3)*512+(x>>3)],pixel=(y&7)*8+(x&7);
    const index=(rom[0x60000+tile*32+(pixel>>1)]>>((pixel&1)*4))&15;
    const palette=(rom[0x67d80+(tile>>1)]>>((tile&1)*4))&15;
    const at=(night?0x6483e:0x67dfe)+(index?palette*30+index*2:0);
    return(rom[at]|rom[at+1]<<8)&0x7fff;
  }};
}
