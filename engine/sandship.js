import {parseEvent,eventRange} from './event-codec.js';
import {compileStoryEvent} from './story-compiler.js';
import {box,call,choice,jump} from './story-events.js';
import {sandshipWeights} from './sandship-dialogue.js';

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
// Super Saiyan wave. A full-power wave the player fires anywhere below deck
// while captive does the same. Either way the ship descends into chaos, the
// captured companions rejoin, and Geshtar's Mech Rider fight starts at once.
export const breakout={offer:0x72,sneak:0x73,wave:0x75,chaos:0x76,scripted:0x78,improvised:0x79};
export const holdMaps=[271,319,324];
const geshtar=177,deck=99;

const offer=()=>[
 ...box('GOKU:Hey... those guys are\npushing the engines in\nchains. Are they slaves?!'),
 ...box('SERGO:We ALL are, matey.\nThe Empire works us till\nwe drop.'),
 ...box('GOKU:That is terrible!\nI can fix that. One\nKamehameha should do it.'),
 ...box('SERGO:A kame-what? No, no!\nWe sneak out proper. Talk\nto the stair guards.'),
 ...box('SERGO:I will make the\ndistraction. Leave it to\nold Sergo!'),
 ...choice('GOKU:Sneak out, or...\n',[{label:'Sneak',x:3,to:breakout.sneak},{label:'KAMEHAMEHA',x:13,to:breakout.wave}])];
// Captives: bit 0 the girl is held in Morie's cabin, bit 1 the sprite is in
// the kitchen. Only a companion who was actually captured comes running.
const chaos=captives=>[
 ...box('SOLDIER:ALARM! The engine\nroom just EXPLODED!\nThe prisoners are loose!'),
 ...box('SERGO:Abandon ship, lads!\nNobody chains up Sergo!\n...That was all him.'),
 ...box('GOKU:You are all free!\nGo on! Nobody should push\nengines in chains.'),
 ...(captives&2?[...box('{2}:Was that YOU?! The\nsoup jumped out of the pot!\nGOKU:Sorry! Bring the pot.'),0x30,0x0e,1,0x09,0x2b,2]:[]),
 ...(captives&1?[...box('{1}:I was just about to\nescape on my own, you know!\nGOKU:Then come on!'),0x30,0x0d,1,0x09,0x2b,1]:[]),
 ...box('GESHTAR:WHO is wrecking\nmy ship?! Up on deck, NOW!\nGOKU:Ooh! Is he strong?'),
 0x30,0x28,10,0x19,0xab,0x29,0x28,...jump(0x29d),0];

const breakoutScripts={
 [breakout.sneak]:[...box('GOKU:Okay. Sneaking.\nI am great at sneaking.\nSERGO:...Sure you are.'),0x30,0x28,3,0],
 [breakout.wave]:[...box('GOKU:Everybody get behind\nme! This one is going\nto be loud.'),0],
 [breakout.scripted]:[...box('SERGO:Your HAIR! And the\nWALL! Where did it go?!\nGOKU:Oops. Too much?'),...jump(breakout.chaos),0],
 [breakout.improvised]:[...box('GOKU:Oops. That was more\nthan I meant.\nOh well. Breakout time!'),...jump(breakout.chaos),0],
};
// The authored breakout scripts, for the scene graph overlay.
export function buildSandshipEvents(){
 return[[breakout.offer,'offer',offer()],...Object.entries(breakoutScripts).map(([id,bytes])=>[Number(id),'all',bytes]),
  ...[0,1,2,3].map(c=>[breakout.chaos,`captives ${c}`,chaos(c)])];
}

