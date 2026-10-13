// Original Potos hole, decoded from the supplied US ROM.
// No artwork bytes embedded. Six native BG2 metatiles, source tileset0/palette24.
// Potos piece13 only clears BG1; the actual hole is in foreground piece15.
export function decodePotosCrater(rom){
  if(!(rom instanceof Uint8Array)||rom.length!==0x200000)throw Error('Crater graphics require the original unheadered US ROM.');
  const words=[
    [0x4e00,0x4aaa,0x4e2b,0x4aa9],[0x4a81,0x0a81,0x4ab9,0x0ab9],[0x0aaa,0x0e00,0x0aa9,0x0e2b],
    [0x4e2b,0x4aac,0x4e00,0x4ab4],[0x4aab,0x0aab,0x4ab3,0x0ab3],[0x0aac,0x0e2b,0x0ab4,0x0e00],
  ];
  const sources={512:0x1d4220,555:0x1d4620,641:0x1d4e40,681:0x1d52a0,682:0x1d52c0,683:0x1d52e0,684:0x1d5300,691:0x1d53e0,692:0x1d5400,697:0x1d54a0};
  const width=48,height=32,pixels=new Uint16Array(width*height),fullPixels=new Uint16Array(width*height),paletteBase=0xc8000+24*210;
  let opaque=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let m=0;m<6;m++)for(let s=0;s<4;s++){
    const word=words[m][s],offset=sources[word&1023],palette=(word>>10)&7;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const px=(word&0x4000)?7-x:x,py=(word&0x8000)?7-y:y;let index=0;
      for(let plane=0;plane<4;plane++)index|=((rom[offset+(plane>>1)*16+py*2+(plane&1)]>>(7-px))&1)<<plane;
      if(index===0)continue;
      const at=paletteBase+(palette-1)*30+(index-1)*2,color=1+((rom[at]|rom[at+1]<<8)&0x7fff);
      const dx=(m%3)*16+(s&1)*8+x,dy=Math.floor(m/3)*16+(s>>1)*8+y,dest=dy*width+dx;
      fullPixels[dest]=color;
      // The original tile edges include turf. Palettes2/3 reserve1..6 for
      // earth/stone,7..9 flowers,10..15 grass. Keep exact earth/stone pixels;
      // native water/turf at the destination remains visible outside the rim.
      if(index<=6){pixels[dest]=color;opaque++;minX=Math.min(minX,dx);maxX=Math.max(maxX,dx);minY=Math.min(minY,dy);maxY=Math.max(maxY,dy);}
    }
  }
  return{width,height,pixels,fullPixels,opaque,bounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},source:{map:131,piece:15,metatiles:[369,370,371,372,373,374],paletteSet:24,tileX:29,tileY:28}};
}
