// Frieza's ki strengthens Dark Lich; all seven seeds force the fed Mana Beast.
// Original boss AI, damage, death and progression still run on the SNES.
export function createBeastChallenge(snes,mod){
  let fed=false,started=false,won=false,wards=0,blocked=0,hits=0,clock=0,wardFlash=0,grace=0,burst=null,lich=null,beastBody=null;
  const powered=()=>mod.options.enabled&&mod.options.power&&mod.gokuActive;
  const active=()=>fed&&started&&!won&&mod.options.enabled&&mod.gokuActive&&mod.read16(0xdc)===253;
  const beast=()=>mod.entities().find(e=>e.index>=3&&e.active&&e.species===127&&e.hp>0&&!(mod.read8(e.base+0x191)&0x80));
  const cpu=snes.cpu,cycle=cpu.cycle;
  cpu.cycle=function(){
    // C0:4053 is the retail damage queue consumer; X selects the actor.
    // Intercept before its load, preserving flags, registers and native death.
    if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[4]===0x4053&&this.br[1]===0&&active()){
      const damage=mod.read16(0xe1f1);
      if(damage){
        if(grace)mod.write16(0xe1f1,0);
        else if(wards){
          wards--;blocked++;grace=90;wardFlash=30;mod.write16(0xe1f1,0);
          mod.playSound?.('impact');
          mod.radio?.say(`MANA WARD: ${wards} left\nOne hit blocked.\nGOKU:Thanks for the save!`,{frames:110,kind:'ward'});
        }else{hits++;grace=90;mod.write16(0xe1f1,Math.max(250,Math.min(500,damage)));}
      }
    }
    return cycle.call(this);
  };
  return{
    victory(){if(fed&&started){won=true;burst=null;}},
    choose(feed){if(mod.quest?.status.canFeed)feed=true;else if(feed)return false;fed=!!feed;started=won=false;wards=feed?(mod.quest?.status.earned??0):0;blocked=hits=clock=wardFlash=grace=0;burst=null;beastBody=null;return true;},
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
      if(!fed||won||!mod.options.enabled||!mod.gokuActive)return;
      if(mod.read8(0xcf4e)>=9){won=true;burst=null;return;}
      if(mod.read16(0xdc)!==253)return;
      const target=beast();
      if(!started&&target&&mod.canAttack){
        started=true;mod.write16(target.base+0x184,65535);mod.write16(target.base+0x182,65535);
        mod.write16(0xe184,999);mod.write16(0xe182,999);clock=150;
        mod.radio?.say('GOKU:Now THAT is a fight!\nKING KAI:Dodge the circles!\nYou are not invincible!',{frames:210,kind:'challenge'});
      }
      if(!started||!target||!mod.canAttack){if(!target)burst=null;return;}
      if(grace)grace--;if(wardFlash)wardFlash--;
      if(burst){
        burst.age++;
        if(burst.age===burst.warning){
          mod.feedback?.pulse(10);mod.playSound?.('impact');
          const s=mod.status;
          if(Math.hypot(s.x-burst.x,s.y-burst.y)<burst.radius+6){
            mod.write16(0xe1f1,Math.max(mod.read16(0xe1f1),450));
            mod.write8(0xe1f0,target.index);mod.write8(0xe1ec,0);
          }
        }
        if(burst.age>=burst.warning+22){burst=null;clock=target.hp<32768?72:120;}
      }else if(--clock<=0){
        const s=mod.status,enraged=target.hp<32768;
        burst={x:s.x,y:s.y,radius:enraged?34:26,warning:enraged?72:90,age:0};
        mod.playSound?.('blast');
      }
    },
    draw(layer){
      if(!active()||!mod.canAttack)return;
      const s=mod.status;
      if(burst){
        const b=burst,x=b.x-s.cameraX,y=b.y-s.cameraY,phase=b.age>>2;
        if(b.age<b.warning){
          for(let i=0;i<12;i++){
            const angle=i*Math.PI/6+b.age/70;
            layer.stamp('gold-spark',phase+i,Math.round(x+Math.cos(angle)*b.radius),Math.round(y+Math.sin(angle)*b.radius));
          }
          layer.stamp('gold-charge-orb',Math.min(4,Math.floor(b.age*5/b.warning)),x,y);
        }else for(let i=0;i<12;i++){
          const angle=i*Math.PI/6,spread=b.radius*(b.age-b.warning)/18;
          layer.stamp(i&1?'lightning':'gold-charge-orb',phase+i,Math.round(x+Math.cos(angle)*spread),Math.round(y+Math.sin(angle)*spread));
        }
      }
      if(wardFlash)for(let i=0;i<8;i++){
        const angle=i*Math.PI/4;
        layer.stamp('gold-arc',wardFlash>>2,Math.round(s.screenX+Math.cos(angle)*18),Math.round(s.screenY-16+Math.sin(angle)*22));
      }
    },
    get status(){return structuredClone({fed,started,won,wards,blocked,hits,clock,grace,burst,lich,beastBody});},
    snapshot(){return structuredClone({fed,started,won,wards,blocked,hits,clock,grace,wardFlash,burst,lich,beastBody});},
    restore(s){fed=!!s?.fed;started=!!s?.started;won=!!s?.won;wards=s?.wards??0;blocked=s?.blocked??0;hits=s?.hits??0;clock=s?.clock??0;grace=s?.grace??0;wardFlash=s?.wardFlash??0;burst=s?.burst?structuredClone(s.burst):null;lich=s?.lich?{...s.lich}:null;beastBody=s?.beastBody?{...s.beastBody}:null;},
  };
}
