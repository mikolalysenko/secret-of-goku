// The deadline is a story state, never a real-time game-over timer. Everyone
// believes Frieza; Goku simply thinks five minutes is ample time to finish.
export const newCoreCrisis=()=>({active:true,minutes:5,flightNotified:false});
export function activateTwilight(r){
 // Retail 4A4's post-continent world state. Do not rewind a later Jema visit
 // or complete any Pure Land/Tree/Fortress battles on the player's behalf.
 for(const[flag,min]of[[0x41,3],[0x44,6],[0x45,1]])r[0xcf00+flag]=Math.max(r[0xcf00+flag],min);
}
export const crisisFlightMessages=[
 "KING KAI:You've done it now,\nGoku! LOOK AT THE SKY!\nIt could blow any second!",
 'GOKU:Frieza said five\nminutes. That is plenty!\nKING KAI:THAT IS NOT PLENTY!',
 'LUKA:The core is breaking!\nPlease save our planet!\nGOKU:Okay. No warmup.',
];
export const crisisGreetings={
 luka:'LUKA:Five minutes until\nthe core explodes. Please\nleave our planet in one piece!',
 jema:'JEMA:Five minutes! How many\nweirdos out there are like\nyou? Please stop this one!',
 watts:'WATTS:Five minutes left.\nI am keeping the forge lit\nuntil everyone is safe.',
 shop:'Five minutes until the\nplanet explodes. Supplies\nare still available. Hurry!',
 inn:'The core will explode in\nfive minutes! Rest quickly.\nYou must stop Frieza!',
 elder:'ELDER:Five minutes! Get\neveryone to shelter. Goku,\nplease save the village!',
 dryad:'DRYAD:Five minutes remain.\nThe roots cannot hold much\nlonger. Save the planet!',
 people0:'Five minutes until the\nplanet explodes! We have\nnowhere else to go!',
 people1:'Look at that sky! They say\nthe core will blow in five\nminutes. Please help us!',
 people2:'Five minutes. My family\nis still here. Please stop\nFrieza before it is too late!',
 people3:'The ground is shaking!\nOnly five minutes remain.\nYou have to save us!',
};
// Called only for a native NPC interaction, never an item/choice/level-up
// window. A separate greeting leaves prices, rewards and choice offsets alone.
export function crisisGreeting(event){
 const text=event.ops.filter(op=>op.op==='text').map(op=>op.text).join(' ');
 if(/JEMA:/.test(text)||event.id===0x131)return'jema';
 if(/LUKA:/.test(text)||[0x130,0x132,0x133,0x134].includes(event.id))return'luka';
 if(/WATTS:/.test(text))return'watts';
 if(/DRYAD:/.test(text))return'dryad';
 if(/ELDER:/.test(text))return'elder';
 if(/\b(inn|rest|stay the night)\b/i.test(text)||event.ops.some(o=>o.op===0x30&&o.bytes[1]===0xf9))return'inn';
 if(/\b(buy|sell|shop|goods)\b/i.test(text)||event.ops.some(o=>o.op===0x30&&o.bytes[1]===0xfa))return'shop';
 return`people${event.id%4}`;
}

// Source spans in the user's US cartridge. Keep all native choreography,
// Tree graphics, map changes, rewards and companion filtering intact.
export const crisisDialogue={
 0xa288c:'JEMA:Goku! The sky...\nWhat happened up there?',
 0xa28b6:'GOKU:Frieza hit the core.\nHe says we have five minutes.',
 0xa28e7:'JEMA:Five minutes?!\nHow many weirdos are there\nout there like you?!',
 0xa2932:'GOKU:I can finish in time.\nJEMA:Then hurry! We cannot\nevacuate an entire planet!',
 0xa297d:'JEMA:The Mana Tree is\nshielding the core. Her roots\nare burning from his attack.',
 0xa29c9:'The cloud barrier around\nPure Land is weakening.',
 0xa29fe:'Frieza is using the\nFortress to drain Mana\nfrom the damaged roots.',
 0xa2a41:'Fly there if you need her\nhelp. Or confront Frieza\ninside the Fortress.',
 0xa2a92:'Recover the Dragon Balls.\nDryad kept the eighth safe.\nThat is our only hope.',
 0xa2ae5:'The wish must repair the\ncore AND the Mana Tree.\nDo not forget the core!',
 0xa2b2f:'GOKU:Beat Frieza, fix the\nplanet. Five minutes is\nmore than enough.',
 0xa7a0a:'GOKU:Made it. Plenty\nof time to check the Tree.',
 0xa7ba0:'GOKU:First, check the roots.',
 0xa7bc9:'GOKU:Ask the Tree to hold\non a little longer,',
 0xa7bf4:'then finish Frieza!',
 0xa7c54:'FRIEZA:\nThe Tree cannot shield\nyour core forever.\nYou have FIVE MINUTES!',
 0xa7d30:'GOKU:The Tree!\nThat was Frieza\'s ki!',
 0xa7d5c:'KING KAI:\nHis Death Ball is burning\nthrough the roots!',
 0xa7d8d:'The core is breaking up!',
 0xa7da7:'LUKA:\nCan you people PLEASE\nleave our planet alone?!',
 0xa7de1:'MANA TREE:Goku...\nMy roots still shelter\nthe souls. Listen.',
 0xa7e0e:'Frieza\'s Death Ball\nshattered my body. The\nFortress drains what remains.',
 0xa7e4b:'The wounded planet is\ncalling the Mana Beast\nto defend it.',
 0xa7efb:'If it strikes the Fortress,\nthe damaged core will fail.\nFive minutes remain.',
 0xa7f40:'MANA TREE:Recover the Balls\nfrom Frieza. Calm the Beast.\nThen the wish can save us.',
 0xa81ef:'Stop Frieza. Calm the Beast.\nThen wish the Tree and\nthe planet\'s core whole.',
 0xa8236:'I will shelter the souls\nuntil then. Please hurry.\nWe have only five minutes.',
 0xa846f:'GOKU:I will keep the\nDragon Balls safe this time.\nFrieza is another story.',
 0xa84dc:'GOKU:I can still feel her\nki. I will make it in time.\nLet us go!',
};
