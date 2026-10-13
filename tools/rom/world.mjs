// SPDX-License-Identifier: LGPL-2.1-only
// RLE based on Moppleton's Ff6StyleMiniMap.cs; banking independently verified
// against the original ROM routine C0:9A00-C0:9A4C (per-row bit mask).
import {requireRange,RomFormatError} from './map-codec.mjs';
import {word} from './rom.mjs';
import {snesColor} from './graphics.mjs';

export function decodeWorldRow(bytes,width=512) {
  if(!Number.isInteger(width)||width<1||width>512) throw new RomFormatError('Invalid world row width');
  const tiles=[];let input=0;
  while(tiles.length<width) {
    requireRange(bytes,input,1,'World row command');
    const command=bytes[input++];
    if(command<0xc0) tiles.push(command);
    else {
      requireRange(bytes,input,1,'World row repeat');
      const value=bytes[input++],count=command-0xbf;
      if(tiles.length+count>width) throw new RomFormatError('World row repeat overflows width');
      for(let i=0;i<count;++i) tiles.push(value);
    }
  }
  return {tiles,bytesConsumed:input};
}

export function readWorldMap(bytes) {
  requireRange(bytes,0x60000,0x14284,'World map region');
  const rowOffsets=Array.from({length:512},(_,row)=>{
    const bank=6+((bytes[0x67fc0+(row>>3)]>>(row&7))&1);
    return (bank<<16)+word(bytes,0x68000+row*2);
  });
  const unique=[...new Set(rowOffsets)].sort((a,b)=>a-b);
  const ends=new Map(unique.map((offset,index)=>[offset,unique[index+1]??0x74284]));
  const tiles=[];
  for(let row=0;row<512;++row) {
    const offset=rowOffsets[row],end=ends.get(offset);
    if(offset<0x68400||end>0x74284) throw new RomFormatError(`World row ${row} outside verified vanilla region`);
    requireRange(bytes,offset,end-offset,`World row ${row}`);
    tiles.push(...decodeWorldRow(bytes.subarray(offset,end)).tiles);
  }
  const tilePixels=Array.from({length:240},(_,tile)=>Array.from({length:64},(_,pixel)=>
    (bytes[0x60000+tile*32+(pixel>>1)]>>((pixel&1)*4))&15));
  const paletteAssignments=Array.from({length:240},(_,tile)=>
    (bytes[0x67d80+(tile>>1)]>>((tile&1)*4))&15);
  const palettes={};
  for(const [period,base] of [['day',0x67dfe],['night',0x6483e]]) {
    palettes[period]=Array.from({length:13},(_,palette)=>Array.from({length:16},(_,color)=>
      snesColor(word(bytes,color===0 ? base : base+palette*30+color*2))));
  }
  const takeoffs=Array.from({length:512},(_,map)=>({map,x:bytes[0x67a80+map*2]*2,y:bytes[0x67a81+map*2]*2}));
  const landingZones=Array.from({length:256},(_,rowMajor)=>{
    const x=rowMajor&15,y=rowMajor>>4;
    const index=((y>>2)*4+(x>>2))*16+(y&3)*4+(x&3);
    const offset=0x67780+index*3;
    return {blockX:x,blockY:y,index,map:bytes[offset],x:bytes[offset+1]/2,y:bytes[offset+2]/2};
  });
  return {width:512,height:512,tileSize:8,pixelWidth:4096,pixelHeight:4096,
    rowOffsets,tiles,tilePixels,paletteAssignments,palettes,takeoffs,landingZones,
    animationFrame:0,notes:'Original world texture; no Mode 7 projection, palette cycling or dynamic fortress overlay.'};
}

export function renderWorld(world,{scale=4,period='day'}={}) {
  if(![1,2,4,8].includes(scale)||!world.palettes[period]) throw new RomFormatError('Invalid world render settings');
  const width=world.pixelWidth/scale,height=world.pixelHeight/scale,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;++y) for(let x=0;x<width;++x) {
    const sx=x*scale,sy=y*scale,tile=world.tiles[(sy>>3)*world.width+(sx>>3)];
    if(tile>=world.tilePixels.length) throw new RomFormatError(`Unknown world tile ${tile}`);
    const pal=world.paletteAssignments[tile];
    if(pal>=world.palettes[period].length) throw new RomFormatError(`Unknown world palette ${pal}`);
    const pixel=world.tilePixels[tile][(sy&7)*8+(sx&7)];
    rgba.set(world.palettes[period][pal][pixel],(y*width+x)*4);
  }
  return {width,height,rgba};
}
