import {parseEvent,eventRange} from './event-codec.js';
import {compileStoryEvent,needsStory,nativeOnlyEvents} from './story-compiler.js';
export {partyText} from './story-compiler.js';
import {buildStoryEvents,box,choice,call,jump} from './story-events.js';
import {prepareStoryArea} from './story-areas.js';
import {buildFriezaEvents,buildFriezaEnding,friezaEvents as F} from './frieza-events.js';
import {breakableDoors} from './breakable-doors.js';
import {crisisDialogue,crisisGreeting,crisisGreetings} from './frieza-crisis.js';
import {endingResult,endingEvents} from './ending-rules.js';
import {buildBadEnding} from './ending-events.js';
import {buildFriezaTree} from './frieza-tree.js';
import {waterPalaceApproach} from './water-palace.js';
import {installSandship} from './sandship.js';

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
  let cart=null,read=null,next=0xf08000,layout='';
  const scripts=new Map(),entries=new Map(),metadata=new Map(),grants=new Map(),eventIds=new Map(),greetings=new Map(),greetingEnds=new Set(),greetingKinds=new Map();
  function inspectByte(pc){
    if(pc>=0xf08000&&pc<0xf80000)for(const[at,script]of scripts)if(pc>=at&&pc<script.end)return script.bytes[pc-at]??0;
    // Inspection must not execute the cartridge adapters. Whip-pad reads, for
    // example, begin a crossing when the interpreter actually fetches them.
    return cart.data[pc&0x3fffff]??0;
  }
  let recentEvents=[];
  let lastEvent=null,relocations=0,skippedActors=0,fastTrack=false,areaChanges=[],queued=null,queuedContext=null,pending=null,error=null,spellGrants=Array.from({length:2},()=>Array(8).fill(0));
  let greetingResume=null,greeted=false,greetingCount=0;
  let waterWalkAt=0,waterWalk=[];
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
    if((bank&63)===8&&enabled()){
      // The retail reunion cliff (map 180) has no NPCs. Extend only this
      // ending's read view by one record so the native loader brings back
      // Dyluck, including his normal graphics, palette and actor ownership.
      if(mod.ending?.reunion){
        const start=cart.data[0x87168]|cart.data[0x87169]<<8,end=start+16;
        if(address===0x716a)return end&255;
        if(address===0x716b)return end>>8;
        if(address>=start+8&&address<end)return [0x4e,0x8f,0x8b,0x88,0x40,0xac,0,0][address-start-8];
      }
      // Map 73, piece 81: show Watts's native entrance after a beam breach.
      // Do not raise CF14, which also controls Gnome and palace progression.
      if(address===0x5a8e&&mod.barriers?.doorBroken('gaia-shortcut'))return 0x0f;
      const emperor=0x80000+(cart.data[0x8735e]|cart.data[0x8735f]<<8)+8+3*8;
      if(0x80000+address===emperor+1){
        if(mod.frieza?.emperorPresent)return 0x0f;
        if(mod.frieza?.status.emperorKilled)return 0xf0;
      }
      // Stage the introduction beside the Emperor and Dryad's seal, rather
      // than at the bottom of the long entrance aisle. Native door loading
      // owns camera setup, party placement and the fade.
      if(address===0x3ff2&&mod.frieza?.emperorPresent)return 36;
      // Jema's normal exterior records do not belong in the Death Ball
      // staging. Suppress them before the arrival fade; the renderer also
      // hides actors already captured in an older cutscene checkpoint.
      if(mod.frieza?.exteriorScene){
        const start=0x80000+(cart.data[0x87186]|cart.data[0x87187]<<8),end=0x80000+(cart.data[0x87188]|cart.data[0x87189]<<8);
        for(let at=start+8;at<end;at+=8)if(cart.data[at+5]===0xa0&&0x80000+address===at+1)return 0xf0;
      }
    }
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
      // The early Tree Palace Jema record wanders in the flooded approach.
      // Keep him on the dry path, facing the arriving player. The later
      // departure scene has its own record and retains its choreography.
      const jema=0x80000+(cart.data[0x87186]|cart.data[0x87187]<<8)+8+6*8;
      if(0x80000+address===jema+3)return 47|128;
      if(0x80000+address===jema+4)return 64;
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
    // The trial needs both native NPC records on the initial door load.
    // REFRESH cannot revive records suppressed before they entered map RAM.
    if((bank&63)===8&&enabled()&&(mod.frieza?.trial||mod.frieza?.pendingTrial)){
      const start=0x80000+(cart.data[0x871ec]|cart.data[0x871ed]<<8),at=0x80000+address;
      if(at===start+10)return 0x8f; // Dyluck, left of Thanatos
      if(at===start+11)return 0x97;
      if(at===start+18)return 0x92; // Thanatos, distinct center-stage body
      if(at===start+19)return 0x97;
    }
    // Keep the native arena/map loader, but suppress its Thanatos/Dyluck/
    // Dark Lich object records before the mainline Frieza scene can spawn.
    if((bank&63)===8&&enabled()&&(mod.frieza?.active||mod.frieza?.pendingEntrance)&&!mod.frieza?.trial&&!mod.frieza?.pendingTrial){
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
      // Repair the same wandering actor when an older checkpoint already
      // contains him. E044:80 is the native stationary-NPC flag.
      if(enabled()&&word(0xdc)===195&&mod.canAttack)for(let base=0xe600;base<0xf800;base+=0x200){
        if((r[base]&1)&&r[base+0x180]===0xa0&&(word(base+0x3e)&0x7ff)===0x4ac&&!(r[base+0x44]&128)){
          mod.write16(base+2,452);mod.write16(base+4,756);r[base+6]=r[base+7]=0;r[base+11]=2;r[base+0x44]|=128;
        }
      }
      if(enabled())for(let i=0;i<2;i++)if(present(i+1))for(let spell=0;spell<8;spell++)r[0xe3c8+i*0x200+spell]|=spellGrants[i][spell];
      if(pending){
        if(this.br[3]!==pending.br[3])error='Story event returned with unexpected stack';
        else{this.br.set(pending.br);this.r.set(pending.r);this.setP(pending.p);}
        pending=null;
      }
      if(fastTrack&&!mod.frieza?.unresolved&&word(0xdc)===246&&r[0xcf4e]===8&&mod.canAttack&&queued===null)queued=0x429;
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
        // A relocated script can call another in the same frame (112 calls the
        // 501 reward first), so keep a short entry history for observers.
        recentEvents.push(lastEvent);if(recentEvents.length>32)recentEvents.shift();
        mod.frieza?.onEvent(lastEvent);
        mod.sandship?.onEvent(lastEvent);
        mod.trial?.onEvent(lastEvent);
        if(lastEvent===0x28b)mod.equipment?.confiscate();
        if(lastEvent===0x88)fastTrack=true;
        if(lastEvent===0x42f)mod.ending?.begin();
        if(lastEvent>=0xa3&&lastEvent<=0xa6)mod.ending?.cue(['dragon','wish','village','complete'][lastEvent-0xa3]);
        if(lastEvent===endingEvents.depart)mod.ending?.cue('depart');
        if(lastEvent===endingEvents.kai)mod.ending?.cue('kai');
        if(lastEvent===endingEvents.scatter)mod.ending?.cue('scatter');
        if(lastEvent===endingEvents.reunion)mod.ending?.cue('reunion');
        if(lastEvent===endingEvents.clearing)mod.ending?.cue('summon');
        if(lastEvent===0xa4&&mod.quest?.status.wished)mod.frieza?.repairCore();
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
        if(nativeOnlyEvents.includes(id))continue; // prologue, legend, arrival splice
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
      installSandship({rom:cart.data,r,mod,entries,variants});
      for(const door of breakableDoors)for(const[id,bytes]of door.events){
        const event=parseEvent(cart.data,id),at=0xc00000+event.start;
        const original=entries.get(at)??variants(id,mask=>compileStoryEvent(event,mask));
        const opened=allocate(bytes,id,3);
        entries.set(at,mask=>mod.barriers?.doorBroken(door.id)?opened:typeof original==='function'?original(mask):original[mask]);
      }
      entries.set(0xc00000+eventRange(cart.data,0x429).start,()=>customPointers.get(mod.worldKi?.status.fortressDestroyed?0x8f:0x429));
      entries.set(0xc00000+eventRange(cart.data,0x93).start,()=>customPointers.get(mod.quest?.status.held===7&&mod.quest.status.seedMask===127?0x94:0x93));
      // All seven seeds force Goku's power-up challenge. Missing Balls have
      // already been acknowledged; proceed directly into the ordinary fight.
      entries.set(0xc00000+eventRange(cart.data,0x9a).start,()=>customPointers.get(mod.quest?.status.canFeed?0x96:0x95));
      entries.set(0xc00000+eventRange(cart.data,0x96).start,()=>customPointers.get(mod.quest?.status.canFeed?0x96:0x95));
      const advice=Array.from({length:8},(_,count)=>allocate([0x51,0x01,...box(`DRAGON BALLS: ${count} / 7\n${count===7?'All seven! Calm the Beast,\nthen make the wish.':'Find the Balls inside the\nseven palace Mana Seeds.'}`),...custom.get(0x85).slice(2)],0x85,3));
      entries.set(0xc00000+eventRange(cart.data,0x85).start,()=>advice[mod.quest?.status.count??0]);
      const route=(id,choose)=>{
        const at=0xc00000+eventRange(cart.data,id).start,original=entries.get(at)??variants(id,mask=>compileStoryEvent(parseEvent(cart.data,id),mask));
        entries.set(at,mask=>choose(mask)??(typeof original==='function'?original(mask):original[mask]));
      };
      // The trial borrows companions only for its entrance. They wait with
      // Jehk while Goku fights Vegeta. Native ADD_CHARACTER restores exactly
      // that lineup, on both victory and the original nonfatal failure exit.
      for(const id of[0x4e5,0x25]){
        const returning=variants(id,mask=>{
          const event=parseEvent(cart.data,id),ops=[];
          for(const op of event.ops){
            if(id===0x4e5&&op.op===0x4a&&[5,6].includes(op.bytes[1]))continue;
            if(id===0x4e5&&op.op===0x18&&op.bytes[1]===0x38)ops.push({op:0x2d,bytes:[0x2d,6,255,255]},{op:0x28,bytes:[0x28,48]});
            ops.push(op);
            if(op.op===0x18&&op.bytes[1]===0x38)for(let i=1;i<=2;i++)if(mask&(1<<(i-1)))ops.push({op:0x2b,bytes:[0x2b,i]});
          }
          return compileStoryEvent({...event,ops},mask,{textOverrides:id===0x25?{
            0x90b5c:'JEHK:Both safely back.\nRest, then try again.\nGOKU:He is a great coach!',
          }:{
            0xa3c3c:'GOKU:A draw! That was fun.\nVegeta wants a rematch!',
            0xa3c59:'JEHK:You both came back,\nand he returned to his own\nworld. With the door intact.',
            0xa3c75:'GOKU:He said it was worth\nbeing interrupted!\nWell... almost.',
            0xa3ca9:'You chose to stop, though\nneither had fallen.\nThat is also strength.',
            0xa3cf0:'I am Joch. The old man\nwas an illusion.\nVegeta, sadly, was not.',
            0xa3d1d:'GOKU:Can we borrow that\nroom again sometime?\nJOCH:After you save the world.',
            0xa3d43:'You have courage, Goku.\nTry using it to protect\npeople, not just to win.',
            0xa3d8c:'GOKU:I can do both!\nJOCH:That is what worries me.',
          }});
        });
        route(id,()=>mod.trial?.active?returning[mod.trial.partyMask]:null);
      }
      // A fixed virtual allocation keeps an in-progress walk replayable in
      // checkpoints. Rebuild its actor-relative bytes on the first talk.
      waterWalkAt=allocate(Array(512).fill(0),0x131,3);
      route(0x131,()=>{
        if(word(0xdc)!==139||r[0xcf11]>=8)return null;
        const jema=mod.entities().find(e=>e.active&&e.species===0xa0);
        if(!jema)return null;
        const leader=[0xe000,0xe200,0xe400].find(base=>(r[base]&1)&&(r[base+0x2c]&1))??0xe000;
        waterWalk=waterPalaceApproach({x:word(leader+2),y:word(leader+4)},jema);
        if(waterWalk.length>512)throw Error('Water Palace approach exceeds script space');
        scripts.get(waterWalkAt).bytes.fill(0);scripts.get(waterWalkAt).bytes.set(waterWalk);
        return waterWalkAt;
      });
      for(const[kind,text]of Object.entries(crisisGreetings)){
        const bytes=box(text),at=allocate([...bytes,1],-1,0);greetings.set(kind,at);greetingEnds.add(at+bytes.length);
      }
      for(const id of[0x4e0,0x5f8]){
        const crisis=variants(id,mask=>compileStoryEvent(parseEvent(cart.data,id),mask,{textOverrides:crisisDialogue}));
        route(id,mask=>mod.frieza?.crisisActive?crisis[mask]:null);
      }
      const fanha=variants(0x4a1,mask=>compileStoryEvent(parseEvent(cart.data,0x4a1),mask,{textOverrides:{
        0xa17da:'FANHA:You made it!\nGOKU:Who killed the Emperor?',
        0xa180c:'FANHA:That white creature!\nOne finger... But WE will\nstill take the Fortress!',
        0xa1945:'FANHA:Go, Thanatos!\nI will keep this one here.\nThe Fortress is ours!',
      }}));
      route(0x4a1,mask=>fanha[mask]);
      const hexasEnd=variants(0x4a2,mask=>[
        ...call(F.fanhaFinish),0x28,12,...call(F.sceneClear),
        ...compileStoryEvent(parseEvent(cart.data,0x4a2),mask,{textOverrides:{
          0xa19be:'FANHA:That light...\nNo! Not me too--!',
        }}),
      ]);
      route(0x4a2,mask=>mod.frieza?.pendingEntrance||mod.frieza?.palace?hexasEnd[mask]:null);
      route(0x4aa,()=>mod.frieza?.pendingEntrance&&!mod.frieza.status.emperorKilled?customPointers.get(F.emperorRoom):null);
      // Older saves past the Emperor can still use Hexas's native fight.
      // Her exit also routes into the altar entrance, replacing Rider III.
      const retiredRider=allocate([0],0x4a3,0);
      route(0x4a3,()=>mod.frieza?.pendingEntrance?customPointers.get(F.offer):mod.frieza?.crisisActive?retiredRider:null);
      const tree=variants(0x5f8,mask=>buildFriezaTree(parseEvent(cart.data,0x5f8),mask));
      const jemaAfterTree=variants(0x4e0,mask=>compileStoryEvent(parseEvent(cart.data,0x4e0),mask,{textOverrides:{...crisisDialogue,
        0xa297d:'JEMA:The Mana Tree is gone.\nOnly her roots are keeping\nthe souls from vanishing.',
        0xa29c9:'The cloud barrier around\nPure Land has fallen.',
        0xa29fe:'Frieza has retreated to\nthe Mana Fortress with\nthe stolen Dragon Balls.',
        0xa2a41:'Follow him. Defeat him.\nPlease leave enough of\nthe planet to save!',
      }}));
      route(0x4e0,mask=>mod.frieza?.crisisActive&&mod.frieza.status.tree==='complete'?jemaAfterTree[mask]:null);
      const treeAfter=allocate([0x51,1,...box('MANA TREE:My roots hold\nthe souls. Frieza waits in\nthe Fortress. Go, Goku.'),0],0x5f8,0);
      route(0x5f8,mask=>mod.frieza?.needsTree?tree[mask]:mod.frieza?.status.tree==='complete'?treeAfter:null);
      // The Grand Palace route (Emperor's room reached, $CF44>=2) leaves Hexas
      // and Rider III to play; an early Fortress entry goes to the deck at once.
      const theft=[false,true].map(palace=>[false,true].map(emperorKilled=>[0,1,7].map(collected=>variants(F.theft,mask=>buildFriezaEvents(cart.data,mask,{collected,emperorKilled,palace}).get(F.theft)))));
      route(F.theft,mask=>theft[Number(r[0xcf44]>=2||!!mod.frieza.status.emperorKilled)][Number(!!mod.frieza.status.emperorKilled)][mod.quest.status.count===7?2:mod.quest.status.count?1:0][mask]);
      // After Rider III the Fortress lurches (retail 4A4's opening), then
      // Frieza lands on its deck for the Death Ball instead of the retail exit.
      const launch=parseEvent(cart.data,0x4a4),door=launch.ops.findIndex(o=>o.op===0x1b);
      const fortressLaunch=variants(0x4a4,mask=>[...compileStoryEvent({...launch,ops:[...launch.ops.slice(0,door),{op:0,bytes:[0]}]},mask).slice(0,-1),...jump(F.deckDeathBall),0]);
      const deck=[0,1,7].map(collected=>variants(F.deckDeathBall,mask=>buildFriezaEvents(cart.data,mask,{collected}).get(F.deckDeathBall)));
      const stolenCount=()=>{let n=0;for(let m=mod.frieza?.stolenMask??0;m;m&=m-1)n++;return n;};
      route(F.deckDeathBall,mask=>deck[stolenCount()===7?2:stolenCount()?1:0][mask]);
      route(0x4a4,mask=>mod.frieza?.palace?fortressLaunch[mask]:mod.frieza?.pendingEntrance?customPointers.get(F.transitionOffer):mod.frieza?.crisisActive?customPointers.get(F.escape):null);
      const showdown=variants(F.showdown,mask=>customVariants[mask].get(F.showdown));
      const trial=variants(F.trial,mask=>customVariants[mask].get(F.trial));
      const afterTrial=variants(F.afterTrial,mask=>customVariants[mask].get(F.afterTrial));
      route(F.showdown,mask=>mod.frieza?.needsTree?customPointers.get(F.treeReminder):mod.frieza?.unresolved&&!mod.frieza?.status.trialWon?trial[mask]:showdown[mask]);
      route(0x42d,mask=>mod.frieza?.trial?afterTrial[mask]:null);
      // Flying straight into the Fortress must not silently select Thanatos.
      // An unseen Frieza makes his entrance, fires into the core, and leaves
      // Goku in the twilight world to finish collecting before returning.
      route(0x4e1,mask=>mod.frieza?.pendingEntrance?customPointers.get(F.offer):mod.frieza?.needsTree?customPointers.get(F.treeReminder):mod.frieza?.unresolved?(mod.frieza.status.trialWon?showdown[mask]:trial[mask]):null);
      // Blowing up the Fortress still commits the doomed-world route, even
      // if the player has not chased Frieza to the Tree yet.
      route(0x429,()=>mod.worldKi?.status.fortressDestroyed?null:mod.frieza?.pendingEntrance?customPointers.get(F.offer):mod.frieza?.needsTree?customPointers.get(F.treeReminder):null);
      route(F.reminder,()=>mod.frieza?.needsTree?customPointers.get(F.treeReminder):null);
      const invitation=allocate([0x51,1,...box(`LUKA:All seven! Dryad
has sensed someone
following their power.
Speak to her before wishing.`),...choice('Visit Dryad?\n',[{label:'Later',x:2,to:0},{label:'Go',x:17,to:F.travel}])],0x85,0);
      route(0x85,()=>mod.frieza?.unresolved?customPointers.get(F.reminder):mod.frieza?.eligible?invitation:null);
      const friezaEnding=[false,true].map(member=>variants(0x42f,mask=>buildFriezaEnding(mask,member)));
      const badEndings=Object.fromEntries(['fortress','balls','frieza','beast'].map(reason=>[reason,allocate(buildBadEnding(reason),0x42f,0)]));
      route(0x42f,mask=>{
        mod.challenge?.victory(); // Native Beast victory, before choosing the ending.
        const result=endingResult(mod);
        return result.outcome==='bad'?badEndings[result.reason]:friezaEnding[Number(mod.frieza.popoiMember)][mask|(mod.frieza.status.primmMember?1:0)];
      });
      const crisisFinales=[0,1,2,3].map(mask=>buildStoryEvents(cart.data,mask,{crisis:true}));
      for(const id of[0x429,0x94,0x95,0x96,0x97]){
        const crisis=variants(id,mask=>crisisFinales[mask].get(id));
        route(id,mask=>mod.frieza?.crisisActive&&!mod.frieza.unresolved&&!mod.worldKi?.status.fortressDestroyed?crisis[mask]:null);
      }
      // Seven personally collected Balls always provoke the upgraded fight.
      // This also covers old checkpoints paused at the former Calm choice.
      route(0x95,()=>mod.quest?.status.canFeed?customPointers.get(0x96):null);
      // Quick checkpoints contain live F0-F7 instruction/return pointers.
      // Any text edit can move subsequent scripts, even in an unrelated
      // chapter. Key caches by the actual allocation, not a hand-bumped tag.
      let fingerprint=2166136261;
      const mix=b=>{fingerprint=Math.imul(fingerprint^b,16777619);};
      for(const[at,script]of scripts){
        for(const n of[at,script.end])for(let shift=0;shift<24;shift+=8)mix(n>>>shift&255);
        for(const b of script.bytes)mix(b);
      }
      layout=(fingerprint>>>0).toString(16);
      cart.read=storyRead;this.restore();
    },
    request(event,{actor=0}={}){
      if(!Number.isInteger(event)||event<0||event>=0x800||queued!==null||pending||!enabled()||!mod.canAttack)return false;
      if(actor&&(!Number.isInteger(actor)||actor<0x600||actor>=0x1800||actor%0x200||!(r[0xe000+actor]&1)))return false;
      queued=event;queuedContext=actor?{actor,map:word(0xdc),event:word(0xe03e+actor)}:null;return true;
    },
    travel(door){if(!Number.isInteger(door)||door<=0||door>=0x400||queued!==null||pending||!enabled()||!mod.canAttack)return false;queued=0x800|door;return true;},
    get layout(){return layout;},
    get status(){return{lastEvent,recentEvents:[...recentEvents],relocations,skippedActors,fastTrack,areaChanges:[...areaChanges],queued,error,eventCount:entries.size,scriptCount:scripts.size,greetingCount};},
    snapshot(){return{version:1,layout,lastEvent,relocations,skippedActors,fastTrack,areaChanges,queued,queuedContext,pending,error,spellGrants:spellGrants.map(s=>s.slice()),greetingResume,greeted,greetingCount,waterWalk:waterWalk.slice()};},
    restore(saved){waterWalk=saved?.waterWalk?.slice()??[];if(waterWalkAt){scripts.get(waterWalkAt).bytes.fill(0);scripts.get(waterWalkAt).bytes.set(waterWalk);}recentEvents=[];lastEvent=saved?.lastEvent??null;relocations=saved?.relocations??0;skippedActors=saved?.skippedActors??0;fastTrack=!!saved?.fastTrack;areaChanges=saved?.areaChanges?.slice()||[];queued=saved?.queued??null;queuedContext=saved?.queuedContext??null;pending=saved?.pending??null;error=saved?.error??null;spellGrants=saved?.spellGrants?.map(s=>s.slice())||[Array.from(r.slice(0xe3c8,0xe3d0)),Array.from(r.slice(0xe5c8,0xe5d0))];greetingResume=saved?.greetingResume??null;greeted=!!saved?.greeted;greetingCount=saved?.greetingCount??0;},
    dispose(){if(cart?.read===storyRead)cart.read=read;c.cycle=cycle;snes.write=write;},
  };
}
