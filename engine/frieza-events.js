import {box,choice,call,jump} from './story-events.js';
import {eventRange} from './event-codec.js';
export const friezaEvents={offer:0xa7,theft:0xa8,reveal:0xac,steal:0xad,eighth:0xaf,leave:0xbf,showdown:0xc1,lift:0xc2,explode:0xc3,gold:0xc5,battle:0xc6,victory:0xc7,defeated:0xc8,revive:0xc9,reminder:0xca,travel:0xcb};
export function buildFriezaEvents(rom,mask,{discVictory=false}={}){
 const f=friezaEvents,e=new Map();
 for(const id of Object.values(f)){const{start,end}=eventRange(rom,id);if(end-start!==1||rom[start]!==0)throw Error('Frieza event slot is occupied');e.set(id,[2]);}
 e.set(f.offer,[0x51,1,...box('DRYAD:Seven Dragon Balls.\nSomeone has followed their\nlight across the stars.'),...box('I can hide them. Or we\ncan draw him out here.\nKING KAI:This is optional!\nFor once, think first.'),...choice('Investigate the strange ki?\n',[{label:'Later',x:2,to:0},{label:'Draw out',x:15,to:f.theft}])]);
 e.set(f.theft,[0x51,1,6,...box('GOKU:Come on out!\nI know you are there.'),...call(f.reveal),0x28,10,
  ...box('FRIEZA:Ho ho ho...\nSeven Dragon Balls.\nAnd you collected every\none for me. How thoughtful.'),
  ...box('GOKU:Frieza?!\nI KNEW this was not Namek.\nFRIEZA:Your geography\nremains impressive.'),...call(f.steal),0x28,12,
  ...box('The seven Dragon Balls\nrise into Frieza\'s hand!'),
  ...box('FRIEZA:That floating\nFortress will do nicely.\nBring me immortality,\nand I may leave a planet.'),...call(f.leave),0x28,8,
  ...box('GOKU:He took all seven!\nDRYAD:Yes. All SEVEN.'),...call(f.eighth),
  ...box('Dryad produces a ball\nwith EIGHT stars.'),
  ...box('GOKU:There is an eighth?!\nDRYAD:Emergency spare.\nAlso the wish authorization.\nI do not advertise it.'),
  ...box('DRYAD:Keep it. Without\nthis, he cannot wish.\nRecover the seven before\nhe learns how to count.'),
  ...box('KING KAI:He is absorbing\nthe Fortress\'s Mana!\nFollow the radar. Do NOT\nblow up the hostage Balls.'),
  ...box('GOKU:Right. Punch Frieza.\nSave the Balls. Then wish.\nI can remember three things.'),0]);
 e.set(f.travel,[0x51,1,...box('LUKA:Dryad felt a strange\npower following the Balls.\nI will guide you to her.'),0x1b,0xfc,0]);
 e.set(f.reminder,[0x51,1,...box('KING KAI:Frieza has the\nseven Dragon Balls inside\nthe Mana Fortress.'),...box('DRYAD:Keep my eighth Ball.\nBring the stolen seven back.\nGOKU:And a good fight!'),0]);
 e.set(f.showdown,[6,0x27,0xd7,...box('FRIEZA:Your local sorcerer\nwas most uncooperative.\nI removed him.'),
  ...box('KING KAI [telepathy]:\nThanatos is gone. The Tree\nhas Dyluck\'s soul.\nFrieza took their Mana.'),
  ...box('FRIEZA:Now give me that\nlast Dragon Ball.\nGOKU:You could have\njust asked Dryad nicely.'),
  ...(!(mask&2)?[0x39,3,0x80,0x82,0x39,3,0x82,40,0x39,3,0x83,0,0x39,3,0x84,40,0x39,3,0x85,0,0x2b,2]:[]),
  ...box(mask&2?'POPOI:Hey! Give our\nDragon Balls back!':'POPOI:I am Popoi!\nDryad sent me to help!\nIs this the ugly guy?'),
  ...box('FRIEZA:Another small\nfriend. How familiar.'),...call(f.lift),0x28,12,
  ...box('POPOI:Uh... Goku?\nPut me down!'),
  ...box('GOKU:FRIEZA! DON\'T!'),...call(f.explode),0x28,12,0x2c,2,
  ...box('GOKU:Popoi...\nYou did it again.'),...call(f.gold),0x28,14,
  ...box('GOKU:No more games.\nYou are going to pay.'),
  ...box('KING KAI [telepathy]:\nDodge his Death Balls!\nLead his chasing discs\nback into HIM!'),
  ...box('FRIEZA:Full power, then.\nFive minutes should suffice.\nGOKU:I have heard that one.'),
  0x30,0x4e,6,0x09,...call(f.battle),0]);
 e.set(f.victory,[6,...box(discVictory?'FRIEZA:My own... discs?!\nThis planet is defective!':'FRIEZA:Impossible...\nThis planet is defective!'),...call(f.defeated),0x28,12,
  ...box('The seven stolen Dragon\nBalls return to the pouch.\nThe eighth glows beside them.'),
  ...box('GOKU:Hang on, Popoi.\nI am bringing you back.'),
  ...box('DRYAD [telepathy]:\nThe Tree has his spirit.\nCalm the Mana Beast.\nThen make the wish.'),
  ...box(mask&1?'PRIMM:And Dyluck.\nGOKU:And Dyluck. Everyone.':'KING KAI:Everyone, Goku.\nGOKU:Everyone.'),
  ...box('KING KAI:Your hair is\nstill gold.\nGOKU:I am not done yet.'),
  0x30,0x4e,8,0x39,2,0xcd,0x38,0x39,3,0xcd,7,...jump(0x429),0]);
 return e;
}

