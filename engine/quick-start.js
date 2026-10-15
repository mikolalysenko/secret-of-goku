// Built locally from the user's ROM. No cartridge bytes or savestates ship
// with the site. Bump the revision when native virtual script layouts change.
import {bootLateGame} from './quick-boot.js';
import {activateTwilight} from './frieza-crisis.js';
import {friezaEvents} from './frieza-events.js';
import {cosmicDuration} from './frieza-cinematic.js';
export const quickStartRevision='orbital-finale-5';
export const quickStartLabels={
  title:'After title',sword:'After sword / pod crash',late:'After Sunken Continent',
  fortress:'Mana Fortress deck',flight:'Fortress aerial shot',
  frieza:'Frieza / Thanatos showdown',battle:'Frieza battle',orbit:'Frieza: transition to space',space:'Frieza: space battle',
  beast:'Upgraded Mana Beast',
  'good-ending':'Good ending', 'bad-ending':'Bad ending',explosion:'Planet explosion',
};
export const isQuickStart=kind=>Object.hasOwn(quickStartLabels,kind);
export const isLateStart=kind=>isQuickStart(kind)&&!['title','sword'].includes(kind);
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
}

// Explicit testing fixtures, built from the running cartridge. These seed
// progression flags only inside a requested quick checkpoint, never a run.
export async function buildLateCheckpoint(kind,{pump,mod,capture,cache,progress}){
  progress('Preparing the post-continent route…');
  mod.cancelCombat();mod.radio.restore({firstFlight:true});mod.powerIntro.restore({flight:true,superShown:true});
  for(const[flag,value]of[[0x10,11],[0x11,10],[0x41,2],[0x44,3],[0x45,1],[0xaf,2],[0x4e,4]])mod.write8(0xcf00+flag,value);
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
  progress('Preparing Frieza and the stolen Dragon Balls…');
  // The showdown fixture begins after Frieza's automatic entrance.
  // Keep the actual theft playable from the post-continent checkpoint.
  mod.frieza.restore({stage:'hunt',stolen:true,stolenMask:127,eighth:true,hinted:true,trialWon:kind!=='frieza'});
  activateTwilight(mod.snes.ram);
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
  if(kind!=='frieza')mod.write8(0xcf4e,6);
  if(!mod.story.travel(0x2f))throw Error('The Fortress entrance was not ready.');
  await pump(240);if(mod.status.map!==246)throw Error('The Fortress did not load.');
  // A direct battle fixture has intentionally skipped Thanatos. Do not let
  // it overwrite the independent showdown slot that plays his trial.
  if(kind==='frieza'){
    if(!['showdown','trial'].includes(mod.frieza.status.stage)&&!mod.story.request(friezaEvents.showdown))throw Error('Frieza was not ready.');
    await pump(1);mod.cancelInput();await cache('frieza',capture());return;
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
