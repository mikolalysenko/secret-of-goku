// Sandship actors include companions temporarily assigned to the kitchen or
// cabin. Runtime routing supplies that captured-party mask as well as the
// active party, so a captive can speak without inventing an absent friend.
// The compiler lays out each window as one continuous text: keep lines to
// 27 columns (a name code counts as 6) so pages break between sentences.
export const sandshipDialogue={
 0x9a9b1:'GOKU:Wait! I smell food!\nI can play the tired\ntraveler for a free lunch.',
 // Without the girl, someone still has to spot the ship.
 0x9a9cc:['GOKU:Over there! Something\nbig on the sand!\n', null, '{2}:LOOK! Over there!\n', null],
 0x9a9eb:[' Lunch is THAT way!', null, ' Hurry!', null],
 0x9aa04:'GOKU:Hello! Is this\na travelling restaurant?',
 0x9aa28:'SOLDIER:An Imperial spy!\nHand over your weapons!\nGOKU:I only have hands.',
 0x9aa78:['GOKU:I need them to eat.\nBut I can help out! Any\nstrong fighters aboard?', '{1}:Are you serious?!\nGOKU:I can handle them.\nLet us see what they want.', '{2}:We could just leave!\nGOKU:But we just found\nthe kitchen!', '{1}:We could just leave!\n{2}:But the kitchen!\nGOKU:Exactly!'],
 0x9ab18:'GOKU:I will work for lunch.\nJust ask nicely.',
 0x9ab34:'COMMANDER:Then work the\nengines! No funny business!\nGOKU:Sounds like a warm-up!',
 0x9ab66:[
  'GOKU:Sure! After lunch, can\nI spar with somebody?\nAnybody strong aboard?',
  'COMMANDER:She is with me!\n{1}:Touch me and see!\nGOKU:She means it.',
  'COMMANDER:The shrimp cooks!\n{2}:I taste everything!\nGOKU:Save me some!',
  'COMMANDER:Shrimp cooks.\nShe comes with me!\n{1}:Touch me and see!'
 ],
 // The runtime swaps this for the weight joke only if he is still wearing
 // his training gi. Already removed or replaced armor is never confiscated.
 0x9abbe:'SOLDIER:No weapons? Move!\nGOKU:Sure. Lead the way.',
 0x9af19:'GUARD:Back to work!\nGOKU:Just checking lunch.',
 0x9af34:['GOKU:That smells good!', 'GOKU:That smells good!', '{2}:Taste-testing! Mmm!','{2}:Taste-testing! Mmm!'],
 0x9af50:[
  'COOK:Engine boy! They say\nyou eat like fifty men,\nand fell out of the sky!\nThe Empire pays for news\nlike that.\nGOKU:Tell them I\'m hungry!',
  'COOK:Engine boy! They say\nyou eat like fifty men,\nand fell out of the sky!\nThe Empire pays for news\nlike that.\nGOKU:Tell them I\'m hungry!',
  '{2}:Best prison ever!\nGOKU:We can leave whenever.\n{2}:Not before dessert!',
  '{2}:Best prison ever!\nGOKU:We can leave whenever.\n{2}:Not before dessert!'
 ],
 0x9af82:'{2}:Couldn\'t eat another\nthing! Let us get out.\nGOKU:Now you are ready?',
 0x9afb8:['COOK:No snacks for the\nengine crew! Out!', 'COOK:No snacks for the\nengine crew! Out!', 'COOK:Take your friend\nand get out of my kitchen!', 'COOK:Take your friend\nand get out of my kitchen!'],
 0x9afe5:['COOK:Who told the Empire\nabout an orange spy?!\nGOKU:I hope they\'re strong!', 'COOK:Who told the Empire\nabout an orange spy?!\nGOKU:I hope they\'re strong!', 'COOK:Your pal ate it all!\nGOKU:You have to admire\nthat kind of training.', 'COOK:Your pal ate it all!\nGOKU:You have to admire\nthat kind of training.'],
 0x9b00e:'GUARDS:No entry!\nGOKU:I could fly past...\nBut Sergo had a good idea.',
 0x9b03f:['GOKU:Rats in the kitchen!\nBig ones! Better check!', 'GOKU:Rats in the kitchen!\nBig ones! Better check!', '{2}:Rats ate the food!\nGOKU:Really hungry rats!', '{2}:Rats ate the food!\nGOKU:Really hungry rats!'],
 0x9b0bc:['GOKU:Hey, that worked!\nNot even a cracked wall.', 'GOKU:Hey, that worked!\nNot even a cracked wall.', 'GOKU:Those rats sound\na lot like you.\n{2}:Don\'t ruin the plan!', 'GOKU:Those rats sound\na lot like you.\n{2}:Don\'t ruin the plan!'],
 0x9b21a:'{1}:Done being captured?\nGOKU:Yeah. This ship needs\nbetter food, fewer jerks.',
 0x9b236:'MORIE:You escaped?!\nGOKU:I was being polite.',
 0x9b281:'MERIA:Guards! Stop him!\nGOKU:Is anyone strong?',
 0x9b39a:'GESHTAR:Thanatos warned me\nabout you! Meet my machine!\nGOKU:Great! Turn it all up!',
 0x9b3cc:"GESHTAR:You'll regret that!\nGOKU:Everybody, stand back!",
 0x9b3f1:'GESHTAR:My machine will\ncrush you!\nGOKU:Now we are talking!',
 0x9b4bd:'MERIA:My grandson tried\nto arrest you...\nGOKU:I let him. It was fun!',
 0x9b4ed:'MERIA:All that with your\nbare hands?!\nGOKU:And I held back!'
};

export const sandshipWeights='SOLDIER:Take his armor!\nOOF! Why is it so HEAVY?!\nGOKU:Weighted training gi.\nI will keep it in my bag.\nI am stronger without it!\nSOLDIER:He got STRONGER?!';
