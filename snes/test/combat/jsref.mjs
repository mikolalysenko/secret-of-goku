#!/usr/bin/env node
// Browser-mod reference for combat: engine/mana-mod.js with the native
// adapters it relies on (combat sound, interaction, hit recovery, feedback,
// equipment, Senzu) installed on the vendored SnesJs core, from a private
// browser-mod state, with scripted input. Every frame is probed exactly as
// the Mesen test probes the cartridge (combat.lua), so traces compare
// field by field.
//   node snes/test/combat/jsref.mjs <state.json> <script> [--ssj] [--frames=N]
//   script: comma list of button[+button]:frames, e.g. right:12,b:3,none:40
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {loadCore} from '../../tools/snesjs-export.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const {restore,hash}=await import(resolve(repo,'engine/state.js'));
const adapters={
  combatSound:(await import(resolve(repo,'engine/native-combat-sound.js'))).createNativeCombatSound,
  interaction:(await import(resolve(repo,'engine/native-interaction.js'))).createNativeInteraction,
  hitRecovery:(await import(resolve(repo,'engine/native-hit-recovery.js'))).createNativeHitRecovery,
  feedback:(await import(resolve(repo,'engine/native-feedback.js'))).createNativeFeedback,
  equipment:(await import(resolve(repo,'engine/native-equipment.js'))).createNativeEquipment,
  senzu:(await import(resolve(repo,'engine/native-senzu.js'))).createNativeSenzu,
  powerIntro:(await import(resolve(repo,'engine/power-intro.js'))).createPowerIntro,
};
const {createFrieza}=await import(resolve(repo,'engine/frieza.js'));

// frieza.js as mana-mod.js's virtual enemy (entities() index 12, hit()):
// the browser module itself, restored from a snapshot (goku.frieza) and
// never ticked, so Frieza stays where the scenario pins him (the cartridge
// test writes the same spot before each combat step). The proxy logs every
// hit() and keeps Frieza's own impact bursts out of combat's effect list
// (the cartridge's frieza module draws those itself).
function friezaReference(snes,mod,snapshot,frameOf){
  globalThis.Image=class{decode(){return new Promise(()=>{});}};   // its atlases never load here
  const real=createFrieza(snes,mod);
  delete globalThis.Image;
  real.restore(JSON.parse(JSON.stringify(snapshot)));
  const hits=[];
  const proxy={
    entity:()=>real.entity(),
    hit(enemy,amount){
      const n=mod.effects.length,melee=mod.action?.kind==='punch',r=real.hit(enemy,amount);
      mod.effects.splice(n);
      hits.push({f:frameOf(),dmg:amount,melee,taken:r.before-r.after});
      return r;
    },
    tick(){},spaceInput:()=>false,floorHole:()=>false,inputLocked:false,orbit:null,
    get permanent(){return real.permanent;},get fighting(){return real.fighting;},
    restore(){},snapshot:()=>null,
  };
  return {proxy,hits,hp:()=>real.entity()?.hp??0};
}

export const BUTTONS={b:1,y:2,select:4,start:8,up:16,down:32,left:64,right:128,a:256,x:512,l:1024,r:2048};
export function parseScript(text){
  const steps=[];
  for(const part of text.split(',').filter(Boolean)){
    const [b,n]=part.split(':');
    const mask=b==='none'?0:b.split('+').reduce((m,k)=>{if(!(k in BUTTONS))throw Error(`unknown button ${k}`);return m|BUTTONS[k];},0);
    steps.push({mask,frames:Number(n??1)});
  }
  return steps;
}

// One probe record, from WRAM only (shared with combat.lua's probe).
export function probe(read8,read16){
  const r={map:read16(0xdc),gx:read16(0xe002),gy:read16(0xe004),gface:read8(0xe010),ghp:read16(0xe182),gq:read16(0xe1f1),d0:read8(0xd0),
    str:read8(0xe188),agi:read8(0xe189),armor:read8(0xe1e1),ring:read8(0xec),pdef:read16(0xe1a5),mdef:read16(0xe1a8),lvl:read8(0xe181),maxhp:read16(0xe184),
    gp:read16(0xcc6a)|read8(0xcc6c)<<16,xp:read16(0xe18d)|read8(0xe18f)<<16,e:[]};
  for(let i=3;i<12;i++){
    const b=0xe000+i*0x200;
    if(!(read8(b)&1)){r.e.push(null);continue;}
    r.e.push({sp:read8(b+0x180),hp:read16(b+0x182),q:read16(b+0x1f1),x:read16(b+2),y:read16(b+4),h:read8(b+0x45),dead:read8(b+0x191)>>7});
  }
  return r;
}

