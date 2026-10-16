import {parseEvent,eventRange} from './event-codec.js';
import {compileStoryEvent} from './story-compiler.js';
import {box,call,choice,jump} from './story-events.js';
import {sandshipWeights} from './sandship-dialogue.js';
import {createSandshipWreck} from './sandship-wreck.js';

export const sandshipCaptives=r=>Number(r[0xcf0d]>=8)|Number(r[0xcf0e]>=8)<<1;

export function compileSandship(event,mask,{weighted=false}={}){
 let ops=event.ops;
 if(event.id===0x295&&!(mask&2)){
  // No captive Popoi to animate or talk to. Finishing the kitchen visit
  // must still reach stage 6, which enables the cabin guards' distraction.
  ops=ops.filter(o=>!(o.op===0x34&&o.bytes[1]===4)).flatMap(o=>o.op===0x29&&o.bytes[1]===0x28?[o,o]:[o]);
 }
 return compileStoryEvent({...event,ops},mask,{textOverrides:event.id===0x28b&&weighted?{0x9abbe:sandshipWeights}:{}});
}

// Kamehameha breakout. Sergo's escape plan becomes a choice: sneak past the
// guards (the original route), or Goku frees the engine-room slaves with a
// full-power wave the player charges and fires. A full-power wave fired
// anywhere below deck while captive does the same. The screen whites out and
// the same rooms return wrecked: the guards have fled, desert monsters pour
// in through the breach, and Goku must fetch each captured companion before
// Geshtar and his Mech Rider meet them on deck.
export const breakout={offer:0x72,sneak:0x73,escape:0x74,wave:0x75,chaos:0x76,deck:0x77,scripted:0x78,improvised:0x79};
export const holdMaps=[271,319,324];
const geshtar=177,deck=99,decks=[98,99];

const offer=()=>[
 ...box('GOKU:Hey... those guys are\npushing the engines in\nchains. Are they slaves?!'),
 ...box('SERGO:We ALL are, matey.\nBut old Sergo has a plan.\nWe sneak out, quiet-like.'),
 ...box('GOKU:Or I blast a hole in\nthe ship and free them\nall. One Kamehameha!'),
 ...choice('SERGO:A kame-WHAT?! Well?\n',[{label:'Sneak',x:3,to:breakout.sneak},{label:'KAMEHAMEHA',x:13,to:breakout.wave}])];
// Captives: bit 0 the girl is held in Morie's cabin, bit 1 the sprite is in
// the kitchen. Nobody rejoins here; Goku has to go and get them.
const stranded=['GOKU:Now let us get off\nthis ship before it\nsinks into the sand!',
 'GOKU:{1} is still up\nwith Morie. Hang on,\nI am coming!',
 'GOKU:{2} is still stuck\nin the kitchen. Hang on,\nI am coming!',
 'GOKU:{2} is in the kitchen\nand {1} is with Morie.\nHang on, you two!'];
const chaos=captives=>[
 ...box('SOLDIER:ABANDON SHIP! The\nhull is open! The desert\nis pouring in!'),
 ...box("SERGO:Every chain aboard\njust snapped, lad! Run,\nye engine rats! RUN!"),
 ...box('GOKU:You are all free! Go!\nNobody should push\nengines in chains.'),
 ...box(stranded[captives]),0];
// The white-out reloads Goku's own room (escape door), then the reaction.
// Release any cutscene lock left by the capture scene, as a door would.
const escape=planned=>[0x19,0xa9,0x07,0x28,50,...jump(planned?breakout.scripted:breakout.improvised),0];
const breakoutScripts={
 [breakout.sneak]:[...box('GOKU:Okay. Sneaking.\nI am great at sneaking.\nSERGO:...Sure you are.'),
  ...box("SERGO:Talk to the stair\nguards. I'll make the\ndistraction!"),0x30,0x28,3,0],
 // The player charges and fires the wave; nothing is said first.
 [breakout.wave]:[0],
 [breakout.scripted]:[...box("SERGO:Yer HAIR! And the\nHULL! Where'd it GO?!\nGOKU:Oops. Too much?"),...jump(breakout.chaos),0],
 [breakout.improvised]:[...box('GOKU:Oops. That was more\nthan I meant. Oh well.\nBreakout time!'),...jump(breakout.chaos),0],
 // Both captives are back: the Empire's ambush on deck, as in the original.
 [breakout.deck]:[...box('GESHTAR:WHO blew a hole in\nmy ship?! Get up here!\nGOKU:Ooh! Is he strong?'),0x30,0x28,10,0x19,0xab,0x29,0x28,...jump(0x29d),0],
};
const wreckScripts={
 sergo:[...box("SERGO:What are ye waitin'\nfor?! Grab yer mates and\nabandon ship!"),0],
 kitchen:[...box('{2}:The stove EXPLODED!\nI saved the soup, though!\nGOKU:Good! Bring the pot!'),0x30,0x0e,1,0x09,0x2b,2,0],
 // Walk in and frame the cabin as the original scene does (47D).
 cabin:[0x06,0x29,0x01,0x32,0,28,0x08,...call(0x47d),
  ...box('MORIE:My SHIP! There is\nsand in my BATHTUB! What\ndid you DO?!'),
  ...box('{1}:Was that YOU?! The\nwhole floor jumped!\nGOKU:I aimed at the chains.'),
  ...box('MORIE:Guards! GUARDS?!\n...Anybody?\nGOKU:They ran. Bye!'),
  0x30,0x0d,1,0x09,0x2b,1,0x2a,0x01,0x07,0],
};
// The authored breakout scripts, for the scene graph overlay.
export function buildSandshipEvents(){
 return[[breakout.offer,'offer',offer()],...Object.entries(breakoutScripts).map(([id,bytes])=>[Number(id),'all',bytes]),
  [breakout.escape,'planned',escape(true)],[breakout.escape,'improvised',escape(false)],
  ...[0,1,2,3].map(c=>[breakout.chaos,`captives ${c}`,chaos(c)]),
  [0x291,'wrecked',wreckScripts.sergo],[0x295,'wrecked',wreckScripts.kitchen],[0x29c,'wrecked',wreckScripts.cabin]];
}

