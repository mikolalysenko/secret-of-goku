import {dialoguePages,encodeText,eventRange} from './event-codec.js';
import {endingEvents} from './ending-rules.js';
import {heroFarewell} from './ending-events.js';
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

export function buildStoryEvents(rom,mask=0,{crisis=false}={}){
  const original=id=>{const{start,end}=eventRange(rom,id);return Array.from(rom.slice(start,end));};
  const events=new Map();
  // These retail slots contain unique END bytes. They are used only by
  // the new native choices, avoiding any global event-table replacement.
  for(const id of [...Array.from({length:0x13},(_,i)=>0x85+i),0x9a,0x9b,0x9c,0x9d,0x9e,0x9f,0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0xa6,...Object.values(endingEvents)]){
    const{start,end}=eventRange(rom,id);
    if(end-start!==1||rom[start]!==0)throw Error('Story choice event slot is occupied');
  }
  events.set(0x133,[0x32,0,0,0x2d,8,0x30,0x0a,0,...choice('LUKA:GOKU, what are you\nso scared of?\n',[{label:'NOTHING',x:9,to:0x9c}],0x9c)]);
  events.set(0x9c,[0x51,0x01,...box('GOKU:Nothing!\nThat Fortress looks like\na pretty good workout.'),...box('LUKA:That is what\nscares ME.'),...jump(0x200),0]);
  events.set(0x9d,[0x30,0x2d,5,0]); // Breached NTR seal: stage the native rescue, not its completion.
  for(let i=0;i<3;i++){
    const stage=2+i*2;
    // Only the gate's own guardians are skipped. Never lower later progress
    // or run the Tree scene remotely; stepping through still owns travel.
    events.set(0x9e+i,[0x42,0x46,(stage<<4)|15,...jump(0),0x30,0x46,stage,0]);
  }
  events.set(0xa1,[...box('MORIE:No one may enter!\nGOKU:But I am already here.\nDo I go out and try again?'),
    ...box('MORIE:How did you get past\nthe guards?!\nGOKU:They were guarding\nthe floor.'),
    ...box('KING KAI:The Empire is\nboarding the ship!\nGOKU:Finally! Someone\nwho wants to fight!'),
    0x30,0x28,10,0x19,0xab,0x29,0x28,...jump(0x29d),0]);
  // If Primm really was captured, flying past the guards skips their decoy
  // puzzle but preserves the original rescue and recruitment choreography.
  events.set(0xa2,[0x30,0x28,7,...jump(0x29c),0]);
  events.set(0x134,[0x42,0xc3,0,...jump(0x92),...choice('LUKA:What will you do?\n',[{label:'Advice',x:5,to:0x85},{label:'Save',x:17,to:0x86}])]);
  events.set(0x92,[0x50,...call(0x13a),0x51,0x01,...jump(0x134),0]); // Keep Luka's original one-time weapon gift.
  events.set(0x85,[...box('LUKA:Find seven Dragon\nBalls. Water, Earth, Wind,\nFire, Dark, Light, Moon.'),...box('The seeds are the cases.\nTouch them to collect the\nBalls. Dryad guards the\neighth palace. She keeps\nher own counsel.'),...box('Wish RANDI, the Sword and\nyour accidents back. First\ncalm the Mana Beast. It\nis allergic to Fortresses.'),...box('Collect all seven Balls.\nSee Dryad before the wish.\nThe Beast must release\nall its trapped Mana.'),...box('Fly anywhere. Punch orbs.\nBlast gates. Fly through\ndungeon ceilings if you\nMUST. We will keep a bill.'),...box('Destroying the Fortress\nwould burn away all Mana.\nNo wish could fix that.\nPlease leave it standing.'),0]);
  events.set(0x86,[0x30,0xfd,0,0x30,0xfe,2,...box('LUKA:I will restore you.'),...call(0x41b),0x2f,0x84,...choice('Want to save the game?\n',[{label:'Yes',x:5,to:0x90},{label:'No',x:17,to:0}])]);
  events.set(0x90,[0x1f,6,0x51,0]); // Original save menu command.
  events.set(0x91,[0x51,0]); // Choices must close their window before END.
  // Retired Luka travel choices return to her menu even if an old selection
  // still dispatches their event IDs. Neither can skip into the final fights.
  for(const id of[0x87,0x88])events.set(id,[0x51,0x01,...jump(0x134),0]);
  // The retail scene repeatedly positions, strikes and waits for Primm,
  // then moves Goku relative to her. Flight and solo arrival do not provide
  // those actors/starting positions. This scene uses native text, music,
  // fades, object refresh and the original Dark Lich setup without any
  // party-dependent motion or waits. Dyluck is introduced here, not assumed
  // to be Goku's long-lost friend. The party can still accompany Goku.
  events.set(0x4e1,[0x06,0x27,0xd7,
    ...box('THANATOS:My body grows\nweak. I must take Dyluck\nand rule this world!'),
    ...box('GOKU:That guy? He looks\npretty tired too.\nLet him go.'),
    ...box('THANATOS:This Fortress\nis overflowing with Mana!\nI will take it ALL!'),
    ...box('KING KAI:He is drawing\npower from the Fortress!\nStay alert, Goku!'),
    0x27,0x8e,0x2d,6,0x10,0,0x28,12,0x2d,4,
    ...box('GOKU:Whoa! That helped.\nNow let Dyluck go and\nfight me.'),
    0x30,0x4e,5,0x09,
    ...box('DYLUCK:He is stealing\nmy body!\nGOKU:I am Goku.\nI will get you out.'),
    ...box('DYLUCK:I can force him out.\nThe Mana Tree can hold my\nspirit until your wish.'),
    ...box('GOKU:Great! Then he can\nfight without borrowing you.\nDYLUCK:That is your concern?'),
    ...box(mask&1?'DYLUCK:Primm! I will return.\nPRIMM:You had better.\nGOKU:I will make the wish.':'DYLUCK:Please find Primm.\nTell her I will return.\nGOKU:Okay. I will ask around.'),
    0x27,0x33,0x30,0x4e,6,0x18,0x2f,0x29,0xff,
    ...box('THANATOS:Behold my true\nform! Now you will suffer!'),
    ...box('GOKU:A giant skeleton!\nI KNEW you had more!\nKING KAI:DO NOT FEED IT.'),
    0x2a,0xff,...jump(0x70c),0]);
  // The original aftermath waits for Primm to mourn and Popoi to collapse.
  // Filtering their lines leaves empty windows and Goku answering nobody.
  // King Kai is explicitly telepathic, so this scene also works alone.
  events.set(0x42d,[0x06,
    ...box('The seal on Mana Magic\nis broken. Thanatos falls.'),
    0x29,0x4e,0x27,0x48,0x29,0xff,
    ...box('GOKU:Now THAT was better!\nHe had a lot left in him.'),
    ...box('KING KAI:That was the\nFortress\'s Mana!\nPlease take this seriously.'),
    ...box(mask&1?'PRIMM:And Dyluck?\nKING KAI:\nSafe with the Tree.\nThe wish will bring him back.':'GOKU:What about Dyluck?\nKING KAI:The Tree has him.\nYour wish can bring him\nback with RANDI.'),
    0x2a,0xff,0x27,0x31,0x18,0x2f,0x28,8,
    0x27,0x84,0x2d,2,0x28,8,0x2d,8,0x27,0x36,
    ...box('GOKU:Whoa! The floor!\nKING KAI:\nThe Mana Beast is coming!'),
    ...box('GOKU:I can feel it!\nNow THAT is a challenge!\nKING KAI:THAT IS A WARNING.'),
    0x29,0x4e,0x39,2,0xcd,0x38,0x39,3,0xcd,7,0]);
  events.set(0x89,[0x30,0x4e,8,...jump(0x429),0]);
  events.set(0x8a,[...box('LUKA:You have already freed\nthe world. Please enjoy\nsome quiet travelling.'),0]);
  events.set(0x8b,[...call(0x7d7),...box('GOKU:Uh... I hit more\nthan the engine.'),...box('LUKA:The Fortress is\nfalling apart!\nGoku, get out of there!'),0x2f,0x84,0x30,0x4e,8,...jump(0x429),0]);
  events.set(0x8c,[0x30,0x17,2,0x09,0x0a,...box('GOKU:Three people on a\nswitch? I brought three\nfingers.\nSorry about the gate.'),0]);
  events.set(0x8d,[0x30,0x34,4,0x09,0x0a,...box('GOKU:Hello! I was told\nthere was an invitation.\nI may have knocked\na little too hard.'),0]);
  events.set(0x8e,[0x30,0x37,1,...box('GOKU:There. Unlocked.\nI can put the lock back\nafterwards. Probably.'),0]);
  events.set(0x9b,[...box('HEY! Get lost!\nStop flying around Potos!\nBanished includes the AIR!'),...box('GOKU:Oh. Sorry!\nI thought you meant\nthe ground.'),...jump(0x11c),0]);
  events.set(0x1bd,[...jump(0x6f4),0]); // Primm no longer refuses Gaia's Navel.
  events.set(0x231,original(0x231).slice(5)); // Undine can be rescued before Elinee.
  events.set(0x368,original(0x368).slice(5)); // A flying Saiyan does not need a Magic Rope to enter the Dwarf Village pit.
  events.set(0x62b,original(0x62b).slice(5)); // Goku can enter the Fortress early.
  events.set(0x3dd,[...box('JEHK:Joch says you may try\nthe trial now. He heard the\nmountain shaking.\nGOKU:That was a sneeze.'),...jump(0x3dc),0]);
  events.set(0x59d,[0x32,0,0,0x08,...box('GOKU:Locked. I could find\nthe key... or back up and\ncharge a Kamehameha.'),0x31,0,0x8c,0x08,0]);
  events.set(0x4d8,[0x29,0x5d,...box('MANA TREE:That barrier\nwas older than your species.\nGOKU:It was in the way.'),...box('MANA TREE:RANDI is safe\nwith me. The Dragon Balls\ncan restore him. Come in.\nLeave the forest standing.'),0x02]);
  // Goku interrupts the abduction instead of watching a companion be killed.
  // Dyluck briefly breaks his possession; native doors, Vampire setup,
  // rewards and flags remain. No absent victim is staged or recruited.
  {
    events.set(0x555,[0x42,0x2d,0x5f,...jump(0x557),0x06,
      ...box('GOKU:Hi! I am Goku.\nDYLUCK:Dyluck. You should\nnot have come here.'),
      ...box(mask&1?'PRIMM:Dyluck! It is me!\nDYLUCK:Come closer...\nGOKU:Wait. That is not\nhis ki doing the talking.':'GOKU:People are worried\nabout you. What is wrong?\nDYLUCK:Thanatos needs\nmore life energy...'),
      ...box('GOKU:You do not sound\nlike you mean that.\nTry fighting him.'),
      0x27,0x87,0x28,8,
      ...box('DYLUCK:Ugh! I can hear you.\nGo through the door.\nI can weaken his spell.\nHelp the people inside!'),
      0x29,0x2d,0]);
    events.set(0x557,[0x51,0x01,...box('DYLUCK:The door behind me.\nI will hold him back.\nHurry!'),0]);
    events.set(0x558,[0x06,0x27,0xd8,
      ...box('THANATOS:You again!\nYour life force could\nfeed an entire army!'),
      ...box('GOKU:People are not food.\nHave you tried rice?\nI could eat a whole army\nof rice balls.'),
      0x2d,6,0xff,0x43,0x28,8,0x2d,7,
      ...box('THANATOS:My binding spell!\nDyluck is interfering!\nGOKU:He is trying to help.'),
      ...box('THANATOS:Enough!\nVampire, destroy him!\nGOKU:Oh! You have a pet too.'),
      // Stage 6 removes the departed cast before stage 7 can spawn the boss.
      // Otherwise the native loader can switch to boss mode between commands
      // and interpret a remaining NPC's animation data as an enemy AI pointer.
      0x30,0x2d,6,0x09,0x30,0x2d,7,0x1b,0x18,...jump(0x704),0]);
    events.set(0x559,[...call(0x506),0x27,0xd8,0x29,0x2d,0x1b,0x19,
      ...box(mask&1?'PRIMM:Where is Dyluck?\nGOKU:They got away again.\nBut he fought the spell.':'GOKU:They got away again.\nBut the people are free.'),
      ...box(mask&1?'PRIMM:I will find him.\nGOKU:We will help.\nA punch cannot fix\neverything. Apparently.':'GOKU:Hang on, Dyluck.\nI will find a way to\nget you out of there.'),0x30,0x32,2,0]);
  }
  events.set(0x93,[...box('KING KAI:You do not have\nall the Dragon Balls!\nWe cannot make the wish!'),0x02]);
  events.set(0x94,[...box(crisis?'KING KAI:Seven Balls back!\nNow calm the Beast!\nFive minutes remain!':'KING KAI:All seven Balls!\nYou actually collected them.\nI had a whole speech ready.'),0x02]);
  // The finale uses the same original camera, Mode7 door and boss setup. No
  // nonexistent companion is asked to cast Mana Magic to make damage possible.
  const beastBattle=destroyed=>[0x42,0x4e,0x07,...jump(0),0x18,0x3b,...call(0x47c),...call(0x737),0x2d,6,0x10,0,0x2d,2,0x28,8,0x2d,4,...call(0x93),
    ...box(destroyed?'LUKA:The Mana Beast is\nattacking! There are still\npeople down here!':'LUKA:The Mana Beast is\nattacking the Fortress!\nGoku, stop it!'),
    ...box('GOKU:Whoa! That ki...\nNow THIS looks like\na challenging fight!'),
    ...(crisis?[...box('KING KAI:Five minutes\nuntil the planet explodes!\nGOKU:Plenty of time!')]:[]),
    ...jump(0x9a),0];
  events.set(0x429,beastBattle(false));events.set(0x8f,beastBattle(true));
  events.set(0x95,[...jump(0x97),0]);
  events.set(0x96,[...box('KING KAI:You have all seven!\nNow listen VERY CAREFULLY-\nGOKU:Hey, big guy! Catch!'),...box('Before King Kai can finish,\nGoku pours all seven Mana\nSeeds\' energy into the Beast.'),0x2d,2,0x2d,6,0x10,0,0x28,12,0x2d,4,
    ...box('GOKU:Eat up! I want to\nfight you at your best!\nCome on! Show me MORE!\nKING KAI:HE IS ENJOYING THIS.'),
    ...box(crisis?'LUKA:FIVE MINUTES, GOKU!\nPlease stop feeding it!\nGOKU:I will still finish\nwith time to spare.':'LUKA:WE ASKED YOU TO SAVE\nTHE WORLD. NOT SEASON IT.\nGOKU:Just a little stronger!\nI know you can do it!'),
    ...box('KING KAI:It has four times\nthe resistance to your ki!\nGOKU:And bigger muscles!\nThis is going to be GREAT.'),...jump(0x97),0]);
  events.set(0x97,[0x2d,6,255,255,...call(0x739),0x18,0xbc,0x30,0x0b,0x0f,...box(crisis?'KING KAI:Five minutes\nuntil the core blows!\nGOKU:Then let us finish!':'GOKU:All right, big guy.\nShow me what you can do!'),0]);
  // Replaced at runtime by earned wards and the mandatory seven-seed feed.
  events.set(0x9a,[...jump(0x95),0]);
  // A short wish scene replaces the retail credits montage, which forcibly
  // recruits Primm and assumes Popoi has just disappeared even on solo runs.
  for(const id of[0xa3,0xa4,0xa5,0xa6,...Object.values(endingEvents)])events.set(id,[0x02]);
  events.set(0x42f,[0x06,0x27,0x3a,0x18,0x2f,
    ...box('The Beast calms. Seven\nDragon Balls glow in a\nbag of sword dust.'),
    ...box('GOKU:Hey, it is snowing!\nKING KAI:\nThat is radioactive fallout\nfrom your Kamehameha!'),
    ...box('GOKU:Oh. Better fix that.\nShenron! Come out!'),
    ...call(0xa3),0x28,0x18,
    ...box('SHENRON:SPEAK YOUR WISH.'),
    ...box('GOKU:Bring back RANDI,\nDyluck, the Sword and Tree.\nFix everyone and everything\nmy ki blasts wrecked.'),
    ...box('GOKU:And the fallout.\nDefinitely the fallout.\nSHENRON:...ALL THE ROOFS?'),
    ...box('GOKU:Yeah. My bad.\nSHENRON:IT IS GRANTED.\nNEXT TIME, USE A DOOR.'),
    ...box('SHENRON:THE PEOPLE RETURN.\nTHE LAND IS WHOLE AGAIN.\nGOKU:Even the big craters?\nSHENRON:EVEN THOSE.'),
    ...call(0xa4),0x28,0x18,
    ...(mask&1?box('PRIMM:Dyluck is coming\nhome! Thank you.\nGOKU:Tell him no more\nborrowing bodies.'):[]),
    ...(mask&2?box('POPOI:Mana is back!\nMy village will be okay!\nGOKU:Save me some dinner.'):[]),
    0x30,0x4e,9,0x30,0x0b,2,0x30,0x10,0x0b,0x18,0x8e,
    ...call(0xa5),0x32,1,0x40,0x08,
    ...box('POTOS VILLAGE\nRandi is alive again.\nThe village is whole.'),
    ...box('RANDI:I had the weirdest\ndream about a sword...\nGOKU:Want lunch?'),
    ...box('RANDI:Did you fix\nthe bridge too?\nGOKU:...Where is the hammer?'),
    ...heroFarewell()]);
  // Choice branches begin with the preceding selection window still open.
  // Close it before opening prose or another choice, including direct calls.
  for(const id of[0x85,0x86,0x87,0x88,0x89,0x8a,0x95,0x96])events.set(id,[0x51,0x01,...events.get(id)]);
  return events;
}
