// Built locally from the user's ROM. No cartridge bytes or savestates ship
// with the site. Story layouts are fingerprinted; bump this revision for
// other changes to how a preset is initialized.
import {bootLateGame} from './quick-boot.js';
import {activateTwilight} from './frieza-crisis.js';
import {friezaEvents} from './frieza-events.js';
import {cosmicDuration} from './frieza-cinematic.js';
import {encodeText} from './event-codec.js';
import {nameSlot} from './native-names.js';
export const quickStartRevision='finale-polish-27';
export const quickStartLabels={
  title:'After title',sword:'After sword / pod crash',sandship:'Sandship desert',late:'After Sunken Continent',trial:'Time Chamber: Goku versus Vegeta',
  fortress:'Mana Fortress deck',flight:'Fortress aerial shot',
  tree:'Frieza at the Mana Tree',intro:'Frieza steals the Balls',hexas:'Fanha / Hexas',rider:'Mech Rider III / Death Ball',
  buffy:'Fortress: Buffy',slime:'Fortress: Dread Slime',
  frieza:'Frieza / Thanatos showdown',thanatos:'Thanatos: Goku, Primm and Popoi',battle:'Frieza battle',orbit:'Frieza: transition to space',space:'Frieza: space battle',
  beast:'Upgraded Mana Beast',
  'good-ending':'Good ending', 'bad-ending':'Bad ending',explosion:'Planet explosion',
};
export const isQuickStart=kind=>Object.hasOwn(quickStartLabels,kind);
export const isLateStart=kind=>isQuickStart(kind)&&!['title','sword','sandship'].includes(kind);
// The checkpoint a start is built on, when it has one: late scenes extend
// the post-continent route, the Sandship extends the after-sword start.
export const quickStartBase=kind=>isLateStart(kind)?'late':kind==='sandship'?'sword':null;
export function buildFromBase(kind,callbacks){
  return kind==='sandship'?buildSandshipCheckpoint(callbacks):buildLateCheckpoint(kind,callbacks);
}

// Late starts boost the companions to 999 HP; the Sandship keeps their
// native recruit stats (the next map load recomputes maximum HP anyway).
async function fullParty({mod,pump},{boost=true}={}){
  const rom=mod.snes.cart.data,bytes=[];
  for(let i=1;i<=2;i++){
    const base=0xe000+i*512;
    if(!(mod.read8(base)&1)){
      // Match the cartridge's actor descriptor initialization before ADD.
      // Fresh test starts have never recruited either companion.
      mod.snes.ram.set(rom.slice(0x100800+i*16,0x100810+i*16),base+0x70);
      mod.write16(base+0x65,mod.read16(base+0x77));
      mod.write16(base+0x80,(mod.read16(base+0x70)&0x3ff)<<6);
      mod.write8(base+0x82,0xd5+((mod.read8(base+0x71)>>2)&7));
      bytes.push(0x2b,i);
    }
    bytes.push(0x30,0x0c+i,1);
  }
  bytes.push(0);
  const table=0x90130,free=0x9f300,pointer=rom.slice(table,table+2),original=rom.slice(free,free+bytes.length);
  try{
    rom.set([0,0xf3],table);rom.set(bytes,free);
    if(!mod.story.request(0x98))throw Error('The full party could not be recruited.');
    await pump(120);
  }finally{rom.set(pointer,table);rom.set(original,free);}
  for(let i=1;i<=2;i++){
    const base=0xe000+i*512;
    if(!(mod.read8(base)&1))throw Error('A test companion did not join.');
    if(boost){mod.write16(base+0x182,999);mod.write16(base+0x184,999);}
    mod.write8(base+0x190,0);mod.write8(base+0x191,0);
    mod.snes.ram.fill(0,nameSlot(i),nameSlot(i+1));mod.snes.ram.set(encodeText(i===1?'Primm':'Popoi'),nameSlot(i));
  }
}
export async function buildQuickStart(kind,{fresh,pump,mod,arrival,capture,cache,progress}){
  if(!isQuickStart(kind))throw Error('Unknown quick checkpoint');
  await fresh();
  if(isLateStart(kind)){
    progress('Initializing the test scene…');
    await bootLateGame({pump,mod});
    return buildLateCheckpoint(kind,{pump,mod,capture,cache,progress});
  }
  progress('Running the original title…');
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
  if(kind==='sandship')await buildSandshipCheckpoint({pump,mod,capture,cache,progress});
}

