// Aerial attacks use the native 12-bit world coordinates and heading. The
// Fortress remains the cartridge's moving object ($0128/$012A), not a marker
// painted over the map. All transitions use the original world landing code.
export const worldDelta=(a,b)=>((a-b+2048)&4095)-2048;
export function worldAim(origin,heading,target){
  const angle=heading*Math.PI/512,dx=-Math.sin(angle),dy=-Math.cos(angle);
  const x=worldDelta(target.x,origin.x),y=worldDelta(target.y,origin.y);
  return{along:x*dx+y*dy,across:x*(-dy)+y*dx};
}
export function createWorldKi(snes,mod){
  const r=snes.ram,c=snes.cpu,cycle=c.cycle,w=a=>r[a]|r[a+1]<<8;
  let shot=null,explosion=null,fortressDestroyed=false,treeBarrierBroken=false,landingQueued=false,finaleQueued=false,lastHit=null,fortScreen=null;
  const enabled=()=>mod.options.enabled&&mod.gokuActive;
  const position=()=>({x:w(0xfa)&4095,y:w(0xfc)&4095});
  function targets(){
    const rom=snes.cart?.data;if(!rom)return[];
    const result=[];
    // Original Pure Land takeoff entry sits inside the AF landing tile patch.
    if(!(r[0xe3]&0x40))result.push({id:'mana-tree-barrier',x:rom[0x67a80+198*2]*16,y:rom[0x67a81+198*2]*16,radius:44});
    if(!fortressDestroyed&&r[0x8c]===0&&r[0xcf4e]<9)result.push({id:'mana-fortress',x:w(0x128),y:w(0x12a),radius:36});
    return [...result,...(mod.worldScars?.targets()??[])];
  }
  function aim(){
    const mega=mod.options.superSaiyan&&mod.charge>=45;
    return targets().map(t=>({...t,...worldAim(position(),w(0xf6),t)}))
      .filter(t=>t.along>=8&&t.along<=(mega?1024:512)&&Math.abs(t.across)<=t.radius+(mega?80:20))
      .sort((a,b)=>(a.id.startsWith('town-')-b.id.startsWith('town-'))||a.along-b.along)[0]??null;
  }
  function screen(target){
    if(target.id==='mana-fortress'&&fortScreen&&mod.frame-fortScreen.frame<3)return{x:fortScreen.x,y:fortScreen.y};
    return{x:Math.round(128+target.across*128/Math.max(80,target.along)),y:Math.round(84+1600/Math.max(64,target.along))};
  }
  function fire(){
    const strength=Math.min(1,mod.charge/(mod.options.superSaiyan?45:90));
    const mega=mod.beamProfile(strength).mega;
    const at=position(),angle=w(0xf6)*Math.PI/512,range=mega?640:420;
    const target=aim()??{id:'landscape',x:(Math.round(at.x-Math.sin(angle)*range)+4096)&4095,y:(Math.round(at.y-Math.cos(angle)*range)+4096)&4095,along:range,across:0};
    shot={age:0,strength,mega,max:mega?72:32,super:mod.options.superSaiyan,target:target?{...target,screen:screen(target)}:null,end:target?screen(target):{x:128,y:45},hit:false};
    mod.charging=false;mod.charge=0;mod.action={kind:'airBeam',age:0,duration:shot.max,facing:3,super:mod.options.superSaiyan};
    mod.playSound('beam');
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
      if(bank===2&&pc===0xb1b3&&(mod.attackHeld||shot))r[0xcf]=0;
      if(bank===0&&pc===0x8064&&landingQueued&&mod.nativeFlight){
        landingQueued=false;finaleQueued=true;
        // Same ABI as the Fortress's own C2:B1CA docking path. Entry 10 of
        // C6:7780 supplies its native door and map coordinates.
        r[0xe8]=1;r[0xf2]|=0x80;this.br[3]=0x1ff;this.setP(this.getP()&~0x30);
        this.br[0]=10;this.r[1]=0;this.br[4]=0x8260;
      }
    }
    return cycle.call(this);
  };
  return{
    aim,targets,
    tick(input){
      if(!enabled())return;
      if(!mod.worldFlight){
        shot=explosion=null;
        if(finaleQueued&&w(0xdc)===255&&mod.canAttack&&mod.story.request(0x8b))finaleQueued=false;
        return;
      }
      if(treeBarrierBroken)r[0xe3]|=0x40;
      // J is consistently hold/release Kamehameha. X ascends; F supplies the
      // original held descend input. A beam cannot accidentally initiate a dock.
      snes.joypad1State&=~1;
      const busy=!!(r[0xfe]&0xc0)||r[0x8c]!==0||!!(r[0xe2]&1)||!!explosion||!!landingQueued;
      if(busy){snes.joypad1State=0;mod.charging=false;mod.charge=0;mod.attackHeld=0;}
      else{
        if(mod.autoLand&&!mod.charging)snes.joypad1State|=1;
        if(input&1){
          mod.autoLand=false;mod.attackHeld++;
          if(mod.attackHeld>=12&&!mod.charging&&!shot&&(!mod.action||mod.action.kind==='ready'))mod.startCharge();
        }else if(mod.attackHeld){if(mod.charging)fire();mod.attackHeld=0;}
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
          if(shot.strength>=.85){
            lastHit=shot.target.id;explosion={...shot.target,mega:shot.mega,age:0};mod.playSound('impact');
            mod.worldScars?.strike(shot.target,shot.mega);
            if(lastHit==='mana-tree-barrier'){
              // AF tests the high byte of $E2: bit 6 in $E3. Preserve every
              // boss, seed and Pure Land flag; this only opens world landing.
              treeBarrierBroken=true;r[0xe3]|=0x40;mod.log('The Mana Tree cloud barrier broke. Press F to land in the Pure Land.');
            }else if(lastHit==='mana-fortress'){fortressDestroyed=true;mod.log('The Fortress is breaking apart. The Mana Beast is coming!');}
            else mod.log('The wave left a permanent crater on the world map.');
          }else mod.log('The wave was too weak. Charge the aerial Kamehameha fully.');
        }
        if(shot.age>(shot.max??32))shot=null;
      }
      if(explosion){explosion.age++;if(explosion.age>80){if(explosion.id==='mana-fortress')landingQueued=true;explosion=null;}}
    },
    draw(layer){
      if(!mod.worldFlight)return;
      const target=aim();
      if(mod.charging&&target){
        const p=screen(target);for(const[dx,dy]of[[-12,-10],[12,-10],[-12,10],[12,10]])layer.stamp('impact-spark',Math.floor(mod.frame/6),p.x+dx,p.y+dy);
      }
      if(shot){
        const phase=shot.age>>1,t=Math.min(1,shot.age/12),end={x:128+(shot.end.x-128)*t,y:88+(shot.end.y-88)*t};
        const dx=end.x-128,dy=end.y-88,len=Math.hypot(dx,dy)||1,bands=shot.super?5:3;
        if(shot.mega){
          // Keep the blue-white core enormous even at the highest altitude;
          // its streak continues past the target and beyond the world horizon.
          const envelope=Math.min(1,shot.age/6,((shot.max??72)-shot.age)/12);
          layer.behindBody=true;
          layer.giantBeam(128,88,dx/len,dy/len,Math.max(288,len)*t,88*envelope,phase,{taper:30,farScale:.72});
          layer.behindBody=false;
        }else{
          for(let d=0;d<=len;d+=5){const scale=1-d/len*.6;for(let k=-bands;k<=bands;k++)layer.stamp('beam-body',phase,128+dx*d/len+k*2*scale,88+dy*d/len,0,-1);}
          layer.stamp('beam-head',phase,end.x,end.y,0,-1);layer.stamp('charge-orb',4,128,88);
        }
      }
      if(explosion){
        const p=explosion.screen,phase=explosion.age>>2;
        for(let i=0;i<(explosion.mega?20:8);i++){const a=i*Math.PI/(explosion.mega?10:4)+phase*.6,rad=8+(explosion.age+i*7)%(explosion.mega?78:30);layer.stamp(i&1?'impact-spark':'charge-orb',phase+i,p.x+Math.cos(a)*rad,p.y+Math.sin(a)*rad);}
      }
    },
    get status(){return{shot,explosion,fortressDestroyed,treeBarrierBroken,landingQueued,finaleQueued,lastHit,target:mod.worldFlight?aim():null};},
    snapshot(){return structuredClone({shot,explosion,fortressDestroyed,treeBarrierBroken,landingQueued,finaleQueued,lastHit,fortScreen,scars:mod.worldScars?.snapshot()});},
    restore(saved){const s=saved?structuredClone(saved):null;shot=s?.shot??null;explosion=s?.explosion??null;fortressDestroyed=!!s?.fortressDestroyed;treeBarrierBroken=s?.treeBarrierBroken??!!(r[0xe3]&0x40);landingQueued=!!s?.landingQueued;finaleQueued=!!s?.finaleQueued;lastHit=s?.lastHit??null;fortScreen=s?.fortScreen??null;mod.worldScars?.restore(s?.scars);},
  };
}
