// Aerial attacks use the native 12-bit world coordinates and heading. The
// Fortress remains the cartridge's moving object ($0128/$012A), not a marker
// painted over the map. All transitions use the original world landing code.
import {treeBlastMessages} from './native-radio.js';
import {createFortressCollapse} from './fortress-collapse.js';
export const fortressDeflectionMessages=[
  'LUKA:The Mana Fortress is\ntoo strong! You cannot just\ndestroy it with your magic!',
  'GOKU:Bet I could if I\ntried a bit harder.',
];
const shieldBlocks=shot=>shot.target?.id==='mana-fortress'&&!shot.ki&&(!shot.super||shot.strength<1);
const shieldPoint=shot=>({x:128,y:shot.end.y>=24&&shot.end.y<=64?shot.end.y:48});
export const worldDelta=(a,b)=>((a-b+2048)&4095)-2048;
export function worldAim(origin,heading,target){
  const angle=heading*Math.PI/512,dx=-Math.sin(angle),dy=-Math.cos(angle);
  const x=worldDelta(target.x,origin.x),y=worldDelta(target.y,origin.y);
  return{along:x*dx+y*dy,across:x*(-dy)+y*dx};
}
export function aerialBeamGeometry(shot){
  // The flight camera looks along the firing heading. Projecting a target's
  // screen offset as a direction sent shots sideways (or down when the
  // Fortress was culled). Its bearing selects hits, never the beam's axis.
  const age=shot.age,max=shot.max??32;
  return{x:128,y:88,dx:0,dy:-1,length:112*Math.min(1,age/12),
    halfWidth:(shot.mega?78:14+shot.strength*12)*Math.max(0,Math.min(1,age/6,(max-age)/12)),
    taper:shot.mega?26:18,farScale:.72};
}
export function createWorldKi(snes,mod){
  const r=snes.ram,c=snes.cpu,w=a=>r[a]|r[a+1]<<8;
  let shot=null,explosion=null,cutaway=null,distantBursts=[],fortressDestroyed=false,treeBarrierBroken=false,landingQueued=false,finaleQueued=false,lastHit=null,fortScreen=null,warningCooldown=0;
  const enabled=()=>mod.options.enabled&&mod.gokuActive;
  const collapse=createFortressCollapse(snes,mod,()=>fortressDestroyed);
  const cycle=c.cycle;
  const position=()=>({x:w(0xfa)&4095,y:w(0xfc)&4095});
  function targets(){
    const rom=snes.cart?.data;if(!rom)return[];
    const result=[];
    // Original Pure Land takeoff entry sits inside the AF landing tile patch.
    // Frieza's chase goes through Pure Land's gates: no cloud-barrier skip.
    if(!(r[0xe3]&0x40)&&!mod.frieza?.unresolved&&!mod.frieza?.crisisActive)result.push({id:'mana-tree-barrier',x:rom[0x67a80+198*2]*16,y:rom[0x67a81+198*2]*16,radius:44});
    if(!fortressDestroyed&&r[0x8c]===0&&r[0xcf4e]<9)result.push({id:'mana-fortress',x:w(0x128),y:w(0x12a),radius:36});
    return [...result,...(mod.worldScars?.targets()??[])];
  }
  function aim(){
    const mega=mod.options.superSaiyan&&mod.charge>=45;
    return targets().map(t=>({...t,...worldAim(position(),w(0xf6),t)}))
      .filter(t=>t.along>=8&&t.along<=(mega||t.id==='mana-fortress'?1024:512)&&Math.abs(t.across)<=t.radius+(mega?80:20))
      .sort((a,b)=>(a.id.startsWith('town-')-b.id.startsWith('town-'))||a.along-b.along)[0]??null;
  }
  function screen(target){
    if(target.id==='mana-fortress'&&fortScreen&&mod.frame-fortScreen.frame<3)return{x:fortScreen.x,y:fortScreen.y};
    return{x:Math.round(128+target.across*128/Math.max(80,target.along)),y:Math.round(48+1600/Math.max(64,target.along))};
  }
  function fire(ki=false){
    const strength=ki ? .2 :Math.min(1,mod.charge/(mod.options.superSaiyan?45:90));
    const mega=!ki&&mod.beamProfile(strength).mega;
    const at=position(),angle=w(0xf6)*Math.PI/512,range=mega?640:420;
    const target=aim()??{id:'landscape',x:(Math.round(at.x-Math.sin(angle)*range)+4096)&4095,y:(Math.round(at.y-Math.cos(angle)*range)+4096)&4095,along:range,across:0};
    shot={age:0,strength,ki,mega,max:ki?12:mega?72:32,super:mod.options.superSaiyan,target:target?{...target,screen:screen(target)}:null,end:target?screen(target):{x:128,y:45},hit:false};
    mod.charging=false;mod.charge=0;mod.action={kind:'airBeam',age:0,duration:shot.max,facing:3,super:mod.options.superSaiyan};
    mod.playSound(ki?'blast':'beam');
  }
  c.cycle=function(){
    if(this.cyclesLeft===0&&enabled()){
      const bank=this.r[1]&63,pc=this.br[4];
      if(bank===2&&pc===0xb112&&mod.nativeFlight){
        // Render the real moving Fortress from the beginning. Do not unlock
        // the AF cloud landing test or raise the Lost Continent to do so.
        this.br[4]=fortressDestroyed?0xb118:0xb119;
      }
      if(bank===2&&pc===0xb1f7)fortScreen={x:r[8],y:r[9],frame:mod.frame};
      if(bank===2&&pc===0xb1b3&&(mod.attackHeld||shot||explosion||cutaway||landingQueued))r[0xcf]=0;
      if(bank===0&&pc===0x8064&&landingQueued&&mod.nativeFlight){
        if(collapse.startLandingMusic(this))return;
        landingQueued=false;finaleQueued=true;
        // Same ABI as the Fortress's own C2:B1CA docking path. Entry 10 of
        // C6:7780 supplies its native door and map coordinates.
        r[0xe8]=1;r[0xf2]|=0x80;this.br[3]=0x1ff;this.setP(this.getP()&~0x30);
        this.br[0]=10;this.r[1]=0;this.br[4]=0x8260;
      }
    }
    return cycle.call(this);
  };
  c.registerBreakpoints?.(c.cycle,cycle,[[2,0xb112],[2,0xb1f7],[2,0xb1b3],[0,0x8064]]);
  return{
    aim,targets,collapse,
    tick(input){
      if(!enabled())return;
      if(warningCooldown)warningCooldown--;
      collapse.tick();
      if(!mod.worldFlight){
        shot=explosion=cutaway=null;distantBursts=[];
        if(finaleQueued&&w(0xdc)===255&&mod.canAttack&&mod.story.request(0x8b))finaleQueued=false;
        return;
      }
      if(treeBarrierBroken)r[0xe3]|=0x40;
      // Keep Flammie's A ascend / B descend and steering. L+Y charges the
      // same wave as on foot; neither that chord nor L+B can cause a landing.
      const wave=!!(input&0x400)&&!!(input&(1<<17));
      if(input&0x400)snes.joypad1State&=~1;
      if(mod.action?.kind==='focus'||wave)snes.joypad1State&=~0x100;
      const busy=!!(r[0xfe]&0xc0)||r[0x8c]!==0||!!(r[0xe2]&1)||!!explosion||!!cutaway||!!landingQueued||!!(shot&&!shot.ki)||!!mod.flight?.docking;
      if(busy){snes.joypad1State=0;mod.charging=false;mod.charge=0;mod.attackHeld=0;}
      else{
        if(!(input&(1<<17)))mod.kiBlocked=false;
        if(wave){
          mod.attackHeld++;
          if(!mod.charging&&!shot&&!mod.kiBlocked&&(!mod.action||['ready','focus'].includes(mod.action.kind)))mod.startCharge();
        }else if(mod.charging){fire();mod.kiBlocked=!!(input&(1<<17));mod.attackHeld=0;}
        else if((input&(1<<17))&&!(input&0x400)&&!mod.kiBlocked&&!shot&&!mod.action)fire(true);
        if(mod.charging){
          const cap=mod.options.superSaiyan?45:90;mod.charge=Math.min(cap,mod.charge+1);
          if(mod.charge===cap&&!mod.action.full){mod.action.full=true;mod.playSound('charged');}
          if(mod.frame&1)snes.joypad1State&=~0x30;
        }
      }
      if(shot){
        shot.age++;
        if(!shot.hit&&shot.target&&shot.age>=12){
          shot.hit=true;
          if(shot.ki){
            // The tiny shot disappears over the horizon, then a very late
            // boom answers it. Cosmetic blasts neither stop steering nor
            // demolish a town, break a seal or start the final battle.
            distantBursts.push({...shot.target,age:-18});
            if(distantBursts.length>8)distantBursts.shift();
          }
          else if(shieldBlocks(shot)){
            // The shield survives every base-form or incomplete SSJ wave.
            // A rebound is cosmetic: no crater, collapse or ending flags.
            shot.deflected={...shieldPoint(shot),side:shot.target.across<0?-1:1};shot.max=54;
            if(mod.action?.kind==='airBeam')mod.action.duration=shot.max;
            mod.playSound('deflect');
            if(!warningCooldown){mod.radio?.interrupt(fortressDeflectionMessages,{kind:'fortress-shield',frames:240});warningCooldown=720;}
            mod.log('The wave deflected off the Mana Fortress. It takes a fully charged Super Saiyan Kamehameha.');
          }
          else if(shot.strength>=.85){
            lastHit=shot.target.id;explosion={...shot.target,mega:shot.mega,age:0};mod.playSound('impact');
            // Opening a cloud layer does not destroy the Tree or crater it.
            if(lastHit!=='mana-tree-barrier')mod.worldScars?.strike(shot.target,shot.mega);
            if(lastHit==='mana-tree-barrier'){
              // AF tests the high byte of $E2: bit 6 in $E3. Preserve every
              // boss, seed and Pure Land flag; this only opens world landing.
              treeBarrierBroken=true;r[0xe3]|=0x40;mod.log('The Mana Tree cloud barrier broke. Hold X / SNES B to descend into the Pure Land.');
              mod.radio?.interrupt(mod.frieza?.crisisActive?['LUKA:The clouds are open!\nReach the Tree or Frieza!\nOnly five minutes remain.']:treeBlastMessages,{kind:'tree-blast',frames:270});
            }else if(lastHit==='mana-fortress'){fortressDestroyed=true;mod.log('The Fortress is breaking apart. Its Mana is burning away. The Mana Beast is coming!');}
            else mod.log('The wave left a permanent crater on the world map.');
          }else mod.log('The wave was too weak. Charge the aerial Kamehameha fully.');
        }
        if(shot.age>(shot.max??32))shot=null;
      }
      if(cutaway&&++cutaway.age>=cutaway.max){cutaway=null;explosion=null;landingQueued=true;}
      if(explosion){
        explosion.age++;
        if(explosion.id==='mana-fortress'){
          if(!cutaway&&explosion.age>=24){cutaway={age:0,max:186,target:{x:explosion.x,y:explosion.y},mega:explosion.mega};mod.playSound('distantImpact');}
        }else if(explosion.age>80)explosion=null;
      }
      for(const burst of distantBursts){burst.age++;if(burst.age===0)mod.playSound('distantImpact');}
      distantBursts=distantBursts.filter(burst=>burst.age<32);
    },
    draw(layer){
      if(!mod.worldFlight)return;
      const target=aim();
      if(mod.charging&&target){
        const p=screen(target);for(const[dx,dy]of[[-12,-10],[12,-10],[-12,10],[12,10]])layer.stamp('impact-spark',Math.floor(mod.frame/6),p.x+dx,p.y+dy);
      }
      if(shot){
        const phase=shot.age>>1,t=Math.min(1,shot.age/12),end={x:128+(shot.end.x-128)*t,y:88+(shot.end.y-88)*t};
        if(shot.ki){layer.stamp('charge-orb',Math.max(0,3-Math.floor(t*3)),end.x,end.y);}
        else{
          const g=aerialBeamGeometry(shot),blocked=shieldBlocks(shot),bounce=shot.deflected;
          layer.behindBody=false;
          if(blocked)g.length=(88-shieldPoint(shot).y)*Math.min(1,shot.age/12);
          if(bounce)g.halfWidth*=Math.max(0,1-(shot.age-12)/10);
          if(g.halfWidth>0)layer.giantBeam(g.x,g.y,g.dx,g.dy,g.length,g.halfWidth,phase,g);
          if(bounce){
            const age=shot.age-12,fade=Math.max(0,Math.min(1,(shot.max-shot.age)/14)),length=Math.min(150,age*12);
            layer.giantBeam(bounce.x,bounce.y,bounce.side*.84,-.54,length,(8+shot.strength*8)*fade,phase,{taper:9,farScale:.6});
            if(age<24){
              for(let i=0;i<4;i++){const angle=i*Math.PI/2,radius=18+age/2;layer.stamp('aura-arc',phase+i,bounce.x+Math.cos(angle)*radius,bounce.y+Math.sin(angle)*radius*.5,Math.cos(angle),Math.sin(angle));}
              layer.stamp('impact-spark',phase,bounce.x,bounce.y);
            }
          }
          layer.behindBody=false;
        }
      }
      if(explosion){
        const p=explosion.screen,phase=explosion.age>>2;
        for(let i=0;i<(explosion.mega?20:8);i++){const a=i*Math.PI/(explosion.mega?10:4)+phase*.6,rad=8+(explosion.age+i*7)%(explosion.mega?78:30);layer.stamp(i&1?'impact-spark':'charge-orb',phase+i,p.x+Math.cos(a)*rad,p.y+Math.sin(a)*rad);}
      }
      for(const burst of distantBursts)if(burst.age>=0){
        const aim=worldAim(position(),w(0xf6),burst);if(aim.along<=0)continue;
        const phase=burst.age>>2,p=screen({...burst,...aim});
        layer.stamp('gold-spark',Math.min(5,phase),p.x,p.y-burst.age/5);
        if(burst.age<18)for(let i=0;i<4;i++){
          const a=i*Math.PI/2,rad=2+burst.age/3;
          layer.stamp('impact-spark',Math.min(5,phase),p.x+Math.cos(a)*rad,p.y+Math.sin(a)*rad);
        }
      }
    },
    get cinematic(){return cutaway;},
    get status(){return{shot,explosion,cutaway,distantBursts,fortressDestroyed,treeBarrierBroken,landingQueued,finaleQueued,lastHit,target:mod.worldFlight?aim():null};},
    snapshot(){return structuredClone({shot,explosion,cutaway,distantBursts,fortressDestroyed,treeBarrierBroken,landingQueued,finaleQueued,lastHit,fortScreen,warningCooldown,collapse:collapse.snapshot(),scars:mod.worldScars?.snapshot()});},
    restore(saved){const s=saved?structuredClone(saved):null;shot=s?.shot??null;explosion=s?.explosion??null;cutaway=s?.cutaway??null;distantBursts=s?.distantBursts??[];fortressDestroyed=!!s?.fortressDestroyed;treeBarrierBroken=s?.treeBarrierBroken??!!(r[0xe3]&0x40);landingQueued=!!s?.landingQueued;finaleQueued=!!s?.finaleQueued;lastHit=s?.lastHit??null;fortScreen=s?.fortScreen??null;warningCooldown=s?.warningCooldown??0;collapse.restore(s?.collapse);mod.worldScars?.restore(s?.scars);},
  };
}
