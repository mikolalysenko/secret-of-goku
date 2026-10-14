import {parseEvent,eventRange,dialoguePages,encodeText,commandLength} from './event-codec.js';
import {storyDialogue,soloDialogue} from './story-dialogue.js';
import {buildStoryEvents,bossReactions,box,choice} from './story-events.js';
import {prepareStoryArea} from './story-areas.js';
import {renameSenzu} from './native-senzu.js';
import {potosCommand} from './potos-story.js';
import {dragonBallGrant} from './dragon-quest.js';
import {breakableDoors} from './breakable-doors.js';

// Keep remaining speakers when a text run contains both a missing companion
// and an NPC. The last speaker carries across native pauses and page clears.
export function partyText(text,mask,silent=false){
  const matches=[...text.matchAll(/(?:^|\n)\s*(\{[012]\}|[A-Z][A-Z ]*):/g)];
  let kept='',offset=0;
  for(let i=0;i<matches.length;i++){
    const match=matches[i];if(!silent)kept+=text.slice(offset,match.index);
    silent=(match[1]==='{1}'&&!(mask&1))||(match[1]==='{2}'&&!(mask&2));
    offset=match.index;
    const end=matches[i+1]?.index??text.length;if(!silent)kept+=text.slice(offset,end);offset=end;
  }
  if(!matches.length&&!silent)kept=text;
  if(!(mask&1))kept=kept.replaceAll('{1}','Primm');
  if(!(mask&2))kept=kept.replaceAll('{2}','Popoi');
  return{text:kept,silent};
}

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
  const scripts=new Map(),entries=new Map(),metadata=new Map(),grants=new Map();
  function inspectByte(pc){
    if(pc>=0xf08000&&pc<0xf80000)for(const[at,script]of scripts)if(pc>=at&&pc<script.end)return script.bytes[pc-at]??0;
    // Inspection must not execute the cartridge adapters. Whip-pad reads, for
    // example, begin a crossing when the interpreter actually fetches them.
    return cart.data[pc&0x3fffff]??0;
  }
  let lastEvent=null,relocations=0,skippedActors=0,fastTrack=false,areaChanges=[],queued=null,queuedContext=null,pending=null,error=null,spellGrants=Array.from({length:2},()=>Array(8).fill(0));
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
  function compile(event,mask){
    const out=bossReactions[event.id]?box(bossReactions[event.id]):[];out.grants=[];
    let silent=false,lastSilent=false,selection=false,currentMask=mask;
    for(const op of event.ops){
      if(op.op==='text'){
        let text=storyDialogue[op.at]??op.text;
        const solo=soloDialogue[op.at],spriteScene=op.at===0x9a168||(op.at>=0xa31ec&&op.at<=0xa3423);
        const missingSpeaker=spriteScene||op.text.includes('{2}:')?!(currentMask&2):!(currentMask&1);
        if(solo&&missingSpeaker){text=solo;silent=false;}
        else if(!(op.at in storyDialogue)){
          const filtered=partyText(text,currentMask,silent);text=filtered.text;silent=filtered.silent;
          if(!text){lastSilent=true;continue;}
        }else silent=false;
        text=renameSenzu(text);lastSilent=false;
        // Choice labels retain their original positions. New story choices are
        // built separately with known widths and native branch commands.
        out.push(...(op.at in storyDialogue||op.at in soloDialogue?dialoguePages(text):text===op.text?op.bytes:encodeText(text)));
      }else{
        if(op.op===0x50){silent=false;lastSilent=false;}
        if(op.op===0x2b&&op.bytes[1]>=1&&op.bytes[1]<=2)currentMask|=1<<(op.bytes[1]-1);
        if(op.op===0x2c&&op.bytes[1]>=1&&op.bytes[1]<=2)currentMask&=~(1<<(op.bytes[1]-1));
        if(op.op===0x58)selection=true;
        if(op.op===0x5b)selection=false;
        if(lastSilent&&!selection&&(op.op===0x52||(op.op===0x28&&op.bytes[1]===0)))continue;
        out.push(...(potosCommand(op)??op.bytes));
        const ball=dragonBallGrant(op.at,op.op);if(ball!==null)out.grants.push([out.length,ball]);
      }
    }
    return out;
  }
  function storyRead(bank,address){
    if(bank>=0xf0&&bank<=0xf7){
      const address24=bank<<16|address;
      for(const[at,script]of scripts)if(address24>=at&&address24<script.end)return script.bytes[address24-at]??0;
    }
    return read.call(this,bank,address);
  }
  c.cycle=function(){
    if(this.cyclesLeft===0&&(this.r[1]&0x3f)===0&&this.br[4]===0xb073){
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
      let pc=pointer();const entry=entries.get(pc);
      if(entry){
        const mask=party();setPointer(typeof entry==='function'?entry(mask):entry[mask]);pc=pointer();lastEvent=metadata.get(pc)?.id;relocations++;
        if(lastEvent===0x88)fastTrack=true;
        if(lastEvent===0x93)mod.quest?.deliver();
        if(lastEvent===0x42f)mod.quest?.wish();
        if(lastEvent===0x95||lastEvent===0x96)mod.challenge?.choose(lastEvent===0x96);
      }
      if(grants.has(pc))mod.quest?.collect(grants.get(pc));
      // Native scripts address party actors 1/2/3 explicitly. An absent actor
      // must never acquire a movement wait bit and stall WAIT_FOR_ANIM.
      for(let i=0;i<32;i++){
        const op=inspectByte(pc),selector=inspectByte(pc+1);
        if(![0x31,0x32,0x34].includes(op)||selector<1||selector>3||present(selector-1))break;
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
      cart=snes.cart;read=cart.read;scripts.clear();entries.clear();metadata.clear();grants.clear();next=0xf08000;
      for(let id=0;id<0x800;id++){
        if(id>=0x100&&id<=0x106||id===0x400)continue; // BOY prologue and title legend
        const event=parseEvent(cart.data,id);
        if(!bossReactions[id]&&!event.ops.some(op=>dragonBallGrant(op.at,op.op)!==null||op.op==='text'&&(op.at in storyDialogue||op.at in soloDialogue||/\{[12]\}/.test(op.text)||renameSenzu(op.text)!==op.text)))continue;
        entries.set(0xc00000+event.start,[0,1,2,3].map(mask=>allocate(compile(event,mask),id,mask)));
      }
      const custom=buildStoryEvents(cart.data),customPointers=new Map();
      for(const[id,bytes]of custom){
        const address=allocate(bytes,id,3);customPointers.set(id,address);
        entries.set(0xc00000+eventRange(cart.data,id).start,[address,address,address,address]);
      }
      const cabinAt=0xc00000+eventRange(cart.data,0x29c).start,cabin=entries.get(cabinAt);
      entries.set(cabinAt,mask=>r[0xcf28]>=7?cabin[mask]:customPointers.get(r[0xcf0d]>=8?0xa2:0xa1));
      for(const door of breakableDoors)for(const[id,bytes]of door.events){
        const event=parseEvent(cart.data,id),at=0xc00000+event.start;
        const original=entries.get(at)??[0,1,2,3].map(mask=>allocate(compile(event,mask),id,mask));
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
      cart.read=storyRead;this.restore();
    },
    request(event,{actor=0}={}){
      if(!Number.isInteger(event)||event<0||event>=0x800||queued!==null||pending||!enabled()||!mod.canAttack)return false;
      if(actor&&(!Number.isInteger(actor)||actor<0x600||actor>=0x1800||actor%0x200||!(r[0xe000+actor]&1)))return false;
      queued=event;queuedContext=actor?{actor,map:word(0xdc),event:word(0xe03e+actor)}:null;return true;
    },
    travel(door){if(!Number.isInteger(door)||door<=0||door>=0x400||queued!==null||pending||!enabled()||!mod.canAttack)return false;queued=0x800|door;return true;},
    get status(){return{lastEvent,relocations,skippedActors,fastTrack,areaChanges:[...areaChanges],queued,error,eventCount:entries.size,scriptCount:scripts.size};},
    snapshot(){return{version:1,lastEvent,relocations,skippedActors,fastTrack,areaChanges,queued,queuedContext,pending,error,spellGrants:spellGrants.map(s=>s.slice())};},
    restore(saved){lastEvent=saved?.lastEvent??null;relocations=saved?.relocations??0;skippedActors=saved?.skippedActors??0;fastTrack=!!saved?.fastTrack;areaChanges=saved?.areaChanges?.slice()||[];queued=saved?.queued??null;queuedContext=saved?.queuedContext??null;pending=saved?.pending??null;error=saved?.error??null;spellGrants=saved?.spellGrants?.map(s=>s.slice())||[Array.from(r.slice(0xe3c8,0xe3d0)),Array.from(r.slice(0xe5c8,0xe5d0))];},
    dispose(){if(cart?.read===storyRead)cart.read=read;c.cycle=cycle;snes.write=write;},
  };
}
