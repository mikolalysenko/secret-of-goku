// Debug scene-select data generator (docs/agents/snes-port/debug.md).
//
// The cartridge's scene select mirrors the browser's `?start=` presets. Their
// single source of truth stays engine/quick-start.js and engine/quick-boot.js:
// this generator runs those builders in Node against a recording mock of the
// browser runtime and translates what they do into a small bytecode that the
// cartridge executes natively (snes/src/modules/debug/recipe.asm):
//   - bootLateGame's temporary event 400/106 bytes become one boot script in
//     ROM; the cartridge points the new game's first event (100) at it, which
//     is what the browser's byte patch achieves;
//   - flag, HP, inventory and name writes become RAM pokes; fullParty's
//     borrowed event 98 script becomes a ROM script run through that slot;
//   - story.travel/request become the story module's APIs, followed by the
//     native condition the browser's polling loop waits for (WAITS below);
//   - every call into a browser module this module does not own (Frieza,
//     Beast challenge, radio, power intro, world ki, endings) becomes a hook
//     call with the browser's argument object as payload.
// Output in dist/snes/gen/debug/: presets.asm, defines.asm, hooks.asm,
// tiles.bin (2bpp font and window art from the cartridge), bg1.bin / bg2.bin
// (menu tilemaps) and catalog.json (traces and recipes, for docs and tests).
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');

// Menu order (story order). Must be exactly the browser's quick starts.
export const PRESETS=['title','sword','sandship','late','trial','intro','hexas','rider','tree','fortress','buffy',
  'slime','flight','frieza','thanatos','battle','orbit','space','beast','good-ending','bad-ending','explosion'];
export const presetDefine=name=>name.toUpperCase().replace(/-/g,'_');

// Recipe opcodes (snes/src/modules/debug/recipe.asm dispatch order).
export const OP={END:0x00,WAIT:0x01,POKE8:0x02,POKE16:0x03,POKEN:0x04,FILL:0x05,FLAG:0x06,RAISE:0x07,SENZU:0x08,
  LEDGER:0x09,SCRIPT:0x0A,TRAVEL:0x0B,REQUEST:0x0C,UNTIL:0x0D,HOOK:0x0E,FORM:0x0F,TAKEOFF:0x10,WORLDAIM:0x11,
  TELEPORT:0x12,PRESS:0x13,SWORD:0x14,OPENING:0x15,REFILL:0x16,CANCEL:0x17,MARK:0x18,PERMANENT:0x19};
// UNTIL condition bits.
export const UNTIL={CAN_ACT:0x01,ADVANCE:0x02,ENEMY:0x04,IDLE:0x08,WINDOW:0x10,WORLD:0x20,SCENE:0x40,EVENT:0x80};
// Hook kinds (A on entry of !DEBUG_PRESET_HOOK_<NAME> / _ANY).
export const HOOK={CANCEL_COMBAT:0x01,RADIO:0x02,POWER_INTRO:0x03,WORLD_KI:0x04,FRIEZA:0x05,FRIEZA_EVENT:0x06,
  FRIEZA_PHASES:0x07,CHALLENGE:0x08,SCENE:0x09,FINISH:0x0A,FORM:0x0B};
// Boot modes: the title's name editor only, the original opening, or the
// late-start boot script (quick-boot.js).
export const BOOT={EDITOR:0,OPENING:1,SCRIPT:2};
// Payload keys and string values of the browser objects passed to hooks.
const KEYS=['stage','tree','emperorKilled','stolen','stolenMask','eighth','hinted','trialWon','permanent','fallen',
  'scene','firstFlight','flight','superShown','fed','started','won','event','phase','superSaiyan'];
const VALUES=['null','hunt','pursuit','complete','defeated','palace','showdown','trial','open','explode'];
// Browser pad indices (engine/input.js; 16 = the wrapper's confirm) to SNES
// pad bits ($4218 layout).
const PAD=[0x8000,0x4000,0x2000,0x1000,0x0800,0x0400,0x0200,0x0100,0x0080,0x0040,0x0020,0x0010];
const padBits=list=>(list??[]).reduce((m,b)=>m|(b===16?0x8000:PAD[b]??0),0);
// Mock RAM sentinels: values the browser copies from live RAM.
const SENT_MAXHP=0x5a5a,SENT_FX=0x0a6e,SENT_FY=0x0bcd;

