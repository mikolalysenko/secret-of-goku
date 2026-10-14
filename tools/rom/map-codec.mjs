// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from Moppleton's SecretOfManaRandomizer, commit
// 1404b7bd8552677399f24632c1e37cba37d491ef (SomMapCompressor.cs,
// VanillaTilesetUtil.cs). See NOTICE.md and COPYING.LESSER.

export class RomFormatError extends Error {
  constructor(message) { super(message); this.name = 'RomFormatError'; }
}

export function requireRange(bytes, offset, length, label = 'ROM read') {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new RomFormatError(`${label}: read [${offset}, ${offset + length}) exceeds ${bytes.length} bytes`);
  }
}

/** Decode a bounded vanilla map-piece stream. Tiles are row-major 16px IDs. */
export function decodeMapPiece(bytes) {
  requireRange(bytes, 0, 2, 'Map dimensions');
  const width = (bytes[0] >> 1) + 1;
  const height = (bytes[1] >> 1) + 1;
  let input = 2;
  const commands = new Set();
  const motifs=[];
  const placements=[];
  const read = () => {
    requireRange(bytes, input, 1, 'Map command');
    return bytes[input++];
  };
  function stream(w,h,allowMotifs=false) {
    const tiles=new Uint8Array(w*h);let output=0;
    const previous = distance => {
      if (distance < 1 || distance > output) {
        throw new RomFormatError(`Map back-reference ${distance} before start at output ${output}`);
      }
      return tiles[output - distance];
    };
    const emit = value => {
      if (output >= tiles.length) throw new RomFormatError(`Map run exceeds ${w}x${h} output`);
      tiles[output++] = value & 0xff;
    };
    while (output < tiles.length) {
      const at = input;
      const command = read();
      if (command < 0xc0) { emit(command); continue; }
      commands.add(command);
      if (command < 0xe0) {
        const value = previous(1 + ((command - 0xc0) >> 3));
        for (let n = (command & 7) + 1; n > 0; --n) emit(value);
      } else if (command <= 0xe7) {
        const arg = command === 0xe0 ? read() : command - 0xe0;
        const distance = w * (1 + (arg >> 7));
        for (let n = (arg & 127) + 1; n > 0; --n) emit(previous(distance));
      } else if (command <= 0xef) {
        const arg = read();
        const size = 1 + 2 * (command - 0xe8) + (arg >> 7);
        const pattern = Array.from({length:size}, (_, i) => previous(size - i));
        for (let i = 0; i <= (arg & 127); ++i) emit(pattern[i % size]);
      } else if (command <= 0xf7) {
        const arg = command === 0xf0 ? read() : command - 0xf0;
        const start = previous(1);
        const step = (arg & 128) ? -1 : 1;
        for (let i = 1; i <= (arg & 127) + 1; ++i) emit(start + step * i);
      } else if(command<=0xfd){
        const motif=motifs[command-0xf8];
        if(!allowMotifs||!motif)throw new RomFormatError(`Undefined map motif at compressed offset 0x${at.toString(16)}`);
        placements.push({motif,position:output});emit(0);
      } else {
        throw new RomFormatError(`Unexpected map motif delimiter at compressed offset 0x${at.toString(16)}`);
      }
    }
    return tiles;
  }
  // C0:CD03-CD38 reads a dictionary before the main stream when either
  // dimension has its low flag bit set. Each rectangle has its OWN width
  // for row back-references. FE separates definitions; FF ends the table.
  if((bytes[0]|bytes[1])&1){
    let delimiter;
    do {
      if(motifs.length>=6)throw new RomFormatError('Too many map motif definitions');
      const settings=read(),w=(settings&15)+1,h=(settings>>4)+1;
      const data=stream(w,h);delimiter=read();commands.add(delimiter);
      if(delimiter!==0xfe&&delimiter!==0xff)throw new RomFormatError('Invalid map motif delimiter');
      motifs.push({width:w,height:h,data});
    }while(delimiter!==0xff);
  }
  const tiles=stream(width,height,true);
  // Native C0:CD4D stamps in encounter order, preserving overlapping motifs.
  for(const {motif,position} of placements)
    for(let y=0;y<motif.height;y++)for(let x=0;x<motif.width;x++){
      const tx=position%width+x,ty=Math.floor(position/width)+y;
      if(tx<width&&ty<height)tiles[ty*width+tx]=motif.data[y*motif.width+x];
    }
  return {width, height, tiles:Array.from(tiles), bytesConsumed:input,
    compressionCommands:[...commands].sort((a,b) => a-b)};
}

/** Decode all SNES tile words in a compressed 16x16 metatile set. */
export function decodeMetatiles(bytes, count = 384) {
  if (!Number.isInteger(count) || count < 1 || count > 384) throw new RomFormatError('Invalid metatile count');
  let bit = 0;
  const read = n => {
    requireRange(bytes, bit >> 3, Math.ceil(((bit & 7) + n) / 8), 'Metatile bitstream');
    let result = 0;
    for (let i = 0; i < n; ++i, ++bit) result = (result << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
    return result;
  };
  const signed = n => { const value=read(n); return value & (1 << (n-1)) ? value - (1 << n) : value; };
  let tile = 0, vflip = 0, hflip = 0, priority = 1, palette = 4;
  const metatiles = [];
  for (let i = 0; i < count; ++i) {
    const subtiles = [];
    for (let j = 0; j < 4; ++j) {
      const control = read(2);
      if (control === 1) tile = (tile & 0x300) | ((tile + 1) & 255);
      if (control === 2) tile = (tile & 0x300) | ((tile - 1) & 255);
      if (control === 3) {
        if (!read(1)) tile += signed(7);
        else if (read(1)) {
          vflip=read(1); hflip=read(1); priority=read(1); palette=read(3); tile=read(10);
        } else {
          if (read(1)) { vflip=read(1); hflip=read(1); priority=read(1); }
          else palette=read(3);
          tile += signed(6);
        }
      }
      if (tile < 0 || tile > 1023) throw new RomFormatError(`Metatile ${i} references invalid 8x8 tile ${tile}`);
      subtiles.push(tile | (palette << 10) | (priority << 13) | (hflip << 14) | (vflip << 15));
    }
    metatiles.push(subtiles);
  }
  return {metatiles, bitsConsumed:bit};
}