export function installSandship({rom,r,mod,entries,variants}){
 const at=id=>0xc00000+eventRange(rom,id).start;
 for(const id of Object.values(breakout)){
  const{start,end}=eventRange(rom,id);
  if(end-start!==1||rom[start]!==0)throw Error('Sandship breakout event slot is occupied');
 }
 const compile=(id,mask,opts)=>compileSandship(parseEvent(rom,id),mask,opts);
 const capture=[false,true].map(weighted=>variants(0x28b,mask=>compile(0x28b,mask,{weighted})));
 entries.set(at(0x28b),mask=>capture[Number(!!mod.equipment?.weighted)][mask]);
 for(const id of[0x295,0x297,0x298,0x299]){
  const scripts=variants(id,mask=>compile(id,mask));
  entries.set(at(id),mask=>scripts[mask|sandshipCaptives(r)]);
 }
 const freed=variants(0x296,mask=>compile(0x296,mask)),end=variants(0x296,()=>[0]);
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
 // until the guards have been distracted.
 const sergo=variants(0x291,mask=>[...compile(0x291,mask).slice(0,-1),...jump(0x292)]);
 entries.set(at(0x291),mask=>sergo[mask|sandshipCaptives(r)]);
 const plan=variants(breakout.offer,offer);
 entries.set(at(0x292),mask=>plan[mask]);
 entries.set(at(breakout.offer),mask=>plan[mask]);
 for(const id of[breakout.sneak,breakout.wave,breakout.scripted,breakout.improvised])entries.set(at(id),variants(id,()=>breakoutScripts[id]));
 const free=[0,1,2,3].map(captives=>variants(breakout.chaos,()=>chaos(captives)));
 entries.set(at(breakout.chaos),mask=>free[sandshipCaptives(r)][mask]);
 entries.set(at(0x29c),mask=>{
  if(r[0xcf28]>=11)return end[mask];
  const captives=sandshipCaptives(r),popoi=Number(!!(captives&2));
  return captives&1?cabin[popoi][mask|captives]:boarding[popoi][mask];
 });
}

// Drives the wave: the cartridge's own transformation and the player's
// L+Y charge, so the beam, demolition and King Kai's remark are the real
// ones. Afterwards it opens the Mech Rider fight as soon as Goku is on deck.
export function createSandship(mod){
 const fresh=()=>({phase:null,age:0,intro:null,boss:false,blasted:false});
 let s=fresh();const seen=new WeakSet();
 const r=a=>mod.read8(a),captive=()=>r(0xcf28)>=1&&r(0xcf28)<=6&&holdMaps.includes(mod.read16(0xdc));
 const quiet=()=>mod.canAttack&&!r(0xd0)&&!mod.radio?.status.current&&!mod.radio?.status.queued;
 return{
  onEvent(id){
   if(id===breakout.wave&&captive()){s={...fresh(),phase:'wait',intro:mod.powerIntro?.snapshot()??null};}
   if(id===breakout.chaos)s.boss=true;
  },
  // Scripted input replaces the pad only while the wave is staged.
  input(input){
   if(!s.phase||s.phase==='wait'||s.phase==='after')return input;
   if(s.phase==='aim')return 1<<5;          // face down, toward the stairs
   if(s.phase==='charge')return 0x402;      // L+Y: Kamehameha charge
   return 0;
  },
  tick(){
   if(!mod.options.enabled||!mod.gokuActive)return;
   if(s.phase){
    s.age++;
    if(s.phase==='wait'&&mod.canAttack&&!r(0xd0)){
     // The first-ever transformation keeps its own tutorial for later.
     mod.powerIntro?.restore({...s.intro,superShown:true});
     if(!mod.options.superSaiyan)mod.configure({superSaiyan:true});
     s.phase='transform';s.age=0;
    }else if(s.phase==='transform'&&s.age>=40){mod.powerIntro?.restore(s.intro);s.phase='aim';s.age=0;}
    else if(s.phase==='aim'){s.phase='charge';s.age=0;mod.radio?.say('GOKU:KA... ME...\nHA... ME...',{frames:70,kind:'story'});}
    else if(s.phase==='charge'&&s.age>=60){s.phase='release';s.age=0;mod.radio?.say('GOKU:HAAAAAAAA!!!',{frames:50,kind:'story'});}
    else if(s.phase==='release'&&s.age>=4){s.phase='after';s.age=0;}
    else if(s.phase==='after'&&s.age>=70&&quiet()&&mod.story.request(breakout.scripted)){s.phase=null;s.age=0;}
    return;
   }
   // Sequence break: any full-power wave below deck while captive.
   for(const e of mod.effects)if(e.kind==='beam'&&!seen.has(e)){seen.add(e);if(captive()&&(e.strength??0)>=.85)s.blasted=true;}
   if(s.blasted&&!captive())s.blasted=false;
   if(s.blasted&&quiet()&&mod.story.request(breakout.improvised))s.blasted=false;
   if(s.boss&&mod.read16(0xdc)===deck&&r(0xcf28)===11&&mod.canAttack&&!r(0xd0)){
    const actor=mod.entities().find(e=>e.active&&e.species===geshtar);
    if(actor&&mod.story.request(0x29e,{actor:actor.base-0xe000}))s.boss=false;
   }
  },
  get status(){return{...s};},
  snapshot(){return structuredClone(s);},
  restore(saved){s={...fresh(),...structuredClone(saved??{})};},
 };
}
