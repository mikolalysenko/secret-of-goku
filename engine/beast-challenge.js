// Frieza's ki strengthens Dark Lich; all seven seeds force the fed Mana Beast.
// Original boss AI, damage, death and progression still run on the SNES.
export function createBeastChallenge(snes,mod){
  let fed=false,started=false,won=false,hits=0,clock=0,grace=0,burst=null,lich=null,beastBody=null,pendingBeam=0;
  const powered=()=>mod.options.enabled&&mod.options.power&&mod.gokuActive;
  const active=()=>fed&&started&&!won&&mod.options.enabled&&mod.gokuActive&&mod.read16(0xdc)===253;
  const beast=()=>mod.entities().find(e=>e.index>=3&&e.active&&e.species===127&&e.hp>0&&!(mod.read8(e.base+0x191)&0x80));
  const cpu=snes.cpu,cycle=cpu.cycle;
  cpu.cycle=function(){
    // C0:4053 is the retail damage queue consumer; X selects the actor.
    // Intercept before its load, preserving flags, registers and native death.
    if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[4]===0x4053&&this.br[1]===0&&active()){
      const damage=mod.read16(0xe1f1);
      // Native healing uses the same queue with E1B0:1000 set. Recovery
      // must never swallow a Senzu Bean or reduce its healing amount.
      if(damage&&!(mod.read16(0xe1b0)&0x1000)){
        if(grace)mod.write16(0xe1f1,0);
        else{hits++;grace=75;mod.write16(0xe1f1,damage===pendingBeam?damage:Math.min(mod.options.superSaiyan?110:140,damage));}
        pendingBeam=0;
      }
    }
    return cycle.call(this);
  };
  return{
    victory(){if(fed&&started){won=true;burst=null;}},
    choose(feed){if(mod.quest?.status.canFeed)feed=true;else if(feed)return false;fed=!!feed;started=won=false;hits=clock=grace=0;burst=null;beastBody=null;pendingBeam=0;return true;},
    get dangerous(){return fed&&!won&&mod.read16(0xdc)===253;},
    get empoweredLich(){return !!(powered()&&lich&&mod.read16(0xdc)===lich.map&&mod.read16(lich.base+0x182)>0&&!(mod.read8(lich.base+0x191)&0x80));},
    damage(enemy,amount){
      if(powered()&&mod.read16(0xdc)===253&&enemy.species===127)return Math.max(1,Math.floor(amount/(fed?8:2)));
      return lich&&powered()&&mod.read16(0xdc)===lich.map&&enemy.species===121&&enemy.base===lich.base?Math.max(1,Math.floor(amount/4)):amount;
    },
    tick(){
      if(mod.read16(0xdc)!==253)beastBody=null;
      if(powered()&&mod.read16(0xdc)===253&&mod.canAttack){
        const target=beast();
        if(target&&beastBody?.base!==target.base){
          beastBody={base:target.base};
          // Preserve wounds when resuming an older checkpoint. Resistance is
          // applied to attacks, avoiding HP overflow in the 16-bit native AI.
          const oldMax=mod.read16(target.base+0x184),maximum=fed?65535:48000;
          if(oldMax<maximum){
            const fraction=oldMax?Math.min(1,target.hp/oldMax):1;
            mod.write16(target.base+0x184,maximum);mod.write16(target.base+0x182,Math.max(1,Math.ceil(maximum*fraction)));
          }
        }
      }
      // Frieza feeds Thanatos ki for his amusement. Give his true form time to fight:
      // roughly three full SSJ beams, with the original AI/death intact.
      if(lich&&mod.read16(0xdc)!==lich.map)lich=null;
      if(!lich&&mod.options.enabled&&mod.options.power&&mod.gokuActive&&mod.canAttack&&mod.read8(0xcf4e)<7){
        const boss=mod.entities().find(e=>e.index>=3&&e.active&&e.species===121&&!e.custom&&e.hp>0&&!(mod.read8(e.base+0x191)&0x80));
        if(boss){
          lich={map:mod.read16(0xdc),base:boss.base};
          const missing=Math.max(0,mod.read16(boss.base+0x184)-boss.hp);
          mod.write16(boss.base+0x184,48000);mod.write16(boss.base+0x182,Math.max(1,48000-missing));
          for(const [offset,bonus]of[[0x198,48],[0x18b,24]])mod.write8(boss.base+offset,Math.min(255,mod.read8(boss.base+offset)+bonus));
        }
      }
      if(lich&&powered()&&mod.frieza?.trial&&mod.canAttack){
        const hp=mod.read16(lich.base+0x182),max=mod.read16(lich.base+0x184);
        lich.clock=(lich.clock??0)+1;
        if(lich.boost&&++lich.boost.age>=120)lich.boost=null;
        const buffs=lich.buffs??0;
        // Two limited interventions from his off-screen spectator. A little
        // healing and attack power, never a reset of the earned damage.
        if(hp>0&&!(mod.read8(lich.base+0x191)&128)&&buffs<2&&hp<max*(buffs?.35:.7)&&lich.clock-(lich.lastBuff??-480)>=480){
          lich.buffs=buffs+1;lich.lastBuff=lich.clock;lich.boost={age:0};
          mod.write16(lich.base+0x182,Math.min(max,hp+Math.floor(max*.1)));
          mod.write8(lich.base+0x198,Math.min(255,mod.read8(lich.base+0x198)+16));
          mod.playSound?.('powerBurst');
          mod.radio?.say(buffs?'FRIEZA:More power!\nTRY HARDER, you useless\nheap of bones!':'FRIEZA:Already struggling?\nHere. More ki. Do try\nto make him break a sweat.',{frames:240,kind:'lich-buff'});
        }
      }
      if(!fed||won||!mod.options.enabled||!mod.gokuActive)return;
      if(mod.read8(0xcf4e)>=9){won=true;burst=null;return;}
      if(mod.read16(0xdc)!==253)return;
      const target=beast();
      if(!started&&target&&mod.canAttack){
        started=true;mod.write16(target.base+0x184,65535);mod.write16(target.base+0x182,65535);
        mod.write16(0xe184,999);mod.write16(0xe182,999);clock=150;
        mod.radio?.say('GOKU:Now THAT is a fight!\nKING KAI:Watch the light!\nYou are not invincible!',{frames:210,kind:'challenge'});
      }
      if(!started||!target||!mod.canAttack){if(!target)burst=null;return;}
      if(grace)grace--;
      if(burst){
        burst.age++;
        const age=burst.age-burst.warning;
        if(age===0){mod.feedback?.pulse(6);mod.playSound?.('beam');}
        // The lane locks when the warning starts. The visible beam travels
        // down it; crossing the empty lane before its front arrives is safe.
        const s=mod.status,front=burst.top+Math.max(0,age)*16;
        if(age>=0&&age<30&&!burst.hit&&!grace&&Math.abs(s.x-burst.x)<burst.width+5&&s.y>=burst.top&&s.y<=Math.min(burst.bottom,front)){
          burst.hit=true;
          if(!mod.read16(0xe1f1)){
            pendingBeam=burst.damage;mod.write16(0xe1f1,pendingBeam);
            mod.write8(0xe1f0,target.index);mod.write8(0xe1ec,0);
          }
        }
        if(age>=36){burst=null;clock=target.hp<32768?90:135;}
      }else if(--clock<=0){
        const s=mod.status,enraged=target.hp<32768;
        burst={kind:'beam',x:s.x,top:s.cameraY+20,bottom:s.cameraY+190,width:enraged?10:8,warning:enraged?78:96,damage:enraged?250:210,age:0,hit:false};
        mod.playSound?.('charged');
      }
    },
    draw(layer){
      if(lich?.boost&&powered()&&mod.frieza?.trial&&mod.read16(0xdc)===lich.map){
        const s=mod.status,age=lich.boost.age,x=mod.read16(lich.base+2)-s.cameraX,y=mod.read16(lich.base+4)-s.cameraY-24;
        for(let i=0;i<3;i++){
          const t=Math.max(0,Math.min(1,(age-i*14)/60));
          layer.stamp('gold-charge-orb',(age>>3)%2,Math.round(232+(x-232)*t),Math.round(-16+(y+16)*t));
        }
        if(age>=60)layer.stamp('impact-spark',(age>>2)%4,x,y);
      }
      if(!active()||!mod.canAttack||!burst)return;
      const s=mod.status,b=burst,x=b.x-s.cameraX,top=b.top-s.cameraY,bottom=b.bottom-s.cameraY,phase=b.age>>2,age=b.age-b.warning;
      if(age<0){
        // Lucent Beam's original charge cells and a narrow, fixed corridor
        // clearly mark where the strike will land. No tracking/radial blast.
        layer.stamp('charge-orb',Math.min(4,Math.floor(b.age*5/b.warning)),x,top);
        if((b.age>>3)&1)for(let y=top+16;y<=bottom;y+=16)for(const side of[-1,1]){
          layer.pixel(x+side*(b.width+5),y,0x7fff+1,true);
          layer.pixel(x+side*(b.width+5),y+1,0x7fff+1,true);
        }
      }else if(age<30){
        const front=Math.min(bottom,top+age*16),width=Math.min(b.width,(30-age)*2);
        for(let y=top;y<=front;y+=8)for(let dx=-width;dx<=width;dx+=3)layer.stamp('beam-body',phase,x+dx,y,0,1);
        layer.stamp('charge-orb',4,x,front,0,1);
      }
    },
    get status(){return structuredClone({fed,started,won,hits,clock,grace,burst,lich,beastBody,pendingBeam});},
    snapshot(){return structuredClone({fed,started,won,hits,clock,grace,burst,lich,beastBody,pendingBeam});},
    restore(s){fed=!!s?.fed;started=!!s?.started;won=!!s?.won;hits=s?.hits??0;clock=s?.clock??0;grace=s?.grace??0;burst=s?.burst?.kind==='beam'?structuredClone(s.burst):null;pendingBeam=s?.pendingBeam??0;lich=s?.lich?structuredClone(s.lich):null;beastBody=s?.beastBody?{...s.beastBody}:null;},
  };
}
