// Original palace BG1 objects. Lit bowls can sit on either the narrow or
// wide pedestal; Earth Palace uses a third pedestal. Match the whole object.
export const palaceBraziers=[
 [144,145,88,89,124,125],
 [130,146,88,89,124,125],
 [144,145,108,109,124,125],
 [92,93,108,109,124,125],
 [144,145,120,121,124,125],
 [92,93,120,121,124,125],
];
export const brazierPart=id=>Math.max(...palaceBraziers.map(cells=>cells.indexOf(id)));
export const palaceDecoration=(t,tileset)=>tileset===23&&t?.layer===0&&t.code===0&&brazierPart(t.tile)>=0;
