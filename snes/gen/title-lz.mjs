// Secret of Mana's LZ decompressor (C1:4C30, called long through C1:0014),
// ported to JavaScript so generators can read compressed cartridge blocks.
// Not a generator itself (no generate export); other modules may import it.
//
// Block header: byte 0 = split s (0..5), byte 1 unused, bytes 2-3 = output
// size (big endian). Tokens: c < $80 copies c+1 literal bytes; otherwise a
// back reference of ((c & $7F) >> (5-s)) + 3 bytes from distance
// (((c & $7F) & mask[s]) << 8 | next) + 1, mask = 1F,0F,07,03,01,00.
// The 65816 routine stops before reading a token once the output reaches the
// header size; this port does the same and returns exactly what it writes.
const MASK=[0x1f,0x0f,0x07,0x03,0x01,0x00];

export function decompress(rom,offset){
  const at=i=>{
    if(offset+i>=rom.length)throw RangeError('LZ block runs past the ROM');
    return rom[offset+i];
  };
  const split=at(0),size=(at(2)<<8)|at(3);
  if(split>5)throw Error(`Unsupported LZ split ${split} at ${offset.toString(16)}`);
  const shift=5-split,mask=MASK[split],out=[];
  let p=4;
  while(out.length<size){
    const c=at(p++);
    if(c<0x80){for(let i=0;i<=c;i++)out.push(at(p++));continue;}
    const distance=((((c&0x7f)&mask)<<8)|at(p++))+1,length=((c&0x7f)>>shift)+3,from=out.length-distance;
    if(from<0)throw Error(`LZ back reference before block start at ${offset.toString(16)}`);
    for(let i=0;i<length;i++)out.push(out[from+i]);
  }
  return {data:Uint8Array.from(out),size,end:offset+p};
}

// HiROM CPU address (banks C0-FF or 40-7D) to file offset.
export const hirom=address=>((address>>16)&0x3f)<<16|(address&0xffff);
