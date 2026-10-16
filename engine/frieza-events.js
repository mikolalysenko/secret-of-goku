import {box,call,jump} from './story-events.js';
import {eventRange} from './event-codec.js';
import {heroFarewell} from './ending-events.js';
import {endingEvents} from './ending-rules.js';
import {wishFlightTiming} from './wish-flight.js';
export const friezaEvents={offer:0xa7,theft:0xa8,reveal:0xac,steal:0xad,eighth:0xaf,leave:0xbf,showdown:0xc1,lift:0xc2,explode:0xc3,gold:0xc5,battle:0xc6,victory:0xc7,defeated:0xc8,revive:0xc9,reminder:0xca,travel:0xcb,coreCharge:0xcc,coreShot:0xd6,coreImpact:0xd7,escape:0xd8,transitionOffer:0xd9,retailEscape:0xdd,trial:0xf6,empower:0x129,afterTrial:0x12a,emperorShot:0x66,emperorFall:0x67,treeReminder:0x68,treeArrival:0x178,treeCharge:0x179,treeShot:0x17a,treeImpact:0x17b,treeLeave:0x17c,treeDone:0x17d,treeReturn:0x19d,treeWake:0x1a4,altarApproach:0x1a8,emperorRoom:0x4a6,emperorPrelude:0x4a7,sceneClear:0x4a8,fanhaFinish:0x4a9,templeExit:0x69,coreArrival:0x6a,trialReady:0x6e,trialLeave:0x6f,trialFade:0x71,palace:0x7b,deckDeathBall:0x7c};
export function buildFriezaEvents(rom,mask,{collected=7,emperorKilled=false,palace=true}={}){
 const f=friezaEvents,e=new Map();
 for(const id of Object.values(f)){const{start,end}=eventRange(rom,id);if(end-start!==1||rom[start]!==0)throw Error('Frieza event slot is occupied');e.set(id,[2]);}
 // Keep the old event IDs as unconditional entrances for older saves.
 // Frieza interrupts the story himself; no invitation or opt-out choice.
 for(const id of[f.offer,f.transitionOffer,f.retailEscape])e.set(id,[0x51,1,...jump(f.theft),0]);
 // The shot, slow reveal and theft are one continuous altar-room scene.
 // Doors rebuild the native event stack. Keep this choreography inline in
 // either entry, never inside a CALL that must return across a door load.
 const altarEntrance=[6,...call(f.emperorPrelude),0x1b,0xfc,...call(0x7d7),0x32,1,0,8];
 const emperorPrelude=[...altarEntrance,
  ...box('EMPEROR:The Fortress is\nmine! The eighth Ball\nwill make my reign eternal!'),
  ...call(f.emperorShot),0x28,8,...call(f.emperorFall),0x28,20,
  ...box('GOKU:The Emperor!\nThat shot came from\nover there...'),
  ...box('KING KAI:That ki...\nGoku, be careful.')];
 e.set(f.emperorRoom,[0x51,1,...jump(f.theft),0]);
 e.set(f.theft,[0x51,1,6,...(!emperorKilled?emperorPrelude:altarEntrance),
  ...call(f.reveal),0x28,60,
  ...box('FRIEZA:An emperor and\nhis generals. Such grand\ntitles for such weaklings.'),
  ...box('GOKU:Frieza!\nGet away from that Seed!'),
  ...call(f.altarApproach),0x32,1,16,8,...call(f.steal),0x28,16,
  ...box(collected===7?'FRIEZA:Ho ho ho...\nSeven Dragon Balls.\nAnd you collected every\none for me. How thoughtful.':collected?'FRIEZA:Ho ho ho...\nOnly a few Dragon Balls?\nHow lazy. I will take\nwhat you have.':'FRIEZA:Ho ho ho...\nNo Dragon Balls yet?\nYou really have wasted\neveryone\'s time, monkey.'),
  ...box(collected?'The Dragon Balls rise\nfrom Goku\'s pouch into\nFrieza\'s hand!':'Frieza snatches the pouch.\nA cloud of sword dust\npours into his hand.\nFRIEZA:Disgusting.'),
  ...box('GOKU:You killed him!\nFRIEZA:I dislike sharing\nthe title of Emperor.'),
  ...box('FRIEZA:Your Emperor\nmentioned an eighth Ball.\nHidden at the Mana Tree.\nI shall collect that next.'),
  // Through the Grand Palace, Hexas and Rider III still stand before the
  // Fortress. A Goku who flew straight to the Fortress gets the deck now.
  ...(palace?[
   ...box('FRIEZA:But first, the\nEmperor\'s Fortress is\nwaking up. I want to see\nwhat your generals do.'),
   ...box('FRIEZA:Run along, monkey.\nPlay with them. I will be\nwatching.'),
   ...call(f.palace),0x28,64,
   ...box('GOKU:He took the Balls!\nKING KAI:Then get them\nback! Carefully!'),
   ...box('KING KAI:Fanha and\nGeshtar are still deeper\nin the palace. Stop them\nbefore the Fortress flies!'),0x09,0x0a,0]:[
   ...box('FRIEZA:Come up to the\nFortress, monkey. I want\nyou to see this.'),
   ...call(f.templeExit),0x28,36,0x18,0x3b,...jump(f.deckDeathBall),0])]);
 // After Mech Rider III, 4A4's Fortress launch hands over here. Frieza
 // lands on the deck and fires the Death Ball into the planet's core.
 e.set(f.deckDeathBall,[0x51,1,6,
  ...box('FRIEZA:Ho ho ho! Such a\nnoisy little machine.\nNow for MY entertainment.'),
  ...box('FRIEZA:Filthy monkey!\nI erased Planet Vegeta.\nI will erase this world too!'),
  ...call(f.coreArrival),0x28,20,...call(f.coreCharge),0x28,12,
  ...box('DRYAD:The Fortress sits\nover the planet\'s core!\nWhat are you doing?!'),
  ...box('FRIEZA:Removing the shield.\nDo watch closely, monkey.'),
  ...box('GOKU:Stop! Everyone down\nthere will be hit!'),
  // The Fortress lurches free; the native flyby over the sinking continent
  // is where the ball grows, falls and detonates (frieza-flyby.js).
  0x1b,0xf7,...jump(f.escape),0]);
 // Retail 4A4's exit map, party launch and Mode 7 handoff. The impact owns
 // the world crisis; this uses the cartridge's palette/music/landing setup.
 e.set(f.escape,[0x51,1,0x28,24,...call(0x47c),0x34,1,0x8a,0x34,2,0x8a,0x34,3,0x8a,8,0x28,2,0x27,0x1e,0x1f,4,0]);
 e.set(f.travel,[0x51,1,...box('LUKA:Dryad felt a strange\npower following the Balls.\nI will guide you to her.'),0x1b,0xfc,0]);
 e.set(f.reminder,[0x51,1,...box('KING KAI:Frieza is inside\nthe Mana Fortress. This planet\nwill explode in five minutes!'),...box('DRYAD:Keep my eighth Ball.\nGet all seven and face him.\nGOKU:I will finish in time.'),0]);
 e.set(f.treeReminder,[0x51,1,...box('KING KAI:Frieza is at\nthe Mana Tree! He thinks\nthe eighth Ball is there.'),...box('LUKA:Follow him through\nPure Land. Please stop him\nbefore he harms the Tree!'),0]);
 // Frieza sponsors the original Dark Lich encounter before fighting himself.
 // Its native loader, defeat event and flag increments remain authoritative.
 const enterCourt=[0x32,1,4,...(mask&1?[0x32,2,0x94]:[]),...(mask&2?[0x32,3,0xd4]:[]),8,
  ...(mask&1?[0x32,2,0x48]:[]),...(mask&2?[0x32,3,0x48]:[]),8,
  0x32,1,0,...(mask&1?[0x32,2,0]:[]),...(mask&2?[0x32,3,0]:[]),0x28,16];
 e.set(f.trial,[6,...call(0x7d7),0x30,0x4e,4,0x09,
  ...enterCourt,...call(f.trialReady),
  ...box('FRIEZA:A sorcerer who\nsteals bodies? How quaint.\nYou do amuse me, Thanatos.'),
  ...box('FRIEZA:Captain Ginyu used\nthat trick. He is a frog now.\nDo try to aim higher.'),
  ...box('THANATOS:I do not serve\nyou! This body is failing.\nI need Dyluck to survive!'),
  ...box('FRIEZA:Here. A little\nof my power. Let us see\nif you can entertain me.'),...call(f.empower),0x28,28,
  ...box('GOKU:Whoa! His ki is\nshooting up! This is going\nto be a great fight!'),
  ...(mask&1?box('{1}:Are you HAPPY?!\nDyluck is in danger and\nyou want him STRONGER?!'):[]),
  ...(mask&2?box('{2}:Goku, that is bad!\nHe was already scary!\nPlease stop smiling!'):[]),
  ...box('GOKU:Then let Dyluck go!\nYou do not need his body\nwith all that power!'),0x30,0x4e,5,0x09,
  ...box('DYLUCK:He is using my\nbody! I can force him out.\nThe Tree can hold my soul.'),
  ...box(mask&1?'{1}:Dyluck! Hold on!\nGOKU:We will wish you back.':'GOKU:You are Dyluck?\nOkay. I will wish you back.\nDYLUCK:Please tell {1}.'),
  ...box('THANATOS:SUCH POWER!\nI need no mortal body!\nBehold my true form!'),
  ...box('FRIEZA:I will watch\nfrom above. Do try to\nmake him work for it.'),
  ...call(f.trialLeave),0x28,24,...call(f.sceneClear),...call(f.trialFade),0x28,14,
  ...call(0x733),0x30,0x4e,6,0x18,0x2f,0x29,0xff,
  ...box('GOKU:A giant skeleton!\nOkay! Show me what you\ncan do!'),0x2a,0xff,...jump(0x70c),0]);
 e.set(f.afterTrial,[6,0x29,0x4e,...call(0x748),0x29,0xff,0x2a,0xff,
  0x30,0x4e,4,0x18,0x2f,...jump(f.showdown),0]);
 e.set(f.showdown,[6,...call(0x7d7),...enterCourt,
  ...box('FRIEZA:All that ki.\nAnd not even a scratch.\nWhat a waste of a sorcerer.'),
  ...box('GOKU:That was fun!\nYour turn.\nFRIEZA:You are enjoying\nthis far too much.'),
  ...box('KING KAI:The Dragon Balls\ncan bring Dyluck back!\nGet them back from Frieza!'),
  ...box('KING KAI:Focus on beating\nFrieza. Then make the wish.\nGOKU:Right! Everyone comes back.'),
  ...box('FRIEZA:Now give me that\nlast Dragon Ball.\nGOKU:You could have\njust asked Dryad nicely.'),
  ...(!(mask&2)?[0x39,3,0x80,0x82,0x39,3,0x82,40,0x39,3,0x83,0,0x39,3,0x84,40,0x39,3,0x85,0,0x2b,2,0x32,3,0xd4,8,0x32,3,0x48,8,0x32,3,0]:[]), // ADD stacks the guest on Goku: walk him into view.
  ...box(mask&2?'{2}:Hey! Give our\nDragon Balls back!':'{2}:I am {2}!\nDryad sent me to help!\nIs this the ugly guy?'),
  ...box('FRIEZA:Another small\nfriend. How familiar.'),...call(f.lift),0x28,12,
  ...box('{2}:Uh... Goku?\nPut me down!'),
  ...box('GOKU:FRIEZA! DON\'T!'),...call(f.explode),0x28,12,0x2c,2,
  ...box('GOKU:{2}...\nYou did it again.'),...call(f.gold),0x28,14,
  ...box('GOKU:No more games.\nYou are going to pay.'),
  ...(mask&1?[
   ...box('{1}:This is insane!\nI cannot even get near him!'),
   ...box('GOKU:Get clear, {1}!\nHelp everyone get to safety.\nI will handle Frieza.'),
   ...box('{1}:You had better\ncome back, Goku!'),0x32,2,0x90,8,0x2c,1,
  ]:[]),
  ...box('KING KAI:\nDodge his Death Balls!\nLead his chasing discs\nback into HIM!'),
  ...box('FRIEZA:This planet will\nexplode in five minutes!\nYou will never escape!'),
  ...box('GOKU:Then I have time\nto finish you first.\nKING KAI:MOVE, GOKU!'),
  0x30,0x4e,6,0x09,...call(0x733),...call(f.battle),0]);
 // The orbital counter already destroys Frieza and shows Goku's return.
 // Never resurrect him on the deck for a second, unrelated disc death.
 e.set(f.victory,[6,...call(f.defeated),
  ...box('GOKU:Got my pouch!\nNow we can wish {2}\nand Dyluck back.'),
  ...box('DRYAD:The Tree holds\ntheir souls. Calm the Beast,\nthen wish everyone back.'),
  // Luka's native restore (event 41B) ends with the healing chime, SPC
  // command 02 07 00 88; play it as Goku's HP refills.
  ...box('LUKA:Let me heal you.'),0x2f,1,0x40,2,7,0,0x88,
  ...box('GOKU:A Zenkai boost!\nI feel stronger already!'),
  ...box('LUKA:The planet still\nhas FIVE MINUTES!\nGOKU:One more good fight!'),
  0x30,0x4e,8,0x39,2,0xcd,0x38,0x39,3,0xcd,7,...jump(0x429),0]);
 return e;
}

