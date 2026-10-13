// Entry prerequisites, not completion flags. Each floor belongs to the area
// being entered, never lowers progress, and leaves its bosses/orbs undefeated.
// Map/flag facts: the local US cartridge and the reference listed in CREDITS.
export const storyAreas=[
  {name:'Earth Palace',maps:[269,291,312,313,314,495],floors:[[0x18,1]],reason:'The elemental orb works before recruiting Popoi.'},
  {name:'Upper Land',maps:[39,40,41,47,49,52,53,54,55,56,57,58,59,60,158,273],floors:[[0x20,3],[0x21,2],[0x22,1]],reason:'Flying finds the seasonal path without a sprite guide; the orb and Spring Beak remain.'},
  {name:'Matango',maps:[134,222,223,224,274,282,307,320,321,322,323,325,336,337,338],floors:[[0x24,3]],reason:'The cave orb and Great Viper exist on an early arrival.'},
  {name:'Paradise Town',maps:[79,194,197,335],floors:[[0x27,3]],reason:'The trapped fire spirit is available before the desert itinerary.'},
  {name:'Northtown Castle',maps:[100,377,378,379,380,381,382,383,384,385,386,387,388,389,390,391],floors:[[0x34,4]],reason:'Entering the castle starts its investigation even before the town invitation.'},
  {name:'Tasnica',maps:[24,26,36,37,51,121],floors:[[0x3c,1]],reason:'The spy investigation starts even if Jema was left behind.'},
  {name:'Joch',maps:[17,18,62],floors:[[0x3f,4]],reason:'The trial is available without the repeated travel errands.'},
  {name:'Lost Continent',maps:[42,43,44,45,46,71,195,237,238,412,413,414,415,416,417,418,419,420,421,422,423,424,425,426,428,430,431,432,433,436],floors:[[0x41,2],[0x44,1]],reason:'An early landing loads an explorable palace and its original bosses.'},
];
export function prepareStoryArea(r,map){
  const changes=[];
  for(const area of storyAreas)if(area.maps.includes(map))for(const[flag,min]of area.floors){
    if(r[0xcf00+flag]<min){changes.push({area:area.name,flag,before:r[0xcf00+flag],after:min});r[0xcf00+flag]=min;}
  }
  return changes;
}
