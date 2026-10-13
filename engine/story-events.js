import {dialoguePages,encodeText,eventRange} from './event-codec.js';
export const jump=id=>[0x10+(id>>8),id&255];
export const call=id=>[0x20+(id>>8),id&255];
// An event NOP returns control to the interpreter between windows. Without
// that boundary the native text worker treats an immediate CLOSE/OPEN as one
// stream and can retain the preceding window's selection state.
export const box=text=>[0x50,...dialoguePages(text),0x28,0,0x51,0x01];
export function choice(text,options,cancel=0){
  return[0x50,...encodeText(text),0x58,...options.flatMap(({label,x})=>[0x5a,x,...encodeText(label)]),0x5b,...jump(cancel||0x91),...options.flatMap(({to})=>jump(to||0x91)),0];
}
export const bossReactions={
  0x1b9:'GOKU:Sorry about the floor.\nWas that plant supposed to\nbe that big?',
  0x1e2:'GOKU:Nice kitty!\nOh. Too much petting.',
  0x237:'GOKU:That was a good warmup.\nIs there a bigger one?\nNever mind. Bad question.',
  0x282:'GOKU:I said I would help\nwith the snake. Nobody said\nhow much snake to leave.',
  0x2a1:'GOKU:Sorry! Your machine\nlooked tougher than that.',
  0x52f:'GOKU:Another one?\nThey should really stop\nputting people in those.',
  0x4a4:'GOKU:Three machines. Same\nproblem. Has anyone tried\nasking them to stop?',
  0x425:'GOKU:I am never eating\njelly again.\nWell... not today.',
};