export function installSandship({rom,r,mod,entries,variants}){
 const at=id=>0xc00000+eventRange(rom,id).start;
 for(const id of Object.values(breakout)){
  const{start,end}=eventRange(rom,id);
  if(end-start!==1||rom[start]!==0)throw Error('Sandship breakout event slot is occupied');
 }
 const wrecked=()=>!!mod.sandship?.wrecked;
 const wreck=Object.fromEntries(Object.entries({sergo:0x291,kitchen:0x295,cabin:0x29c}).map(([k,id])=>[k,variants(id,()=>wreckScripts[k])]));
 const compile=(id,mask,opts)=>compileSandship(parseEvent(rom,id),mask,opts);
 const capture=[false,true].map(weighted=>variants(0x28b,mask=>compile(0x28b,mask,{weighted})));
 entries.set(at(0x28b),mask=>capture[Number(!!mod.equipment?.weighted)][mask]);
 const freed=variants(0x296,mask=>compile(0x296,mask)),end=variants(0x296,()=>[0]);
 for(const id of[0x295,0x297,0x298,0x299]){
  const scripts=variants(id,mask=>compile(id,mask));
  // In the wreck the kitchen walk-on is Popoi's rescue, or nothing at all.
  entries.set(at(id),id===0x295?mask=>wrecked()?(sandshipCaptives(r)&2?wreck.kitchen:end)[mask]:scripts[mask|sandshipCaptives(r)]:mask=>scripts[mask|sandshipCaptives(r)]);
 }
 entries.set(at(0x296),mask=>r[0xcf0e]>=8?freed[mask|2]:end[mask]);
 // Flying straight to the cabin can bypass the kitchen. Bring along only
 // a Popoi who was actually captured; never strand him when the ship sinks.
 const collect=()=>[...box('{2}:Kitchen\'s empty!\nGOKU:Good timing! Come on!'),0x30,0x0e,1,0x09,0x2b,2];
 const cabin=[false,true].map(popoi=>variants(0x29c,mask=>[
  ...(popoi?collect():[]),0x30,0x28,7,...compile(0x29c,mask|(popoi?2:0))
 ]));
 // Walk in and frame the cabin as the original scene does (47D settles the
 // party and pans up), so Morie shows below the window, not behind it.
 const boarding=[false,true].map(popoi=>variants(0xa1,mask=>[
  0x06,0x29,0x01,0x32,0,28,0x08,...call(0x47d),...box('MORIE:How did you get past\nthe guards?!'),...box('GOKU:I can fly. I was just\nplaying along.'),
  ...(popoi?collect():[]),
  ...box('SOLDIER:The Empire!\nGOKU:Maybe they brought\nsomebody worth fighting!'),
  0x2a,0x01,0x30,0x28,10,0x19,0xab,0x29,0x28,0x12,0x9d,0
 ]));
 // Sergo's first talk runs straight into his plan, so the offer comes while
 // Goku is still taking in the engine room. Talking again re-offers it
 // until the guards have been distracted. In the wreck he just yells.
 const sergo=variants(0x291,mask=>[...compile(0x291,mask).slice(0,-1),...jump(0x292)]);
 entries.set(at(0x291),mask=>wrecked()?wreck.sergo[mask]:sergo[mask|sandshipCaptives(r)]);
 const plan=variants(breakout.offer,offer);
 entries.set(at(0x292),mask=>wrecked()?wreck.sergo[mask]:plan[mask]);
 entries.set(at(breakout.offer),mask=>wrecked()?wreck.sergo[mask]:plan[mask]);
 for(const id of[breakout.sneak,breakout.wave,breakout.scripted,breakout.improvised,breakout.deck])entries.set(at(id),variants(id,()=>breakoutScripts[id]));
 const escapes=[false,true].map(planned=>variants(breakout.escape,()=>escape(planned)));
 entries.set(at(breakout.escape),mask=>escapes[Number(!!mod.sandship?.planned)][mask]);
 const free=[0,1,2,3].map(captives=>variants(breakout.chaos,()=>chaos(captives)));
 entries.set(at(breakout.chaos),mask=>free[sandshipCaptives(r)][mask]);
 entries.set(at(0x29c),mask=>{
  if(r[0xcf28]>=11)return end[mask];
  const captives=sandshipCaptives(r),popoi=Number(!!(captives&2));
  if(wrecked())return(captives&1?wreck.cabin:end)[mask];
  return captives&1?cabin[popoi][mask|captives]:boarding[popoi][mask];
 });
}

