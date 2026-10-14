// Built locally from the user's ROM. No cartridge bytes or savestates ship
// with the site. Bump the revision when native virtual script layouts change.
export const quickStartRevision='frieza-1';
export const quickStartLabels={title:'After title',sword:'After sword / pod crash',late:'After Sunken Continent',frieza:'Frieza showdown',battle:'Frieza battle'};
export async function buildQuickStart(kind,{fresh,pump,mod,arrival,capture,cache,progress}){
  if(!(kind in quickStartLabels))throw Error('Unknown quick checkpoint');
  await fresh();progress('Running the original title…');
  for(const[frames,buttons]of[[960],[2,[3]],[180],[2,[0]],[180]])await pump(frames,buttons);
  if(!mod.nameEditor)throw Error('The original name menu did not open.');
  await cache('title',capture());if(kind==='title')return;
  progress('Running the bridge and waterfall…');
  await pump(2,[3]);await pump(300);
  for(let i=0;i<6;i++)await pump(600);
  for(let i=0;i<30&&!(mod.read16(0xdc)===128&&mod.read8(0xd0)===0);i++){await pump(2,[16]);await pump(240);}
  if(mod.read16(0xdc)!==128||mod.read8(0xd0)!==0||mod.read8(0xcf10)!==0)throw Error('The opening did not reach the waterfall.');
  progress('Pulling the Mana Sword and landing the pod…');
  // This explicit testing shortcut skips the river walk. Use the verified
  // sword approach point and stream every crossed camera row through the
  // native camera adapter. The real interaction and arrival events follow.
  mod.write16(0xe002,500);mod.write16(0xe004,932);
  mod.teleport.follow({x:500,y:932,terrain:mod.read8(0xe00b),layer:0});
  await pump(120);await pump(2,[5]);
  for(let i=0;i<65&&!(arrival.phase==='complete'&&mod.canAttack);i++){await pump(2,[16]);await pump(150);}
  if(arrival.phase!=='complete'||!mod.canAttack||mod.read8(0xcf10)!==1)throw Error('The sword scene did not return control.');
  mod.cancelInput();await pump(60);await cache('sword',capture());
  if(kind!=='sword')await buildLateCheckpoint(kind,{pump,mod,capture,cache,progress});
}

// Explicit testing fixtures, built from the running cartridge. These seed
// progression flags only inside a requested quick checkpoint, never a run.
export async function buildLateCheckpoint(kind,{pump,mod,capture,cache,progress}){
  progress('Preparing the post-continent route…');
  mod.cancelCombat();mod.radio.restore({firstFlight:true});mod.powerIntro.restore({flight:true,superShown:true});
  for(const[flag,value]of[[0x10,11],[0x11,10],[0x41,3],[0x44,3],[0x45,1],[0xaf,2],[0x4e,4]])mod.write8(0xcf00+flag,value);
  for(let i=0;i<7;i++)mod.write8(0xcf90+i,1);
  mod.quest.restore({mask:127,seedMask:127,delivered:0,wished:false});mod.frieza.restore({hinted:true});
  mod.worldKi.restore();mod.write16(0xe182,999);mod.write16(0xe184,999);
  if(!mod.story.travel(0x3fc))throw Error('The late-game entrance was not ready.');
  await pump(240);
  if(mod.status.map!==431||!mod.canAttack)throw Error('The Tree Palace did not return control.');
  mod.cancelInput();await cache('late',capture());if(kind==='late')return;
  progress('Preparing Frieza and the stolen Dragon Balls…');
  // The showdown fixture begins after accepting Dryad's optional route.
  // Keep the actual theft playable from the post-continent checkpoint.
  mod.frieza.restore({stage:'hunt',stolen:true,eighth:true,hinted:true});
  if(!mod.story.travel(0x2f))throw Error('The Fortress entrance was not ready.');
  await pump(240);if(mod.status.map!==246)throw Error('The Fortress did not load.');
  if(mod.frieza.status.stage!=='showdown'&&!mod.story.request(0xc1))throw Error('Frieza was not ready.');
  mod.cancelInput();await cache('frieza',capture());
  if(kind==='frieza')return;
  progress("Playing Frieza's confrontation…");
  for(let i=0;i<100&&mod.frieza.status.stage!=='battle';i++)await pump(60,[11]);
  if(!mod.frieza.fighting||!mod.canAttack)throw Error('The Frieza battle did not start.');
  mod.cancelInput();mod.write16(0xe182,999);await cache('battle',capture());
}
