// The browser's own orbital battle (engine/frieza.js tick + spaceInput, with
// frieza-orbit.js, orbit-duel.js and orbit-pixels.js), driven headlessly
// for the cartridge's logic tests: same start, same pad, frame by frame.
//
//   import {runFightReference} from './fight-ref.mjs';
//   const frames=await runFightReference({rom,frames:600,pad:f=>0,start:{}});
//
// Pad bits are the core's ($4218 layout); the harness converts them to the
// browser's input word. Nothing here draws: the mod is a stub that keeps a
// little WRAM (map 246, Goku's HP and damage queue) and logs sounds.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
export const repo=resolve(here,'../../..');

// Core pad ($4218) -> browser input bits (engine/input.js / frieza.js).
const PAD={B:0x8000,Y:0x4000,SELECT:0x2000,START:0x1000,UP:0x0800,DOWN:0x0400,LEFT:0x0200,RIGHT:0x0100,A:0x0080,X:0x0040,L:0x0020,R:0x0010};
export function browserInput(pad){
  let v=0;
  if(pad&PAD.B)v|=1;if(pad&PAD.X)v|=2;
  if(pad&PAD.UP)v|=16;if(pad&PAD.DOWN)v|=32;if(pad&PAD.LEFT)v|=64;if(pad&PAD.RIGHT)v|=128;
  if(pad&PAD.A)v|=0x100;if(pad&PAD.L)v|=0x400;if(pad&PAD.R)v|=0x800;if(pad&PAD.Y)v|=1<<17;
  return v;
}

let installed=false;
function installGlobals(){
  if(installed)return;installed=true;
  process.on('unhandledRejection',()=>{});     // the sprite atlases need a DOM
  globalThis.window??={};
  globalThis.Image??=class{set src(v){}decode(){return Promise.reject(Error('no DOM'));}};
  globalThis.document??={createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8Array(4)})})})};
}

