import {ceilingExitFor} from './ceiling-exits.js';

export function createCeilingEscape(mod){
  let escape=null,holes=[],completed=0,error=null;
  const safe=()=>mod.options.enabled&&mod.gokuActive&&mod.canAttack&&!mod.worldFlight&&!mod.flight?.pending&&!mod.teleport?.pending;
  const cancel=reason=>{error=reason;escape=null;mod.flightTransition=null;mod.feedback?.clear();};
  return{
    request(){
      if(escape||!safe())return false;
      const exit=ceilingExitFor(mod.read16(0xdc));if(!exit)return false;
      const s=mod.status;
      mod.cancelCombat();mod.localFlight=false;mod.localLift=0;
      escape={phase:'punch',age:0,source:s.map,x:s.x,y:s.y-56,exit:{map:exit.map,door:exit.door}};
      mod.playSound('swing');error=null;return true;
    },
    tick(){
      if(!escape)return false;
      if(!mod.options.enabled||!mod.gokuActive){cancel('Escape cancelled');return false;}
      const e=escape;e.age++;mod.snes.joypad1State=0;
      if(e.phase!=='punch'&&!mod.canAttack&&!mod.worldFlight)
        mod.snes.joypad1State=(mod.input&0xfff)|((mod.input&(1<<16))?1:0);
      if(e.phase==='punch'){
        if(mod.read16(0xdc)!==e.source||!mod.canAttack){cancel('The native scene took over');return false;}
        if(e.age===18){mod.feedback?.pulse(24);mod.playSound('kick');holes.push({map:e.source,x:e.x,y:e.y});if(holes.length>256)holes.shift();}
        if(e.age>=62&&mod.story.travel(e.exit.door)){e.phase='exit';e.age=0;}
      }else if(e.phase==='exit'){
        if(mod.read16(0xdc)===e.exit.map&&mod.canAttack&&mod.flight.request()){e.phase='flight';e.age=0;}
      }else if(e.phase==='flight'&&mod.worldFlight){
        completed++;escape=null;
        mod.radio?.say(completed%2?'GOKU:Found the exit!\nKING KAI:You MADE an exit.\nAdd the roof to the wish.':'LUKA:Another ceiling?!\nGOKU:Good ventilation.\nKING KAI:BAD TENANT.');
        return false;
      }else if(e.phase==='flight'&&!mod.flight.pending&&mod.canAttack){
        // An exterior's walk-on event can acquire control between REQUEST
        // and the native CPU boundary. Retry after that event has finished.
        mod.flight.request();
      }
      if(escape?.age>600){cancel('Flight interrupted; the party remains on the native map');return false;}
      return true;
    },
    draw(layer){
      if(mod.worldFlight||!mod.gokuActive)return;
      const s=mod.status,e=escape,phase=e?.phase==='punch'?e.age:100;
      for(const hole of holes)if(hole.map===s.map){
        const x=hole.x-s.cameraX,y=hole.y-s.cameraY;
        // A jagged breach and rock chips use the loaded map's stone shades;
        // the burst itself uses the cartridge's original explosion cells.
        const pal=mod.snes.ppu.cgram,dark=pal[0x21]||0x0421,stone=pal[0x26]||0x294a;
        for(let yy=-12;yy<=12;yy++)for(let xx=-23;xx<=23;xx++){
          const edge=xx*xx/529+yy*yy/144,rag=((xx*17+yy*11)&7)/48;
          if(edge<1+rag)layer.pixel(x+xx,y+yy,1+(edge>.7?stone:dark),true);
        }
        if(e?.source===s.map&&phase<58&&phase>=18)for(let i=0;i<12;i++){
          const age=phase-18,a=i*Math.PI/6,spread=8+age;
          layer.stamp(i&1?'impact-spark':'gold-spark',age>>2,x+Math.cos(a)*spread,y+Math.sin(a)*spread*.6+age*age/90);
        }
      }
    },
    get busy(){return !!escape;},
    repair(){holes=[];},
    get pose(){return escape?.phase==='punch'?{age:escape.age}:null;},
    get status(){return{escape:escape?structuredClone(escape):null,completed,holes:holes.length,error};},
    snapshot(){return structuredClone({escape,holes,completed,error});},
    restore(saved){const s=saved?structuredClone(saved):null;escape=s?.escape??null;holes=s?.holes??[];completed=s?.completed??0;error=s?.error??null;},
  };
}
