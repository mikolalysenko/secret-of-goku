import {loadVegetaSprite,drawVegetaSprite} from './vegeta-sprite.js';
import {createNativeCombustion} from './native-combustion.js';
import {beamTouchesShot,sweptDistance} from './frieza-combat.js';
import {createTimeChamber} from './time-chamber.js';
import {opposingBeams,createTrainingClash,mashTrainingClash,tickTrainingClash,drawTrainingClash,trainingClashPoint,trainingClashTiming} from './vegeta-clash.js';
import {drawBeamDetonation} from './beam-detonation.js';
export const vegetaHealth=[32000,60000];
const cloneBases=[0xe600,0xe800,0xea00],directions=[[0,1],[1,0],[-1,0],[0,-1]];
const face=(dx,dy)=>Math.abs(dx)>Math.abs(dy)?dx<0?2:1:dy<0?3:0;
const copy=v=>v?structuredClone(v):null;

// A real, mildly inconvenienced Vegeta occupies the boy Doppel's encounter
// slot. Native event 4E5 owns the return and Joch reveal after their draw.
export function createJochTrial(snes,mod,{loadArt=true}={}){
 let s=null,cells=null,combustion=null;
 const arena=createTimeChamber(snes,mod,{loadArt});
 const ready=Promise.all([arena.ready,loadArt?loadVegetaSprite().then(v=>cells=v):Promise.resolve()]);
 const r=snes.ram,w=a=>r[a]|r[a+1]<<8,put=(a,v)=>{r[a]=v;r[a+1]=v>>8;};
 const on=()=>mod.options.enabled&&mod.gokuActive,wanted=()=>on()&&w(0xdc)===72&&r[0xcf3f]<6;
 const party=()=>Number(!!(r[0xe200]&1))|Number(!!(r[0xe400]&1))<<1;
 const hero=()=>({x:w(0xe002),y:w(0xe004)});
 const safe=(x,y)=>mod.localFlightHook.canFly(x,y,s?.terrain&128?1:0);
 function start(introduced=false){
  if(!wanted())return;
  if(s){if(introduced)s.introduced=true;return;}
  s={mask:party(),hp:vegetaHealth[0],tier:0,x:0,y:0,terrain:0,spawned:false,age:0,clock:75,cycle:0,
   facing:0,action:null,shots:[],bursts:[],rocks:[],echoes:[],grace:90,hurt:0,melee:0,lastMelee:-1000,
   phase:'intro',phaseAge:0,introduced,arrival:0,entrance:{stable:0,view:null,revealed:false},clash:null,clashes:0,quips:0,earlySuperRemark:false,won:false,damageTaken:0,counters:0,travel:0,movingUntil:0};
 }
 function burst(x,y,loud=true){
  s.bursts.push({x:Math.round(x),y:Math.round(y)-10,age:0});
  if(loud){mod.playSound?.('impact');mod.feedback?.pulse(8);}
 }
 function step(dx,dy,speed){
  for(let i=0;i<speed;i++){
   const x=s.x+dx,y=s.y+dy;if(!safe(x,y))return false;s.x=x;s.y=y;
   s.travel=(s.travel??0)+Math.abs(dx)+Math.abs(dy);s.movingUntil=s.age+3;
  }return true;
 }
 function pickSpot(distance=112){
  const h=hero(),choices=[];
  for(const[dx,dy]of directions)for(const d of[distance,86,56]){
   const x=h.x+dx*d,y=h.y+dy*d;if(safe(x,y))choices.push({x,y,d:Math.abs(x-s.x)+Math.abs(y-s.y)});
  }
  // Power-ups and counters stay between the dialogue and HUD. Prefer a
  // lateral standoff so the authored hand/beam poses read clearly.
  const camera=mod.status,framed=choices.filter(p=>p.x-camera.cameraX>=28&&p.x-camera.cameraX<=228&&p.y-camera.cameraY>=104&&p.y-camera.cameraY<=184);
  return (framed.length?framed:choices).sort((a,b)=>b.d-a.d)[0]??{x:s.x,y:s.y};
 }
 function teleport(){
  s.echoes.push({x:s.x,y:s.y,age:0,frame:s.tier*8+1,flip:s.facing===2});
  const at=pickSpot();s.x=at.x;s.y=at.y;mod.playSound?.('teleportIn');
 }
 function receive(amount){
  if(s.grace||!w(0xe182)||r[0xe191]&128||w(0xe1f1)||(w(0xe1b0)&0x1000))return;
  const damage=Math.round(amount*(mod.options.superSaiyan?.6:1));
  // This is sparring. Vegeta calls a break before a lethal blow; the native
  // trial heal/return still runs, without a corpse or a game-over transition.
  put(0xe1f1,Math.min(damage,Math.max(0,w(0xe182)-1)));r[0xe1f0]=3;s.grace=65;s.damageTaken+=damage;
  burst(w(0xe002),w(0xe004));
  if(damage>=w(0xe182))finish(false);
 }
 function finish(draw){
  s.phase='draw';s.phaseAge=0;s.draw=draw;s.hp=Math.max(1,s.hp);s.action=null;s.clash=null;s.shots=[];s.rocks=[];s.grace=999;
 }
 function begin(kind){
  const h=hero(),facing=face(h.x-s.x,h.y-s.y),[dx,dy]=directions[facing];
  s.facing=facing;s.action={kind,age:0,dx,dy,x:s.x,y:s.y,tx:h.x,ty:h.y};
  if(kind==='beam'||kind==='volley')mod.playSound?.('charged');
  if(kind==='beam'&&s.tier)mod.radio?.say('VEGETA:FINAL FLASH!',{frames:80,kind:'trial'});
  if(kind==='counter'){s.counters++;mod.playSound?.('teleport');}
 }
 function recover(frames=70){s.action=null;s.clock=frames;}
 function counterBeam(){
  const enemy=s.action?.beam;if(!enemy)return false;
  const beam=mod.effects.find(e=>e.kind==='beam'&&e.life>0&&opposingBeams(e,mod.beamGeometry(e),enemy));
  if(!beam)return false;
  s.clash=createTrainingClash(beam,enemy,hero(),{x:s.x,y:s.y},s.tier);s.clashes=(s.clashes??0)+1;
  s.shots=[];s.rocks=[];s.grace=120;mod.cancelCombat?.();mod.knockbacks=[];
  mod.playSound?.('powerBurst');mod.feedback?.pulse(16);
  mod.radio?.say('VEGETA:Push back, Kakarot!\nGOKU:You asked for it!',{frames:140,kind:'trial'});
  return true;
 }
 function updateClash(){
  const c=s.clash;
  // Freeze the actual combatants. The collision ball supplies the movement;
  // residual flight, knockback or Instant Transmission cannot slide a body.
  put(0xe002,c.hero.x);put(0xe004,c.hero.y);s.x=c.boss.x;s.y=c.boss.y;
  const cue=tickTrainingClash(c);
  if(cue==='focus'){mod.playSound?.('charged');mod.feedback?.pulse(8);}
  if(cue==='struggle')mod.playSound?.('beam');
  if(cue==='surge'){mod.playSound?.('powerBurst');mod.feedback?.pulse(5);}
  if(cue==='win'||cue==='lose')mod.feedback?.pulse(6);
  if(cue==='detonate'){mod.playSound?.('fortressBreak');mod.playSound?.('friezaImpact');mod.feedback?.pulse(24);}
  if(c.phase==='release'&&c.age===trainingClashTiming.impact+28){mod.playSound?.('fortressBreak');mod.feedback?.pulse(12);}
  if(cue==='done'){
   const win=c.result==='win';s.clash=null;recover(140);mod.cancelCombat?.();
   if(win){s.grace=90;api.hit(api.entity(),Math.round(vegetaHealth[s.tier]*.34/(s.tier?.38:.55)));}
   else{s.grace=0;receive(s.tier?320:230);}
  }
 }
 function impactWall(x,y){
  burst(x,y);
  if(s.rocks.length<4){
   const h=hero();for(const dx of[-32,32])if(safe(h.x+dx,h.y))s.rocks.push({x:h.x+dx,y:h.y,age:0});
   if(!s.quips++){mod.radio?.say('JEHK:Not the doorway!\nGOKU:Right! We need that.\nVEGETA:Then watch your aim!',{frames:220,kind:'trial'});}
  }
 }
 function updateAttack(){
  const a=s.action;if(!a)return;
  a.age++;const gold=s.tier>0,h=hero();
  if(a.kind==='counter'){
   if(a.age===12)teleport();
   if(a.age===24){const f=face(h.x-s.x,h.y-s.y);s.facing=f;[a.dx,a.dy]=directions[f];a.tx=h.x;a.ty=h.y;}
   if(a.age>=24&&a.age<40){step(a.dx,a.dy,gold?8:6);if(Math.hypot(s.x-h.x,s.y-h.y)<24)receive(gold?310:220);}
   if(a.age>=54)recover(75);
  }else if(a.kind==='rush'){
   if(a.age===24)mod.playSound?.('flight');
   if(a.age>=24&&a.age<58){
    const moved=step(a.dx,a.dy,gold?6:4);
    if(Math.hypot(s.x-h.x,s.y-h.y)<24)receive(gold?260:190);
    if(!moved){impactWall(s.x+a.dx*10,s.y+a.dy*10);recover(95);return;}
   }
   if(a.age>=76)recover(80);
  }else if(a.kind==='volley'){
   const at=a.age-42,spacing=gold?13:20,count=gold?5:3;
   if(at>=0&&at%spacing===0&&at/spacing<count){
    // Each shot aims once at release. Eight compass directions and integer
    // steps let a moving player dodge; there is no homing or subpixel drift.
    const dx=Math.sign(h.x-s.x),dy=Math.sign(h.y-s.y),ax=Math.abs(h.x-s.x),ay=Math.abs(h.y-s.y);
    const vx=ax>ay*2?dx:ay>ax*2?0:dx,vy=ay>ax*2?dy:ax>ay*2?0:dy;
    s.shots.push({x:s.x+vx*12,y:s.y-12+vy*12,dx:vx,dy:vy,speed:gold?5:4,age:0});mod.playSound?.('blast');
   }
   if(at>spacing*(count-1)+20)recover(100);
  }else if(a.kind==='beam'){
   // The lane locks early. Even base Goku can charge a counter during the
   // long windup; the more dangerous second phase still gives a full second.
   const windup=gold?82:110,age=a.age-windup;
   if(age===0){mod.playSound?.('beam');mod.feedback?.pulse(12);}
   if(age>=0){
    const length=Math.min(512,16+age*16),origin={x:a.x+a.dx*12,y:a.y-12+a.dy*12};
    a.beam={...origin,dx:a.dx,dy:a.dy,length,halfWidth:gold?17:11};
    if(counterBeam())return;
    const along=(h.x-origin.x)*a.dx+(h.y-12-origin.y)*a.dy,across=Math.abs((h.x-origin.x)*a.dy-(h.y-12-origin.y)*a.dx);
    if(along>=0&&along<=length&&across<a.beam.halfWidth+5)receive(gold?320:240);
    if(age===24){const end={x:origin.x+a.dx*384,y:origin.y+a.dy*384};if(!safe(end.x,end.y+12))impactWall(end.x,end.y);}
    if(age>=(gold?66:48))recover(140);
   }
  }
 }
 const api={
  ready,load:()=>arena.load(),get partyMask(){return s?.mask??0;},get roomLoaded(){return !!s?.spawned;},get active(){return !!(s&&wanted());},get dangerous(){return api.active&&s.phase==='battle';},
  get music(){return api.active&&s.spawned?(s.tier||s.phase==='transform'||s.draw?'vegeta-full-power':'vegeta'):null;},
  get inputLocked(){return api.active&&s.phase==='draw'&&!r[0xd0];},
  clashInput(input){
   const c=s?.clash;if(!api.active||!c)return false;
   if(!r[0xd0]&&!(r[0xec]&0xfe)&&mashTrainingClash(c,input)){mod.playSound?.('hit');mod.feedback?.pulse(2);}
   mod.action={kind:'beam',age:7,duration:1000000,facing:face(c.dx,c.dy),super:c.super};
   return true;
  },
  onEvent(id){if(id===0x3db)start(true);},
  hideOwner(o){return api.active&&[0xe200,0xe400,...cloneBases].includes(o?.base)&&o.kind!=='portrait';},
  entity(){if(!api.active||!s?.spawned||s.won)return null;return{index:3,base:0xe600,custom:'vegeta',species:46,active:true,hp:s.hp,maxHp:vegetaHealth[s.phase==='transform'||s.tier?1:0],x:s.x,y:s.y,screenX:s.x-mod.status.cameraX,screenY:s.y-mod.status.cameraY,terrain:s.terrain};},
  hit(enemy,amount){
   const before=s?.hp??0;
   if(!api.active||s.phase!=='battle'||s.won||s.clash)return{index:3,species:46,before,after:before};
   // A newly released wave can reach Vegeta in this same native frame,
   // after the AI tick. Intercept it before its damage skips the clash.
   if(counterBeam())return{index:3,species:46,before,after:before};
   const melee=mod.action?.kind==='punch',damage=Math.max(1,Math.round(amount*(s.tier?.38:.55)));
   s.hp=Math.max(0,s.hp-damage);s.hurt=10;
   if(melee&&s.hp){
    s.melee=s.age-s.lastMelee<100?s.melee+1:1;s.lastMelee=s.age;
    if(s.melee>=2){s.melee=0;begin('counter');}
   }
   if(!s.hp){
    s.phase='transform';s.phaseAge=0;s.action=null;s.shots=[];s.rocks=[];
    s.hp=s.tier?1:vegetaHealth[1];
    if(!s.tier){teleport();mod.playSound?.('charge');mod.radio?.say('VEGETA:Hmph. Not bad.\nI suppose this interruption\nwas worth my time!',{frames:190,kind:'trial'});}
    else finish(true);
   }
   put(0xe782,Math.max(1,s.hp));put(0xe784,s.phase==='transform'||s.tier?vegetaHealth[1]:vegetaHealth[0]);
   return{index:3,species:46,before,after:s.hp};
  },
  tick(){
   if(!on())return;
   if(!wanted()){
    // Keep the saved lineup until native ADD_CHARACTER has completed on
    // return. It owns graphics, names and the original trial heal.
    if(s&&w(0xdc)!==72&&mod.canAttack&&(party()&s.mask)===s.mask)s=null;
    return;
   }
   if(!s&&(r[0xe600]&1)&&r[0xe780]===46)start();
   if(!s)return;
   if(!s.spawned&&(r[0xe600]&1)&&r[0xe780]===46){
    Object.assign(s,{spawned:true,x:w(0xe602),y:w(0xe604),terrain:r[0xe60b]});
    // The retail Doppel starts well above the entrance camera. Summon
    // Vegeta beside Goku, below the dialogue, before either can attack.
    r[0xe791]&=~128;
    put(0xe784,vegetaHealth[0]);put(0xe782,vegetaHealth[0]);
   }
   if(!s.spawned)return;
   if(s.phase==='intro'){
    // Stage beneath black while the door's native walk/camera settle. The
    // native brightness ramp reveals still fighters, not sliding sprites.
    const h=hero(),at=[[56,0],[-56,0],[32,16],[-32,16]].map(([dx,dy])=>({x:h.x+dx,y:h.y+dy})).find(p=>safe(p.x,p.y));
    if(at)Object.assign(s,at);s.facing=face(h.x-s.x,h.y-s.y);
    const e=s.entrance;
    if(e?.revealed&&!(r[0xe2]&1)&&r[0xe6]===15){r[0xe4]=r[0xe5]=1;e.complete=true;}
    if(e&&!e.revealed&&!snes.ppu?.forcedBlank){
     const view=[h.x,h.y,w(0xa8),w(0xaa)],still=e.view?.every((v,i)=>v===view[i]);
     e.stable=still?e.stable+1:0;e.view=view;
     if(e.stable>=12&&s.introduced){
      e.revealed=true;s.arrival=36;r[0xe7]=15;r[0xe4]=1;r[0xe5]=4;r[0xe2]|=1;
     }else{
      r[0xe6]=0;r[0xe7]=0;r[0xe4]=r[0xe5]=1;r[0xe2]&=~1;
     }
    }
    if(e?.revealed){
     // The walk-in finishes under black. Reveal Goku facing the camera in
     // base form, including when restoring an older entrance checkpoint.
     if(mod.options.superSaiyan){mod.options.superSaiyan=false;mod.cancelCombat?.();mod.motion?.reset();}
     r[0xe010]=1;mod.facing=0;
    }
   }
   for(const base of cloneBases){r[base]&=~1;put(base+0x1f1,0);if(base!==0xe600){put(base+0x182,0);r[base+0x191]|=128;}}
   put(0xe602,s.x);put(0xe604,s.y);r[0xe60b]=s.terrain;
   // Rings, native dialogue, fades and death own time. Attacks cannot move
   // under a menu or damage the player while they select a Senzu Bean.
   if(!mod.nativeField||r[0xd0]||r[0xec]&0xfe||r[0xff]||!w(0xe182)||r[0xe191]&128||snes.ppu?.forcedBlank)return;
   // A checkpoint/warp can skip the door's walk-on event. Do not start AI
   // before the introduction has removed companions and set the loss route.
   if(s.phase==='intro'&&!s.introduced){mod.story?.request(0x3db);return;}
   if(s.phase==='intro'){
    if(s.entrance&&!s.entrance.complete)return;
    s.phase='battle';s.entrance=null;
   }
   if(s.phase==='battle'&&!s.tier&&mod.options.superSaiyan&&!s.earlySuperRemark){
    s.earlySuperRemark=true;
    mod.radio?.interrupt?.(['VEGETA:Super Saiyan already?\nI was just warming up,\nKakarot!'],{frames:200,kind:'trial'});
   }
   s.age++;if(s.grace)s.grace--;if(s.hurt)s.hurt--;
   s.echoes=s.echoes.filter(e=>++e.age<18);s.bursts=s.bursts.filter(e=>++e.age<28);
   if(s.clash){updateClash();return;}
   if(s.phase==='transform'){
    s.phaseAge++;
    if(s.phaseAge===92){s.tier=1;put(0xe784,vegetaHealth[1]);mod.playSound?.('transform');mod.feedback?.burst?.();}
    if(s.phaseAge===155)mod.radio?.say('GOKU:Now we are talking!\nVEGETA:For once, we agree.\nMake this interesting.',{frames:210,kind:'trial'});
    if(s.phaseAge>=220){s.phase='battle';s.grace=60;teleport();begin('beam');}
    return;
   }
   if(s.phase==='draw'){
    // Let the finishing wave finish travelling before the two relax. No
    // boss-death particles, red palette, loot or defeated Vegeta sprite.
    if(!s.phaseAge&&mod.effects.some(e=>e.kind==='beam'&&e.life>0))return;
    s.phaseAge++;
    if(s.phaseAge===1){mod.cancelCombat?.();teleport();s.facing=face(hero().x-s.x,hero().y-s.y);}
    if(s.phaseAge===35){
     s.tier=0;if(mod.options.superSaiyan&&!mod.frieza?.permanent){mod.options.superSaiyan=false;mod.playSound?.('revert');}
     mod.radio?.say(s.draw?'VEGETA:Enough. Neither of\nus is getting anywhere.\nCall it a draw, Kakarot.':'VEGETA:Take a breather.\nThis is training, Kakarot.\nWe can try again.',{frames:230,kind:'trial'});
    }
    if(s.phaseAge===275)mod.radio?.say(s.draw?'GOKU:That was great!\nVEGETA:Hmph. Same again.\nAfter we get back.':'GOKU:Still a great workout!\nVEGETA:Next time, dodge.\nCome on. Time to head back.',{frames:200,kind:'trial'});
    if(s.phaseAge>=490){
     s.won=!!s.draw;put(0xe782,s.draw?0:1);if(s.draw)r[0xe791]|=128;
     if(!s.returning)s.returning=!!mod.story?.request(s.draw?0x4e5:0x25);
    }
    return;
   }
   for(const shot of s.shots){
    const old={x:shot.x,y:shot.y};shot.x+=shot.dx*shot.speed;shot.y+=shot.dy*shot.speed;shot.age++;
    const counter=mod.effects.some(e=>e.kind==='beam'&&e.life>0&&beamTouchesShot(e,mod.beamGeometry(e),shot));
    if(counter){shot.age=200;burst(shot.x,shot.y,false);mod.playSound?.('deflect');continue;}
    const h=hero();if(sweptDistance(h.x,h.y-12,old.x,old.y,shot.x,shot.y)<12){receive(s.tier?180:130);shot.age=200;}
    if(!safe(shot.x,shot.y+12)){impactWall(shot.x,shot.y+12);shot.age=200;}
   }
   s.shots=s.shots.filter(q=>q.age<95);
   for(const rock of s.rocks){rock.age++;if(rock.age===62){burst(rock.x,rock.y);if(Math.hypot(hero().x-rock.x,hero().y-rock.y)<16)receive(110);}}
   s.rocks=s.rocks.filter(q=>q.age<85);
   if(s.action)updateAttack();
   else if(--s.clock<=0)begin(['rush','volley','beam','counter','beam'][s.cycle++%5]);
   else{
    const h=hero(),dx=h.x-s.x,dy=h.y-s.y;s.facing=face(dx,dy);
    // Footwork uses ordinary collision and whole pixels; leave a readable
    // recovery window after attacks instead of endlessly chasing the player.
    const distance=Math.hypot(dx,dy);
    if(distance>180&&s.clock<45){
     // Use the wider floor: close distance with a readable dash, then
     // recover in view instead of firing from an unseen corner of the map.
     begin('rush');
    }else if(s.clock<45&&s.age%2===0){
     const[dX,dY]=directions[s.facing];
     if(distance>105)step(dX,dY,s.tier?3:2);
     else if(distance<55)step(-dX,-dY,s.tier?3:2);
     else if(s.tier&&s.age%4===0)step(dY,-dX,2);
    }
   }
  },
  draw(layer){
   if(!api.active||!s.spawned)return;
   const camera=mod.status,a=s.action,putPixel=(x,y,c)=>layer.pixel(x,y,c,true);
   combustion??=createNativeCombustion(snes.cart.data);
   for(const e of s.echoes)drawVegetaSprite(cells,e.frame,e.x-camera.cameraX,e.y-camera.cameraY,putPixel,{flip:e.flip,ghost:true});
   let frame=(s.phase==='transform'?7:a?.kind==='beam'?(a.beam?6:5):a?.kind==='volley'?6:a&&a.age>=24&&a.age<58?Math.floor(a.age/6)%2?3:4:s.phase==='intro'||s.phase==='draw'?0:1)+s.tier*8;
   // Advance the walk cycle from real travel, not a recovery timer. Idle
   // footwork and blocked rushes no longer run in place or snap poses.
   const moving=s.phase==='battle'&&s.age<(s.movingUntil??0),step=Math.floor((s.travel??0)/12)&1;
   if(s.phase==='battle'&&(!a||a.kind==='rush')){
    if(s.facing===0)frame=16+s.tier*8+(moving?1+step:0);
    else if(s.facing===3)frame=16+s.tier*8+(moving?4+step:3);
    else if(moving)frame=16+s.tier*8+6+step;
   }
   const visible=s.phase!=='intro'||s.arrival>=12,vanishing=a?.kind==='counter'&&a.age>=8&&a.age<12;
   if(s.phase==='transform'||a?.kind==='beam'&&!a.beam){
    layer.behindBody=true;
    const age=s.phase==='transform'?s.phaseAge:a.age,power=s.phase==='transform' ? .35+age/140 : .25+.75*age/(s.tier?82:110);
    layer.aura(s.x-camera.cameraX,s.y-camera.cameraY-20,age,{height:40,gold:!!s.tier,power:Math.min(1,power),seed:5});
    layer.behindBody=false;
   }
   if(visible&&!vanishing)drawVegetaSprite(cells,frame,s.x-camera.cameraX,s.y-camera.cameraY,s.clash?(x,y,c)=>layer.pixel(x,y,c):putPixel,{flip:s.facing===2,flash:s.hurt>0&&(s.hurt&2)!==0});
   if(s.clash){
    // Leave both firing poses readable at their beam's hand anchor. Native
    // spell OBJs can overlap the hands without covering either body.
    layer.behindBody=true;
    try{drawTrainingClash(layer,s.clash,camera);}finally{layer.behindBody=false;}
    if(s.clash.phase==='release'){
     const p=trainingClashPoint(s.clash);
     drawBeamDetonation(snes.cart.data,p.x-camera.cameraX,p.y-camera.cameraY,s.clash.age-trainingClashTiming.impact,putPixel);
    }
    return;
   }
   if(a?.kind==='beam'){
    if(a.beam){const b=a.beam;layer.giantBeam(b.x-camera.cameraX,b.y-camera.cameraY,b.dx,b.dy,b.length,b.halfWidth,a.age>>2,{palette:[0x540d,0x6d3c,0x7e60,0x8000]});}
    else{
     layer.stamp('charge-orb',Math.min(4,a.age>>4),s.x-camera.cameraX+a.dx*12,s.y-camera.cameraY-12+a.dy*12);
     // Four spaced native sparks mark the committed beam lane.
     for(let d=40;d<=136;d+=32)layer.stamp('impact-spark',(a.age>>4)%2,s.x-camera.cameraX+a.dx*d,s.y-camera.cameraY-12+a.dy*d);
    }
   }
   for(const p of s.shots)layer.stamp('charge-orb',(p.age>>2)%3,p.x-camera.cameraX,p.y-camera.cameraY);
   for(const e of s.bursts)combustion('burst',Math.min(6,e.age>>2),e.x-camera.cameraX,e.y-camera.cameraY,putPixel);
   for(const e of s.rocks){
    const x=e.x-camera.cameraX,y=e.y-camera.cameraY;
    if(e.age<42)layer.stamp('impact-spark',(e.age>>3)%2,x,y);
    else if(e.age<62)combustion('ember',(e.age>>2)%3,x,y-(62-e.age)*5,putPixel);
   }
  },
  snapshot(){return copy(s);},restore(saved){s=copy(saved);combustion=null;},get status(){return copy(s);},
 };
 return api;
}
