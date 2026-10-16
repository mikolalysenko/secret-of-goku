// SPDX-License-Identifier: LGPL-2.1-only
// SNES tile decoding; graphics list layout independently traced from the user's
// ROM routines C1:F413-C1:F5CC. Sources and verification notes: docs/agents/rom-research.md.
import {deflateSync} from 'node:zlib';
import {requireRange,RomFormatError} from './map-codec.mjs';
import {crc32,word,long} from './rom.mjs';

export function decodePlanarTile(bytes,offset,bpp=4,fill=0) {
  if(![2,3,4].includes(bpp)) throw new RomFormatError(`Unsupported tile depth ${bpp}`);
  requireRange(bytes,offset,bpp*8,'Planar 8x8 tile');
  const pixels=[];
  for(let y=0;y<8;++y) for(let x=0;x<8;++x) {
    let color=fill;
    for(let plane=0;plane<bpp;++plane) {
      const index=plane===2&&bpp===3 ? offset+16+y : offset+(plane>>1)*16+y*2+(plane&1);
      color|=((bytes[index]>>(7-x))&1)<<plane;
    }
    pixels.push(color);
  }
  return pixels;
}

export function readGraphics(bytes,id,{animated=true}={}) {
  if(!Number.isInteger(id)||id<0||id>=64) throw new RomFormatError(`Invalid tileset8 ID ${id}`);
  const offset=0xc0000+word(bytes,0xce27e+id*2);
  const end=0xc0000+word(bytes,0xce280+id*2);
  requireRange(bytes,offset,end-offset,'Tileset8 list');
  if((end-offset)%3) throw new RomFormatError('Tileset8 list is not triple-aligned');
  const tiles=[],runs=[];
  for(let pointer=offset;pointer<end;pointer+=3) {
    const encoded=word(bytes,pointer),count=bytes[pointer+2]+1;
    const mode=encoded>>>13,tile=encoded&0x1fff;
    if(mode===7) throw new RomFormatError('8bpp tileset run unsupported');
    const bpp=mode===6 ? 4 : mode>=4 ? 3 : 2;
    const fill=bpp===2 ? ((mode&2)?4:0)|((mode&1)?8:0) : bpp===3 && (mode&1) ? 8 : 0;
    const base=long(bytes,0xce270+(bpp-2)*3);
    const source=base+tile*bpp*8;
    runs.push({source,count,bpp,fill,destination:tiles.length});
    for(let i=0;i<count;++i) tiles.push(decodePlanarTile(bytes,source+i*bpp*8,bpp,fill));
  }
  const staticTileCount=tiles.length;
  const animationGroups=[];
  if(animated) {
    requireRange(bytes,0x80400+id,1,'Animation index');
    const animationIndex=bytes[0x80400+id]*2;
    for(let group=0;group<8;++group) {
      requireRange(bytes,0x80441+animationIndex+group,1,'Animation group');
      const code=bytes[0x80441+animationIndex+group];
      const source=0x1c8000+(code&63)*0x200;
      animationGroups.push({code,source,destination:864+group*4});
      for(let i=0;i<4;++i) tiles[864+group*4+i]=decodePlanarTile(bytes,source+i*32);
    }
  }
  return {id,offset,staticTileCount,runs,animationGroups,tiles};
}

export function snesColor(value) {
  const expand=n=>(n<<3)|(n>>2);
  return [expand(value&31),expand((value>>5)&31),expand((value>>10)&31),255];
}
export function readPalette(bytes,id) {
  if(!Number.isInteger(id)||id<0||id>=128) throw new RomFormatError('Invalid palette set');
  const offset=0xc8000+id*210;
  requireRange(bytes,offset,210,'Map palette');
  const palettes=Array.from({length:8},()=>Array.from({length:16},()=>[0,0,0,0]));
  for(let p=1;p<8;++p) for(let c=1;c<16;++c) palettes[p][c]=snesColor(word(bytes,offset+(p-1)*30+(c-1)*2));
  return {id,offset,palettes};
}

export function renderMap(map,tileset,graphics,palette,{layer=null,priority=null}={}) {
  const width=map.composite.pixelWidth,height=map.composite.pixelHeight;
  const rgba=new Uint8Array(width*height*4);
  // SNES Mode 1: BG1 wins over BG2 at equal priority; both high-priority
  // backgrounds win over both low-priority backgrounds. The names here refer
  // to logical map layers, not an unconditional painter's-order foreground.
  const passes=layer ? [[layer,priority]] :
    [['foreground',0],['background',0],['foreground',1],['background',1]];
  for(const [layerName,passPriority] of passes) {
    const cells=map.composite.layers[layerName];
    for(let index=0;index<cells.length;++index) {
      if(cells[index]===null) continue;
      const metatile=tileset.metatiles[cells[index]];
      const x=(index%map.composite.width)*16,y=Math.floor(index/map.composite.width)*16;
      for(let s=0;s<4;++s) {
        const tileWord=metatile[s];
        if(passPriority!==null && ((tileWord>>13)&1)!==passPriority) continue;
        const pixels=graphics.tiles[tileWord&1023];
        if(!pixels) throw new RomFormatError(`Missing graphics tile ${tileWord&1023}`);
        const colors=palette.palettes[(tileWord>>10)&7];
        for(let py=0;py<8;++py) for(let px=0;px<8;++px) {
          const color=pixels[(tileWord&0x8000?7-py:py)*8+(tileWord&0x4000?7-px:px)];
          if(!color) continue;
          const destination=((y+(s>>1)*8+py)*width+x+(s&1)*8+px)*4;
          rgba.set(colors[color],destination);
        }
      }
    }
  }
  return {width,height,rgba};
}

/** Minimal deterministic RGBA PNG writer, avoiding native image dependencies. */
export function encodePng({width,height,rgba}) {
  if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1||rgba.length!==width*height*4) throw new RomFormatError('Invalid PNG dimensions');
  const chunk=(type,data)=>{
    const name=Buffer.from(type),body=Buffer.from(data),result=Buffer.alloc(body.length+12);
    result.writeUInt32BE(body.length);name.copy(result,4);body.copy(result,8);
    result.writeUInt32BE(parseInt(crc32(Buffer.concat([name,body])),16),body.length+8);return result;
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const scanlines=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;++y) scanlines.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',new Uint8Array())]);
}