// start: {hp, age, cycle, node, clock, target:{x,y}, hero:{x,y}, ...boss fields}
// wram: the import bundle's wram.bin (bank 7E first), so the equipment and
// Goku's HP are the cartridge test's. onFrame({f, frieza, mod, snes}) after
// each frame's step (fight-view.mjs draws the browser's picture there).
export async function runFightReference({rom=readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')),frames=600,pad=()=>0,start={},trace=null,wram=null,onFrame=null}={}){
  installGlobals();
  const {createFrieza}=await import(resolve(repo,'engine/frieza.js'));
  const {newOrbit}=await import(resolve(repo,'engine/frieza-orbit.js'));
  const {newFriezaArena}=await import(resolve(repo,'engine/frieza-arena.js'));
  const {clashCamera}=await import(resolve(repo,'engine/frieza-finale.js'));
  const {orbitTargets,orbitTarget}=await import(resolve(repo,'engine/orbit-debris.js'));
  const ram=new Uint8Array(0x20000);
  if(wram)ram.set(wram.subarray(0,0x20000));
  const w16=(a,v)=>{ram[a&0x1ffff]=v&255;ram[(a+1)&0x1ffff]=(v>>8)&255;};
  w16(0xdc,246);w16(0xe182,999);ram[0xe000]=1;ram[0xd0]=0;ram[0xec]=0;w16(0xe1f1,0);ram[0xe191]=0;
  const sounds=[];
  // The CPU stub lets boss-victory.js's dispatcher run: it hooks cycle()
  // at C0:B073 and sends one queued native command per frame (below).
  const cpu={cycle(){},r:new Uint8Array(8),br:new Uint16Array(8),registerBreakpoints(){},cyclesLeft:0,waiting:false,stopped:false,
    nmiWanted:false,abortWanted:false,irqWanted:false,i:true,getP(){return 0;},setP(){},pushByte(){},pushWord(){}};
  const snes={cpu,ram,cart:{data:rom,read(){return 0;}},frames:0,ppu:{forcedBlank:false,mode:1},joypad1State:0};
  const requests=[];
  const mod={
    options:{enabled:true,superSaiyan:true,power:false},gokuActive:true,nativeField:true,canAttack:true,
    lastInput:0,charge:0,charging:false,powerCharge:0,powerBlocked:false,action:null,frame:0,effects:[],snes,
    read8:a=>ram[a&0x1ffff],read16:a=>ram[a&0x1ffff]|ram[(a+1)&0x1ffff]<<8,readSigned16(a){const v=this.read16(a);return v&0x8000?v-65536:v;},
    write8(a,v){ram[a&0x1ffff]=v&255;},write16:w16,
    playSound(n){sounds.push(n);},feedback:{pulse(){},clearFlash(){}},cancelCombat(){},cancelInput(){},configure(){},
    radio:{restore(){},interrupt(){}},
    // native-equipment.js powerScale: the training gi (armor 22) weighs 0.9
    equipment:{get powerScale(){return ram[0xe1e1]===22?.9:1;}},
    get status(){return{x:this.read16(0xe002),y:this.read16(0xe004),cameraX:0,cameraY:0};},
    story:{request(id){requests.push(id);}},teleport:{follow(){}},
    localFlightHook:{canLand:()=>true},
    // mana-mod.js focus (L alone): powerCharge to 96.
    focus(input){const held=!!(input&0x400);if(!held){this.powerCharge=0;if(this.action?.kind==='focus')this.action=null;return false;}
      if(this.action&&!['focus','ready'].includes(this.action.kind))return true;
      if(!this.action||this.action.kind!=='focus')this.action={kind:'focus',age:0,duration:0};this.powerCharge=Math.min(96,this.powerCharge+1);return true;},
  };
  const frieza=createFrieza(snes,mod);mod.frieza=frieza;
  const target=start.target??{x:1848,y:3527};
  const space=newOrbit(target);space.intro=start.intro??0;
  if(start.hero)space.hero={...start.hero};
  const boss={x:202,y:57,nodes:[{x:202,y:57},{x:54,y:48},{x:208,y:148},{x:48,y:132}],node:0,hp:32000,age:0,clock:150,cycle:0,stun:0,
    grace:60,hurt:0,warning:null,shots:[],terrain:0,tier:2,surge:null,arena:newFriezaArena(),afterimages:[],hazards:[],dash:0,
    orbital:true,muscular:true,guard:0,space,ground:{x:mod.read16(0xe002)||120,y:mod.read16(0xe004)||120},...start.boss};
  frieza.restore({stage:'battle',permanent:true,fallen:true,boss});
  const out=[];let last=0;
  for(let f=0;f<frames;f++){
    const p=pad(f),input=browserInput(p);
    sounds.length=0;requests.length=0;
    frieza.tick();
    frieza.spaceInput(input);
    mod.lastInput=input;mod.frame++;snes.frames++;
    // The frame's CPU run: the victory dispatcher sends one queued command
    // (the native driver takes it at once), then sees it complete.
    for(let k=0;k<2;k++){cpu.r[1]=0;cpu.br[4]=0xb073;cpu.br[3]=0x1ff;cpu.cyclesLeft=0;cpu.cycle();}
    const native=ram[0x1e00]?Array.from(ram.slice(0x1e00,0x1e04)):null;ram[0x1e00]=0;
    // Native damage queue: the game applies E1F1 to Goku's HP (no defense
    // here; the cartridge test reads its own HP the same way).
    const queued=mod.read16(0xe1f1);if(queued){w16(0xe182,Math.max(0,mod.read16(0xe182)-queued));w16(0xe1f1,0);}
    const s=frieza.snapshot(),b=s.boss,o=b.space;
    if(onFrame)await onFrame({f,frieza,mod,snes});
    if(!o){out.push({f,stage:s.stage,boss:{age:b.age,hp:b.hp},returned:true,native,requests:[...requests],sounds:[...sounds],gokuHp:mod.read16(0xe182)});if(trace)trace(out.at(-1));continue;}
    const c=o.clash,cam=c?clashCamera(o):o.camera;
    out.push({f,stage:s.stage,clash:c?{phase:c.phase,age:c.age,pressure:c.pressure,shown:c.shown,taps:c.taps}:null,
      view:{x:cam.x,y:cam.y,r:cam.r},native,requests:[...requests],grace:b.grace,spaceAge:o.age,
      hero:{...o.hero},heading:o.heading,charge:o.charge,teleport:o.teleport,punch:o.punch,cooldown:o.cooldown,
      beam:o.beam?{x:o.beam.x,y:o.beam.y,age:o.beam.age,max:o.beam.max,width:o.beam.width}:null,
      camera:{x:o.camera.x,y:o.camera.y,r:o.camera.r,lon:o.camera.longitude,lat:o.camera.latitude},
      boss:{x:b.x,y:b.y,hp:b.hp,clock:b.clock,cycle:b.cycle,node:b.node,dash:b.dash,stun:b.stun,age:b.age},
      warning:b.warning?{kind:b.warning.kind,age:b.warning.age,wait:b.warning.wait}:null,
      shots:b.shots.filter(p=>p.age<330).map(p=>({kind:p.kind,x:p.x,y:p.y,age:p.age,heading:p.heading})),
      kis:o.shots.map(p=>({x:p.x,y:p.y,age:p.age})),ricochets:o.ricochets.map(r=>({x:r.x,y:r.y,age:r.age,owner:r.owner})),
      hits:(o.hits??[]).map(h=>({x:h.x,y:h.y,age:h.age})),duel:o.duel?o.duel.age:0,gokuHp:mod.read16(0xe182),sounds:[...sounds],
      // the distant bodies (orbit-debris.js): shattered, Luna's remark, the
      // bodies' places on the fight's camera, the impacts where they draw
      scenery:{destroyed:[...o.destroyed],moonRemark:!!o.moonRemark,aside:o.aside?o.aside.age:null,
        bodies:orbitTargets.map((_,i)=>{const t=orbitTarget(o,i,o.camera);return{x:t.x,y:t.y,r:t.r};}),
        impacts:o.impacts.map(p=>{const t=orbitTarget(o,p.target,o.camera,p.copy);return{target:p.target,age:p.age,x:t.x,y:t.y};})}});
    if(trace)trace(out[out.length-1]);
  }
  return out;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const frames=Number(process.argv[2]??600);
  const out=await runFightReference({frames});
  for(const s of out)if(s.f%60===0)console.log(s.f,JSON.stringify({hero:s.hero,boss:s.boss,warning:s.warning,gokuHp:s.gokuHp,cam:s.camera,shots:s.shots.length}));
}