// The beam other modules read (mana-mod.js beamGeometry of the live beam):
// combat_api_beam's fields, half width floor(256 * w).
function beamProbe(mod){
  const e=mod.effects.find(e=>e.kind==='beam'&&e.life>0);
  if(!e)return null;
  const g=mod.beamGeometry(e);
  return {x:e.x,y:e.y,dx:e.dx,dy:e.dy,len:g.length,half:Math.floor(g.halfWidth*256),super:e.super?1:0,mega:e.mega?1:0,age:e.max-e.life,life:e.life,taper:g.taper};
}

// locks: [[frame, 'hold' | 'unlock']] as mana-mod.js trial.inputLocked (a
// stand-in trial with nothing else), applied before the frame like pokes.
export function runJsRef({state,steps,superSaiyan=false,gi=null,pokes=[],pokeBase=0,frieza=null,locks=null,romPath=resolve(repo,'rom/secret-of-mana-us.sfc')}){
  const s=loadCore(new Uint8Array(readFileSync(romPath)));
  restore(s,{...JSON.parse(readFileSync(state,'utf8')),romHash:hash(s.cart.data)});
  const context={window:{ManaSpriteLayer:class{load(){}destroy(){}}},Image:class{decode(){return Promise.resolve();}},Promise,Math,JSON,Array,Object,Number,Set,Map,Error};
  for(const f of['goku-animation-data.js','goku-animation.js','mana-mod.js'])vm.runInNewContext(readFileSync(resolve(repo,'engine',f),'utf8'),context);
  const logs=[];
  const mod=new context.window.ManaMod(s,{onLog:t=>logs.push(t)});
  Object.assign(mod.options,{enabled:true,power:true,superSaiyan});
  const sounds=[];
  mod.playSound=name=>sounds.push(name);
  mod.combatSound=adapters.combatSound(s,mod);
  mod.feedback=adapters.feedback(s,mod);
  mod.interaction=adapters.interaction(s,mod);
  mod.hitRecovery=adapters.hitRecovery(s,mod);
  mod.senzu=adapters.senzu(s,mod);mod.senzu.load();
  mod.equipment=adapters.equipment(s,mod);mod.equipment.load();
  mod.powerIntro=adapters.powerIntro(mod);
  if(gi!==null)s.ram[0xe1e1]=gi?22:21;
  const read8=a=>s.ram[a&0x1ffff],read16=a=>read8(a)|read8(a+1)<<8;
  const frames=[];
  let n=0,fz=null,fzHits=0;
  if(frieza){fz=friezaReference(s,mod,frieza,()=>n);mod.frieza=fz.proxy;}
  if(locks)mod.trial={inputLocked:false,dangerous:false,tick(){},clashInput:()=>false,entity:()=>null,restore(){}};
  for(const st of steps)for(let i=0;i<st.frames;i++){
    sounds.length=0;
    // scheduled RAM writes ([frame, address, value, bytes]) before the frame
    for(const [at,addr,value,bytes=1] of pokes)if(at+pokeBase===n){s.ram[addr&0x1ffff]=value&255;if(bytes===2)s.ram[(addr+1)&0x1ffff]=value>>8&255;}
    for(const [at,what] of locks??[])if(at+pokeBase===n)mod.trial.inputLocked=what==='hold';
    s.joypad1State=st.mask;mod.beforeFrame(st.mask);s.runFrame(true);mod.afterFrame();
    const a=mod.action;
    frames.push({n:n++,input:st.mask,hurt:read8(0xe011),act:a?a.kind:null,age:a?.age??null,combo:a?.combo??null,pause:a?.hitPause??0,
      charge:mod.charge,charging:mod.charging,ssj:mod.options.superSaiyan,power:mod.powerCharge,
      deflected:mod.hitRecovery.deflected,recovered:mod.hitRecovery.recovered,
      kb:mod.knockbacks.reduce((m,k)=>m|1<<((k.base-0xe600)>>9),0),
      k0:Object.fromEntries(mod.knockbacks.map(k=>[(k.base-0xe600)>>9,[k.x,k.y]])),fx:mod.effects.map(e=>`${e.kind}:${e.life}`).join(' '),sounds:[...sounds],
      // (a spent ki shot keeps life 0 until the next frame's filter; the cartridge frees it at once)
      kis:mod.effects.filter(e=>e.kind==='ki'&&e.life>0).length,
      sparks:mod.effects.filter(e=>e.kind==='impact'&&e.life>0).map(e=>`${e.x},${e.y}`).sort().join(' '),
      ...(fz?{fzhp:fz.hp(),vt:fz.hits.slice(fzHits)}:{}),beam:beamProbe(mod),...probe(read8,read16)});
    if(fz)fzHits=fz.hits.length;
  }
  return {frames,logs};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [state,script]=process.argv.slice(2);
  const ssj=process.argv.includes('--ssj');
  const {frames}=runJsRef({state,steps:parseScript(script),superSaiyan:ssj});
  for(const f of frames)console.log(JSON.stringify({n:f.n,act:f.act,age:f.age,combo:f.combo,pause:f.pause,charge:f.charge,sounds:f.sounds,e:f.e.slice(0,3)}));
}