// Popoi is restored only to a party that had actually recruited him. A solo
// visit gets a cameo and a happy return to Dryad, not a forced companion.
export function buildFriezaEnding(mask,popoiMember){
 const f=friezaEvents;
 return[6,0x28,12,...call(0x72c),0x18,0x2f,...call(endingEvents.clearing),0x28,8,
  ...box('The Beast calms. Seven\nDragon Balls glow. Dryad\'s\neighth unlocks their light.'),
  ...box('GOKU:Hey, it is snowing!\nKING KAI:\nRadioactive fallout.\nYou AND Frieza this time.'),
  ...box('GOKU:Shenron! Come out!'),...call(0xa3),0x28,24,
  ...box('SHENRON:SPEAK YOUR WISH.'),
  ...box('KING KAI:The planet, Goku!\nIt explodes in five minutes!\nGOKU:I have time to say it.'),
  ...box('GOKU:Bring back {2},\n{3}, Dyluck, and everyone\nFrieza hurt. Fix the Sword,\nthe Tree and my accidents.'),
  ...box('GOKU:Repair the planet\'s\ncore. Undo Frieza\'s Death\nBall. And the fallout.'),
  ...box('SHENRON:...ALL THE ROOFS?\nGOKU:Please.\nSHENRON:IT IS GRANTED.'),...call(0xa4),...call(0x73a),
  ...box('SHENRON:THE CORE IS WHOLE.\nTHIS WORLD WILL LIVE.\nLUKA:Thank goodness...'),
  ...(mask&1?[0x2b,1]:[]),...(popoiMember?[0x2b,2]:[]),...call(f.revive),0x28,24,
  ...box(popoiMember?'{2}:Next time, let me\nfinish the insult!\nGOKU:Good to have you back.':'DRYAD:\n{2} is safe here.\nHe says he had a much\nbetter insult ready.'),
  ...(mask&1?box('{1}:And Dyluck?\nSHENRON:ALIVE.\nGOKU:Everyone, remember?'):[]),
  ...box('DRYAD:My eighth Ball\nis back in the vault.\nSHENRON:THE LAND IS WHOLE.\nEVEN THE CRATERS ARE GONE.'),
  ...box('SHENRON:FAREWELL.'),...call(endingEvents.scatter),0x28,wishFlightTiming.end/5,
  ...(mask&1?[
   ...call(endingEvents.reunion),...call(0x73a),0x1b,0xff,
   // The original cliff, native movement and happy reunion music. Dyluck
   // is a real map NPC again; the wish reunites the couple on screen.
   0x32,1,0x48,0x32,2,0x50,8,0x32,1,0xc8,0x32,2,0x84,0x32,4,0xc0,8,
   ...box('{1}:Dyluck!\nDYLUCK:I heard you calling.\nThen the Tree let me go...'),
   0x32,2,0x88,8,0x28,12,
   ...box('{1}:You are really here!\nDYLUCK:Thanks to your wish.\nThank you, Goku.'),
   0x32,1,0x80,8,
   ...box('GOKU:Good to see you\nwithout that sorcerer!\n{1}:Everyone is home again.'),
   ...box('GOKU:Told you five\nminutes was plenty!'),
   ...box('{1}:Please never say\nthat to me again.\n...Thank you, Goku.'),
   0x28,24,
  ]:[]),
  0x30,0x4e,9,0x30,0x0b,2,0x30,0x10,0x0b,0x18,0x8e,...call(0xa5),...call(0x73a),0x32,1,0x40,8,
  ...box('POTOS VILLAGE\n{3} is alive again.\nThe village is whole.'),
  ...box('{3}:I had the weirdest\ndream about a sword...\nGOKU:Want lunch?'),
  ...box('{3}:Did you fix\nthe bridge too?\nGOKU:...Where is the hammer?'),...heroFarewell()];
}