export function buildStoryEvents(rom){
  const original=id=>{const{start,end}=eventRange(rom,id);return Array.from(rom.slice(start,end));};
  const events=new Map();
  // These retail slots contain unique END bytes. They are used only by
  // the new native choices, avoiding any global event-table replacement.
  for(let id=0x85;id<=0x94;id++){
    const{start,end}=eventRange(rom,id);
    if(end-start!==1||rom[start]!==0)throw Error('Story choice event slot is occupied');
  }
  events.set(0x134,[0x42,0xc3,0,...jump(0x92),...choice('LUKA:What will you do?\n',[{label:'Advice',x:1,to:0x85},{label:'Save',x:10,to:0x86},{label:'Shortcut',x:17,to:0x87}])]);
  events.set(0x92,[0x50,...call(0x13a),0x51,0x01,...jump(0x134),0]); // Keep Luka's original one-time weapon gift.
  events.set(0x85,[...box('LUKA:Find seven Dragon\nBalls. Water, Earth, Wind,\nFire, Dark, Light, Moon.'),...box('The seeds are the cases.\nTouch them to collect the\nBalls. Dryad is the eighth\npalace, not an eighth Ball.'),...box('Wish RANDI, the Sword and\nyour accidents back. First\ncalm the Mana Beast. It\nis allergic to Fortresses.'),...box('Fly anywhere. Punch orbs.\nBlast gates. Fly through\ndungeon ceilings if you\nMUST. We will keep a bill.'),...box('Shortcut reaches Thanatos.\nOr shoot the Fortress from\nthe sky. Both are dangerous.\nI know you heard convenient.'),0]);
  events.set(0x86,[0x30,0xfd,0,0x30,0xfe,2,...box('LUKA:I will restore you.'),...call(0x41b),0x2f,0x84,...choice('Want to save the game?\n',[{label:'Yes',x:5,to:0x90},{label:'No',x:17,to:0}])]);
  events.set(0x90,[0x1f,6,0x51,0]); // Original save menu command.
  events.set(0x91,[0x51,0]); // Choices must close their window before END.
  events.set(0x87,[...box('LUKA:I can guide your ki\nstraight to Thanatos.\nSkip the journey and face\nthe last two battles.'),...box('KING KAI:I will fetch any\nmissing Dragon Balls while\nyou fight. Better an errand\nthan a replacement planet.'),...box('LUKA:Free the captive souls,\ncalm the Beast, then wish\nthe crash undone. Try to\nleave the sky attached.'),...choice('Take the shortcut now?\n',[{label:'Stay',x:3,to:0},{label:'Go',x:17,to:0x88}])]);
  events.set(0x88,[...box('GOKU:Can we still wish\nRANDI and the Sword back?\nLUKA:Yes. The Tree is\nkeeping the souls safe.'),...box('KING KAI:I will get any\nmissing Balls. You get\nThanatos. NOT HIS PLANET.'),...box('GOKU:I can feel him now.\nOne villain. Small punch.\nProbably.'),0x2f,0x84,0x30,0x4e,6,0x30,0x0b,2,0x18,0x2f,...box('THANATOS:Who are you?!\nThis is my final body!\nGOKU:Then leave Dyluck\nand the others alone!'),...box('DYLUCK:I can force him out!\nCatch us!\nGOKU:The Mana Tree has you.\nNow, you and me, Thanatos.'),...jump(0x70c),0]);
  events.set(0x89,[0x30,0x4e,8,...jump(0x429),0]);
  events.set(0x8a,[...box('LUKA:You have already freed\nthe world. Please enjoy\nsome quiet travelling.'),0]);
  events.set(0x8b,[...box('GOKU:That was the engine,\nright?\nOh. The whole thing.'),...box('KING KAI:I shielded Mana!\nThe Tree caught the souls!\nLUKA:That was our ENTIRE\nemergency plan, Goku!'),...box('MANA TREE:Thanatos lost\nhis host. Dyluck is safe\nwith RANDI. Your wish can\nbring them back.'),...box('GOKU:Great! All fixed!\nKING KAI:LOOK UP.\nGOKU:That is a VERY\nbig shadow.'),0x2f,0x84,0x30,0x4e,8,...jump(0x429),0]);
  events.set(0x8c,[0x30,0x17,2,0x09,0x0a,...box('GOKU:Three people on a\nswitch? I brought three\nfingers.\nSorry about the gate.'),0]);
  events.set(0x8d,[0x30,0x34,4,0x09,0x0a,...box('GOKU:Hello! I was told\nthere was an invitation.\nI may have knocked\na little too hard.'),0]);
  events.set(0x8e,[0x30,0x37,1,...box('GOKU:There. Unlocked.\nI can put the lock back\nafterwards. Probably.'),0]);
  events.set(0x1bd,[...jump(0x6f4),0]); // Primm no longer refuses Gaia's Navel.
  events.set(0x231,original(0x231).slice(5)); // Undine can be rescued before Elinee.
  events.set(0x62b,original(0x62b).slice(5)); // Goku can enter the Fortress early.
  events.set(0x3dd,[...box('JEHK:Joch says you may try\nthe trial now. He heard the\nmountain shaking.\nGOKU:That was a sneeze.'),...jump(0x3dc),0]);
  events.set(0x59d,[0x32,0,0,0x08,...box('GOKU:Locked. I could find\nthe key... or back up and\ncharge a Kamehameha.'),0x31,0,0x8c,0x08,0]);
  events.set(0x4d8,[0x29,0x5d,...box('MANA TREE:That barrier\nwas older than your species.\nGOKU:It was in the way.'),...box('MANA TREE:RANDI is safe\nwith me. The Dragon Balls\ncan restore him. Come in.\nLeave the forest standing.'),0x02]);
  events.set(0x93,[...box('KING KAI:I got the rest\nof the Dragon Balls!\nI am NOT doing this again.'),...box('GOKU:Thanks! That saved\na lot of walking.\nKING KAI:YOU CAN FLY.'),0x02]);
  events.set(0x94,[...box('KING KAI:All seven Balls!\nYou actually collected them.\nI had a whole speech ready.'),0x02]);
  // The finale uses the same original camera, Mode7 door and boss setup. No
  // nonexistent companion is asked to cast Mana Magic to make damage possible.
  const beastBattle=destroyed=>[0x42,0x4e,0x07,...jump(0),0x18,0x3b,...call(0x47c),...call(0x737),0x2d,6,0x10,0,0x2d,2,0x28,8,0x2d,3,...call(0x93),
    ...box(destroyed?'GOKU:The Fortress is gone!\nYou can go home now!\n...It cannot hear me.':'GOKU:That is a Mana Beast!\nIt is only trying to stop\nthe Fortress.'),
    ...box('Seven Dragon Balls glow\nin the Sword pouch.\nKING KAI:No wish while\nthat thing is panicking!'),
    ...box(destroyed?'MANA TREE:Its rage remains.\nCalm it before it destroys\nwhat you have saved.':'MANA TREE:Guide your power.\nBreak its rage, and let\nMana flow home again.'),
    ...box('GOKU:So I can save it?\nMANA TREE:Yes. Ki is yours.\nYour friends need not\nspend their lives on it.'),
    ...box('GOKU:One careful beam.\nThen one wish fixes it all.\nKING KAI:YOUR DEFINITION\nOF CAREFUL WORRIES ME.'),
    0x2d,6,255,255,...call(0x739),0x18,0xbc,0x30,0x0b,0x0f,...box('GOKU:Easy...\nNo planet-sized crater.'),0];
  events.set(0x429,beastBattle(false));events.set(0x8f,beastBattle(true));
  events.set(0x42f,[
    ...box('The Beast calms. Mana is\nsafe. Seven Dragon Balls\nglow in a bag of sword dust.'),
    ...box('SHENRON:STATE YOUR WISH.\nGOKU:Please undo the harm\nfrom my crash and all this\nFortress mess. Everyone too.'),
    ...box('SHENRON:RANDI. DYLUCK. THE\nSWORD. THE TREE. THE SOULS.\nTHE ROOFS. ...ALL THE ROOFS?'),
    ...box('GOKU:Yeah. My bad.\nSHENRON:IT IS GRANTED.\nNEXT TIME, USE A DOOR.'),
    ...box('RANDI:I had the weirdest\ndream about a sword.\nGOKU:Want lunch?\nKING KAI:I NEED A HOLIDAY.'),
    ...box('JEMA:You saved the world.\nELDER:You missed the bridge.\nGOKU:Small hammer. Got it.\nNo Kamehameha.'),
    ...original(0x42f)]);
  // Choice branches begin with the preceding selection window still open.
  // Close it before opening prose or another choice, including direct calls.
  for(const id of[0x85,0x86,0x87,0x88,0x89,0x8a])events.set(id,[0x51,0x01,...events.get(id)]);
  return events;
}
