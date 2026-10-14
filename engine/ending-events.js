import {box,call} from './story-events.js';
import {endingEvents} from './ending-rules.js';

export function heroFarewell(){
  return[
    ...box('RANDI:You saved everyone!\nVILLAGER:Eventually.\nGOKU:I should probably go.'),
    ...box('LUKA:Thank you, Goku.\nPlease use the sky on\nyour way out. Just fly.\nNo more beams.'),
    ...call(endingEvents.depart),0x28,16,...call(endingEvents.kai),0x28,4,
    ...box('KING KAI:Next time, be\nmore careful, Goku.\nBut... good job.'),
    ...box('GOKU:Thanks, King Kai!\nThe big one was REALLY\nstrong after I fed it.'),
    ...box('KING KAI:I noticed.\nThat was the part where\nI was shouting STOP.'),
    ...box('GOKU:So... lunch?\nKING KAI:Fine.\nYou are washing the dishes.'),
    ...call(0xa6),0,
  ];
}
export function buildBadEnding(reason){
  const cause={
    fortress:'KING KAI:You burned away\nthe Fortress and its Mana!\nThere is nothing left\nholding this world together!',
    balls:'KING KAI:The Dragon Balls\nare still scattered!\nNo wish! No time left!\nThe planet is coming apart!',
    frieza:'KING KAI:You never dealt\nwith Frieza! He just fired\nanother Death Ball!\nThe core is rupturing!',
    beast:'KING KAI:The core is\nstill breaking apart!\nWe are out of time!',
  }[reason];
  return[6,0x27,0x3a,0x18,0x2f,
    ...box('The Mana Beast falls.\nThe ground keeps shaking.'),
    ...box('GOKU:Great! Now we can\nwish everything back.\n...Shenron?'),
    ...box(cause),
    ...box('LUKA:\nThe sky is on fire!\nGoku, what have you done?!'),
    ...box('GOKU:I thought there\nwas still time.\nKING KAI:THERE IS NOT!'),
    ...call(0xa3),0x28,40,
    ...box('GOKU:King Kai! I can\nstill feel your ki!'),
    ...call(0xa4),0x28,10,...call(0xa5),0x28,4,
    ...box('KING KAI:You saved\nYOURSELF. That entire\nworld is gone, Goku.'),
    ...box('GOKU:I was going to\nwish them all back.\nKING KAI:WITH WHAT?!'),
    ...box('KING KAI:They asked for\nhelp. You treated their\nplanet like a training room.\nThat was a jerk move.'),
    ...box('GOKU:...Yeah.\nThat one is on me.'),
    ...box('KING KAI:No victory meal.\nSit down. We are having\na very long conversation.'),
    0x30,0x4e,9,...call(0xa6),0,
  ];
}