// What the browser's polling loops and guards wait for, as native
// conditions, keyed by travel door / requested event. `map` is also what the
// mock reports so the browser's guards pass; `frieza`/`scene` are the Frieza
// stage and the module state its loop polls; `soft` marks a wait that only
// another module's logic can satisfy (the preset then ends at the closest
// native state after `frames`). These are the only facts here not read
// from quick-start.js; each mirrors one loop condition there.
const WAITS={
  travel:{
    0x304:{map:72},                                                // trial: pump(240), map 72
    0x3df:{map:418,until:UNTIL.CAN_ACT|UNTIL.ADVANCE},               // hexas: map 418 && canAttack, R held
    // rider: map 237, canAttack, a live enemy. Room 419 only moves on when
    // the Frieza module requests 4A3 (frieza.js: stage palace, CF44 = 6):
    // without it the preset ends in room 419 (soft wait).
    0x3dd:{map:237,until:UNTIL.CAN_ACT|UNTIL.ADVANCE|UNTIL.ENEMY,soft:{owner:'frieza',frames:1280}},
    0x3a9:{map:235,until:UNTIL.CAN_ACT|UNTIL.ADVANCE},               // tree: until canAttack, R held
    0x3b:{map:255,until:UNTIL.CAN_ACT},                             // Fortress deck guard
    0x2f:{map:246,frieza:'trial'},                                  // Fortress arena: the trial scene starts
    0x1cb:{map:67,until:UNTIL.EVENT},                               // desert: the thirst scene ($D0 != 0)
    0x3fc:{map:431,until:UNTIL.CAN_ACT},                            // late staging room
  },
  request:{
    0xa8:{},                                                        // intro: pump(1)
    0xa7:{until:UNTIL.CAN_ACT|UNTIL.IDLE|UNTIL.ADVANCE|UNTIL.SCENE,frieza:'palace',scene:{stage:'palace'}},
    0x5f8:{},                                                       // tree confrontation: pump(1)
    0x420:{map:244,until:UNTIL.CAN_ACT|UNTIL.ENEMY,species:120},      // Buffy
    0x423:{map:488,until:UNTIL.CAN_ACT|UNTIL.ENEMY,species:124},      // Dread Slime
    0x429:{map:253,until:UNTIL.CAN_ACT|UNTIL.ADVANCE|UNTIL.SCENE,scene:{started:true}}, // Beast challenge
    0x42f:{until:UNTIL.WINDOW|UNTIL.SCENE,scene:kind=>({phase:kind==='explosion'?'explode':'open'})}, // endings
    0xc1:{},                                                        // Frieza showdown: pump(1)
  },
};

