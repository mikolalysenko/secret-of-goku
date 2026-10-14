import {box,choice,call,jump} from './story-events.js';
import {eventRange,parseEvent} from './event-codec.js';
import {compileStoryEvent} from './story-compiler.js';
export const friezaEvents={offer:0xa7,theft:0xa8,reveal:0xac,steal:0xad,eighth:0xaf,leave:0xbf,showdown:0xc1,lift:0xc2,explode:0xc3,gold:0xc5,battle:0xc6,victory:0xc7,defeated:0xc8,revive:0xc9,reminder:0xca,travel:0xcb,coreCharge:0xcc,coreShot:0xd6,coreImpact:0xd7,escape:0xd8,transitionOffer:0xd9,retailEscape:0xdd};
export function buildFriezaEvents(rom,mask,{discVictory=false}={}){
 const f=friezaEvents,e=new Map();
 for(const id of Object.values(f)){const{start,end}=eventRange(rom,id);if(end-start!==1||rom[start]!==0)throw Error('Frieza event slot is occupied');e.set(id,[2]);}
 e.set(f.offer,[0x51,1,...box('DRYAD:Seven Dragon Balls.\nSomeone has followed their\nlight across the stars.'),...box('I can hide them. Or we\ncan draw him out here.\nKING KAI:This is optional!\nFor once, think first.'),...choice('Investigate the strange ki?\n',[{label:'Later',x:2,to:0},{label:'Draw out',x:15,to:f.theft}])]);
 e.set(f.transitionOffer,[0x51,1,6,...box('DRYAD [telepathy]:\nSeven Balls... Something\nis following their light.'),...box('GOKU:That ki! I know it!\nKING KAI:You can still\nleave without calling it!'),...choice('Call out to the strange ki?\n',[{label:'Leave',x:2,to:f.retailEscape},{label:'Call out',x:16,to:f.theft}],f.retailEscape)]);
 e.set(f.retailEscape,[0x51,1,...compileStoryEvent(parseEvent(rom,0x4a4),mask)]);
 e.set(f.theft,[0x51,1,6,...box('GOKU:Come on out!\nI know you are there.'),...call(f.reveal),0x28,10,
  ...box('FRIEZA:Ho ho ho...\nSeven Dragon Balls.\nAnd you collected every\none for me. How thoughtful.'),
  ...box('GOKU:Frieza?!\nI KNEW this was not Namek.\nFRIEZA:Your geography\nremains impressive.'),...call(f.steal),0x28,12,
  ...box('The seven Dragon Balls\nrise into Frieza\'s hand!'),
  ...box('FRIEZA:That Fortress\nwill make a fine throne.\nFirst, some insurance.'),...call(f.coreCharge),0x28,20,
  ...box('DRYAD:The Mana Tree\nshields the planet\'s core.\nWhat are you doing?!'),
  ...box('FRIEZA:Removing the shield.'),...call(f.coreShot),0x28,24,...call(f.coreImpact),0x2d,6,0xff,0x7f,0x28,3,0x2d,7,0x28,12,
  ...box('FRIEZA:My Death Ball has\ndestabilized the core.\nThis planet will explode\nin FIVE MINUTES!'),
  ...box('LUKA [telepathy]:\nThe roots are burning!\nThe whole sky is changing!'),
  ...box('JEMA [telepathy]:\nHow many weirdos are\nthere out there like you?!'),
  ...(mask&1?box('PRIMM:Five minutes?!\nThere are people down there!\nWe have to save them!'):[]),
  ...(mask&2?box('POPOI:Only five minutes?!\nGoku, hurry! My whole\nvillage is on this planet!'):[]),
  ...box('GOKU:Five minutes?\nSure. I can beat you and\nfix everything before then.'),
  ...box('FRIEZA:You will die here.\nCome to the Fortress\nand face me!'),...call(f.leave),0x28,8,
  ...box('GOKU:He took all seven!\nDRYAD:Yes. All SEVEN.'),...call(f.eighth),
  ...box('Dryad produces a ball\nwith EIGHT stars.'),
  ...box('GOKU:There is an eighth?!\nDRYAD:Emergency spare.\nAlso the wish authorization.\nI do not advertise it.'),
  ...box('DRYAD:Keep it. Without\nthis, he cannot wish.\nRecover the seven. We\nhave only five minutes!'),
  ...box('KING KAI:He is absorbing\nthe Fortress\'s Mana!\nFollow the radar. Do NOT\nblow up the hostage Balls.'),
  ...box('GOKU:Punch Frieza.\nGet the Balls. Fix the core.\nFive minutes is plenty.'),
  ...box('DRYAD:The continent is\nsinking! Fly out, NOW!'),...jump(f.escape),0]);
 // Retail 4A4's exit map, party launch and Mode 7 handoff. The impact owns
 // the world crisis; this uses the cartridge's palette/music/landing setup.
 e.set(f.escape,[0x51,1,0x1b,0xf7,...call(0x47c),0x34,1,0x8a,0x34,2,0x8a,0x34,3,0x8a,8,0x28,2,0x27,0x1e,0x1f,4,0]);
 e.set(f.travel,[0x51,1,...box('LUKA:Dryad felt a strange\npower following the Balls.\nI will guide you to her.'),0x1b,0xfc,0]);
 e.set(f.reminder,[0x51,1,...box('KING KAI:Frieza has the\nseven Dragon Balls inside\nthe Mana Fortress. The core\nwill explode in five minutes!'),...box('DRYAD:Keep my eighth Ball.\nBring the stolen seven back.\nGOKU:I will finish in time.'),0]);
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
  ...box('FRIEZA:The core will\nexplode in five minutes!\nYou will never escape!'),
  ...box('GOKU:Then I have time\nto finish you first.\nKING KAI:MOVE, GOKU!'),
  0x30,0x4e,6,0x09,...call(f.battle),0]);
 e.set(f.victory,[6,...box(discVictory?'FRIEZA:My own... discs?!\nThis planet is defective!':'FRIEZA:Impossible...\nThis planet is defective!'),...call(f.defeated),0x28,12,
  ...box('The seven stolen Dragon\nBalls return to the pouch.\nThe eighth glows beside them.'),
  ...box('GOKU:Hang on, Popoi.\nI am bringing you back.'),
  ...box('DRYAD [telepathy]:\nThe Tree has his spirit.\nCalm the Mana Beast.\nThen make the wish.'),
  ...box(mask&1?'PRIMM:And Dyluck.\nGOKU:And Dyluck. Everyone.':'KING KAI:Everyone, Goku.\nGOKU:Everyone.'),
  ...box('LUKA:The core is still\nbreaking! Five minutes!\nGOKU:One fight left.\nI can do that.'),
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
  ...box('KING KAI:The core, Goku!\nIt explodes in five minutes!\nGOKU:I have time to say it.'),
  ...box('GOKU:Bring back Popoi,\nRANDI, Dyluck, and everyone\nFrieza hurt. Fix the Sword,\nthe Tree and my accidents.'),
  ...box('GOKU:Repair the planet\'s\ncore. Undo Frieza\'s Death\nBall. And the fallout.'),
  ...box('SHENRON:...ALL THE ROOFS?\nGOKU:Please.\nSHENRON:IT IS GRANTED.'),...call(0xa4),
  ...box('SHENRON:THE CORE IS WHOLE.\nTHIS WORLD WILL LIVE.\nLUKA:Thank goodness...'),
  ...(popoiMember?[0x2b,2]:[]),...call(f.revive),0x28,24,
  ...box(popoiMember?'POPOI:Next time, let me\nfinish the insult!\nGOKU:Good to have you back.':'DRYAD [telepathy]:\nPopoi is safe here.\nHe says he had a much\nbetter insult ready.'),
  ...(mask&1?box('PRIMM:And Dyluck?\nSHENRON:ALIVE.\nGOKU:Everyone, remember?'):[]),
  ...box('DRYAD:My eighth Ball\nis back in the vault.\nSHENRON:THE CRATERS STAY.\nGOKU:Fair enough.'),
  0x30,0x4e,9,0x30,0x0b,2,0x30,0x10,0x0b,0x18,0x8e,...call(0xa5),0x32,1,0x40,8,
  ...box('POTOS VILLAGE\nRandi is alive again.\nThe village is whole.'),
  ...box('RANDI:I had the weirdest\ndream about a sword...\nGOKU:Want lunch?'),
  ...box('RANDI:Why is your hair\ngold now?\nGOKU:Long day.'),...call(0xa6),0];
}
