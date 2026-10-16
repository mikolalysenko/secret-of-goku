// Native items share a palette in groups of three. The same 16x16 graphic
// therefore has three different bitplane encodings, depending on its slot.
// Match the actual DMA'd cells, not inventory order or a fixed OBJ bank.
const kinds=new Map([
 [0xb22e39c3,'senzu'],[0x5fde505c,'senzu'],[0x430ea2ce,'senzu'],
 [0xfce785b7,'fly'],[0x256f2fff,'fly'],[0x98686110,'fly'],
]);
export function nativeItemIcon(ppu,attr){
 const base=ppu.sprAdr1+((attr&256)?ppu.sprAdr2:0),tile=attr&255;let hash=2166136261;
 for(const delta of[0,1,16,17])for(let i=0;i<16;i++)hash=Math.imul(hash^ppu.vram[(base+((tile+delta)&255)*16+i)&32767],16777619);
 return kinds.get(hash>>>0)??null;
}
