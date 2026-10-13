// Optional seed-fed finale. The original boss AI, damage queue, death and
// ending still run on the SNES. Only this deliberately chosen fight loses
// Saiyan auto-healing; ordinary enemies keep their overpowered comedy.
export function createBeastChallenge(snes,mod){
  let fed=false,started=false,won=false,wards=0,blocked=0,hits=0,clock=0,wardFlash=0,grace=0,burst=null;
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
    choose(feed){fed=!!feed;started=won=false;wards=feed?(mod.quest?.status.earned??0):0;blocked=hits=clock=wardFlash=grace=0;burst=null;},
    get dangerous(){return fed&&!won&&mod.read16(0xdc)===253;},
    damage(enemy,amount){return active()&&enemy.species===127?Math.max(1,Math.floor(amount/4)):amount;},
    tick(){
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
    get status(){return structuredClone({fed,started,won,wards,blocked,hits,clock,grace,burst});},
    snapshot(){return structuredClone({fed,started,won,wards,blocked,hits,clock,grace,wardFlash,burst});},
    restore(s){fed=!!s?.fed;started=!!s?.started;won=!!s?.won;wards=s?.wards??0;blocked=s?.blocked??0;hits=s?.hits??0;clock=s?.clock??0;grace=s?.grace??0;wardFlash=s?.wardFlash??0;burst=s?.burst?structuredClone(s.burst):null;},
  };
}