export async function generate({rom,repo,outDir}){
  const engine=name=>import(pathToFileURL(join(repo,'engine',name)).href);
  const qs=await engine('quick-start.js');
  const {eventRange,encodeText}=await engine('event-codec.js');
  const {friezaEvents}=await engine('frieza-events.js');
  const labels=qs.quickStartLabels;
  const browserKinds=Object.keys(labels).sort().join();
  if([...PRESETS].sort().join()!==browserKinds)throw Error(`debug: presets differ from quick-start.js (${browserKinds})`);

  const doorMap=door=>{const at=0x83000+door*4;return rom[at]|((rom[at+1]&1)<<8);};
  const ev100=eventRange(rom,0x100).start,ev400=eventRange(rom,0x400).start,ev106=eventRange(rom,0x106).start;
  const bootDoor=bytes=>{
    for(let i=bytes.length-1;i>0;i--)if(bytes[i-1]>=0x18&&bytes[i-1]<=0x1b)return((bytes[i-1]-0x18)<<8)|bytes[i];
    throw Error('debug: boot script has no door');
  };

  // ---- 1. record each preset through the browser's own builders ----------
  async function record(kind){
    const trace=[],rec=(op,args={})=>trace.push({op,...args});
    const romCopy=rom.slice(),romSets=[];
    romCopy.set=function(bytes,offset=0){romSets.push({offset,bytes:Array.from(bytes)});Uint8Array.prototype.set.call(this,bytes,offset);};
    // A fresh game's inventory, empty companion name slots, sentinels.
    const ram=new Uint8Array(0x20000);
    ram.fill(0xff,0xcc48,0xcc48+12);ram.fill(0xff,0xcc0c,0xcc30);
    const put16=(a,v)=>{ram[a]=v&255;ram[a+1]=v>>8;};
    put16(0xe384,SENT_MAXHP);put16(0xe584,SENT_MAXHP);put16(0x128,SENT_FX);put16(0x12a,SENT_FY);
    let inBoot=true,bootControl=null;
    const state={map:0,d0:0,frieza:{stage:'none'},fighting:false,challenge:{started:false},ending:null,worldFlight:false,entities:[]};
    const ramProxy=new Proxy(ram,{
      get(t,k){
        if(k==='set')return(arr,off=0)=>{rec('pokeBlock',{a:off,bytes:Array.from(arr)});t.set(arr,off);};
        if(k==='fill')return(v,s=0,e=t.length)=>{rec('fill',{a:s,n:e-s,v});t.fill(v,s,e);};
        if(typeof k==='string'&&/^\d+$/.test(k))return t[Number(k)];
        const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;
      },
      set(t,k,v){
        if(typeof k==='string'&&/^\d+$/.test(k)){rec('ramSet',{a:Number(k),v,old:t[Number(k)]});t[Number(k)]=v;return true;}
        return Reflect.set(t,k,v);
      },
    });
    const r8=a=>{
      if(a===0xd0){if(inBoot&&bootControl===null)bootControl=false;return state.d0;}
      if(a===0xdc)return state.map&255;if(a===0xdd)return state.map>>8;
      return ram[a&0x1ffff];
    };
    const options=new Proxy({},{set(t,k,v){rec('option',{key:k,v});t[k]=v;return true;}});
    const mod={
      snes:{cart:{data:romCopy},ram:ramProxy},
      get nameEditor(){return true;},
      get canAttack(){if(inBoot&&bootControl===null)bootControl=true;return true;},
      get status(){return{map:state.map};},
      get worldFlight(){return state.worldFlight;},
      read8:r8,read16:a=>r8(a)|r8(a+1)<<8,
      write8:(a,v)=>{rec('poke8',{a,v});ram[a]=v&255;},
      write16:(a,v)=>{rec('poke16',{a,v});put16(a,v);},
      cancelCombat:()=>rec('hook',{kind:'CANCEL_COMBAT'}),
      cancelInput:()=>rec('cancelInput'),
      requestFlight:()=>{rec('takeoff');state.worldFlight=true;return true;},
      entities:()=>state.entities,
      options,
      radio:{restore:o=>rec('hook',{kind:'RADIO',o})},
      powerIntro:{restore:o=>rec('hook',{kind:'POWER_INTRO',o})},
      worldKi:{restore:o=>rec('hook',{kind:'WORLD_KI',o})},
      quest:{restore:o=>rec('ledger',{o})},
      challenge:{restore:o=>{rec('hook',{kind:'CHALLENGE',o});state.challenge={...o};},get status(){return state.challenge;}},
      ending:{get status(){return state.ending;},get active(){return!!state.ending;}},
      teleport:{follow:o=>{rec('teleport',{o});ram[0xcf10]=1;}},
      story:{
        travel:door=>{
          const w=WAITS.travel[door];
          if(!w)throw Error(`debug: no native wait for travel ${hex(door,3)}`);
          rec('travel',{door});
          state.map=w.map??doorMap(door);
          if(w.until&UNTIL.EVENT)state.d0=1;
          if(w.until&UNTIL.ENEMY)state.entities=[{active:true,index:3,species:w.species??0,hp:1}];
          if(w.frieza)state.frieza={...state.frieza,stage:w.frieza};
          return true;
        },
        request:id=>{
          if(id===0x98){
            const table=0x90000+0x98*2,free=0x90000+(romCopy[table]|romCopy[table+1]<<8);
            const set=romSets.findLast(s=>s.offset===free);
            if(!set)throw Error('debug: borrowed event 98 has no script');
            rec('script',{bytes:set.bytes});
            for(let i=0;i+1<set.bytes.length;i++)if(set.bytes[i]===0x2b)ram[0xe000+set.bytes[i+1]*0x200]|=1;
            return true;
          }
          const w=WAITS.request[id];
          if(!w)throw Error(`debug: no native wait for request ${hex(id,3)}`);
          rec('request',{id});
          if(w.map)state.map=w.map;
          if(w.species)state.entities=[{active:true,index:3,species:w.species,hp:1}];
          if(w.frieza)state.frieza={...state.frieza,stage:w.frieza};
          if(id===0x429)state.challenge={...state.challenge,started:true};
          if(id===0x42f){state.ending={phase:kind==='explosion'?'explode':'open'};state.d0=0x81;}
          return true;
        },
      },
      frieza:{
        restore:o=>{rec('hook',{kind:'FRIEZA',o});state.frieza={...o};},
        snapshot:()=>({...state.frieza,boss:{surge:{kind:'frieza-cosmic',age:0},tier:1,guard:0,dash:0,muscular:false,space:{intro:1}}}),
        get status(){return{...state.frieza,boss:{tier:1,guard:0,dash:0}};},
        onEvent:e=>{rec('hook',{kind:'FRIEZA_EVENT',o:{event:e}});if(e===friezaEvents.battle)state.fighting=true;},
        get fighting(){return state.fighting;},
        hit:()=>rec('friezaHit'),
        entity:()=>({}),
        get inputLocked(){return false;},
        get orbit(){return true;},
      },
    };
    const arrival={get phase(){return'complete';}};
    const callbacks={
      fresh:async()=>rec('fresh'),
      pump:async(frames,buttons)=>{
        if(inBoot&&romSets.length&&!trace.some(t=>t.op==='boot')){
          const a=romSets.find(s=>s.offset===ev400),b=romSets.find(s=>s.offset===ev106);
          if(!a||!b)throw Error('debug: bootLateGame did not patch events 400/106');
          rec('boot',{a:a.bytes,b:b.bytes});
          state.map=doorMap(bootDoor(b.bytes));
        }
        rec('pump',{frames,buttons:buttons??[]});
      },
      mod,arrival,
      capture:()=>({}),
      cache:async slot=>rec('capture',{slot}),
      progress:text=>{
        rec('progress',{text});
        if(trace.some(t=>t.op==='boot'))inBoot=false;
        if(/bridge and waterfall/.test(text))state.map=128;    // the original opening ends at the waterfall
      },
    };
    await qs.buildQuickStart(kind,callbacks);
    return{trace,bootControl};
  }

  // ---- 2. translate traces into native recipes -----------------------------
  const payloads=[],scripts=[];
  const payloadOf=o=>{
    const entries=[];
    for(const[k,v]of Object.entries(o??{})){
      if(k==='boss')continue;                    // live combat object; owned by the Frieza module
      if(!KEYS.includes(k))throw Error(`debug: hook payload key ${k} has no id`);
      entries.push([k,v]);
    }
    const bytes=[entries.length];
    for(const[k,v]of entries){
      let n;
      if(typeof v==='boolean')n=v?1:0;else if(typeof v==='number')n=v;else if(v===null||v===undefined)n=0;
      else{n=VALUES.indexOf(v);if(n<0)throw Error(`debug: payload value ${v} has no id`);}
      bytes.push(KEYS.indexOf(k),n&255,(n>>8)&255);
    }
    const key=bytes.join(',');let p=payloads.find(x=>x.key===key);
    if(!p){p={key,label:`debug_payload_${payloads.length}`,bytes,object:Object.fromEntries(entries)};payloads.push(p);}
    return p.label;
  };
  const scriptOf=bytes=>{const key=bytes.join(',');let s=scripts.find(x=>x.key===key);if(!s){s={key,label:`debug_script_${scripts.length}`,bytes};scripts.push(s);}return s.label;};
  const EMPTY=payloadOf({});

  const recipes={},boots={},catalog={presets:[]};
  for(const kind of PRESETS){
    const {trace,bootControl}=await record(kind);
    const ops=[],emit=(op,...args)=>ops.push([op,...args]);
    const iBoot=trace.findIndex(t=>t.op==='boot');
    let boot,i;
    if(iBoot>=0){
      const{a,b}=trace[iBoot];
      // Event 400's replacement ends with JUMP 106 + END; inline 106's.
      const jump=[0x10|(0x106>>8),0x106&255,0x00];
      if(a.slice(-3).join()!==jump.join())throw Error('debug: event 400 replacement does not jump to 106');
      const door=bootDoor(b);
      boot={mode:BOOT.SCRIPT,script:[...a.slice(0,-3),...b],door,map:doorMap(door),control:bootControl!==false,
        arrived:b.some((x,j)=>x===0x30&&b[j+1]===0x10&&b[j+2]>0)};
      // bootLateGame ends with crownGoku and cancelInput; the scene starts after.
      i=trace.findIndex((t,j)=>j>iBoot&&t.op==='cancelInput')+1;
    }else{
      // title / sword: the original title, game select and name editor.
      const iTitle=trace.findIndex(t=>t.op==='capture'&&t.slot==='title');
      if(iTitle<0)throw Error(`debug: ${kind} does not pass the title`);
      boot={mode:kind==='title'?BOOT.EDITOR:BOOT.OPENING,script:null,door:0,map:0,control:false,arrived:false};
      i=iTitle+1;
      if(kind!=='title'){
        // Start accepts the name; the fixed pumps and confirm loop play the
        // original opening until the waterfall is controllable.
        while(i<trace.length&&['progress','pump'].includes(trace[i].op))i++;
        emit(OP.OPENING);
      }
    }
    const tookOff=()=>ops.some(o=>o[0]===OP.TAKEOFF);
    for(;i<trace.length;i++){
      const t=trace[i];
      switch(t.op){
        case'pump':{
          const bits=padBits(t.buttons);
          if(bits&&t.frames)emit(OP.PRESS,bits,t.frames);else if(t.frames)emit(OP.WAIT,t.frames);
          break;
        }
        case'progress':case'fresh':break;
        case'cancelInput':emit(OP.CANCEL);break;
        case'capture':if(i<trace.length-1)emit(OP.MARK,PRESETS.indexOf(t.slot));break;
        case'poke8':
          if(t.a>=0xcf00&&t.a<0xd000)emit(OP.FLAG,t.a-0xcf00,t.v);
          else if(t.a>=0xcc48&&t.a<0xcc48+12&&t.v===0xa5)emit(OP.SENZU);
          else if(t.a===0xf8&&tookOff()){/* WORLDAIM */}
          else emit(OP.POKE8,t.a,t.v);
          break;
        case'poke16':{
          if((t.a===0xe382||t.a===0xe582)&&t.v===SENT_MAXHP){if(!ops.some(o=>o[0]===OP.REFILL))emit(OP.REFILL);break;}
          if(t.a===0xe002&&trace[i+1]?.op==='poke16'&&trace[i+1].a===0xe004&&trace[i+2]?.op==='teleport'){
            emit(OP.TELEPORT,0x82,t.v,trace[i+1].v);i+=2;
            // pullSword: pump(n) settles, Down faces the sword, then confirm
            // repeats until the arrival returns control with CF10 = 1.
            if(trace[i+1]?.op==='pump'&&!trace[i+1].buttons.length){emit(OP.WAIT,trace[i+1].frames);i++;}
            if(trace[i+1]?.op==='pump'&&trace[i+1].buttons.join()==='5'){emit(OP.PRESS,padBits([5]),trace[i+1].frames);i++;}
            else throw Error('debug: pullSword changed shape');
            emit(OP.SWORD);
            break;
          }
          if(tookOff()&&[0xfa,0xfc,0xf6,0xf4].includes(t.a)){
            if(t.a===0xfa&&t.v!==SENT_FX)throw Error('debug: Fortress aim x changed');
            if(t.a===0xfc&&t.v!==((SENT_FY+400)&4095))throw Error('debug: Fortress aim y changed');
            if((t.a===0xf6||t.a===0xf4)&&t.v!==0)throw Error('debug: Fortress aim heading changed');
            if(t.a===0xf4){const f8=trace[i+1];if(f8?.op!=='poke8'||f8.a!==0xf8||f8.v!==160)throw Error('debug: Fortress aim altitude changed');emit(OP.WORLDAIM);}
            break;
          }
          emit(OP.POKE16,t.a,t.v);break;
        }
        case'ramSet':
          if(t.a>=0xcf00&&t.a<0xd000){if(t.v<t.old)throw Error('debug: twilight lowered a flag');emit(OP.RAISE,t.a-0xcf00,t.v);}
          else emit(OP.POKE8,t.a,t.v);
          break;
        case'pokeBlock':emit(OP.POKEN,t.a,t.bytes);break;
        case'fill':emit(OP.FILL,t.a,t.n,t.v);break;
        case'ledger':{const o=t.o;emit(OP.LEDGER,o.mask??0,o.seedMask??0,o.delivered??0,o.wished?1:0);break;}
        case'script':emit(OP.SCRIPT,scriptOf(t.bytes));break;
        case'option':
          if(t.key!=='superSaiyan')throw Error(`debug: option ${t.key} has no native form`);
          emit(OP.FORM,t.v?1:0);emit(OP.HOOK,HOOK.FORM,payloadOf({superSaiyan:!!t.v}));break;
        case'takeoff':emit(OP.TAKEOFF);emit(OP.UNTIL,0xffff,0,UNTIL.WORLD,EMPTY,0);break;
        case'hook':
          if(t.kind==='FRIEZA'&&trace.slice(0,i).some(x=>x.op==='friezaHit'))break;
          emit(OP.HOOK,HOOK[t.kind],payloadOf(t.o));
          // frieza.restore({permanent}) also turns on the story's permanent
          // Super Saiyan form (frieza.js restore: options.superSaiyan), which
          // is shared state: core's !persist_ssj_lock and the goku form.
          if(t.kind==='FRIEZA'&&t.o?.permanent)emit(OP.PERMANENT);
          break;
        case'friezaHit':
          // orbit/space: the Frieza module's own phase handoffs; everything
          // up to the final capture belongs to it.
          emit(OP.HOOK,HOOK.FRIEZA_PHASES,payloadOf({}));
          while(i+1<trace.length&&trace[i+1].op!=='cancelInput')i++;
          break;
        case'travel':case'request':{
          const travel=t.op==='travel',w=travel?WAITS.travel[t.door]:WAITS.request[t.id];
          const scene=typeof w.scene==='function'?w.scene(kind):w.scene;
          emit(travel?OP.TRAVEL:OP.REQUEST,travel?t.door:t.id);
          const map=travel?w.map??doorMap(t.door):w.map??0xffff;
          if(travel&&!w.until)emit(OP.UNTIL,map,0,0,EMPTY,0);
          while(trace[i+1]?.op==='pump'){const p=trace[++i],bits=padBits(p.buttons);if(bits)emit(OP.PRESS,bits,p.frames);else emit(OP.WAIT,p.frames);}
          if(w.until)emit(OP.UNTIL,map,w.species??0,w.until,scene?payloadOf(scene):EMPTY,w.soft?Math.ceil(w.soft.frames/64):0);
          break;
        }
        case'teleport':throw Error('debug: teleport outside pullSword');
        default:throw Error(`debug: unhandled trace op ${t.op}`);
      }
    }
    emit(OP.HOOK,HOOK.FINISH,EMPTY);
    emit(OP.END);
    recipes[kind]=ops;boots[kind]=boot;
    const name=o=>Object.keys(OP).find(n=>OP[n]===o[0]);
    catalog.presets.push({kind,label:labels[kind],boot:{...boot,script:boot.script?.map(b=>hex(b))},
      recipe:ops.map(o=>[name(o),...o.slice(1).map(v=>typeof v==='number'?hex(v,v>255?4:2):Array.isArray(v)?v.map(x=>hex(x)):v)]),trace});
  }

  // ---- 3. tiles and tilemaps --------------------------------------------
  const GLYPH_BASE=16,FIRST=0x80,LAST=0xce;
  const tiles=new Uint8Array(16*(GLYPH_BASE+(LAST-FIRST+1)*2));
  // 0 blank; 1 window interior (the native dither: colour 1 on alternate
  // pixels); 2-4 the cartridge's window corner, horizontal and vertical edge.
  for(let y=0;y<8;y++)tiles[16+y*2]=y&1?0xaa:0x55;
  for(const[dst,src]of[[2,0],[3,1],[4,3]])tiles.set(rom.slice(0x12d080+src*16,0x12d080+src*16+16),dst*16);
  // The retail 8x12 font (PC 12D600 + code*12) as 8x16 cells: white
  // (colour 3) with a one-pixel black outline (colour 1), glyph rows 2-13.
  for(let code=FIRST;code<=LAST;code++){
    const px=Array.from({length:16},()=>new Uint8Array(8));
    for(let y=0;y<12;y++){const b=rom[0x12d600+code*12+y];for(let x=0;x<8;x++)if(b>>(7-x)&1)px[y+2][x]=3;}
    for(let y=0;y<16;y++)for(let x=0;x<8;x++)if(px[y][x]===3)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const yy=y+dy,xx=x+dx;if(yy>=0&&yy<16&&xx>=0&&xx<8&&!px[yy][xx])px[yy][xx]=1;}
    for(let half=0;half<2;half++){
      const t=GLYPH_BASE+(code-FIRST)*2+half;
      for(let y=0;y<8;y++){let p0=0,p1=0;for(let x=0;x<8;x++){const c=px[half*8+y][x];p0|=(c&1)<<(7-x);p1|=(c>>1&1)<<(7-x);}tiles[t*16+y*2]=p0;tiles[t*16+y*2+1]=p1;}
    }
  }
  writeFileSync(join(outDir,'tiles.bin'),tiles);
  // BG1: the window frame around the whole screen (28 rows), dithered inside.
  const bg1=new Uint16Array(32*32);
  for(let y=0;y<28;y++)for(let x=0;x<32;x++){
    const top=y===0,bottom=y===27,left=x===0,right=x===31;
    let w;
    if((top||bottom)&&(left||right))w=2|(right?0x4000:0)|(bottom?0x8000:0);
    else if(top||bottom)w=3|(bottom?0x8000:0);
    else if(left||right)w=4|(right?0x4000:0);
    else w=1|(1<<10);
    bg1[y*32+x]=w;
  }
  // BG2: text. Row r of text uses tile rows 1+2r (top halves) and 2+2r.
  const bg2=new Uint16Array(32*32);
  const cellOf=code=>GLYPH_BASE+(code-FIRST)*2;
  const put=(text,col,row,pal)=>{
    const codes=encodeText(text);
    codes.forEach((c,j)=>{if(c<FIRST||c>LAST)throw Error(`debug: glyph ${hex(c)} outside the font`);
      const t=cellOf(c);bg2[(1+row*2)*32+col+j]=t|pal<<10;bg2[(2+row*2)*32+col+j]=(t+1)|pal<<10;});
    return codes;
  };
  put('SCENE SELECT',1,0,2);
  put('B:GO  Y:BACK',19,0,2);
  const names=PRESETS.map((kind,j)=>{
    const col=j<11?2:17,row=1+(j%11),text=kind.toUpperCase();
    if(text.length>14)throw Error(`debug: preset name ${kind} too long`);
    return{col,row,codes:put(text,col,row,0)};
  });
  const shorten=s=>{for(const[a,b]of[[' versus ',' vs '],[' and ',' & ']])if(s.length>30)s=s.replace(a,b);if(s.length>30)throw Error(`debug: label too long: ${s}`);return s;};
  const descriptions=PRESETS.map(k=>{const c=encodeText(shorten(labels[k]));while(c.length<30)c.push(0x80);return c;});
  writeFileSync(join(outDir,'bg1.bin'),new Uint8Array(bg1.buffer));
  writeFileSync(join(outDir,'bg2.bin'),new Uint8Array(bg2.buffer));

  // ---- 4. assembler output ----------------------------------------------
  const d=['; Generated by snes/gen/debug.mjs.'];
  PRESETS.forEach((k,j)=>d.push(`!DEBUG_PRESET_${presetDefine(k)} = $${hex(j)}`));
  d.push(`!DEBUG_PRESET_COUNT = ${PRESETS.length}`);
  for(const[k,v]of Object.entries(OP))d.push(`!DEBUG_OP_${k} = $${hex(v)}`);
  for(const[k,v]of Object.entries(UNTIL))d.push(`!DEBUG_UNTIL_${k} = $${hex(v)}`);
  for(const[k,v]of Object.entries(HOOK))d.push(`!DEBUG_HOOK_${k} = $${hex(v)}`);
  for(const[k,v]of Object.entries(BOOT))d.push(`!DEBUG_BOOT_${k} = $${hex(v)}`);
  KEYS.forEach((k,j)=>d.push(`!DEBUG_KEY_${k.replace(/[A-Z]/g,c=>'_'+c).toUpperCase()} = $${hex(j)}`));
  VALUES.forEach((v,j)=>d.push(`!DEBUG_VAL_${v.toUpperCase()} = $${hex(j)}`));
  d.push(`!DEBUG_GLYPH_BASE = ${GLYPH_BASE}`,`!DEBUG_TILE_BYTES = $${hex(tiles.length,4)}`);
  d.push(`!DEBUG_EVENT100 = $${hex(0xc00000+ev100,6)} ; event 100 start (new game's first event)`);
  writeFileSync(join(outDir,'defines.asm'),d.join('\n')+'\n');

  const a=['; Generated by snes/gen/debug.mjs; included by modules/debug/module.asm inside the debug bank.'];
  const bytesLine=bs=>{const out=[];for(let j=0;j<bs.length;j+=16)out.push('\tdb '+bs.slice(j,j+16).map(b=>'$'+hex(b)).join(','));return out;};
  a.push('debug_preset_table: ; 8 bytes per preset: recipe, boot script (0 = none), boot map; mode, flags (1 control, 2 arrived)');
  for(const k of PRESETS){
    const b=boots[k],n=presetDefine(k).toLowerCase();
    a.push(`\tdw debug_recipe_${n}, ${b.script?`debug_boot_${n}`:'$0000'}, $${hex(b.map,4)} : db $${hex(b.mode)}, $${hex((b.control?1:0)|(b.arrived?2:0))}`);
  }
  a.push('debug_preset_names: ; 16 bytes per preset: column, text row, length, 13 glyph codes');
  for(const n of names){const c=[...n.codes];while(c.length<13)c.push(0x80);a.push(`\tdb ${n.col}, ${n.row}, ${n.codes.length}, `+c.map(b=>'$'+hex(b)).join(','));}
  a.push('debug_preset_desc: ; 32 bytes per preset: 30 glyph codes, 2 pad');
  for(const c of descriptions)a.push(...bytesLine([...c,0x80,0x80]));
  for(const k of PRESETS){
    const b=boots[k];
    if(b.script)a.push(`debug_boot_${presetDefine(k).toLowerCase()}: ; quick-boot.js script for ${k}`,...bytesLine(b.script));
  }
  for(const k of PRESETS){
    a.push(`debug_recipe_${presetDefine(k).toLowerCase()}:`);
    for(const o of recipes[k]){
      const [op,...args]=o,name=Object.keys(OP).find(n=>OP[n]===op);
      const w=v=>`dw $${hex(v&0xffff,4)}`,b=v=>`db $${hex(v&255)}`;
      const parts=[`db !DEBUG_OP_${name}`];
      switch(op){
        case OP.END:case OP.SENZU:case OP.TAKEOFF:case OP.WORLDAIM:case OP.SWORD:case OP.OPENING:case OP.REFILL:case OP.CANCEL:case OP.PERMANENT:break;
        case OP.WAIT:case OP.TRAVEL:case OP.REQUEST:parts.push(w(args[0]));break;
        case OP.POKE8:parts.push(w(args[0]),b(args[1]));break;
        case OP.POKE16:parts.push(w(args[0]),w(args[1]));break;
        case OP.POKEN:parts.push(w(args[0]),b(args[1].length),'db '+args[1].map(x=>'$'+hex(x)).join(','));break;
        case OP.FILL:parts.push(w(args[0]),w(args[1]),b(args[2]));break;
        case OP.FLAG:case OP.RAISE:parts.push(b(args[0]),b(args[1]));break;
        case OP.LEDGER:parts.push(...args.map(b));break;
        case OP.SCRIPT:parts.push(`dw ${args[0]}`);break;
        case OP.UNTIL:parts.push(w(args[0]),b(args[1]),b(args[2]),`dw ${args[3]}`,b(args[4]));break;
        case OP.HOOK:parts.push(b(args[0]),`dw ${args[1]}`);break;
        case OP.FORM:case OP.MARK:parts.push(b(args[0]));break;
        case OP.TELEPORT:parts.push(w(args[0]),w(args[1]),w(args[2]));break;
        case OP.PRESS:parts.push(w(args[0]),w(args[1]));break;
        default:throw Error(`debug: no encoding for op ${name}`);
      }
      a.push('\t'+parts.join(' : '));
    }
  }
  for(const p of payloads)a.push(`${p.label}: ; ${JSON.stringify(p.object)}`,...bytesLine(p.bytes));
  for(const s of scripts)a.push(`${s.label}:`,...bytesLine(s.bytes));
  writeFileSync(join(outDir,'presets.asm'),a.join('\n')+'\n');

  // hooks.asm: assembled after every module so their defines are visible.
  const h=['; Generated by snes/gen/debug.mjs. Include after every module, before story/hooks.asm.','pushpc','org !CODE_DEBUG+$7F00',
    'debug_hook_table: ; preset id -> JSL target (A = hook kind, X = preset, Y = payload in the debug bank)'];
  for(const k of PRESETS){const N=presetDefine(k);h.push(`if defined("DEBUG_PRESET_HOOK_${N}")`,`\tdl !DEBUG_PRESET_HOOK_${N}`,'else',`\tdl debug_hook_stub ; ${k}`,'endif');}
  h.push('debug_hook_any_target:',`if defined("DEBUG_PRESET_HOOK_ANY")`,'\tdl !DEBUG_PRESET_HOOK_ANY','else','\tdl debug_hook_stub','endif');
  h.push('debug_hooks_end:','assert debug_hooks_end <= !CODE_DEBUG+$8000, "debug hook table overflow"','pullpc');
  writeFileSync(join(outDir,'hooks.asm'),h.join('\n')+'\n');

  catalog.payloads=payloads.map(p=>({label:p.label,object:p.object,bytes:p.bytes}));
  catalog.scripts=scripts.map(s=>({label:s.label,bytes:s.bytes.map(b=>hex(b))}));
  catalog.keys=KEYS;catalog.values=VALUES;
  writeFileSync(join(outDir,'catalog.json'),JSON.stringify(catalog,null,1));
}
