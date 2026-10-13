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
  for(let id=0x85;id<=0x92;id++){
    const{start,end}=eventRange(rom,id);
    if(end-start!==1||rom[start]!==0)throw Error('Story choice event slot is occupied');
  }
  events.set(0x134,[0x42,0xc3,0,...jump(0x92),...choice('LUKA:What will you do?\n',[{label:'Advice',x:1,to:0x85},{label:'Save',x:10,to:0x86},{label:'Shortcut',x:17,to:0x87}])]);
  events.set(0x92,[0x50,...call(0x13a),0x51,0x01,...jump(0x134),0]); // Keep Luka's original one-time weapon gift.
  events.set(0x85,[...box('LUKA:You may visit the lands\nin any order. Help the\npeople you find there.'),...box('Punch or shoot crystal\norbs. Float across whip\ngaps. Bring friends if\nyou want their company.'),...box('The Sword fragments carry\nMana. Your ki does the hard\nwork. Visit the Tree to\nlearn how to use both.'),...box('If you are ready to face\nThanatos, ask for Shortcut.\nYou can keep exploring\nuntil you choose Go.'),0]);
  events.set(0x86,[0x30,0xfd,0,0x30,0xfe,2,...box('LUKA:I will restore you.'),...call(0x41b),0x2f,0x84,...choice('Want to save the game?\n',[{label:'Yes',x:5,to:0x90},{label:'No',x:17,to:0}])]);
  events.set(0x90,[0x1f,6,0x51,0]); // Original save menu command.
  events.set(0x91,[0x51,0]); // Choices must close their window before END.
  events.set(0x87,[...box('LUKA:I can ask the Mana\nTree to guide your ki\nstraight to Thanatos.'),...box('You will skip the remaining\njourney and face the last\ntwo battles. You can do\nthis alone.'),...box('We must free the souls\nThanatos holds, then calm\nthe Mana Beast. Do not\nblast the whole world.'),...choice('Take the shortcut now?\n',[{label:'Stay',x:3,to:0},{label:'Go',x:17,to:0x88}])]);
  events.set(0x88,[...box('GOKU:Can the Tree bring\nthe boy back?\nLUKA:Yes. And the souls\nstill held by Thanatos.'),...box('LUKA:The seeds answer her\nthrough your Sword pouch.\nLet Mana guide your ki.'),...box('GOKU:I can feel him now.\nPlease look after everyone.\nI will be careful.'),0x2f,0x84,0x30,0x4e,6,0x30,0x0b,2,0x18,0x2f,...box('THANATOS:Who are you?!\nThis is my final body!\nGOKU:Then leave Dyluck\nand the others alone!'),...box('DYLUCK:I can force him out!\nCatch us!\nGOKU:The Mana Tree has you.\nNow, you and me, Thanatos.'),...jump(0x70c),0]);
  events.set(0x89,[0x30,0x4e,8,...jump(0x429),0]);
  events.set(0x8a,[...box('LUKA:You have already freed\nthe world. Please enjoy\nsome quiet travelling.'),0]);
  events.set(0x8b,[...box('GOKU:That was the engine,\nright?\nOh. The whole thing.'),...box('MANA TREE:I guided your\nwave through his binding.\nThanatos has no host now.\nI have the captive souls.'),...box('GOKU:Dyluck too?\nMANA TREE:Safe with the boy.\nGOKU:Good! So we can...\nThat is a VERY big shadow.'),0x2f,0x84,0x30,0x4e,8,...jump(0x429),0]);
  events.set(0x8c,[0x30,0x17,2,0x09,0x0a,...box('GOKU:Three people on a\nswitch? I brought three\nfingers.\nSorry about the gate.'),0]);
  events.set(0x8d,[0x30,0x34,4,0x09,0x0a,...box('GOKU:Hello! I was told\nthere was an invitation.\nI may have knocked\na little too hard.'),0]);
  events.set(0x8e,[0x30,0x37,1,...box('GOKU:There. Unlocked.\nI can put the lock back\nafterwards. Probably.'),0]);
  events.set(0x1bd,[...jump(0x6f4),0]); // Primm no longer refuses Gaia's Navel.
  events.set(0x231,original(0x231).slice(5)); // Undine can be rescued before Elinee.
  events.set(0x62b,original(0x62b).slice(5)); // Goku can enter the Fortress early.
  events.set(0x3dd,[...box('JEHK:Joch says you may try\nthe trial now. He heard the\nmountain shaking.\nGOKU:That was a sneeze.'),...jump(0x3dc),0]);
  events.set(0x59d,[0x32,0,0,0x08,...box('GOKU:Locked. I could find\nthe key... or back up and\ncharge a Kamehameha.'),0x31,0,0x8c,0x08,0]);
  events.set(0x4d8,[0x29,0x5d,...box('MANA TREE:I felt that.\nYou may enter early, but\nplease leave the forest\nstanding.'),...box('GOKU:Just the barrier!\nI am getting better.\nIs the boy safe?'),...box('MANA TREE:His spirit is\nwith me. Free Mana, and\nI can return him to life.\nCome through the forest.'),0x02]);
  // The finale uses the same original camera, Mode7 door and boss setup. No
  // nonexistent companion is asked to cast Mana Magic to make damage possible.
  const beastBattle=destroyed=>[0x42,0x4e,0x07,...jump(0),0x18,0x3b,...call(0x47c),...call(0x737),0x2d,6,0x10,0,0x2d,2,0x28,8,0x2d,3,
    ...box(destroyed?'GOKU:The Fortress is gone!\nYou can go home now!\n...It cannot hear me.':'GOKU:That is a Mana Beast!\nIt is only trying to stop\nthe Fortress.'),
    ...box('The Sword fragments glow.\nThe Tree\'s voice carries\nthrough them.'),
    ...box(destroyed?'MANA TREE:Its rage remains.\nCalm it before it destroys\nwhat you have saved.':'MANA TREE:Guide your power.\nBreak its rage, and let\nMana flow home again.'),
    ...box('GOKU:So I can save it?\nMANA TREE:Yes. Ki is yours.\nYour friends need not\nspend their lives on it.'),
    ...box('GOKU:All right. One careful\nKamehameha. For the boy,\nDyluck, and everyone.'),
    0x2d,6,255,255,...call(0x739),0x18,0xbc,0x30,0x0b,0x0f,...box('GOKU:Easy...\nNo planet-sized crater.'),0];
  events.set(0x429,beastBattle(false));events.set(0x8f,beastBattle(true));
  events.set(0x42f,[
    ...box('The Beast\'s fury breaks.\nMana flows free. The last\nwreckage falls away.'),
    ...box('GOKU:I have everyone!\nPlease stay in the pouch\nuntil we are on the ground.'),
    ...box('MANA TREE:The souls are\nsafe. The boy and Dyluck\nwill live again. My seed\nwill grow with them.'),
    ...box('BOY:I had the weirdest\ndream about a sword.\nGOKU:That... was my fault.\nI owe you a lot of dinners.'),
    ...box('DYLUCK:I need to see Primm.\nGOKU:I will take you home.\nAnd Popoi can return to\nthe sprite world safely.'),
    ...box('JEMA:You saved the world.\nELDER:Now fix the bridge.\nGOKU:Right! Small hammer.\nNo Kamehameha.'),
    ...original(0x42f)]);
  // Choice branches begin with the preceding selection window still open.
  // Close it before opening prose or another choice, including direct calls.
  for(const id of[0x85,0x86,0x87,0x88,0x89,0x8a])events.set(id,[0x51,0x01,...events.get(id)]);
  return events;
}
