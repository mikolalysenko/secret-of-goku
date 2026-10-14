import {parseEvent,eventRange} from './event-codec.js';
import {compileStoryEvent,needsStory} from './story-compiler.js';
export {partyText} from './story-compiler.js';
import {buildStoryEvents,box,choice} from './story-events.js';
import {prepareStoryArea} from './story-areas.js';
import {buildFriezaEvents,buildFriezaEnding,friezaEvents as F} from './frieza-events.js';
import {breakableDoors} from './breakable-doors.js';
import {crisisDialogue,crisisGreeting,crisisGreetings} from './frieza-crisis.js';

// Relocate selected event streams on reads. Native control codes, text drawing,
// choices, actor choreography, map loading and rewards still run on the SNES.
// F0-F7 are virtual script banks; the original 2 MiB cartridge is untouched.
export function createNativeStory(snes,mod){
  const r=snes.ram,c=snes.cpu,cycle=c.cycle,word=a=>r[a]|r[a+1]<<8;
  const pointer=()=>word(0xd1)|(r[0xd3]<<16),setPointer=a=>{r[0xd1]=a&255;r[0xd2]=a>>8&255;r[0xd3]=a>>16;};
  const enabled=()=>mod.options.enabled&&mod.gokuActive;
  // E02C is controller ownership, not party membership. Followers can have
  // zero there while remaining active and required by native choreography.
  const present=index=>!!(r[0xe000+index*0x200]&1);
  const party=()=>Number(present(1))|Number(present(2))<<1;
  let cart=null,read=null,next=0xf08000;
  const scripts=new Map(),entries=new Map(),metadata=new Map(),grants=new Map(),eventIds=new Map(),greetings=new Map(),greetingEnds=new Set(),greetingKinds=new Map();
  function inspectByte(pc){
    if(pc>=0xf08000&&pc<0xf80000)for(const[at,script]of scripts)if(pc>=at&&pc<script.end)return script.bytes[pc-at]??0;
    // Inspection must not execute the cartridge adapters. Whip-pad reads, for
    // example, begin a crossing when the interpreter actually fetches them.
    return cart.data[pc&0x3fffff]??0;
  }
  let lastEvent=null,relocations=0,skippedActors=0,fastTrack=false,areaChanges=[],queued=null,queuedContext=null,pending=null,error=null,spellGrants=Array.from({length:2},()=>Array(8).fill(0));
  let greetingResume=null,greeted=false,greetingCount=0;
  const write=snes.write;
  snes.write=function(address,value,dma=false){
    const result=write.call(this,address,value,dma),bank=address>>>16&255;
    if((address&65535)===0xdd&&(bank===0x7e||(bank&0x40)===0)&&enabled()){
      areaChanges.push(...prepareStoryArea(r,word(0xdc)));if(areaChanges.length>100)areaChanges.splice(0,areaChanges.length-100);
    }
    return result;
  };
  function allocate(bytes,id,mask){
    if((next&65535)+bytes.length+1>65535)next=((next+0x10000)&0xff0000)|0x8000;
    if(next>=0xf80000)throw Error('Native story script banks exhausted');
    const at=next;next+=bytes.length+1;
    scripts.set(at,{bytes:Uint8Array.from(bytes),end:next});metadata.set(at,{id,mask});
    for(const[offset,index]of bytes.grants??[])grants.set(at+offset,index);
    return at;
  }
  function storyRead(bank,address){
    // Sequence breaks can leave the first Luka visit unfinished while the
    // Empire plot already wants its later Jema. These are separate object
    // records; keep the introduction's Jema until his departure is complete.
    if((bank&63)===8&&enabled()&&r[0xcf11]<10){
      const header=0x80000+(cart.data[0x87116]|cart.data[0x87117]<<8);
      if(0x80000+address===header+8+6*8+1)return 0xf0; // impossible visibility range
    }
    // The Tree's first shot uses NPC stand-ins for the party, not the party
    // slots. Hide only missing companions; the goblin camp's girl remains
    // a real scene NPC even when she has not been recruited.
    if((bank&63)===8&&enabled()){
      const header=0x80000+(cart.data[0x871d8]|cart.data[0x871d9]<<8);
      for(let i=1;i<=2;i++)if(!present(i)&&0x80000+address===header+8+i*8+1)return 0xf0;
      // New Northtown scenes never abduct Primm. Hide the captive stand-in,
      // and let Thanatos disappear at stage 6, before stage 7 spawns Vampire.
      // The boss loader can run between event commands, so its old NPC must
      // already be gone before the flag changes to the boss stage. Preserve
      // the retail records for checkpoints with an actual captive Primm.
      if(r[0xcf0d]<8){
        const northtown=0x80000+(cart.data[0x87330]|cart.data[0x87331]<<8);
        if(0x80000+address===northtown+9)return 0xf0;
        if(0x80000+address===northtown+17)return 0x55;
      }
    }
    // Keep the native arena/map loader, but suppress its Thanatos/Dyluck/
    // Dark Lich object records on the optional branch before they can spawn.
    if((bank&63)===8&&enabled()&&mod.frieza?.active){
      const start=0x80000+(cart.data[0x871ec]|cart.data[0x871ed]<<8),end=0x80000+(cart.data[0x871ee]|cart.data[0x871ef]<<8),at=0x80000+address;
      if(at>=start+9&&at<end&&(at-start-9)%8===0)return 0xf0;
    }
    if(bank>=0xf0&&bank<=0xf7){
      const address24=bank<<16|address;
      for(const[at,script]of scripts)if(address24>=at&&address24<script.end)return script.bytes[address24-at]??0;
    }
    return read.call(this,bank,address);
  }
  c.cycle=function(){
    if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&this.br[4]===0xb073){
      if(mod.canAttack&&!r[0xd0]&&greetingResume===null)greeted=false;
      // Older checkpoints may already be inside the skipped Fire Palace
      // room. Stage two enables its plate; the plate and orb still earn stages
      // three and four, and the room's exit still owns the final progression.
      if(enabled()&&mod.canAttack&&word(0xdc)===240&&r[0xcf2b]<2)areaChanges.push(...prepareStoryArea(r,240));
      // The first conversation advances CF11 and spawns Jema beside Luka,
      // but the native refresh can retain his old stair-blocking actor when
      // Goku bypasses the approach. Reconcile only after choreography ends;
      // never remove an actor that an active movement command is waiting on.
      // This also repairs duplicates already stored in older checkpoints.
      if(enabled()&&word(0xdc)===139&&mod.canAttack){
        const jemas=[];
        for(let base=0xe600;base<0xf800;base+=0x200)if((r[base]&1)&&r[base+0x180]===0xa0&&[0x131,0x212].includes(word(base+0x3e)&0x7ff))jemas.push(base);
        if(jemas.length>1){
          const stage=r[0xcf11],event=stage<10?0x131:0x212,x=stage<8?212:260,y=stage<8?404:stage<10?276:308;
          const candidates=jemas.filter(base=>(word(base+0x3e)&0x7ff)===event);
          if(candidates.length){
            const keep=candidates.sort((a,b)=>Math.hypot(word(a+2)-x,word(a+4)-y)-Math.hypot(word(b+2)-x,word(b+4)-y))[0];
            for(const base of jemas)if(base!==keep)r[base]&=~1;
          }
        }
      }
      if(enabled())for(let i=0;i<2;i++)if(present(i+1))for(let spell=0;spell<8;spell++)r[0xe3c8+i*0x200+spell]|=spellGrants[i][spell];
      if(pending){
        if(this.br[3]!==pending.br[3])error='Story event returned with unexpected stack';
        else{this.br.set(pending.br);this.r.set(pending.r);this.setP(pending.p);}
        pending=null;
      }
      if(fastTrack&&word(0xdc)===246&&r[0xcf4e]===8&&mod.canAttack&&queued===null)queued=0x429;
      if(queued!==null&&!pending&&enabled()&&mod.canAttack&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)){
        const context=queuedContext;queuedContext=null;
        if(context&&(word(0xdc)!==context.map||!(r[0xe000+context.actor]&1)||word(0xe03e+context.actor)!==context.event)){queued=null;return cycle.call(this);}
        r[0xd4]=r[0xd5]=r[0x3a]=r[0x3b]=0;
        if(context){r[0x3a]=context.actor&255;r[0x3b]=context.actor>>8;}
        pending={br:[...this.br],r:[...this.r],p:this.getP()};
        this.br[0]=queued;queued=null;this.pushByte(this.r[1]);this.pushWord((this.br[4]-1)&65535);
        this.r[1]=1;this.br[4]=0xe76d;this.cyclesLeft=7;return;
      }
    }
    if(this.cyclesLeft===0&&(this.r[1]&0x3f)===1&&this.br[4]===0xe8ef&&enabled()){
      let pc=pointer();
      // A greeting is a native window prepended to the NPC's real event.
      // Resume at the exact script pointer: no extra CALL stack or altered
      // shop/inn/save choices, and no second greeting in nested subevents.
      const resuming=greetingEnds.has(pc)&&greetingResume!==null;
      if(resuming){setPointer(greetingResume);pc=pointer();greetingResume=null;}
      const id=resuming?null:eventIds.get(pc),entry=resuming?null:entries.get(pc);
      if(entry){
        const mask=party();setPointer(typeof entry==='function'?entry(mask):entry[mask]);pc=pointer();lastEvent=metadata.get(pc)?.id;relocations++;
        mod.frieza?.onEvent(lastEvent);
        if(lastEvent===0x88)fastTrack=true;
        if(lastEvent===0x93)mod.quest?.deliver();
        if(lastEvent===0x42f)mod.ending?.begin();
        if(lastEvent>=0xa3&&lastEvent<=0xa6)mod.ending?.cue(['dragon','wish','village','complete'][lastEvent-0xa3]);
        if(lastEvent===0xa4)mod.frieza?.repairCore();
        if(lastEvent===0x95||lastEvent===0x96)mod.challenge?.choose(lastEvent===0x96);
      }
      const actor=word(0x3a);
      if(id!==null&&id!==undefined&&mod.frieza?.crisisActive&&!greeted&&greetingResume===null&&
        actor>=0x600&&actor<0x1800&&actor%0x200===0&&(r[0xe000+actor]&1)&&(word(0xe03e+actor)&0x7ff)===id&&greetingKinds.has(id)){
        greeted=true;greetingCount++;greetingResume=pc;setPointer(greetings.get(greetingKinds.get(id)));pc=pointer();
      }
      if(grants.has(pc))mod.quest?.collect(grants.get(pc));
      // Native scripts address party actors 1/2/3 explicitly. An absent actor
      // must never acquire a movement wait bit and stall WAIT_FOR_ANIM.
      for(let i=0;i<32;i++){
        const op=inspectByte(pc),selector=inspectByte(pc+1);
        const missingParty=selector>=1&&selector<=3&&!present(selector-1);
        const missingStandIn=word(0xdc)===236&&((selector===5&&!present(1))||(selector===6&&!present(2)));
        if(![0x31,0x32,0x34].includes(op)||!missingParty&&!missingStandIn)break;
        pc+=3;setPointer(pc);skippedActors++;
      }
      if(inspectByte(pc)===0x39){
        const actor=inspectByte(pc+1),attribute=inspectByte(pc+2),value=inspectByte(pc+3);
        if(actor>=2&&actor<=3&&attribute>=0xc8&&attribute<=0xcf)spellGrants[actor-2][attribute-0xc8]|=value;
      }
    }
    return cycle.call(this);
  };
  return{
    inspectByte,
    load(){
      cart=snes.cart;read=cart.read;scripts.clear();entries.clear();metadata.clear();grants.clear();eventIds.clear();greetings.clear();greetingEnds.clear();greetingKinds.clear();next=0xf08000;
      const customVariants=[0,1,2,3].map(mask=>new Map([...buildStoryEvents(cart.data,mask),...buildFriezaEvents(cart.data,mask)]));
      const custom=customVariants[0],customIds=new Set(customVariants.flatMap(v=>[...v.keys()])),customPointers=new Map();
      function variants(id,compile){
        const seen=new Map();
        return [0,1,2,3].map(mask=>{
          const bytes=compile(mask),key=bytes.join(',')+'|'+JSON.stringify(bytes.grants??[]);
          if(!seen.has(key))seen.set(key,allocate(bytes,id,mask));return seen.get(key);
        });
      }
      for(let id=0;id<0x800;id++){
        const event=parseEvent(cart.data,id);eventIds.set(0xc00000+event.start,id);
        if((!customIds.has(id)&&id!==0x5f8&&id!==0x4a4)||[0x131,0x132,0x133,0x134].includes(id))greetingKinds.set(id,crisisGreeting(event));
        if(customIds.has(id))continue;
        if(id>=0x100&&id<=0x106||id===0x400)continue; // BOY prologue and title legend
        if(!needsStory(event))continue;
        entries.set(0xc00000+event.start,variants(id,mask=>compileStoryEvent(event,mask)));
      }
      // Cannon returns use the waterfall's prone/bouncing recovery for all
      // three actors. Goku brakes upright; companions retain their original
      // fall and the original script still owns the camera, waits and exit.
      const cannonReturn=parseEvent(cart.data,0xf7);
      entries.set(0xc00000+cannonReturn.start,[0,1,2,3].map(mask=>{
        const event={...cannonReturn,ops:cannonReturn.ops.map(op=>op.op===0x31&&op.bytes[1]===1?{...op,bytes:[0x31,1,0x80]}:op)};
        return allocate(compileStoryEvent(event,mask),0xf7,mask);
      }));
      for(const id of customIds){
        const entry=variants(id,mask=>customVariants[mask].get(id)??compileStoryEvent(parseEvent(cart.data,id),mask));
        customPointers.set(id,entry[0]);
        entries.set(0xc00000+eventRange(cart.data,id).start,entry);
      }
      // Resume old checkpoints made while Primm really was captive. New
      // scenes never set this flag, but an existing rescue must finish.
      const rescueAt=0xc00000+eventRange(cart.data,0x558).start,free=entries.get(rescueAt);
      const captive=variants(0x558,mask=>compileStoryEvent(parseEvent(cart.data,0x558),mask|1));
      entries.set(rescueAt,mask=>r[0xcf0d]>=8?captive[mask]:free[mask]);
      const cabinAt=0xc00000+eventRange(cart.data,0x29c).start,cabin=entries.get(cabinAt);
      entries.set(cabinAt,mask=>r[0xcf28]>=7?cabin[mask]:customPointers.get(r[0xcf0d]>=8?0xa2:0xa1));
      for(const door of breakableDoors)for(const[id,bytes]of door.events){
        const event=parseEvent(cart.data,id),at=0xc00000+event.start;
        const original=entries.get(at)??variants(id,mask=>compileStoryEvent(event,mask));
        const opened=allocate(bytes,id,3);
        entries.set(at,mask=>mod.barriers?.doorBroken(door.id)?opened:typeof original==='function'?original(mask):original[mask]);
      }
      entries.set(0xc00000+eventRange(cart.data,0x88).start,()=>customPointers.get(r[0xcf4e]>=9?0x8a:r[0xcf4e]>=7?0x89:0x88));
      entries.set(0xc00000+eventRange(cart.data,0x429).start,()=>customPointers.get(mod.worldKi?.status.fortressDestroyed?0x8f:0x429));
      entries.set(0xc00000+eventRange(cart.data,0x93).start,()=>customPointers.get(mod.quest?.status.count===7?0x94:0x93));
      const wardAdvice=Array.from({length:8},(_,count)=>allocate([
        ...box(`MANA WARDS: ${count} / 7\nOne hit blocked per ward.\nOnly palace visits earn them.\nKai's deliveries do not.`),...(count===7?custom.get(0x9a):[...box(`KING KAI:You touched ${count} of\nseven Mana Seeds. Delivered\nBalls cannot feed the Beast.\nGOKU:Aw. Next time, big guy.`),...choice('Calm the Mana Beast?\n',[{label:'Calm it',x:7,to:0x95}],0x95)]),
      ],0x9a,3));
      entries.set(0xc00000+eventRange(cart.data,0x9a).start,()=>wardAdvice[mod.quest?.status.earned??0]);
      entries.set(0xc00000+eventRange(cart.data,0x96).start,()=>customPointers.get(mod.quest?.status.canFeed?0x96:0x95));
      const advice=Array.from({length:8},(_,count)=>allocate([0x51,0x01,...box(`DRAGON BALLS: ${count} / 7\n${count===7?'All seven! Calm the Beast,\nthen make the wish.':'Find the Balls inside the\nseven palace Mana Seeds.'}`),...custom.get(0x85).slice(2)],0x85,3));
      entries.set(0xc00000+eventRange(cart.data,0x85).start,()=>advice[mod.quest?.status.count??0]);
      const route=(id,choose)=>{
        const at=0xc00000+eventRange(cart.data,id).start,original=entries.get(at);
        entries.set(at,mask=>choose(mask)??(typeof original==='function'?original(mask):original[mask]));
      };
      for(const[kind,text]of Object.entries(crisisGreetings)){
        const bytes=box(text),at=allocate([...bytes,1],-1,0);greetings.set(kind,at);greetingEnds.add(at+bytes.length);
      }
      for(const id of[0x4e0,0x5f8]){
        const crisis=variants(id,mask=>compileStoryEvent(parseEvent(cart.data,id),mask,{textOverrides:crisisDialogue}));
        route(id,mask=>mod.frieza?.crisisActive?crisis[mask]:null);
      }
      route(0x4a4,()=>mod.frieza?.crisisActive?customPointers.get(F.escape):mod.frieza?.eligible?customPointers.get(F.transitionOffer):null);
      const showdown=variants(F.showdown,mask=>customVariants[mask].get(F.showdown));
      const visit=allocate([0x51,1,...box('LUKA:Frieza has your Balls.\nI can take you inside.\nKeep the eighth safe.'),0x2f,0x84,0x30,0x4e,4,0x30,0x0b,2,0x18,0x2f,...[0x10|(F.showdown>>8),F.showdown&255],0],F.showdown,0);
      route(0x4e1,mask=>mod.frieza?.unresolved?showdown[mask]:null);
      route(0x88,()=>mod.frieza?.unresolved?visit:null);
      const rescue=allocate([0x51,1,...box('LUKA:Five minutes remain.\nI can take you to Frieza.\nRecover the Balls and\nsave this planet!'),...choice('Enter the Fortress?\n',[{label:'Stay',x:3,to:0},{label:'Go',x:17,to:0x88}])],0x87,0);
      route(0x87,()=>mod.frieza?.unresolved?rescue:null);
      for(const id of[0x429,0x8b,0x93])route(id,()=>mod.frieza?.unresolved?customPointers.get(F.reminder):null);
      const invitation=allocate([0x51,1,...box(`LUKA:All seven! Dryad
has sensed someone
following their power.
You can investigate first.`),...choice('Visit Dryad?\n',[{label:'Later',x:2,to:0},{label:'Go',x:17,to:F.travel}])],0x85,0);
      route(0x85,()=>mod.frieza?.unresolved?customPointers.get(F.reminder):mod.frieza?.eligible?invitation:null);
      const discVictory=variants(F.victory,mask=>buildFriezaEvents(cart.data,mask,{discVictory:true}).get(F.victory));
      route(F.victory,mask=>mod.frieza?.status.discHits?discVictory[mask]:null);
      const friezaEnding=[false,true].map(member=>variants(0x42f,mask=>buildFriezaEnding(mask,member)));
      route(0x42f,mask=>mod.frieza?.unresolved?customPointers.get(F.reminder):mod.frieza?.permanent?friezaEnding[Number(mod.frieza.popoiMember)][mask]:null);
      const crisisFinales=[0,1,2,3].map(mask=>buildStoryEvents(cart.data,mask,{crisis:true}));
      for(const id of[0x429,0x94,0x95,0x96,0x97]){
        const crisis=variants(id,mask=>crisisFinales[mask].get(id));
        route(id,mask=>mod.frieza?.crisisActive&&!mod.frieza.unresolved?crisis[mask]:null);
      }
      cart.read=storyRead;this.restore();
    },
    request(event,{actor=0}={}){
      if(!Number.isInteger(event)||event<0||event>=0x800||queued!==null||pending||!enabled()||!mod.canAttack)return false;
      if(actor&&(!Number.isInteger(actor)||actor<0x600||actor>=0x1800||actor%0x200||!(r[0xe000+actor]&1)))return false;
      queued=event;queuedContext=actor?{actor,map:word(0xdc),event:word(0xe03e+actor)}:null;return true;
    },
    travel(door){if(!Number.isInteger(door)||door<=0||door>=0x400||queued!==null||pending||!enabled()||!mod.canAttack)return false;queued=0x800|door;return true;},
    get status(){return{lastEvent,relocations,skippedActors,fastTrack,areaChanges:[...areaChanges],queued,error,eventCount:entries.size,scriptCount:scripts.size,greetingCount};},
    snapshot(){return{version:1,lastEvent,relocations,skippedActors,fastTrack,areaChanges,queued,queuedContext,pending,error,spellGrants:spellGrants.map(s=>s.slice()),greetingResume,greeted,greetingCount};},
    restore(saved){lastEvent=saved?.lastEvent??null;relocations=saved?.relocations??0;skippedActors=saved?.skippedActors??0;fastTrack=!!saved?.fastTrack;areaChanges=saved?.areaChanges?.slice()||[];queued=saved?.queued??null;queuedContext=saved?.queuedContext??null;pending=saved?.pending??null;error=saved?.error??null;spellGrants=saved?.spellGrants?.map(s=>s.slice())||[Array.from(r.slice(0xe3c8,0xe3d0)),Array.from(r.slice(0xe5c8,0xe5d0))];greetingResume=saved?.greetingResume??null;greeted=!!saved?.greeted;greetingCount=saved?.greetingCount??0;},
    dispose(){if(cart?.read===storyRead)cart.read=read;c.cycle=cycle;snes.write=write;},
  };
}
