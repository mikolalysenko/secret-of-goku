// Decorative cave stalagmites that the retail game never marks cuttable.
// Tileset 10 draws them as a spire (metatile 105 on a height-2 floor, 106 on
// height 1) over a solid base (121/122) with descriptor code 0. Only its
// stalagmite cluster 168 and rock 80 carry the axe code (C2), so neither the
// native axe nor native-plants.js eligible() touched these, though they look
// alike. Each object lists its BG1 cells with their retail tiles. A punch or
// a wave on any cell breaks the whole object (native-plants.js), each cell
// to the floor tile that the map itself puts around it, at the same
// collision height (breakScenery, native-local-flight.js). The cartridge
// port reads this table too (snes/gen/destroy.mjs).
// tests/cave-stalagmites.test.mjs checks every object against the ROM: its
// cells, its floor and neighbours, and that only Watts's shortcut joins two
// walkable regions.
//
// Watts's shortcut (map 294) is the retail game's own opened layout: piece
// 99, placed once CF14 reaches 7 (event 1B6, after Watts forges an orb).
// Breaking it latches the passage (barriers door 'watts-shortcut'), so the
// piece loader shows piece 99 on every later visit (native-story.js), like
// the Gaia shortcut door at the top of the same stairs. CF14, which also
// drives Gnome and palace progress, is left alone. The Dwarf Village plaza's
// stalagmites respawn when the map is entered again, as axe obstacles do.
//
// Left intact: plaza stalagmites whose spires sit in the cliff's dark lower
// band (no floor art exists for those cells) or beside a height-transition
// strip, Tropicallo's arena ring (map 290), the pair flanking Gaia's Navel's
// corridor (285, one beside a transition strip) and its CF60 cluster, the
// Matango cave's CF24 cave-in (321, it joins two areas) and its lone spire
// beside a height-0 cell, the one-tile gaps between cliffs in map 323,
// Jehk's lobby (18, CF3F pieces) and the Doppel arena (72). The cone
// (metatile 130) is a whip post (hit source 6F8), not decoration.
export const stalagmiteTileset=10;
export const caveStalagmites=[
 // Watts's forge, behind Watts: the foot of the stairs to his shortcut.
 {map:294,floor:0x46,latch:'watts-shortcut',record:0x79f9,
  cells:[[19,10,0x69],[20,10,0x69],[21,10,0x69],[19,11,0x79],[20,11,0x79],[21,11,0x79]]},
 // The Dwarf Village plaza (height-1 floor 2B).
 {map:287,floor:0x2b,cells:[[22,31,0x6a],[21,32,0x6a],[22,32,0x7a],[23,32,0x6a],[21,33,0x79],[22,33,0x79],[23,33,0x79],[21,34,0x6a],[21,35,0x79]]},
 {map:287,floor:0x2b,cells:[[31,34,0x6a],[31,35,0x79]]},
 {map:287,floor:0x2b,cells:[[25,34,0x6a],[25,35,0x79],[26,35,0x6a],[26,36,0x79]]},
 {map:287,floor:0x2b,cells:[[16,36,0x6a],[17,36,0x6a],[16,37,0x79],[17,37,0x7a],[17,38,0x79],[18,38,0x6a],[18,39,0x79]]},
 {map:287,floor:0x2b,cells:[[28,36,0x6a],[28,37,0x79],[27,38,0x6a],[28,38,0x6a],[27,39,0x79],[28,39,0x79]]},
 {map:287,floor:0x2b,cells:[[30,36,0x6a],[30,37,0x7a],[30,38,0x79]]},
 {map:287,floor:0x2b,cells:[[20,37,0x6a],[20,38,0x7a],[20,39,0x79]]},
 {map:287,floor:0x2b,cells:[[22,38,0x6a],[23,38,0x6a],[22,39,0x7a],[23,39,0x7a],[24,39,0x6a],[25,39,0x6a],[22,40,0x79],[23,40,0x79],[24,40,0x79],[25,40,0x79]]},
];
export const stalagmiteLatches=caveStalagmites.filter(o=>o.latch);
const byMap=new Map();
for(const o of caveStalagmites){if(!byMap.has(o.map))byMap.set(o.map,[]);byMap.get(o.map).push(o);}
// The object one of whose BG1 cells is this tile, still holding its retail
// tile (another piece or a native rebuild may have replaced it).
export function stalagmiteAt(map,tile){
 if(!tile||tile.layer!==0||tile.code!==0)return null;
 for(const o of byMap.get(map)??[])for(const[x,y,id]of o.cells)if(x===tile.tx&&y===tile.ty&&id===tile.tile)return o;
 return null;
}
