import {ceilingExitFor} from './ceiling-exits.js';

export function createCeilingEscape(mod){
  let escape=null,completed=0,error=null;
  const bossActive=()=>mod.entities?.().some(e=>e.index>=3&&e.active&&e.species>=87&&e.species<128&&e.hp>0&&(e.custom||!(mod.read8(e.base+0x191)&0x80)))??false;
  const safe=()=>mod.options.enabled&&mod.gokuActive&&mod.canAttack&&!mod.worldFlight&&!mod.flight?.pending&&!mod.teleport?.pending&&!bossActive();
  const cancel=reason=>{error=reason;escape=null;mod.flightTransition=null;mod.feedback?.clear();};
  function roofColors(){
    const light=c=>(c&31)+((c>>5)&31)+((c>>10)&31);
    const colors=[...new Set(mod.snes.ppu.cgram.slice(0,128))].filter(c=>{
      const r=c&31,g=c>>5&31,b=c>>10&31;
      // Neutral stone and warm timber, not a plant/water palette merely
      // because it happens to occupy the same CGRAM slot in another room.
      return light(c)>18&&light(c)<75&&(Math.max(r,g,b)-Math.min(r,g,b)<=8||r>=g&&g>=b&&r-g<12&&g-b<12);
    }).sort((a,b)=>light(a)-light(b));
    return[0,colors[Math.floor(colors.length*.4)]??0x294a,colors[Math.floor(colors.length*.8)]??0x4631];
  }
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
        if(e.age===22){
          e.colors=roofColors();
          mod.feedback?.pulse(24);mod.playSound('impact');mod.playSound('flight');
        }
        if(e.age>=68&&mod.story.travel(e.exit.door)){e.phase='exit';e.age=0;}
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
      if(e?.source===s.map&&phase>=22&&phase<68){
        const x=e.x-s.cameraX,y=e.y-s.cameraY;
        const [dark,stone,highlight]=e.colors??roofColors();
        const age=phase-22;
        // Short native impact cells give way to spinning chunks and falling
        // dust. Integer pixels and the room's own palette keep the SNES look.
        if(age<12)for(let i=0;i<8;i++){
          const a=i*Math.PI/4,spread=5+age*1.7;
          layer.stamp('impact-spark',Math.min(5,age>>2),x+Math.cos(a)*spread,y+Math.sin(a)*spread*.6);
        }
        for(let i=0;i<20;i++){
          const a=i*2.39996,speed=1+(i%5)*.3,px=Math.round(x+Math.cos(a)*(10+age*speed)),py=Math.round(y+Math.sin(a)*7-age*(1.3+(i%4)*.4)+age*age*.095);
          const size=2+i%3,turn=(age>>2)+i;
          for(let yy=-size;yy<=size;yy++)for(let xx=-size;xx<=size;xx++){
            if(Math.abs(xx)+Math.abs(yy)>size+1||((xx+yy+turn)&7)===0)continue;
            layer.pixel(px+xx,py+yy,1+(yy<0?highlight:xx<0?stone:dark),true);
          }
          if(age>8&&age<38){layer.pixel(px-(turn&3),py+size+3,1+stone,true);layer.pixel(px+2,py+size+5,1+stone,true);}
        }
      }
    },
    get busy(){return !!escape;},
    get bossActive(){return bossActive();},
    repair(){},
    // The exterior loads only to initialize the native world-flight return
    // data. Goku is already above the roof: never pop him onto that floor.
    get pose(){return escape&&!mod.worldFlight?{age:escape.phase==='punch'?escape.age:80}:null;},
    get status(){return{escape:escape?structuredClone(escape):null,completed,holes:0,error};},
    snapshot(){return structuredClone({escape,completed,error});},
    restore(saved){const s=saved?structuredClone(saved):null;escape=s?.escape??null;completed=s?.completed??0;error=s?.error??null;},
  };
}
