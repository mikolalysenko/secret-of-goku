import {box,call,jump} from './story-events.js';
import {eventRange} from './event-codec.js';
import {heroFarewell} from './ending-events.js';
export const friezaEvents={offer:0xa7,theft:0xa8,reveal:0xac,steal:0xad,eighth:0xaf,leave:0xbf,showdown:0xc1,lift:0xc2,explode:0xc3,gold:0xc5,battle:0xc6,victory:0xc7,defeated:0xc8,revive:0xc9,reminder:0xca,travel:0xcb,coreCharge:0xcc,coreShot:0xd6,coreImpact:0xd7,escape:0xd8,transitionOffer:0xd9,retailEscape:0xdd,trial:0xf6,empower:0x129,afterTrial:0x12a};
export function buildFriezaEvents(rom,mask,{discVictory=false,collected=7}={}){
 const f=friezaEvents,e=new Map();
 for(const id of Object.values(f)){const{start,end}=eventRange(rom,id);if(end-start!==1||rom[start]!==0)throw Error('Frieza event slot is occupied');e.set(id,[2]);}
 // Keep the old event IDs as unconditional entrances for older saves.
 // Frieza interrupts the story himself; no invitation or opt-out choice.
 for(const id of[f.offer,f.transitionOffer,f.retailEscape])e.set(id,[0x51,1,...jump(f.theft),0]);
 e.set(f.theft,[0x51,1,6,...call(0x7d7),...box('A cold laugh cuts through\nthe palace.'),...call(f.reveal),0x28,10,
  ...box(collected===7?'FRIEZA:Ho ho ho...\nSeven Dragon Balls.\nAnd you collected every\none for me. How thoughtful.':collected?'FRIEZA:Ho ho ho...\nOnly a few Dragon Balls?\nHow lazy. I will take\nwhat you have.':'FRIEZA:Ho ho ho...\nNo Dragon Balls yet?\nYou really have wasted\neveryone\'s time, monkey.'),
  ...box('GOKU:Frieza?!\nI KNEW this was not Namek.\nFRIEZA:Your geography\nremains impressive.'),...call(f.steal),0x28,12,
  ...box(collected?'The Dragon Balls rise\nfrom Goku\'s pouch into\nFrieza\'s hand!':'Frieza snatches the pouch.\nA cloud of sword dust\npours into his hand.\nFRIEZA:Disgusting.'),
  ...box('FRIEZA:That Fortress\nwill make a fine throne.\nFirst, some insurance.'),...call(f.coreCharge),0x28,20,
  ...box('DRYAD:The Mana Tree\nshields the planet\'s core.\nWhat are you doing?!'),
  ...box('FRIEZA:Removing the shield.'),...call(f.coreShot),0x28,24,...call(f.coreImpact),0x2d,6,0xff,0x7f,0x28,3,0x2d,7,0x28,12,
  ...box('FRIEZA:My Death Ball has\ndestabilized the core.\nThis planet will explode\nin FIVE MINUTES!'),
  ...box('LUKA:\nThe roots are burning!\nThe whole sky is changing!'),
  ...box('JEMA:\nHow many weirdos are\nthere out there like you?!'),
  ...(mask&1?box('PRIMM:Five minutes?!\nThere are people down there!\nWe have to save them!'):[]),
  ...(mask&2?box('POPOI:Only five minutes?!\nGoku, hurry! My whole\nvillage is on this planet!'):[]),
  ...box('GOKU:Five minutes?\nSure. I can beat you and\nfix everything before then.'),
  ...box('FRIEZA:You will die here.\nCome to the Fortress\nand face me!'),...call(f.leave),0x28,8,
  ...box(collected===7?'GOKU:He took all seven!\nDRYAD:Yes. All SEVEN.':collected?'GOKU:He took my Balls!\nDRYAD:But not this one.':'GOKU:Hey! My sword dust!\nDRYAD:I have something\na little more useful.'),...call(f.eighth),
  ...box('Dryad produces a ball\nwith EIGHT stars.'),
  ...box('GOKU:There is an eighth?!\nDRYAD:Emergency spare.\nAlso the wish authorization.\nI do not advertise it.'),
  ...box('DRYAD:Keep it. He cannot\nwish without this. Gather\nall seven and defeat him.\nOnly five minutes remain!'),
  ...box('KING KAI:He is absorbing\nthe Fortress\'s Mana!\nFollow the radar. Do NOT\nblow up the Fortress.'),
  ...box('GOKU:Punch Frieza.\nGet the Balls. Fix the core.\nFive minutes is plenty.'),
  ...box('DRYAD:The continent is\nsinking! Fly out, NOW!'),...jump(f.escape),0]);
 // Retail 4A4's exit map, party launch and Mode 7 handoff. The impact owns
 // the world crisis; this uses the cartridge's palette/music/landing setup.
 e.set(f.escape,[0x51,1,0x1b,0xf7,...call(0x47c),0x34,1,0x8a,0x34,2,0x8a,0x34,3,0x8a,8,0x28,2,0x27,0x1e,0x1f,4,0]);
 e.set(f.travel,[0x51,1,...box('LUKA:Dryad felt a strange\npower following the Balls.\nI will guide you to her.'),0x1b,0xfc,0]);
 e.set(f.reminder,[0x51,1,...box('KING KAI:Frieza is inside\nthe Mana Fortress. The core\nwill explode in five minutes!'),...box('DRYAD:Keep my eighth Ball.\nGet all seven and face him.\nGOKU:I will finish in time.'),0]);
 // Frieza sponsors the original Dark Lich encounter before fighting himself.
 // Its native loader, defeat event and flag increments remain authoritative.
 e.set(f.trial,[6,...call(0x7d7),0x30,0x4e,4,0x09,
  ...box('FRIEZA:Before we fight,\nI brought entertainment.\nSorcerer! Earn your keep.'),
  ...box('THANATOS:I do not serve\nyou! This body is failing.\nI need Dyluck to survive!'),
  ...box('FRIEZA:Then have some ki.\nTry not to die immediately.\nI want to watch him sweat.'),...call(f.empower),0x28,16,
  ...box('GOKU:Whoa! That helped.\nKING KAI:Frieza is feeding\nthat thing! Stay alert!'),0x30,0x4e,5,0x09,
  ...box('DYLUCK:He is using my\nbody! I can force him out.\nThe Tree can hold my soul.'),
  ...box(mask&1?'PRIMM:Dyluck! Hold on!\nGOKU:We will wish you back.':'GOKU:You are Dyluck?\nOkay. I will wish you back.\nDYLUCK:Please tell Primm.'),
  ...box('FRIEZA:Touching. Now show\nme what my energy can do!'),
  ...call(0x733),0x30,0x4e,6,0x18,0x2f,0x29,0xff,
  ...box('THANATOS:SUCH POWER!\nFRIEZA:Do amuse me.\nGOKU:Okay! Warm-up first.'),0x2a,0xff,...jump(0x70c),0]);
 e.set(f.afterTrial,[6,0x29,0x4e,...call(0x748),0x29,0xff,0x2a,0xff,
  0x30,0x4e,4,0x18,0x2f,...call(0x7d7),
  ...box('FRIEZA:All that ki.\nAnd not even a scratch.\nWhat a waste of a sorcerer.'),
  ...box('GOKU:That was fun!\nYour turn.\nFRIEZA:You are enjoying\nthis far too much.'),...jump(f.showdown),0]);
 e.set(f.showdown,[6,...call(0x7d7),
  ...box('KING KAI:Dyluck is safe\nwith the Tree. Frieza is\nfar more dangerous. Focus!'),
  ...box('FRIEZA:Now give me that\nlast Dragon Ball.\nGOKU:You could have\njust asked Dryad nicely.'),
  ...(!(mask&2)?[0x39,3,0x80,0x82,0x39,3,0x82,40,0x39,3,0x83,0,0x39,3,0x84,40,0x39,3,0x85,0,0x2b,2]:[]),
  ...box(mask&2?'POPOI:Hey! Give our\nDragon Balls back!':'POPOI:I am Popoi!\nDryad sent me to help!\nIs this the ugly guy?'),
  ...box('FRIEZA:Another small\nfriend. How familiar.'),...call(f.lift),0x28,12,
  ...box('POPOI:Uh... Goku?\nPut me down!'),
  ...box('GOKU:FRIEZA! DON\'T!'),...call(f.explode),0x28,12,0x2c,2,
  ...box('GOKU:Popoi...\nYou did it again.'),...call(f.gold),0x28,14,
  ...box('GOKU:No more games.\nYou are going to pay.'),
  ...box('KING KAI:\nDodge his Death Balls!\nLead his chasing discs\nback into HIM!'),
  ...box('FRIEZA:The core will\nexplode in five minutes!\nYou will never escape!'),
  ...box('GOKU:Then I have time\nto finish you first.\nKING KAI:MOVE, GOKU!'),
  0x30,0x4e,6,0x09,...call(0x733),...call(f.battle),0]);
 e.set(f.victory,[6,...box(discVictory?'FRIEZA:My own... discs?!\nThis planet is defective!':'FRIEZA:Impossible...\nThis planet is defective!'),...call(f.defeated),0x28,12,
  ...box('Goku reclaims his pouch.\nDryad\'s eighth Ball glows\nbeside his collection.'),
  ...box('GOKU:Hang on, Popoi.\nI am bringing you back.'),
  ...box('DRYAD:\nThe Tree has his spirit.\nCalm the Mana Beast.\nThen make the wish.'),
  ...box(mask&1?'PRIMM:And Dyluck.\nGOKU:And Dyluck. Everyone.':'KING KAI:Everyone, Goku.\nGOKU:Everyone.'),
  ...box('LUKA:What in the name\nof Mana was THAT?!'),
  ...box('LUKA:All the Mana in this\nworld... nothing beside\nthat ki! Such overwhelming\npower!'),
  ...box('GOKU:He finally went\nall out. That was a fight!'),
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
  ...box('GOKU:Hey, it is snowing!\nKING KAI:\nRadioactive fallout.\nYou AND Frieza this time.'),
  ...box('GOKU:Shenron! Come out!'),...call(0xa3),0x28,24,
  ...box('SHENRON:SPEAK YOUR WISH.'),
  ...box('KING KAI:The core, Goku!\nIt explodes in five minutes!\nGOKU:I have time to say it.'),
  ...box('GOKU:Bring back Popoi,\nRANDI, Dyluck, and everyone\nFrieza hurt. Fix the Sword,\nthe Tree and my accidents.'),
  ...box('GOKU:Repair the planet\'s\ncore. Undo Frieza\'s Death\nBall. And the fallout.'),
  ...box('SHENRON:...ALL THE ROOFS?\nGOKU:Please.\nSHENRON:IT IS GRANTED.'),...call(0xa4),
  ...box('SHENRON:THE CORE IS WHOLE.\nTHIS WORLD WILL LIVE.\nLUKA:Thank goodness...'),
  ...(popoiMember?[0x2b,2]:[]),...call(f.revive),0x28,24,
  ...box(popoiMember?'POPOI:Next time, let me\nfinish the insult!\nGOKU:Good to have you back.':'DRYAD:\nPopoi is safe here.\nHe says he had a much\nbetter insult ready.'),
  ...(mask&1?box('PRIMM:And Dyluck?\nSHENRON:ALIVE.\nGOKU:Everyone, remember?'):[]),
  ...box('DRYAD:My eighth Ball\nis back in the vault.\nSHENRON:THE LAND IS WHOLE.\nEVEN THE CRATERS ARE GONE.'),
  0x30,0x4e,9,0x30,0x0b,2,0x30,0x10,0x0b,0x18,0x8e,...call(0xa5),0x32,1,0x40,8,
  ...box('POTOS VILLAGE\nRandi is alive again.\nThe village is whole.'),
  ...box('RANDI:I had the weirdest\ndream about a sword...\nGOKU:Want lunch?'),
  ...box('RANDI:Why is your hair\ngold now?\nGOKU:Long day.'),...heroFarewell()];
}