// The player's own L+Y charge fires the wave; a full-power one (85% charge
// or more) breaks out. The white-out then reloads the room as a wreck. Once
// every captured companion is back, the deck brings on Geshtar's Mech Rider.
export function createSandship(mod){
 const fresh=()=>({armed:false,hinted:false,cut:null,flash:0,wreck:null,deckDone:false,deckHint:false,boss:false});
 let s=fresh();const seen=new WeakSet();
 const wreck=createSandshipWreck(mod.snes,mod,()=>s);
 const r=a=>mod.read8(a),map=()=>mod.read16(0xdc);
 const captive=()=>r(0xcf28)>=1&&r(0xcf28)<=6&&holdMaps.includes(map());
 const quiet=()=>mod.canAttack&&!r(0xd0)&&!mod.radio?.status.current&&!mod.radio?.status.queued;
 function blast(e){
  const x=mod.read16(0xe002),y=mod.read16(0xe004),breach={...wreck.breach({x,y,dx:e.dx,dy:e.dy}),origin:{x:Math.round(e.x),y:Math.round(e.y)}};
  s.cut={age:0,planned:s.armed,map:map(),tx:breach.stand.x>>4,ty:breach.stand.y>>4,layer:r(0xe00b)&128?1:0,breach,requested:false,door:false,loaded:false,after:0};
  s.armed=false;mod.radio?.dismiss?.('sandship');
 }
 function cutTick(){
  const c=s.cut;c.age++;
  if(!c.requested){
   // Let the beam itself read for a moment, then white out.
   s.flash=Math.max(0,Math.min(1,(c.age-6)/18));
   if(c.age>=24){
    if(!s.wreck)s.wreck={age:0,planned:c.planned,blasts:[],breach:c.breach};
    for(let i=mod.effects.length-1;i>=0;i--)if(mod.effects[i].kind==='beam')mod.effects.splice(i,1);
    mod.cancelInput();
    if(mod.story.request(breakout.escape))c.requested=true;
   }
  }else if(c.loaded&&++c.after>16)s.flash=Math.max(0,1-(c.after-16)/45);
  else s.flash=1;
  if(c.after>61||c.age>900){s.cut=null;s.flash=0;}
 }
 return{
  get wrecked(){return !!s.wreck;},
  get planned(){return !!(s.cut?.planned??s.wreck?.planned);},
  onEvent(id){
   if(id===breakout.wave&&captive()&&!s.wreck){s.armed=true;s.hinted=false;}
   if(id===breakout.deck)s.boss=true;
  },
  // Goku holds still while the screen is white.
  input(input){return s.cut?0:input;},
  read:(address,data)=>wreck.read(address,data),
  floorHole:(x,y)=>wreck.floorHole(x,y),
  draw:layer=>wreck.draw(layer),
  tick(){
   if(!mod.options.enabled||!mod.gokuActive)return;
   const stage=r(0xcf28);
   if(s.wreck){s.wreck.age++;if(stage>=12){s.wreck=null;s.boss=false;}}
   if(s.cut)return cutTick();
   for(const e of mod.effects)if(e.kind==='beam'&&!seen.has(e)){
    seen.add(e);if(!captive()||s.wreck)continue;
    if((e.strength??0)>=.85){blast(e);return;}
    if(s.armed)mod.radio?.say('GOKU:Too weak! I have to\ncharge it all the way.',{frames:150,kind:'sandship'});
   }
   if(s.armed&&!s.hinted&&quiet()){s.hinted=true;mod.radio?.say('GOKU:Hold L and Y to\ncharge, let go at full\npower. KA... ME... HA...',{frames:240,kind:'sandship'});}
   wreck.tick();
   if(s.wreck&&!s.deckDone&&decks.includes(map())&&stage<10&&mod.canAttack&&!r(0xd0)){
    if(!sandshipCaptives(mod.snes.ram)){if(mod.story.request(breakout.deck))s.deckDone=true;}
    else if(!s.deckHint&&quiet()){s.deckHint=true;mod.radio?.say('GOKU:Not yet! My friends\nare still down below.',{frames:180,kind:'sandship'});}
   }
   if(s.boss&&map()===deck&&stage===11&&mod.canAttack&&!r(0xd0)){
    const actor=mod.entities().find(e=>e.active&&e.species===geshtar);
    if(actor&&mod.story.request(0x29e,{actor:actor.base-0xe000}))s.boss=false;
   }
  },
  get status(){return{...structuredClone(s),...wreck.status()};},
  snapshot(){return structuredClone(s);},
  restore(saved){s={...fresh(),...structuredClone(saved??{})};wreck.restore();},
 };
}
