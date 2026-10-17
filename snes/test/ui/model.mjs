// Runs the browser mod's own telepathy policy (engine/native-radio.js and
// power-intro.js) on a minimal stand-in for the emulator, driven by the same
// per-frame script as a Mesen test, and reports the current message per
// frame. Used as the expected side of the UI policy tests.
//
// Script: array of frame records {charge: 0|flags, say, interrupt, barrier,
// ceiling, dismiss, super, flight, restore, hidden, map, world, crisis}.
// Flags as ui_charge_tick: 1 Super Saiyan, 2 full power, 4 beam.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const eng=name=>import(pathToFileURL(resolve(repo,'engine',name)).href);

export async function runModel(script,{catalog,map=0,restore=null}){
  const {createNativeRadio}=await eng('native-radio.js');
  const {createPowerIntro}=await eng('power-intro.js');
  const ram=new Uint8Array(0x20000);
  const snes={ram,ppu:{getColor(){return 0;},forcedBlank:false},cart:{data:new Uint8Array(0x400000)}};
  const mod={
    options:{enabled:true,superSaiyan:false},gokuActive:true,worldFlight:false,canAttack:true,
    charging:false,charge:0,action:null,frame:0,localFlight:false,
    frieza:{crisisActive:false},worldKi:{status:{fortressDestroyed:false}},
    read16:a=>ram[a]|ram[a+1]<<8,read8:a=>ram[a],
  };
  ram[0xdc]=map&255;ram[0xdd]=map>>8;
  const radio=createNativeRadio(snes,mod);mod.radio=radio;
  if(restore)radio.restore({barrierVersion:2,...restore});
  const intro=createPowerIntro(mod);
  const byId=catalog.messages;
  const out=[];
  for(const f of script){
    mod.frame++;
    if(f.map!==undefined){ram[0xdc]=f.map&255;ram[0xdd]=f.map>>8;}
    mod.worldFlight=!!f.world;mod.frieza.crisisActive=!!f.crisis;
    // hidden frames: the browser's visible() is false (e.g. an event runs)
    ram[0xd0]=f.hidden?1:0;
    // charge: 0 = no ui_charge_tick call, else $100 | flags (1 SSJ, 2 full, 4 beam)
    const c=f.charge??0,flags=c&0xff;
    mod.charging=!!c&&!(flags&4);mod.options.superSaiyan=!!(flags&1)||!!f.super;
    mod.charge=flags&2?45:c?10:0;
    mod.action=flags&4?{kind:'beam'}:null;
    if(f.say!==undefined){const m=byId[f.say];radio.say(m.text,{frames:m.frames,kind:m.kind});}
    if(f.group!==undefined){for(const id of f.group){const m=byId[id];radio.say(m.text,{frames:m.frames,kind:m.kind});}}
    if(f.interrupt!==undefined){const ms=f.interrupt.map(id=>byId[id]);radio.interrupt(ms.map(m=>m.text),{frames:ms[0].frames,kind:ms[0].kind});}
    if(f.barrier!==undefined)radio.defeatedBarrier(f.barrier,{map:f.barrierMap??0});
    if(f.ceiling!==undefined)radio.escapedCeiling(f.ceiling);
    if(f.dismiss!==undefined)radio.dismiss(f.dismiss);
    if(f.restore)radio.restore({firstFlight:true});
    if(f.transform){mod.options.superSaiyan=true;intro.transform();}
    if(f.hover){mod.localFlight=true;}
    intro.tick();mod.localFlight=false;
    radio.tick();
    const cur=radio.status.current;
    out.push(cur?byId.findIndex(m=>m.text===cur.text&&m.kind===cur.kind)+1:0);
  }
  return out;
}

export function loadCatalog(){
  return JSON.parse(readFileSync(resolve(repo,'dist/snes/gen/ui/catalog.json'),'utf8'));
}
