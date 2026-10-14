import {box} from './story-events.js';

// Changes at native command boundaries, before relocating the event. Keep
// the original hole pieces, door 08D, Mantis battle and reward flags intact.
export const potosCommands=new Map([
  // Step clear before the ground opens under Elliott.
  [0x93150,{before:[0x29,0x10],after:[0x32,0,0x02,0x08,0x32,0,0x40,0x08,0x29,0x10]}],
  // The child falls first. Goku chooses to follow, walks to the lip, hops,
  // then uses the original pit descent and map transition.
  [0x9315c,{before:[0x31,0,0xae],after:[
    ...box('ELLIOTT:HELP!\nGOKU:Hang on, kid.\nI will hop down.'),
    0x32,0,0x42,0x08,0x31,0,0xa1,0x08,0x31,0,0xae,
  ]}],
  // No helpless flinches when the villagers shout him out of town.
  ...[0xa4033,0xa404d,0xa406c].map(at=>[at,{before:[0x31,0,0x8c],after:[0x32,0,0x40]}]),
]);

export function potosCommand(op){
  const edit=potosCommands.get(op.at);
  if(!edit)return null;
  if(op.bytes.length!==edit.before.length||!op.bytes.every((v,i)=>v===edit.before[i]))throw Error('Unsupported Potos event command');
  return edit.after;
}

// The banished-villager event moves selector 4 (the talking NPC), so retain
// the guard's native actor context when replaying his original kick sequence.
export function createPotosGatekeeper(mod){
  let latched=false,triggers=0,home=null;
  function guard(){return mod.entities().find(e=>e.index>=3&&e.active&&e.species===0xc4&&(mod.read16(e.base+0x3e)&0x7ff)===0x10b);}
  return{
    tick(){
      if(mod.read16(0xdc)!==131){latched=false;home=null;return;}
      if(home&&mod.read8(0xd0))home.started=true;
      if(home?.started&&mod.canAttack){
        // The retail walk can round its return by a pixel or two. Repeating
        // the joke must not gradually walk the guard away from his post.
        if((mod.read16(home.base+0x3e)&0x7ff)===0x10b){mod.write16(home.base+2,home.x);mod.write16(home.base+4,home.y);}
        home=null;
      }
      if(!mod.options.enabled||!mod.gokuActive||!mod.canAttack)return;
      const npc=guard();if(!npc)return;
      const dx=mod.read16(0xe002)-npc.x,dy=mod.read16(0xe004)-npc.y;
      if(latched){if(Math.hypot(dx,dy)>64)latched=false;return;}
      // Let the incoming flight actually pass over him. His original script
      // needs Goku on the village side; starting it from below blocks the
      // guard's first walk and makes him drift north with every replay.
      if(mod.read8(0xcf10)<10||!mod.localFlight||Math.abs(dx)>20||dy> -8||dy< -32||!mod.story.request(0x9b,{actor:npc.base-0xe000}))return;
      latched=true;triggers++;home={base:npc.base,x:npc.x,y:npc.y,started:false};mod.cancelCombat();mod.localFlight=false;mod.localLift=0;mod.snes.joypad1State=0;mod.playSound?.('landing');
    },
    snapshot:()=>({latched,triggers,home:home?{...home}:null}),
    restore(s){latched=!!s?.latched;triggers=s?.triggers??0;home=s?.home?{...s.home}:null;},
    get status(){return{latched,triggers};},
  };
}