// Testing fixture for the desert arc: the full party walks into the dunes,
// where the native thirst scene (28A) leads to the Sandship. Only the
// desert and Sandship flags are seeded; the arc itself plays natively.
export async function buildSandshipCheckpoint({pump,mod,capture,cache,progress}){
  progress('Preparing the Sandship desert…');
  mod.cancelCombat();mod.radio.restore({firstFlight:true});mod.powerIntro.restore({flight:true,superShown:true});
  await fullParty({mod,pump},{boost:false});
  for(const[flag,value]of[[0x10,11],[0x28,0],[0x36,1]])mod.write8(0xcf00+flag,value);
  mod.write16(0xe182,999);mod.write16(0xe184,999);
  if(!mod.story.travel(0x1cb))throw Error('The desert entrance was not ready.');
  for(let i=0;i<60&&!(mod.status.map===67&&mod.read8(0xd0));i++)await pump(8);
  if(mod.status.map!==67||!mod.read8(0xd0))throw Error('The desert scene did not start.');
  // The map load recomputes the companions' native maximum HP; refill to it.
  for(let i=1;i<=2;i++)mod.write16(0xe000+i*512+0x182,mod.read16(0xe000+i*512+0x184));
  mod.cancelInput();await cache('sandship',capture());
}

// Explicit testing fixtures, built from the running cartridge. These seed
// progression flags only inside a requested quick checkpoint, never a run.
export async function buildLateCheckpoint(kind,{pump,mod,capture,cache,progress}){
  progress('Preparing the post-continent route…');
  mod.cancelCombat();mod.radio.restore({firstFlight:true});mod.powerIntro.restore({flight:true,superShown:true});
  for(const[flag,value]of[[0x10,11],[0x11,10],[0x41,2],[0x44,3],[0x45,1],[0xaf,2],[0x4e,0]])mod.write8(0xcf00+flag,value);
  for(let i=0;i<7;i++)mod.write8(0xcf90+i,1);
  mod.quest.restore({mask:127,seedMask:127,delivered:0,wished:false});mod.frieza.restore({hinted:true});
  mod.worldKi.restore();mod.write16(0xe182,999);mod.write16(0xe184,999);
  // Explicit test starts have a full native stack (four) of Senzu Beans.
  // Use a free inventory record and retain the player's other item types.
  const items=Array.from({length:12},(_,i)=>0xcc48+i),slot=items.find(a=>(mod.read8(a)&31)===5)??items.find(a=>mod.read8(a)===255);
  if(slot!==undefined)mod.write8(slot,0xa5);
  if(mod.status.map!==431){
    if(!mod.story.travel(0x3fc))throw Error('The late-game entrance was not ready.');
    await pump(240);
  }
  if(mod.status.map!==431||!mod.canAttack)throw Error('The Tree Palace did not return control.');
  mod.cancelInput();await pump(40);await cache('late',capture());if(kind==='late')return;
  if(kind==='trial'){
    await fullParty({mod,pump});mod.options.superSaiyan=false;mod.write8(0xcf3f,4);
    if(!mod.story.travel(0x304))throw Error('Joch\'s trial entrance was not ready.');
    await pump(240);if(mod.status.map!==72)throw Error('Joch\'s trial did not load.');
    mod.cancelInput();await cache(kind,capture());return;
  }
  if(kind==='thanatos'){await fullParty({mod,pump});mod.options.superSaiyan=false;}
  if(kind==='intro'){
    if(!mod.story.request(friezaEvents.theft))throw Error('Frieza\'s entrance was not ready.');
    await pump(1);mod.cancelInput();await cache(kind,capture());return;
  }
  // Frieza has already taken the Balls at the altar and is watching the
  // generals; the Death Ball waits for the Fortress deck after Rider III.
  if(kind==='hexas'||kind==='rider'){
    // Play the real altar scene: it leaves the native interpreter state the
    // later palace events expect, which a restored stage alone does not.
    progress('Frieza takes the Dragon Balls…');
    if(!mod.story.request(friezaEvents.offer))throw Error('Frieza\'s entrance was not ready.');
    for(let i=0;i<400&&!(mod.frieza.status.stage==='palace'&&mod.canAttack&&!mod.read8(0xd0));i++){await pump(26);await pump(4,[11]);}
    if(mod.frieza.status.stage!=='palace')throw Error('Frieza did not leave the altar.');
    if(!mod.story.travel(0x3df))throw Error('Hexas\'s chamber was not ready.');
    for(let i=0;i<60&&!(mod.status.map===418&&mod.canAttack);i++)await pump(20,[11]);
    if(kind==='rider'){
      mod.write8(0xcf44,6);await pump(30);
      if(!mod.story.travel(0x3dd))throw Error('Mech Rider III\'s room was not ready.');
      for(let i=0;i<120&&!(mod.status.map===237&&mod.canAttack&&mod.entities().some(e=>e.active&&e.index>=3&&e.hp>0));i++){await pump(16);await pump(4,[11]);}
      if(mod.status.map!==237)throw Error('Mech Rider III did not start.');
    }
    mod.cancelInput();await cache(kind,capture());return;
  }
  progress('Preparing Frieza and the stolen Dragon Balls…');
  // The showdown fixture begins after Frieza's automatic entrance.
  // Keep the actual theft playable from the post-continent checkpoint.
  mod.frieza.restore({stage:'hunt',tree:kind==='tree'?'pursuit':'complete',emperorKilled:true,stolen:true,stolenMask:127,eighth:true,hinted:true,trialWon:!['frieza','thanatos','tree','fortress','flight','buffy','slime'].includes(kind)});
  activateTwilight(mod.snes.ram);
  if(kind==='tree'){
    progress('Preparing the Mana Tree confrontation…');
    mod.write8(0xcf46,6);
    if(!mod.story.travel(0x3a9))throw Error('The Mana Tree approach was not ready.');
    await pump(240);
    // The real doorway runs the Tree's arrival greeting before returning
    // control. Finish that event before requesting the confrontation.
    for(let i=0;i<120&&!mod.canAttack;i++)await pump(20,[11]);
    if(mod.status.map!==235||!mod.story.request(0x5f8))throw Error('The Mana Tree scene did not start.');
    await pump(1);mod.cancelInput();await cache(kind,capture());return;
  }
  mod.write8(0xcf46,8);
  if(kind==='buffy'||kind==='slime'){
    progress(`Preparing ${quickStartLabels[kind]}…`);
    mod.write8(0xcf4e,kind==='buffy'?0:2);
    if(!mod.story.request(kind==='buffy'?0x420:0x423))throw Error('The Fortress boss entrance was not ready.');
    const map=kind==='buffy'?244:488,species=kind==='buffy'?120:124;
    for(let i=0;i<90&&!(mod.status.map===map&&mod.canAttack);i++)await pump(8);
    if(mod.status.map!==map||!mod.canAttack||!mod.entities().some(e=>e.active&&e.species===species&&e.hp>0))throw Error('The Fortress boss did not initialize.');
    mod.cancelInput();await cache(kind,capture());return;
  }
  if(kind==='fortress'||kind==='flight'){
    if(!mod.story.travel(0x3b))throw Error('The Fortress entrance was not ready.');
    await pump(240);
    if(mod.status.map!==255||!mod.canAttack)throw Error('The Fortress deck did not load.');
    if(kind==='flight'){
      progress('Preparing the aerial Fortress shot…');
      mod.options.superSaiyan=true;
      if(!mod.requestFlight())throw Error('World flight was not ready.');
      for(let i=0;i<90&&!(mod.worldFlight&&mod.read8(0x8c)===0&&!(mod.read8(0xfe)&0xc0));i++)await pump(8);
      if(!mod.worldFlight)throw Error('World flight did not load.');
      // Native world coordinates/heading: start south of the moving Fortress,
      // high enough to aim, with its shield intact and no attack already held.
      mod.write16(0xfa,mod.read16(0x128));mod.write16(0xfc,(mod.read16(0x12a)+400)&4095);
      mod.write16(0xf6,0);mod.write16(0xf4,0);mod.write8(0xf8,160);await pump(40);
    }
    mod.cancelInput();await cache(kind,capture());return;
  }
  if(['beast','good-ending','bad-ending','explosion'].includes(kind)){
    progress(`Preparing ${quickStartLabels[kind].toLowerCase()}…`);
    mod.frieza.restore({stage:'defeated',stolen:false,stolenMask:127,eighth:true,permanent:true,fallen:true,trialWon:true});
    mod.write8(0xcf4e,8);
    if(kind==='beast'){
      if(!mod.story.request(0x429))throw Error('The Mana Beast entrance was not ready.');
      for(let i=0;i<300&&!(mod.status.map===253&&mod.canAttack&&mod.challenge.status.started);i++)await pump(16,[11]);
      if(mod.status.map!==253||!mod.canAttack||!mod.challenge.status.started)throw Error('The Mana Beast did not start.');
      mod.radio.restore({firstFlight:true});
    }else{
      mod.challenge.restore({fed:true,started:true,won:true});
      if(kind!=='good-ending')mod.quest.restore({mask:0,seedMask:0,delivered:0,wished:false});
      if(!mod.story.request(0x42f))throw Error('The ending was not ready.');
      for(let i=0;i<300;i++){
        const e=mod.ending.status;
        if(kind==='explosion'?e?.phase==='explode':e&&mod.read8(0xd0)&0x80)break;
        await pump(kind==='explosion'?8:1,kind==='explosion'?[11]:[]);
      }
      if(!mod.ending.active||kind==='explosion'&&mod.ending.status.phase!=='explode')throw Error('The ending scene did not open.');
    }
    mod.cancelInput();mod.write16(0xe182,999);await cache(kind,capture());return;
  }
  // Only the direct final-fight fixtures skip Buffy and Dread Slime.
  mod.write8(0xcf4e,['frieza','thanatos'].includes(kind)?4:6);
  if(!mod.story.travel(0x2f))throw Error('The Fortress entrance was not ready.');
  await pump(240);if(mod.status.map!==246)throw Error('The Fortress did not load.');
  // A direct battle fixture has intentionally skipped Thanatos. Do not let
  // it overwrite the independent showdown slot that plays his trial.
  if(kind==='frieza'||kind==='thanatos'){
    if(!['showdown','trial'].includes(mod.frieza.status.stage)&&!mod.story.request(friezaEvents.showdown))throw Error('Frieza was not ready.');
    await pump(1);mod.cancelInput();await cache(kind,capture());return;
  }
  progress('Preparing the Frieza battle…');
  // Test the actual combat controller without replaying the theft, Thanatos,
  // Popoi and transformation dialogue on every fresh browser.
  mod.frieza.restore({...mod.frieza.snapshot(),stage:'hunt',permanent:true,fallen:true,scene:null});
  mod.write8(0xcf4e,6);mod.frieza.onEvent(friezaEvents.battle);
  if(!mod.frieza.fighting||!mod.canAttack)throw Error('The Frieza battle did not start.');
  mod.cancelInput();mod.write16(0xe182,999);await cache('battle',capture());
  if(kind==='orbit'||kind==='space'){
    progress('Preparing the orbital battle…');
    // Use the real phase handoffs, fast-forwarding only their test-scene
    // clocks. This keeps the arena and orbital spawn in the combat owner.
    for(let phase=0;phase<2;phase++){
      mod.frieza.hit(mod.frieza.entity(),1e8);
      await pump(1);
      const state=mod.frieza.snapshot();
      // Orbit starts at the end of ground phase two, before the collateral
      // montage and pullback. Space remains a direct combat-only fixture.
      if(phase===1&&kind==='orbit'){
        if(state.boss.surge?.kind!=='frieza-cosmic')throw Error('The transition to space did not start.');
        mod.cancelInput();mod.write16(0xe182,999);await cache('orbit',capture());return;
      }
      state.boss.surge.age=phase===0?379:cosmicDuration-1;
      if(phase===0)state.boss.muscular=true;
      mod.frieza.restore(state);mod.radio.restore({firstFlight:true});
      for(let f=0;f<420;f++){
        await pump(1);
        if(!mod.frieza.inputLocked&&(phase===0?mod.frieza.status.boss.tier===1:mod.frieza.orbit))break;
      }
      // His real phase-two entrance now includes an invulnerable retreat.
      // Let it complete before applying the next test-only threshold hit.
      if(phase===0)for(let f=0;f<120&&(mod.frieza.status.boss.guard||mod.frieza.status.boss.dash);f++)await pump(1);
    }
    if(!mod.frieza.orbit)throw Error('The orbital battle did not start.');
    const direct=mod.frieza.snapshot();direct.boss.space.intro=0;direct.boss.guard=0;mod.frieza.restore(direct);
    mod.cancelInput();mod.write16(0xe182,999);await cache('space',capture());
  }
}
