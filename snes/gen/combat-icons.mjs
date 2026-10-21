// Native ring/shop icons: four 8x8 cells, three interleaved bitplanes per
// row. Values 1-5 use an icon's five colours, 7 is transparent. The decoder
// adds 0/5/10 according to its position in the shared OBJ palette.
import {senzuPixel} from '../../engine/native-senzu.js';
import {dustPixel} from '../../engine/native-equipment.js';
import {nativeItemIcon} from '../../engine/native-item-icons.js';
import {quantize,nearest,encodeTile} from '../tools/gfx.mjs';

export function itemIcon(pixel){
  const colors=Array.from({length:256},(_,i)=>pixel(i%16,i>>4));
  const hist=new Map();
  for(const c of colors)if(c)hist.set(c-1,(hist.get(c-1)??0)+1);
  const palette=quantize(hist,5);
  const indices=colors.map(c=>c?nearest(palette,c-1,0)+1:7);
  const tiles=new Uint8Array(96);
  for(let t=0;t<4;t++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const v=indices[((t>>1)*8+y)*16+(t%2)*8+x];
    for(let p=0;p<3;p++)tiles[t*24+y*3+p]|=((v>>p)&1)<<(7-x);
  }
  const pal=Buffer.alloc(10);
  palette.forEach((c,i)=>pal.writeUInt16LE(c,i*2));
  return {tiles,palette:pal};
}

export function patchItemIcons(rom,patch){
  const base=0x18FD60,word=a=>rom[a]|rom[a+1]<<8;
  const record=(table,item)=>word(base+word(base+table*2)+item*2);
  const cup=record(0,5);
  // Verify the graphics, including every palette-position encoding, with
  // the browser's own classifier rather than guessing from inventory order.
  for(const offset of [0,5,10]){
    const src=0x128400+(cup&255)*96,idx=new Uint8Array(256),vram=new Uint16Array(32768);
    for(let t=0;t<4;t++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      let c=0;for(let p=0;p<3;p++)c|=((rom[src+t*24+y*3+p]>>(7-x))&1)<<p;
      idx[((t>>1)*8+y)*16+(t%2)*8+x]=c===7?0:c+offset;
    }
    for(const [i,t] of [0,1,16,17].entries()){
      const b=encodeTile(idx,16,(i%2)*8,(i>>1)*8);
      for(let j=0;j<16;j++)vram[t*16+j]=b[j*2]|b[j*2+1]<<8;
    }
    if(nativeItemIcon({vram,sprAdr1:0,sprAdr2:0},0)!=='senzu')throw Error('combat: Cup icon no longer matches the browser');
  }
  const targets=[['Senzu Bean',0,[5],senzuPixel],['DUST BAG',3,Array.from({length:9},(_,i)=>i+9),dustPixel]];
  const tables=[12,8,8,72,21,21,21];
  for(const [name,ownTable,items,pixel] of targets){
    const records=items.map(i=>record(ownTable,i)),art=itemIcon(pixel);
    const graphics=new Set(records.map(r=>r&255)),palettes=new Set(records.map(r=>r>>8));
    for(const [table,count] of tables.entries())for(let i=0;i<count;i++){
      if(table===ownTable&&items.includes(i))continue;
      const r=record(table,i);
      if(graphics.has(r&255))throw Error(`combat: ${name} graphic shared with table ${table} item ${i}`);
      palettes.delete(r>>8);
    }
    // Native palette 0 is also the unequipped armour icon's. Redirect the
    // nine sword records to one exclusively sword-owned palette instead.
    const palette=palettes.values().next().value;
    if(palette===undefined)throw Error(`combat: no exclusive palette for ${name}`);
    for(const id of graphics)patch(0x128400+id*96,art.tiles,`${name} icon ${id.toString(16)} (browser pixels)`);
    patch(0x12C900+palette*10,art.palette,`${name} palette ${palette.toString(16)} (five-colour native slice)`);
    for(const i of items)if(record(ownTable,i)>>8!==palette)
      patch(base+word(base+ownTable*2)+i*2+1,[palette],`${name} ${i}: exclusive icon palette`);
  }
}