// Popoi is restored only to a party that had actually recruited him. A solo
// visit gets a cameo and a happy return to Dryad, not a forced companion.
export function buildFriezaEnding(mask,popoiMember){
 const f=friezaEvents;
 return[6,0x27,0x3a,0x18,0x2f,
  ...box('The Beast calms. Seven\nDragon Balls glow. Dryad\'s\neighth unlocks their light.'),
  ...box('GOKU:Hey, it is snowing!\nKING KAI [telepathy]:\nRadioactive fallout.\nYou AND Frieza this time.'),
  ...box('GOKU:Shenron! Come out!'),...call(0xa3),0x28,24,
  ...box('SHENRON:SPEAK YOUR WISH.'),
  ...box('GOKU:Bring back Popoi,\nRANDI, Dyluck, and everyone\nFrieza hurt. Fix the Sword,\nthe Tree and my accidents.'),
  ...box('GOKU:And the fallout.\nSHENRON:...ALL THE ROOFS?\nGOKU:Please.\nSHENRON:IT IS GRANTED.'),...call(0xa4),
  ...(popoiMember?[0x2b,2]:[]),...call(f.revive),0x28,24,
  ...box(popoiMember?'POPOI:Next time, let me\nfinish the insult!\nGOKU:Good to have you back.':'DRYAD [telepathy]:\nPopoi is safe here.\nHe says he had a much\nbetter insult ready.'),
  ...(mask&1?box('PRIMM:And Dyluck?\nSHENRON:ALIVE.\nGOKU:Everyone, remember?'):[]),
  ...box('DRYAD:My eighth Ball\nis back in the vault.\nSHENRON:THE CRATERS STAY.\nGOKU:Fair enough.'),
  0x30,0x4e,9,0x30,0x0b,2,0x30,0x10,0x0b,0x18,0x8e,...call(0xa5),0x32,1,0x40,8,
  ...box('POTOS VILLAGE\nRandi is alive again.\nThe village is whole.'),
  ...box('RANDI:I had the weirdest\ndream about a sword...\nGOKU:Want lunch?'),
  ...box('RANDI:Why is your hair\ngold now?\nGOKU:Long day.'),...call(0xa6),0];
}
