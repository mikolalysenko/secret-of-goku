// Script locks are separate from collision walls. Breaking one permits its
// original door transition; it never teleports the player with the attack.
// The two tiles of each doorway share a saved latch across room variants.
export const breakableDoors=[
  {id:'pandora-ruins-exit',maps:[164,167],flag:0x1a,openAt:8,
    events:new Map([[0x16a,[0x18,0x31,0]],[0x16b,[0x18,0x33,0]]])},
  {id:'northtown-ruins-seal',maps:[402,405],flag:0x2d,openAt:5,prepareEvent:0x9d,
    // The rescue and Vampire sequence still run on first entry. Returning
    // after the fight only enters the empty room, never restarts that scene.
    events:new Map([[0x55a,[0x19,0x4e,0x42,0x2d,0x55,0x15,0x58,0]],
      [0x55b,[0x18,0x9f,0x42,0x2d,0x55,0x15,0x58,0]]])},
];

export function lockedDoorAt(mod,event){
  const map=mod.read16(0xdc),door=breakableDoors.find(d=>d.maps.includes(map)&&d.events.has(event));
  if(!door||mod.barriers?.doorBroken(door.id))return null;
  const progress=mod.read8(0xcf00+door.flag);
  if(door.prepareEvent?progress===door.openAt:progress>=door.openAt)return null;
  return door;
}
