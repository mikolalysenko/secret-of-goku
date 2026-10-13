import {box} from './story-events.js';

// Changes at native command boundaries, before relocating the event. Keep
// the original hole pieces, door 08D, Mantis battle and reward flags intact.
export const potosCommands=new Map([
  // Step clear before the ground opens under Elliott.
  [0x93150,{before:[0x29,0x10],after:[0x32,0,0x02,0x08,0x32,0,0x40,0x08,0x29,0x10]}],
  // The child falls first. Goku chooses to follow, walks to the lip, hops,
  // then uses the original pit descent and map transition.
  [0x9315c,{before:[0x31,0,0xae],after:[
    ...box('ELLIOTT:HELP!\nGOKU:Hang on, kid.\nI will hop down.'),
    0x32,0,0x42,0x08,0x31,0,0xa1,0x08,0x31,0,0xae,
  ]}],
  // No helpless flinches when the villagers shout him out of town.
  ...[0xa4033,0xa404d,0xa406c].map(at=>[at,{before:[0x31,0,0x8c],after:[0x32,0,0x40]}]),
]);

export function potosCommand(op){
  const edit=potosCommands.get(op.at);
  if(!edit)return null;
  if(op.bytes.length!==edit.before.length||!op.bytes.every((v,i)=>v===edit.before[i]))throw Error('Unsupported Potos event command');
  return edit.after;
}
