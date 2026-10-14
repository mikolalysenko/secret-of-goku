import {friezaEvents as F} from './frieza-events.js';
import {FRIEZA_HP,homingStep,discContact,sweptDistance} from './frieza-combat.js';
import {newCoreCrisis,activateTwilight,crisisFlightMessages} from './frieza-crisis.js';
import {newFriezaArena,fractureFortress,tickFriezaArena,ruinMask,drawFriezaDebris} from './frieza-arena.js';
import {newOrbit,ricochet,tickOrbit,steerOrbit} from './frieza-orbit.js';
const copy=s=>s?structuredClone(s):null;
const initial=()=>({stage:'dormant',trialWon:false,stolen:false,stolenMask:0,eighth:false,permanent:false,fallen:false,popoiMember:false,popoi:null,scene:null,boss:null,crisis:null,offered:false,lastMap:null,hinted:false,discHits:0,playerHits:0});
export function createFrieza(snes,mod){
 let s=initial(),atlas=null,fullAtlas=null,ruins=null,ruinsKey='',renderFrame=-1,renderArena=false,renderCamera=null;
 async function loadAtlas(path){
  const img=new Image(),url=new URL(path,import.meta.url);url.search=new URL(import.meta.url).search;img.src=url.href;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  const rgba=ctx.getImageData(0,0,c.width,c.height).data,pixels=new Uint16Array(c.width*c.height),frames=[];
  for(let i=0;i<pixels.length;i++)if(rgba[i*4+3]>=128)pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  for(let i=0;i<8;i++){
   const x0=Math.round(i%4*c.width/4),x1=Math.round((i%4+1)*c.width/4),y0=Math.round((i>>2)*c.height/2),y1=Math.round(((i>>2)+1)*c.height/2);
   let left=x1,right=x0,top=y1,bottom=y0;
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[y*c.width+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   frames.push({x:left,y:top,w:right-left+1,h:bottom-top+1});
  }
  return{pixels,width:c.width,frames};
 }
 const ready=Promise.all([loadAtlas('../assets/sprites/frieza.png').then(a=>atlas=a),loadAtlas('../assets/sprites/frieza-full-power.png').then(a=>fullAtlas=a)]);
 const map=()=>mod.read16(0xdc);
 const on=()=>mod.options.enabled&&mod.gokuActive;
 const pendingEntrance=()=>on()&&s.stage==='dormant'&&!mod.quest?.status.wished&&mod.read8(0xcf4e)<9&&!mod.worldKi?.status.fortressDestroyed;
 // Radar/Dryad guidance waits until late progression. The story transition
 // and early Fortress entry always trigger him, even with no collected Balls.
 const eligible=()=>pendingEntrance()&&(mod.quest?.status.seedMask===127||mod.read8(0xcfaf)>=2);
 const hero=()=>s.boss?.space?.hero??{x:mod.read16(0xe002),y:mod.read16(0xe004)-12};
 function cue(name){
  s.scene={kind:name,age:0,map:map(),x:mod.read16(0xe002),y:mod.read16(0xe004)};
 }
 function laugh(){mod.playSound?.('friezaLaugh');}
 function burst(x,y,kind='impact'){mod.effects.push({kind,x,y,dx:1,dy:0,life:12,max:12,super:true});mod.playSound?.('impact');mod.feedback?.pulse(8);}
 function breakFloor(x,y,radius=18,loud=true){
  const b=s.boss;if(!b)return;
  b.arena??=newFriezaArena();
  fractureFortress(b.arena,x,y,radius,(x,y)=>mod.localFlightHook.canLand(x,y,b.terrain&128?1:0,b.terrain&3));
  if(loud){mod.playSound?.('fortressBreak');mod.feedback?.pulse(radius>30?14:6);}
 }
 function damagePlayer(amount){
  const b=s.boss;if(s.stage!=='battle'||!b||b.grace||mod.read8(0xe191)&0x80||!mod.read16(0xe182))return;
  mod.write16(0xe1f1,Math.max(mod.read16(0xe1f1),amount));mod.write8(0xe1f0,0);mod.write8(0xe1ec,0);b.grace=48;s.playerHits++;burst(hero().x,hero().y);mod.playSound?.('friezaImpact');
 }
 function hurt(amount,disc=false){
  const b=s.boss;if(!b||s.stage!=='battle'||b.surge||b.space?.clash)return 0;
  // Full beams are still devastating, but cannot erase an entire dramatic
  // phase before it appears. The two surges are earned HP thresholds.
  const floor=b.space?6000:(2-(b.tier??0))*FRIEZA_HP/3;
  const hit=Math.min(Math.max(0,b.hp-Math.max(0,floor)),Math.max(0,Math.floor(amount)));b.hp-=hit;b.hurt=10;
  if(disc){s.discHits++;b.stun=75;burst(b.x,b.y);if(!b.space)breakFloor(b.x,b.y+12,26);mod.playSound?.('friezaImpact');}
  else if(hit&&b.age-(b.lastImpact??-100)>18){b.lastImpact=b.age;burst(b.x,b.y);mod.playSound?.('friezaImpact');}
  if(b.hp<=0)win();
  return hit;
 }
 function win(){const b=s.boss;s.stage='won';b.hp=0;b.shots=[];b.warning=null;b.age=0;cue('victory');mod.cancelCombat();mod.feedback?.burst();mod.playSound?.('beam');}
 function enterOrbit(target){
  const b=s.boss;b.ground={x:b.x,y:b.y};b.space=newOrbit(target);b.x=202;b.y=57;
  b.nodes=[{x:202,y:57},{x:54,y:48},{x:208,y:148},{x:48,y:132}];b.node=0;b.shots=[];b.hazards=[];b.afterimages=[];
  mod.localFlight=false;mod.localLift=0;mod.cancelCombat();mod.playSound?.('flight');
 }
 function startBattle(){
  s.stage='battle';s.scene=null;
  const h=hero(),terrain=mod.read8(0xe00b),nodes=[];
  for(const[dx,dy]of[[-60,-50],[60,-50],[60,30],[-60,30],[0,-30]]){
   const x=h.x+dx,y=h.y+dy;
   if(mod.localFlightHook.canLand(x,y+12,terrain&128?1:0,terrain&3))nodes.push({x,y});
  }
  if(!nodes.length)nodes.push({x:h.x,y:h.y-24});
  s.boss={x:nodes[0].x,y:nodes[0].y,nodes,node:0,hp:FRIEZA_HP,age:0,clock:55,cycle:0,stun:0,grace:0,hurt:0,warning:null,shots:[],terrain,tier:0,surge:null,arena:newFriezaArena(),afterimages:[],hazards:[],dash:0,orbital:true};
  mod.cancelCombat();mod.radio?.restore({firstFlight:true});
 }
 function attack(){
  const b=s.boss,h=hero(),enraged=b.tier>0,discs=b.cycle++%2===1;
  b.warning={kind:discs?'disc':'orb',age:0,wait:enraged?38:52,x:b.x,y:b.y,target:{...h}};
  // A lock-on ring gives time to fly clear before the deck erupts.
  if(b.tier&&!b.space&&b.cycle%3===0)b.hazards.push({x:h.x,y:h.y+12,age:0,wait:65,radius:28});
 }
 function fire(){
  const b=s.boss,w=b.warning,x=b.x,y=b.y-(b.space?5:24),angle=Math.atan2(w.target.y-y,w.target.x-x),enraged=b.tier>0;
  // Launch from the same moving hand that drew the charge, not the stale
  // world position where the warning started several dozen frames ago.
  if(w.kind==='disc')for(const sign of[-1,1])b.shots.push({kind:'disc',x,y,angle:angle+sign*.85,speed:enraged?3.7:3.1,age:0,trail:[]});
  else for(const offset of(enraged?[-.45,0,.45]:[-.23,.23]))b.shots.push({kind:'orb',x,y,angle:angle+offset,speed:enraged?3.5:2.8,age:0,trail:[]});
  b.warning=null;b.clock=enraged?62:85;b.recoil=9;mod.playSound?.(w.kind==='disc'?'friezaDisc':'friezaOrb');
  mod.feedback?.pulse(w.kind==='orb'?4:2);
  if(b.cycle===2||b.cycle===8)laugh();
 }
 // This arena reserves BG2 for Dark Lich's dynamically streamed body.
 // With that boss absent it retains unrelated VRAM. Frieza uses OBJ pixels;
 // show the complete native BG1 floor and BG3 windows without the old boss
 // plane. Never change the PPU registers or affect other maps/menus.
 const color=snes.ppu.getColor;
 snes.ppu.getColor=function(sub,x,y){
  if(renderFrame!==mod.frame){renderFrame=mod.frame;renderArena=api.ownsArena();renderCamera=renderArena?mod.status:null;}
  if(!renderArena||this.mode!==1)return color.call(this,sub,x,y);
  const screens=sub?this.subScreenEnabled:this.mainScreenEnabled,old=screens[1];screens[1]=false;
  let result;try{result=color.call(this,sub,x,y);}finally{screens[1]=old;}
  // Floor-only scars cannot cover Goku, native windows, or room walls.
  if(!sub&&result[1]===0&&y<224&&s.boss?.arena){
   const a=s.boss.arena,h=renderCamera,key=`${a.revision}:${h.cameraX}:${h.cameraY}`;
   if(key!==ruinsKey){ruinsKey=key;ruins=ruinMask(a,h.cameraX,h.cameraY);}
   const value=ruins?.[y*256+x];
   if(value){const wx=x+h.cameraX,wy=y+h.cameraY,t=s.boss.age;
    if(value===1){const cloud=(Math.floor(wx/9)+Math.floor(wy/6)+Math.floor(t/24))%3;result[0]=(2+cloud)|(1<<5)|((5+cloud)<<10);if((wx*37+wy*19)%211===0)result[0]=0x316b;}
    else result[0]=value===2?0x0842:(wx+wy)%11===0?0x3296:0x31a8;
   }
  }
  return result;
 };
 const api={
  ready,get pendingEntrance(){return pendingEntrance();},get eligible(){return eligible();},get active(){return s.stage!=='dormant';},get crisisActive(){return !!s.crisis?.active;},get unresolved(){return s.stolen;},get eighth(){return s.eighth;},get permanent(){return s.permanent;},get fallen(){return s.fallen;},get popoiMember(){return s.popoiMember;},get trial(){return s.stage==='trial';},get fighting(){return s.stage==='battle'||s.stage==='won';},
  repairCore(){if(s.crisis){s.crisis.active=false;s.crisis.resolved=true;}},
  ownsArena(){return on()&&api.active&&!api.trial&&map()===246;},
  get orbit(){return on()&&map()===246?s.boss?.space??null:null;},
  get portraitAtlas(){return s.boss?.muscular&&fullAtlas?fullAtlas:atlas;},
  get music(){if(!on())return null;return s.boss?.space&&['battle','won'].includes(s.stage)?'orbit':['battle','won'].includes(s.stage)||s.scene?.kind==='gold'?'battle':['theft','showdown'].includes(s.stage)||s.scene?.kind==='eighth'?'arrival':null;},
  get stolenMask(){return s.stolen?s.stolenMask:0;},
  get cinematic(){const c=s.boss?.surge;return on()&&map()===246&&c?.kind==='frieza-cosmic'&&c.age>=72&&c.age<190?c:null;},
  get inputLocked(){return on()&&map()===246&&!!s.boss?.surge;},
  get chargeSound(){if(!on())return 0;const c=s.scene?.map===map()?s.scene:null;if(c)return c.kind==='core-charge'?.8:c.kind==='empower'?.7:0;if(map()!==246||s.stage!=='battle'||!mod.nativeField||mod.read8(0xec)&0xfe||mod.read8(0xe191)&128)return 0;return s.boss?.surge||s.boss?.space?.clash?1:s.boss?.warning?.kind==='orb'?.5:0;},
  onEvent(id){
   if(id===F.trial){s.stage='trial';mod.cancelCombat();cue('trial-taunt');laugh();}
   if(id===F.empower){cue('empower');mod.playSound?.('powerBurst');mod.feedback?.pulse(14);}
   if(id===F.afterTrial){s.trialWon=true;s.stage='hunt';s.scene=null;}
   if(id===F.offer)s.offered=true;
   if(id===F.theft){if(!pendingEntrance())return;s.stage='theft';mod.cancelCombat();cue('waiting');}
   if(id===F.reveal){cue('reveal');laugh();mod.playSound?.('teleportIn');mod.feedback?.pulse(12);}
   if(id===F.steal){s.stolen=true;s.stolenMask=mod.quest?.status.mask??0;cue('steal');mod.playSound?.('charged');}
   if(id===F.coreCharge){cue('core-charge');mod.playSound?.('friezaOrb');}
   if(id===F.coreShot){cue('core-shot');mod.playSound?.('friezaOrb');}
   if(id===F.coreImpact){s.crisis=newCoreCrisis();cue('core-impact');mod.feedback?.pulse(24);mod.playSound?.('powerBurst');}
   if(id===F.escape){activateTwilight(snes.ram);s.stage='hunt';s.scene=null;}
   if(id===F.leave){cue('depart');mod.playSound?.('flight');}
   if(id===F.eighth){s.eighth=true;s.stage='hunt';cue('eighth');mod.playSound?.('charged');}
   if(id===F.showdown){s.stage='showdown';s.popoiMember=!!(snes.ram[0xe400]&1);s.popoi=Array.from(snes.ram.slice(0xe400,0xe600));if(!s.popoiMember){
     // An unrecruited Popoi has no actor graphics descriptor yet. Mirror
     // C1:DFD3's descriptor setup before native ADD_CHARACTER animates him.
     snes.ram.set(snes.cart.data.slice(0x100820,0x100830),0xe470);
     mod.write16(0xe465,mod.read16(0xe477));mod.write16(0xe480,(mod.read16(0xe470)&0x3ff)<<6);mod.write8(0xe482,0xd5+((mod.read8(0xe471)>>2)&7));
    }cue('taunt');laugh();}
   if(id===F.lift){cue('lift');mod.playSound?.('charged');}
   if(id===F.explode){s.fallen=true;cue('explode');mod.playSound?.('powerBurst');mod.feedback?.pulse(18);}
   if(id===F.gold){s.permanent=true;mod.options.superSaiyan=true;mod.powerIntro?.restore({flight:true,superShown:true});cue('gold');mod.playSound?.('transform');}
   if(id===F.battle)startBattle();
   if(id===F.victory){if(s.boss?.space){s.boss.space=null;Object.assign(s.boss,s.boss.ground);}cue('victory');}
   if(id===F.defeated){s.stage='defeated';s.stolen=false;cue('defeated');mod.playSound?.('powerBurst');mod.quest?.recover?.();}
   if(id===F.revive){
    s.fallen=false;s.eighth=false;
    if(s.popoiMember&&s.popoi){
     // Native ADD_CHARACTER owns membership/graphics. Restore earned stats,
     // equipment and magic, then put Popoi beside the actual party.
     snes.ram.set(s.popoi.slice(0x180),0xe580);mod.write8(0xe590,0);mod.write8(0xe591,0);mod.write16(0xe582,mod.read16(0xe584));
    }
   }
  },
  entity(){const b=s.boss;if(!on()||map()!==246||s.stage!=='battle'||!b?.hp)return null;const h=mod.status;return{index:12,base:0,custom:'frieza',species:121,active:true,hp:b.hp,maxHp:FRIEZA_HP,x:b.x,y:b.y+12,screenX:b.x-h.cameraX,screenY:b.y+12-h.cameraY,terrain:b.terrain};},
  hit(enemy,amount){const before=s.boss?.hp??0,damage=hurt(amount*(s.boss?.stun ? .65 : .15));return{index:enemy.index,species:enemy.species,before,after:before-damage};},
  spaceInput(input){
   const b=s.boss,o=api.orbit;if(!o)return false;
   // Original rings/items still pause the fight and own their normal input.
   if(mod.read8(0xd0)||mod.read8(0xec)&0xfe||input&2){o.charge=0;mod.charging=false;return false;}
   if(s.stage!=='battle'||mod.read8(0xe191)&128)return true;
   const wave=!!(input&0x400)&&!!(input&(1<<17)),tap=input&~mod.lastInput;
   const direction=()=>{const dx=b.x-o.hero.x,dy=b.y-o.hero.y,n=Math.hypot(dx,dy)||1;return{dx:dx/n,dy:dy/n};};
   const c=o.clash;
   if(c?.phase==='struggle'){
    if(tap&(1|(1<<17))){c.pressure=Math.min(1,c.pressure+.058);c.taps++;mod.playSound?.('hit');mod.feedback?.pulse(2);}
    return true;
   }
   if(!c)steerOrbit(o,input);
   if(wave&&!o.beam){o.charge=Math.min(45,o.charge+1);if(o.charge===45&&mod.charge<45)mod.playSound?.('charged');}
   else if(o.charge){
    const strength=o.charge/45,dir=direction();
    if(c){
     if(strength===1){c.phase='struggle';c.age=0;c.pressure=.45;c.taps=0;mod.playSound?.('beam');}
     else{damagePlayer(180);c.age=0;mod.playSound?.('friezaImpact');}
    }else{o.beam={...o.hero,...dir,age:0,max:strength===1?60:30,width:8+strength*15,damage:400+strength*500};mod.playSound?.('beam');mod.feedback?.pulse(18);}
    o.charge=0;
   }
   mod.charging=wave&&!o.beam;mod.charge=o.charge;mod.action=mod.charging?{kind:'charge',age:o.charge,duration:999,super:true,facing:mod.facing}:null;
   if(c)return true;
   if((input&0x401)===0x401&&(tap&1)){o.hero.x=Math.max(14,Math.min(242,b.x-18));o.hero.y=Math.max(20,Math.min(184,b.y+8));o.teleport=12;mod.playSound?.('teleport');}
   else if(input&1&&!(input&0x400)&&!o.cooldown){o.cooldown=8;o.punch=8;mod.playSound?.('swing');if(Math.hypot(b.x-o.hero.x,b.y-o.hero.y)<32){hurt(550);mod.playSound?.('friezaImpact');}}
   if(input&(1<<17)&&!(input&0x400)&&!o.cooldown&&!o.beam){o.cooldown=6;o.shots.push({...o.hero,...direction(),age:0});mod.playSound?.('blast');}
   return true;
  },
  tick(){
   if(!on())return;
   const here=map();if(s.lastMap!==here){s.lastMap=here;s.offered=false;if(s.scene?.map!==here)s.scene=null;}
   if(s.permanent&&!mod.ending?.nativeBoy)mod.options.superSaiyan=true;
   if(s.crisis?.active&&!s.crisis.flightNotified&&mod.worldFlight&&!snes.ram[0x8c]&&!(snes.ram[0xfe]&0xc0)&&!snes.ppu.forcedBlank){
    // 1F04 ends its sinking-continent flyby in the overhead view. Ask the
    // native C0:8779 camera transition for a rear view, so Kai's sky warning
    // arrives over the changed horizon. Do not touch matrices/HDMA/VRAM.
    if(snes.ram[0xf2]&0x80){if(!s.crisis.rearCamera){s.crisis.rearCamera=true;snes.ram[0xf8]=0x90;snes.ram[0xcc]|=0x10;}}
    else if(!(snes.ram[0xf2]&3)){s.crisis.flightNotified=true;mod.radio?.interrupt(crisisFlightMessages,{kind:'core-crisis',frames:300});}
   }
   if(eligible()&&!s.hinted){s.hinted=true;mod.radio?.say('DRYAD:Come to the Tree\nPalace. I sense something\nfollowing your ki.',{kind:'quest'});}
   if(eligible()&&here===431&&!s.offered&&Math.hypot(hero().x-232,hero().y-200)<90&&mod.canAttack)mod.story.request(F.offer);
   if(s.scene){
    const c=s.scene;c.age++;
    if(c.kind==='lift'&&snes.ram[0xe400]&1){mod.write16(0xe402,c.x+35);mod.write16(0xe404,c.y-10);mod.write8(0xe445,Math.min(55,Math.floor(c.age*.8)));}
    if(c.kind==='gold'&&c.age===28){mod.feedback?.pulse(16);mod.playSound?.('powerBurst');}
    if(['eighth','defeated'].includes(c.kind)&&mod.canAttack)s.scene=null;
   }
   if(s.stage==='won'&&here===246&&mod.canAttack){
    const b=s.boss;b.age++;if(b.arena)tickFriezaArena(b.arena);
    if(b.space){tickOrbit(b.space,b,{hurt:()=>{},damage:()=>{},sound:mod.playSound,shake:n=>mod.feedback?.pulse(n)});if(b.space.clash)b.space.clash.age++;}
    else if(b.age<90&&b.age%18===1)breakFloor(b.x+(b.age%3-1)*18,b.y+12,24);
    if(b.age>=108)mod.story.request(F.victory);return;
   }
   if(s.stage!=='battle'||here!==246||!s.boss)return;
   // Menus pause this battle; spell/hit messages do not stop its projectiles.
   if(!mod.nativeField||mod.read8(0xd0)||mod.read8(0xec)&0xfe||snes.ppu.forcedBlank||mod.read8(0xe191)&0x80)return;
   const b=s.boss,h=hero();b.age++;if(b.grace)b.grace--;if(b.hurt)b.hurt--;if(b.recoil)b.recoil--;
   b.arena??=newFriezaArena();b.afterimages??=[];b.hazards??=[];b.tier??=0;tickFriezaArena(b.arena);
   b.afterimages=b.afterimages.filter(p=>++p.age<16);
   if(!b.surge&&b.tier<2&&b.hp<=(2-b.tier)*FRIEZA_HP/3){
    b.tier++;b.shots=[];b.warning=null;b.hazards=[];b.stun=0;
    b.surge={kind:b.tier===2?'frieza-cosmic':'frieza-breach',age:0,target:{x:mod.read16(0x128)||2000,y:mod.read16(0x12a)||2000}};
    mod.cancelCombat();mod.radio?.restore({firstFlight:true});mod.playSound?.('friezaOrb');
    if(b.tier===1)mod.radio?.interrupt([
     'FRIEZA:You have not seen\nmy maximum power!',
     'GOKU:Then show me.\nOne hundred percent.\nI will wait.',
     'KING KAI:NO! FINISH HIM!\nThe planet has FIVE MINUTES!',
     'FRIEZA:Then witness\nONE HUNDRED PERCENT!'
    ],{kind:'full-power-frieza',frames:90});
   }
   if(b.surge){
    const c=b.surge;c.age++;
    if(c.kind==='frieza-breach'&&c.age===270){b.muscular=true;mod.playSound?.('powerBurst');mod.feedback?.burst();}
    const impact=c.kind==='frieza-breach'?270:24;
    if(c.age===impact){breakFloor(b.x,b.y+12,34);mod.feedback?.burst();}
    if(c.age===impact+24){for(let i=0;i<b.nodes.length;i++){const n=b.nodes[i];breakFloor(n.x,n.y+12,c.kind==='frieza-cosmic'?29+i*5:19+i*3,false);}mod.playSound?.('fortressBreak');mod.feedback?.pulse(16);}
    if(c.age===72&&c.kind==='frieza-cosmic'){mod.playSound?.('friezaOrb');mod.playSound?.('beam');}
    if(c.age===116&&c.kind==='frieza-cosmic')mod.playSound?.('fortressBreak');
    if(c.age>=(c.kind==='frieza-cosmic'?206:380)){if(c.kind==='frieza-cosmic')enterOrbit(c.target);b.surge=null;b.clock=35;b.grace=60;mod.cancelInput();}
    return;
   }
   if(b.space){
    const o=b.space;
    tickOrbit(o,b,{hurt,damage:damagePlayer,sound:mod.playSound,shake:n=>mod.feedback?.pulse(n)});
    if(b.hp<=6000&&!o.clash){
     o.clash={phase:'charge',age:0,pressure:.45,taps:0};o.hero={x:48,y:140};b.x=209;b.y=51;b.shots=[];b.warning=null;o.shots=[];o.beam=null;o.charge=0;
     mod.cancelCombat();mod.radio?.restore({firstFlight:true});mod.playSound?.('friezaOrb');
    }
    if(o.clash){
     const c=o.clash;c.age++;
     if(c.phase==='charge'&&c.age>480&&c.age%240===0)damagePlayer(180);
     if(c.phase==='struggle'){
      c.pressure-=.0017;
      if(c.age%45===0)mod.playSound?.('friezaOrb');
      if(c.pressure>=.99){c.phase='win';c.age=0;ricochet(o,b.x,b.y,.8,-.6,'clash');o.beam={...o.hero,dx:.875,dy:-.484,age:0,max:108,width:37,damage:0};win();}
      else if(c.pressure<=.04){damagePlayer(420);c.phase='charge';c.age=0;c.pressure=.45;mod.cancelCombat();mod.playSound?.('fortressBreak');}
     }
     return;
    }
   }
   if(b.stun)b.stun--;
   else{
    // He holds his ground to steer the discs. This gives players a readable
    // anchor to circle behind instead of moving their counter target away.
    const steering=b.shots.some(p=>p.kind==='disc'&&p.age<260);
    if(!steering&&b.age%105===0){b.node=(b.node+1)%b.nodes.length;b.dash=12;mod.playSound?.('friezaRush');}
    if(b.dash){if(b.age%2===0)b.afterimages.push({x:b.x,y:b.y,age:0});b.dash--;}
    const to=b.nodes[b.node],dx=to.x-b.x,dy=to.y-b.y,d=Math.hypot(dx,dy),speed=steering?0:b.dash?7:b.tier?2.8:2.1;
    if(d>1){b.x+=dx/d*Math.min(d,speed);b.y+=dy/d*Math.min(d,speed);}
    if(b.warning){if(++b.warning.age>=b.warning.wait)fire();}else if(--b.clock<=0)attack();
   }
   for(const shot of b.shots){
    // A beam can counter a Death Ball earlier in this same tick. The
    // removed projectile must never run its old collision a second time.
    if(shot.age>=330)continue;
    shot.previousX=shot.x;shot.previousY=shot.y;shot.trail.unshift({x:shot.x,y:shot.y});if(shot.trail.length>8)shot.trail.pop();
    if(shot.kind==='disc'){
     homingStep(shot,h,b.hp<FRIEZA_HP/2?.038:.032);
     const hit=discContact(shot,h,b);if(hit==='frieza'){shot.age=999;hurt(12000,true);}else if(hit==='goku'){shot.age=999;damagePlayer(230);}
    }else{
     shot.age++;shot.x+=Math.cos(shot.angle)*shot.speed;shot.y+=Math.sin(shot.angle)*shot.speed;
     const hit=sweptDistance(h.x,h.y,shot.previousX,shot.previousY,shot.x,shot.y)<20;
     const camera=b.space?{cameraX:0,cameraY:0}:mod.status;
     const out=shot.age>15&&(shot.x<camera.cameraX+8||shot.x>camera.cameraX+248||shot.y<camera.cameraY+8||shot.y>camera.cameraY+205);
     if(hit||out){shot.age=999;if(b.space){if(out)ricochet(b.space,shot.x,shot.y,Math.cos(shot.angle),Math.sin(shot.angle),'frieza');}else breakFloor(shot.x,shot.y+12,hit?20:28);if(hit)damagePlayer(310);}
    }
   }
   for(const hazard of b.hazards){hazard.age++;if(hazard.age===hazard.wait){breakFloor(hazard.x,hazard.y,32);if(Math.hypot(h.x-hazard.x,h.y+12-hazard.y)<hazard.radius)damagePlayer(280);}}
   b.hazards=b.hazards.filter(v=>v.age<v.wait+24);
   b.shots=b.shots.filter(v=>v.age<330);if(b.shots.length>12)b.shots.splice(0,b.shots.length-12);
  },
  hideOwner(owner){return api.ownsArena()&&owner?.base>=0xe600||s.fallen&&owner?.base===0xe400;},
  draw(layer){
   if(!on()||mod.worldFlight||snes.ppu.mode!==1||!atlas)return;
   const h=mod.status,c=s.scene?.map===map()?s.scene:null,b=map()===246?s.boss:null;
   const put=(x,y,color)=>layer.pixel(x,y,color,true),rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
   const sprite=(frame,x,y,flip=false,ghost=0)=>{
    const sheet=s.boss?.muscular&&fullAtlas?fullAtlas:atlas;
    const f=sheet.frames[frame],height=frame===7?27:frame===4||frame===5?34:40,width=Math.round(f.w*height/f.h);
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
     const color=sheet.pixels[(f.y+Math.floor(py*f.h/height))*sheet.width+f.x+Math.floor((flip?width-1-px:px)*f.w/width)];
     if(color&&(!ghost||(px+py+ghost)%3===0))put(x-width/2+px,y-height+py,ghost?rgb(10,7,18):color);
    }
   };
   const ball=(x,y,r,color)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const d=dx*dx+dy*dy;if(d<=r*r)put(x+dx,y+dy,d<(r-2)**2?color:rgb(8,2,14));}};
   const fx=(x,y,n)=>{for(let i=0;i<8;i++){const a=i*Math.PI/4;layer.stamp(i&1?'impact-spark':'gold-charge-orb',n>>2,x+Math.cos(a)*n,y+Math.sin(a)*n);}};
   const line=(x,y,xx,yy,color)=>{const n=Math.ceil(Math.max(Math.abs(x-xx),Math.abs(y-yy)));for(let i=0;i<=n;i++)put(x+(xx-x)*i/(n||1),y+(yy-y)*i/(n||1),color);};
   if(b?.space)return;
   if(b?.arena)drawFriezaDebris(b.arena,layer,h.cameraX,h.cameraY);
   if(c&&['reveal','steal','depart','taunt','lift','explode','gold','eighth','victory','defeated','core-charge','core-shot','core-impact','trial-taunt','empower'].includes(c.kind)){
    let x=c.x+40-h.cameraX,y=c.y-40-h.cameraY;
    if(['reveal','steal','depart','core-charge','core-shot','core-impact','trial-taunt','empower'].includes(c.kind))y=Math.max(104,Math.min(160,y));
    if(['reveal','steal','depart'].includes(c.kind))y-=c.kind==='reveal'?Math.max(0,64-c.age*2):c.kind==='depart'?Math.min(150,c.age*4):0;
    if(!['eighth','defeated'].includes(c.kind))sprite(c.kind==='lift'||c.kind==='explode'||c.kind==='core-charge'||c.kind==='empower'?3:c.kind==='core-shot'?2:c.kind==='victory'?7:Math.floor(c.age/20)%2,x,y);
    if(c.kind==='core-charge'||c.kind==='core-shot'){
     // A large violet Death Ball forms overhead, then burrows down through
     // the floor. All pixels use the same native-resolution effect surface.
     const t=c.kind==='core-shot'?Math.min(1,c.age/80):0,size=c.kind==='core-charge'?Math.min(24,5+c.age/5):24;
     const ox=x-12,oy=y-58+Math.pow(t,1.8)*66;
     if(t<1){mod.kiArt?.draw('death',Math.floor(c.age/6)%6,ox,oy,size*2.8,put);
      for(let i=0;i<6;i++){const a=i*Math.PI/3+c.age*.08;layer.stamp('lightning',(c.age>>2)+i,ox+Math.cos(a)*(size+5),oy+Math.sin(a)*(size+5));}}
     if(t>.7)fx(ox,y+8,Math.min(40,(t-.7)*120));
    }
    if(c.kind==='core-impact'&&c.age<80){fx(x-12,y+8,Math.min(60,c.age+8));for(let i=0;i<5;i++)layer.stamp('lightning',(c.age>>2)+i,x-60+i*26,y+8-Math.abs(Math.sin(c.age*.1+i))*25);}
    if(c.kind==='empower'&&c.age<100){
     const dest=mod.entities().find(e=>e.index>=3&&e.active),tx=dest?dest.x-h.cameraX:x-50,ty=dest?dest.y-20-h.cameraY:y+10;
     for(let i=0;i<6;i++){
      const t=((c.age*2+i*13)%100)/100,px=x+(tx-x)*t,py=y-25+(ty-y+25)*t;
      layer.stamp('lightning',(c.age>>2)+i,px,py);ball(px,py,3,rgb(30,10,27));
     }
    }
    if(c.kind==='steal')for(let i=0;i<7;i++)if(s.stolenMask>>i&1){const t=Math.min(1,c.age/48),a=i*Math.PI*2/7;mod.kiArt?.draw('dragon',i,c.x-h.cameraX+(40+Math.cos(a)*18)*t,c.y-12-h.cameraY+(-42+Math.sin(a)*14)*t,11,put);}
    if(c.kind==='eighth')mod.kiArt?.draw('dragon',7,c.x-h.cameraX,c.y-36-h.cameraY,18,put);
    if(c.kind==='explode'&&c.age<48)fx(c.x+35-h.cameraX,c.y-60-h.cameraY,Math.min(28,c.age));
    if(c.kind==='gold'){
     for(let i=0;i<12;i++){const a=i*Math.PI/6;layer.stamp(i&1?'gold-arc':'lightning',c.age>>2,c.x-h.cameraX+Math.cos(a)*23,c.y-16-h.cameraY+Math.sin(a)*25);}
    }
    if(c.kind==='defeated'&&c.age<45)fx(x,y-16,Math.min(40,c.age));
   }
   if(s.stage!=='battle'||!b)return;
   const bx=b.x-h.cameraX,by=b.y+8-h.cameraY-Math.round(Math.sin(b.age*.08)*2),face=b.x<h.x;
   for(const p of b.afterimages??[])sprite(5,p.x-h.cameraX,p.y+8-h.cameraY,face,1+Math.floor(p.age/4));
   if(b.tier||b.surge){
    const t=b.surge?.age??b.age,scale=b.surge?1.7:1;
    for(let i=0;i<7;i++){
     const a=i*Math.PI*2/7+t*.13,rx=19*scale,ry=25*scale;
     if(b.surge||i%2===(t>>3)%2)layer.stamp('lightning',(t>>2)+i,bx+Math.cos(a)*rx,by-17+Math.sin(a)*ry);
    }
   }
   sprite(b.hurt?6:b.surge?4:b.dash?5:b.recoil?2:b.warning?.kind==='disc'?2:b.warning?3:b.tier?4:Math.floor(b.age/16)%2,bx+(b.recoil?(face?1:-1)*b.recoil*.3:0),by,face);
   if(b.surge){
    const age=b.surge.age;
    if(b.surge.kind==='frieza-cosmic'&&age>24&&age<72){
     const r=Math.min(29,(age-24)*.65);mod.kiArt?.draw('death',(age>>3)%6,bx,by-58,r*2.8,put);
     if(age>57)layer.giantBeam(h.screenX,h.screenY-14,0,-1,(age-57)*12,18,age,{taper:20});
    }
    return;
   }
   for(const q of b.hazards??[]){
    const x=q.x-h.cameraX,y=q.y-h.cameraY;
    if(q.age<q.wait){
     const r=q.radius*(1-.3*q.age/q.wait);
     for(let i=0;i<48;i++){const a=i*Math.PI/24;put(x+Math.cos(a)*r,y+Math.sin(a)*r*.55,rgb(29,4,18));}
     line(x-5,y,x+5,y,rgb(31,16,25));line(x,y-3,x,y+3,rgb(31,16,25));
    }else if(q.age<q.wait+16){
     const t=q.age-q.wait,width=Math.max(2,14-t*.6);
     for(let yy=y-100;yy<y;yy++)for(let xx=-width;xx<width;xx++)put(x+xx,yy,Math.abs(xx)<width*.5?rgb(31,24,29):rgb(24,3,22));
    }
   }
   for(const p of b.shots){
    if(p.kind==='disc'){
     p.trail.forEach((t,i)=>{if(i%2===0)for(let dx=-5;dx<=5;dx++)if((dx+i)%2===0)put(t.x-h.cameraX+dx,t.y-h.cameraY,rgb(25-i,9,22));});
     const x=p.x-h.cameraX,y=p.y-h.cameraY;
     const tilt=Math.sin(p.age*.28)*.28;
     for(let dy=-3;dy<=3;dy++)for(let dx=-12;dx<=12;dx++)if(dx*dx/144+dy*dy/9<=1)put(x+dx,y+dy+dx*tilt,Math.abs(dy)<2?rgb(31,31,20):rgb(31,4,22));
     if(p.age%4<2){put(x-14,y-14*tilt,rgb(31,28,30));put(x+14,y+14*tilt,rgb(31,28,30));}
    }else{
     const x=p.x-h.cameraX,y=p.y-h.cameraY;
     p.trail.forEach((t,i)=>{if(i%2===1)ball(t.x-h.cameraX,t.y-h.cameraY,Math.max(2,9-i),rgb(13-i,2,17-i));});
     mod.kiArt?.draw('death',(p.age>>3)%6,x,y,36,put);
     for(let i=0;i<3;i++){const a=p.age*.24+i*Math.PI*2/3;layer.stamp('lightning',(p.age>>2)+i,x+Math.cos(a)*13,y+Math.sin(a)*13);}
    }
   }
   if(b.warning){const w=b.warning,x=b.x-h.cameraX,y=b.y-24-h.cameraY;for(let i=0;i<8;i++){const a=i*Math.PI/4+w.age/15,r=26-w.age/w.wait*10;line(x+Math.cos(a)*r,y+Math.sin(a)*r,x+Math.cos(a)*(r+5),y+Math.sin(a)*(r+5),rgb(31,7,25));}if(w.kind==='orb')mod.kiArt?.draw('death',(w.age>>3)%6,x,y,12+w.age/w.wait*27,put);else line(x-16,y,x+16,y,rgb(31,30,23));}

  },
  get status(){return copy({...s,eligible:eligible(),hp:s.boss?.hp??null});},snapshot(){return copy(s);},restore(saved){
   s={...initial(),...copy(saved)};ruinsKey='';renderFrame=-1;
   if(saved&&saved.stolenMask===undefined&&s.stolen)s.stolenMask=mod.quest?.status.mask??0;
   if(saved&&saved.trialWon===undefined&&['showdown','battle','won','defeated'].includes(s.stage))s.trialWon=true;
   if(saved&&saved.crisis===undefined&&(s.stolen||s.permanent))s.crisis={...newCoreCrisis(),active:!mod.quest?.status.wished,flightNotified:true};
   const b=s.boss;
   if(b&&!b.orbital){
    b.orbital=true;
    if(b.tier>0&&b.surge?.kind!=='frieza-breach')b.muscular=true;
    // Older checkpoints ended phase three on the ground. Enter the new
    // orbital phase on its normal transition, without replaying the story.
    if(s.stage==='battle'&&b.tier>=2&&!b.space&&!b.surge){b.tier=1;b.hp=Math.min(b.hp,FRIEZA_HP/3);}
   }
   if(s.permanent)mod.options.superSaiyan=true;
  },
 };
 return api;
}
