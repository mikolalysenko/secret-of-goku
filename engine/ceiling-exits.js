// Factual map IDs and original exterior doors from the US cartridge.
// No floor graphics or event streams are bundled. The real door loader
// places the whole party outside before normal Mode 7 takeoff.
export const ceilingExits=[
  {name:"Water Palace and Undine",map:136,door:7,rooms:[140,143,275,277]},
  {name:"Pandora and Kippo",map:160,door:17,rooms:[161,162,163,165,166]},
  {name:"Gaia’s Navel and Dwarf Village",map:25,door:26,rooms:[73,284,285,286,288,289,290,294]},
  {name:"Haunted Forest and Witch Castle",map:196,door:175,rooms:[28,29,30,31,38,300,301,302,303,304,305,306,309,310,343,344]},
  {name:"Earth Palace",map:25,door:26,rooms:[269,276,291,312,313,314]},
  {name:"Kilroy’s ship",map:25,door:26,rooms:[311,315,317]},
  {name:"Upper Land and Wind Palace",map:47,door:350,rooms:[58,60,273]},
  {name:"Matango and Flammie’s cave",map:223,door:470,rooms:[134,307,320,321,322,323,325]},
  {name:"Ice Country and Ice Palace",map:75,door:512,rooms:[79,352,353,354,355,356,357,358,359,360,361,362,363,364,365]},
  {name:"Kakkara and Sandship",map:89,door:395,rooms:[340]},
  {name:"Fire Palace",map:90,door:562,rooms:[240,241,326,327,328,329,330,331,345,346,347,348,349]},
  {name:"Empire towns and castle",map:82,door:379,rooms:[20,100,377,378,379,381,382,383,384,385,386,388,389,390]},
  {name:"Northtown Ruins",map:21,door:380,rooms:[400,401,402,403,404,405,406,407,408,409,410]},
  {name:"Gold City and Light Palace",map:116,door:648,rooms:[111,117,118,119,120]},
  {name:"Mandala and Jehk",map:62,door:288,rooms:[17,18,66]},
  {name:"Shade Palace",map:61,door:283,rooms:[367,368,369,370,371,372,373,374,375,489]},
  {name:"Moon Palace and ferry",map:95,door:501,rooms:[32,33,34,35,48,350,351]},
  {name:"Tasnica",map:24,door:746,rooms:[121]},
  {name:"Lost Continent, subway and Grand Palace",map:195,door:778,rooms:[42,43,44,45,46,71,72,237,238,412,413,414,415,416,417,418,419,420,421,422,423,424,425,426,428,430,431,432,433,434,435,436,495]},
  {name:"Pure Land and Mana Tree",map:198,door:874,rooms:[204,211,212,213,214,226,230,231,232,236,444,445,446]},
  {name:"Mana Fortress and final bosses",map:255,door:59,rooms:[244,245,248,249,250,251,488]},
];
export const ceilingExitFor=map=>ceilingExits.find(exit=>exit.rooms.includes(map))??null;
