import {friezaEvents as F} from './frieza-events.js';
import {FRIEZA_HP,homingStep,discContact,sweptDistance,pixelStep,rushStep,beamTouchesShot} from './frieza-combat.js';
import {deathBallTiming,friezaFlybyPose,deathBallFlybyPose} from './frieza-flyby.js';
import {newCoreCrisis,activateTwilight,crisisFlightMessages,deathBallAnnouncement,deathBallAftermath} from './frieza-crisis.js';
import {newFriezaArena,fractureFortress,tickFriezaArena,ruinMask,drawFriezaDebris,floorHole} from './frieza-arena.js';
import {newOrbit,ricochet,tickOrbit,steerOrbit} from './frieza-orbit.js';
import {cosmicBeat,collateralBeat,collateralStart,pullbackStart,cosmicDuration} from './frieza-cinematic.js';
import {aerialMeleePose} from './aerial-melee.js';
import {prepareFriezaSprite,drawFriezaSprite,friezaDeathBeamPose} from './frieza-sprite.js';
import {beginClash,tickClash,tapClash,victoryTiming} from './frieza-finale.js';
import {orbitHeading,orbitVector,orbitProjectile,orbitRush} from './orbit-pixels.js';
import {createOrbitEffects} from './orbit-effects.js';
import {orbitAim,orbitDefense,orbitAttackPattern,beginOrbitExchange,tickOrbitExchange} from './orbit-duel.js';
import {createBossVictoryAudio,bossVictoryCue,bossVictoryTiming} from './boss-victory.js';
import {createFriezaTreeView,treeTiming} from './frieza-tree-view.js';
import {createEmperorBeamView,installAltarCamera,introTiming} from './frieza-intro.js';
import {friezaScenePose,friezaDeathBallPose,templeFollowerPose,exteriorFollowerPose,coreTiming} from './frieza-staging.js';
import {installOrbitMenu,orbitMenuView} from './orbit-menu.js';
const copy=s=>s?structuredClone(s):null;
const initial=()=>({flyby:null,deckBall:false,stage:'dormant',tree:null,outdoorIntro:false,emperorKilled:false,trialWon:false,stolen:false,stolenMask:0,eighth:false,permanent:false,fallen:false,popoiMember:false,popoi:null,primmMember:false,primm:null,scene:null,boss:null,crisis:null,offered:false,lastMap:null,hinted:false,discHits:0,playerHits:0});
export function createFrieza(snes,mod){
 let s=initial(),atlas=null,fullAtlas=null,ruins=null,ruinsRevision=-1,ruinsX=NaN,ruinsY=NaN,renderFrame=-1,renderArena=false,cameraLine=-1,cameraX=0,cameraY=0,spellLayer=null,spellFx=null;
 const victoryAudio=createBossVictoryAudio(snes,mod,()=>s);
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
  return prepareFriezaSprite({pixels,width:c.width,frames});
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
  const previous=s.scene,clock=previous?.map===map()?(previous.clock??0)+previous.age:0;
  s.scene={kind:name,age:0,clock,map:map(),x:mod.read16(0xe002),y:mod.read16(0xe004)};
  if(previous?.map===map()&&previous.altar)s.scene.altar=copy(previous.altar);
  if(previous?.map===map()&&previous.court)s.scene.court=true;
 }
 function laugh(){mod.playSound?.('friezaLaugh');}
 let riderRoom={map:null,since:0};
 // The continent flyby: Frieza hovers above Goku's flight, the Death Ball
 // swells until it fills the sky, then he hurls it into the planet below
 // and flies back toward the Fortress. Screen-space, over the native Mode 7.
 function drawFlyby(layer){
  const t=deathBallTiming,a=s.flyby.age,put=(x,y,color)=>layer.pixel(x,y,color,true);
  if(spellLayer!==layer){spellLayer=layer;spellFx=createOrbitEffects(snes,mod,put);}
  const sprite=(frame,x,y)=>drawFriezaSprite(api.portraitAtlas,frame,x,y,put,{});
  const pose=friezaFlybyPose(a),ball=deathBallFlybyPose(a);
  // Behind Goku's flight sprite while it fills the sky; over him once thrown.
  layer.behindBody=a<deathBallTiming.throw;
  if(ball.visible)mod.kiArt?.draw('death',ball.frame,ball.x,ball.y,ball.size,put,{cinematic:true});
  layer.behindBody=false;
  if(pose.visible)sprite(pose.frame,pose.x,pose.y);
  if(a>=t.impact&&a<t.impact+120)for(const[i,at]of[[96,200],[80,186],[112,184],[96,170],[70,176],[122,168],[96,150]].entries()){
   const age=a-t.impact-i*10;if(age>=0&&age<74)spellFx.burst(at[0],at[1],age,{large:true});
  }
  if(a>=t.impact&&a<t.impact+8)for(let y=0;y<224;y+=2)for(let x=(y>>1)&1;x<256;x+=2)put(x,y,layer.rgb(31,31,31));
 }
 function burst(x,y,kind='impact'){
  if(s.boss?.space)(s.boss.space.hits??=[]).push({x:Math.round(x),y:Math.round(y),age:0});
  else mod.effects.push({kind,x,y,dx:1,dy:0,life:12,max:12,super:true});
  mod.playSound?.('impact');mod.feedback?.pulse(8);
 }
 function breakFloor(x,y,radius=18,loud=true){
  const b=s.boss;if(!b)return;
  b.arena??=newFriezaArena();
  fractureFortress(b.arena,x,y,radius,(x,y)=>mod.localFlightHook.canLand(x,y,b.terrain&128?1:0,b.terrain&3));
  if(loud){mod.playSound?.('fortressBreak');mod.feedback?.pulse(radius>30?14:6);}
 }
 function damagePlayer(amount){
  const b=s.boss;if(s.stage!=='battle'||!b||b.grace||mod.read8(0xe191)&0x80||!mod.read16(0xe182))return;
  if(!b.tier&&!b.space)amount=Math.ceil(amount/2);
  mod.write16(0xe1f1,Math.max(mod.read16(0xe1f1),amount));mod.write8(0xe1f0,0);mod.write8(0xe1ec,0);b.grace=48;s.playerHits++;burst(hero().x,hero().y);mod.playSound?.('friezaImpact');
 }
 function hurt(amount,disc=false){
  const b=s.boss;if(!b||s.stage!=='battle'||b.surge||b.space?.clash||b.space?.intro||b.guard)return 0;
  // Ground attacks already use Goku's damageScale. Orbital attacks have
  // their own values; apply the same training weight once, except when
  // Frieza is struck by his own returning disc.
  if(b.space&&!disc)amount*=mod.equipment?.powerScale??1;
  // Full beams are still devastating, but cannot erase an entire dramatic
  // phase before it appears. The two surges are earned HP thresholds.
  const floor=b.space?6000:(2-(b.tier??0))*FRIEZA_HP/3;
  const hit=Math.min(Math.max(0,b.hp-Math.max(0,floor)),Math.max(0,Math.floor(amount)));b.hp-=hit;b.hurt=10;
  if(disc){s.discHits++;b.stun=75;burst(b.x,b.y);if(!b.space)breakFloor(b.x,b.y+12,26);mod.playSound?.('friezaImpact');}
  else if(hit&&b.age-(b.lastImpact??-100)>18){b.lastImpact=b.age;burst(b.x,b.y);mod.playSound?.('friezaImpact');}
  if(b.hp<=0)win();
  return hit;
 }
 function evadeMelee(){
  const b=s.boss,h=hero();if(!b?.tier||b.stun||b.surge||b.space?.clash)return;
  const destinations=b.nodes.map((n,i)=>({n,i})).filter(({n})=>Math.hypot(n.x-b.x,n.y-b.y)>32);
  b.node=(destinations.length?destinations:b.nodes.map((n,i)=>({n,i}))).sort((a,c)=>Math.hypot(c.n.x-h.x,c.n.y-h.y)-Math.hypot(a.n.x-h.x,a.n.y-h.y))[0].i;
  b.warning=null;b.shots=[];b.dash=1;b.windup=0;b.guard=45;b.counter=true;b.hurt=0;b.meleeHits=0;mod.playSound?.('friezaRush');
 }
 function melee(amount){
  const b=s.boss,hit=hurt(amount);
  if(hit&&b.space?.teleport&&beginOrbitExchange(b.space,b))return hit;
  if(hit&&b.tier&&!b.stun){
   b.meleeHits=b.age-(b.lastMelee??-200)>120?1:(b.meleeHits??0)+1;b.lastMelee=b.age;
   if(b.meleeHits>=2){
    if(b.tier===1&&!b.space){
     // One clean hit is safe. Repeated rushes provoke a visible, committed
     // close-range counter; teleporting to his other side cannot cancel it.
     b.riposte={age:0};b.guard=42;b.dash=0;b.windup=0;b.warning=null;b.hurt=0;b.meleeHits=0;
     mod.playSound?.('charged');
    }else evadeMelee();
   }
  }
  return hit;
 }
 function win(){const b=s.boss;s.stage='won';b.hp=0;b.shots=[];b.warning=null;b.age=0;s.scene=null;mod.cancelCombat();victoryAudio.play('stop');}
 function returnToFortress(){
  const b=s.boss;b.space=null;Object.assign(b,b.ground);mod.cancelCombat();
  // The player may have left the deck while hovering over a blast hole.
  // Touch down on intact native floor, without rewriting a single map tile.
  const h=mod.status,layer=b.terrain&128?1:0,candidates=[];
  for(let dy=-128;dy<=128;dy+=8)for(let dx=-128;dx<=128;dx+=8){
   const x=h.x+dx,y=h.y+dy;
   if(mod.localFlightHook.canLand(x,y,layer,b.terrain&3)&&!floorHole(b.arena,x,y))candidates.push({x,y,d:dx*dx+dy*dy});
  }
  const at=candidates.sort((a,c)=>a.d-c.d)[0];
  if(at){mod.write16(0xe002,at.x);mod.write16(0xe004,at.y);mod.teleport.follow({...at,layer,terrain:b.terrain});}
  mod.localFlight=!at;mod.localLift=at?0:12;mod.flightTransition={kind:'landing',age:0};cue('return');
 }
 function enterOrbit(target){
  const b=s.boss;b.ground={x:b.x,y:b.y};b.space=newOrbit(target);b.x=202;b.y=57;
  b.nodes=[{x:202,y:57},{x:54,y:48},{x:208,y:148},{x:48,y:132}];b.node=0;b.shots=[];b.hazards=[];b.afterimages=[];
  mod.localFlight=false;mod.localLift=0;mod.cancelCombat();mod.playSound?.('flight');
 }
 function startBattle(){
  // Carry the last rendered court pose into combat. Starting at the first
  // patrol node used to teleport him sideways as the dialogue closed.
  const arrival=s.scene?.court?friezaScenePose(s.scene):null;
  s.stage='battle';s.scene=null;
  const h=hero(),terrain=mod.read8(0xe00b),nodes=[];
  for(const[dx,dy]of[[-60,-50],[60,-50],[60,30],[-60,30],[0,-30]]){
   const x=h.x+dx,y=h.y+dy;
   if(mod.localFlightHook.canLand(x,y+12,terrain&128?1:0,terrain&3))nodes.push({x,y});
  }
  if(!nodes.length)nodes.push({x:h.x,y:h.y-24});
  if(arrival)nodes.unshift({x:arrival.x,y:arrival.y-8});
  s.boss={x:nodes[0].x,y:nodes[0].y,nodes,node:0,hp:FRIEZA_HP,age:0,clock:90,cycle:0,stun:0,grace:60,hurt:0,warning:null,shots:[],terrain,tier:0,surge:null,arena:newFriezaArena(),afterimages:[],hazards:[],dash:0,orbital:true};
  mod.cancelCombat();mod.radio?.restore({firstFlight:true});
 }
 function attack(){
  const b=s.boss,h=hero(),enraged=b.tier>0,pattern=b.space?orbitAttackPattern:['orb','disc','laser'],kind=pattern[b.cycle++%pattern.length];
  b.warning={kind,age:0,wait:kind==='beam'?75:enraged?55:65,x:b.x,y:b.y,target:{...h}};
  // A native charge sprite gives time to fly clear before the deck erupts.
  if(b.tier&&!b.space&&b.cycle%3===0)b.hazards.push({x:h.x,y:h.y+12,age:0,wait:65,radius:28});
 }
 function fire(){
  const b=s.boss,w=b.warning,pointer=friezaDeathBeamPose(b),x=pointer?.finger.x??b.x,y=pointer?.finger.y??b.y-(b.space?5:24),angle=Math.atan2(w.target.y-y,w.target.x-x),enraged=b.tier>0;
  // Launch from the same moving hand that drew the charge, not the stale
  // world position where the warning started several dozen frames ago.
  if(b.space){
   const heading=orbitHeading(w.target.x-x,w.target.y-y);
   if(w.kind==='laser'||w.kind==='beam')b.shots.push({kind:w.kind,x,y,...orbitVector(heading),flip:pointer?.flip,age:0,trail:[]});
   else for(const offset of(w.kind==='disc'?[-2,2]:[0]))b.shots.push({kind:w.kind,x,y,heading:(heading+offset+16)&15,speed:4,age:0,trail:[]});
  }else if(w.kind==='laser')b.shots.push({kind:'laser',x,y,...orbitVector(orbitHeading(w.target.x-x,w.target.y-y)),flip:pointer.flip,age:0,trail:[]});
  else if(w.kind==='disc')for(const sign of(enraged?[-1,1]:[0]))b.shots.push({kind:'disc',x,y,angle:angle+sign*.85,speed:enraged?4:3,age:0,trail:[]});
  else for(const offset of(enraged?[-.45,0,.45]:[0]))b.shots.push({kind:'orb',x,y,angle:angle+offset,speed:enraged?4:3,age:0,trail:[]});
  // A clear recovery window after each volley is long enough to charge and
  // release the wave, including time spent first dodging the projectile.
  b.warning=null;b.clock=enraged?140:180;b.recoil=9;mod.playSound?.(w.kind==='beam'?'friezaBeam':w.kind==='laser'?'friezaLaser':w.kind==='disc'?'friezaDisc':'friezaOrb');
  mod.feedback?.pulse(w.kind==='orb'?4:2);
  if(b.cycle===2||b.cycle===8)laugh();
 }
 function counterShot(shot){
  if(!mod.effects.some(e=>e.kind==='beam'&&e.life>0&&beamTouchesShot(e,mod.beamGeometry(e),shot)))return false;
  shot.age=999;mod.effects.push({kind:'impact',x:shot.x,y:shot.y,life:10,max:10,dx:1,dy:0,super:true});mod.playSound?.('deflect');return true;
 }
 // This arena reserves BG2 for Dark Lich's dynamically streamed body.
 // With that boss absent it retains unrelated VRAM. Frieza uses OBJ pixels;
 // show the complete native BG1 floor and BG3 windows without the old boss
 // plane. Never change the PPU registers or affect other maps/menus.
 const treeView=createFriezaTreeView(snes,mod,()=>s.scene,()=>atlas);
 const emperorView=createEmperorBeamView(snes,mod,()=>s.scene);
 const altarCamera=installAltarCamera(snes,mod,()=>s.scene);
 installOrbitMenu(snes,mod,()=>api.orbit);
 const color=snes.ppu.getColor;
 snes.ppu.getColor=function(sub,x,y){
  if(renderFrame!==mod.frame){renderFrame=mod.frame;renderArena=api.ownsArena();cameraLine=-1;}
  if(!renderArena||this.mode!==1)return emperorView.color(this,sub,x,y,treeView.color(this,sub,x,y,color.call(this,sub,x,y)));
  const screens=sub?this.subScreenEnabled:this.mainScreenEnabled,old=screens[1];screens[1]=false;
  let result;try{result=color.call(this,sub,x,y);}finally{screens[1]=old;}
  // Floor-only scars cannot cover Goku, native windows, or room walls.
  if(!sub&&result[1]===0&&y<224&&s.boss?.arena){
   // Actor screen coordinates include lift and can be one movement update
   // behind the background. Use the tile stream's origin and this scanline's
   // actual BG1 fine scroll, including native quake, instead.
   if(cameraLine!==y){
    cameraLine=y;const x0=mod.read16(0xa8),y0=mod.read16(0xaa);
    cameraX=x0+((this.bgHoff[0]-x0+8)&15)-8;cameraY=y0+((this.bgVoff[0]-y0+8)&15)-8;
    const a=s.boss.arena;if(a.revision!==ruinsRevision||cameraX!==ruinsX||cameraY!==ruinsY){ruinsRevision=a.revision;ruinsX=cameraX;ruinsY=cameraY;ruins=ruinMask(a,cameraX,cameraY);}
   }
   const value=ruins?.[y*256+x];
   if(value){const wx=x+cameraX,wy=y+cameraY,t=s.boss.age;
    if(value===1){const cloud=(Math.floor(wx/9)+Math.floor(wy/6)+Math.floor(t/24))%3;result[0]=(2+cloud)|(1<<5)|((5+cloud)<<10);if((wx*37+wy*19)%211===0)result[0]=0x316b;}
    else result[0]=value===2?0x0842:(wx+wy)%11===0?0x3296:0x31a8;
   }
  }
  return result;
 };
 const api={
  ready,get pendingEntrance(){return pendingEntrance();},get eligible(){return eligible();},get active(){return s.stage!=='dormant';},get crisisActive(){return !!s.crisis?.active;},get unresolved(){return s.stolen;},get eighth(){return s.eighth;},get permanent(){return s.permanent;},get fallen(){return s.fallen;},get popoiMember(){return s.popoiMember;},get trial(){return s.stage==='trial';},get fighting(){return s.stage==='battle'||s.stage==='won';},
  get pendingTrial(){return on()&&s.stolen&&s.tree==='complete'&&!s.trialWon&&s.stage==='hunt';},
  get encounter(){return on()&&map()===246&&s.stage==='battle'&&!s.boss?.surge&&!s.boss?.space?.intro?`frieza:${s.boss?.tier??0}`:null;},
  repairCore(){if(s.crisis){s.crisis.active=false;s.crisis.resolved=true;}},
  ownsArena(){return on()&&api.active&&!api.trial&&map()===246;},
  floorHole(x,y,layer){const b=s.boss;return !!(api.ownsArena()&&!b?.space&&b?.arena&&(b.terrain&128?1:0)===layer&&floorHole(b.arena,x,y));},
  get orbit(){return on()&&map()===246?s.boss?.space??null:null;},
  get portraitAtlas(){return s.boss?.muscular&&fullAtlas?fullAtlas:atlas;},
  get needsTree(){return s.stolen&&s.stage!=='palace'&&s.tree!=='complete';},
  get palace(){return on()&&s.stage==='palace';},
  get treeScene(){return on()&&s.scene?.map===map()&&s.scene.kind.startsWith('tree-');},
  get approachingAltar(){return on()&&s.scene?.map===map()&&s.scene.kind==='altar-approach';},
  get introHero(){
   if(!on()||mod.worldFlight)return null;
   const c=s.scene?.map===map()?s.scene:null;if(!c)return null;
   if(c.kind==='temple-exit')return templeFollowerPose(c,mod.status,mod.options.superSaiyan);
   if(map()===195&&(c.kind.startsWith('core-')||['depart','eighth'].includes(c.kind)))return exteriorFollowerPose(c,mod.options.superSaiyan);
   return null;
  },
  get orbitMenu(){const o=api.orbit;return o&&mod.nativeField&&(mod.read8(0xec)&12)?orbitMenuView(o.hero):null;},
  get exteriorScene(){return on()&&map()===195&&(s.outdoorIntro||s.stage==='theft'||s.scene?.kind==='eighth');},
  get emperorPresent(){return on()&&!s.emperorKilled&&(s.stage==='theft'||s.scene?.kind==='emperor-wait');},
  get music(){if(!on())return null;if(s.stage==='won')return s.boss?.space?.clash.age<victoryTiming.impact+bossVictoryTiming.white?'orbit':null;return s.boss?.space&&s.stage==='battle'?'orbit':s.stage==='battle'||s.scene?.kind==='gold'?'battle':['theft','showdown'].includes(s.stage)||s.scene?.kind==='eighth'||s.scene?.kind?.startsWith('tree-')&&s.scene.kind!=='tree-leave'?'arrival':null;},
  get returnScene(){return on()&&map()===246&&s.scene?.kind==='return'?s.scene:null;},
  get stolenMask(){return s.stolen?s.stolenMask:0;},
  get cinematic(){const c=s.boss?.surge;return on()&&map()===246&&c?.kind==='frieza-cosmic'&&c.age>=collateralStart&&c.age<cosmicDuration?c:null;},
  get inputLocked(){return on()&&map()===246&&(!!s.boss?.surge||s.stage==='won')&&!mod.read8(0xd0)&&!(mod.read8(0xec)&0xfe);},
  get chargeSound(){if(!on())return 0;const c=s.scene?.map===map()?s.scene:null;if(c)return ['core-charge','tree-charge'].includes(c.kind)?.3+.65*Math.min(1,c.age/(c.kind==='tree-charge'?88:144)):c.kind==='empower'&&c.age<140?.7:0;if(map()!==246||s.stage!=='battle'||!mod.nativeField||mod.read8(0xec)&0xfe||mod.read8(0xe191)&128)return 0;const surge=s.boss?.surge,clash=s.boss?.space?.clash;if(surge)return surge.kind==='frieza-breach'&&surge.age>=220&&surge.age<270?.8:0;if(clash)return ['gather','charge','launch','struggle'].includes(clash.phase)?.8:0;return ['orb','beam'].includes(s.boss?.warning?.kind)?.5:0;},
  onEvent(id){
   if(id===F.trial){s.stage='trial';mod.cancelCombat();mod.localFlight=false;mod.localLift=0;cue('trial-entry');s.scene.court=true;}
   if(id===F.trialReady){cue('trial-taunt');laugh();}
   if(id===F.empower){cue('empower');const e=mod.entities().find(e=>e.active&&e.species===0xbf);if(e)s.scene.target={x:e.x,y:e.y-16};mod.playSound?.('powerBurst');mod.feedback?.pulse(14);}
   if(id===F.trialLeave){cue('trial-leave');mod.playSound?.('flight');}
   if(id===F.trialFade){
    // C0:8B16's ordinary 60-frame fade. Finish it before CF4E exposes
    // Dark Lich's head; the following door loads his streamed body in black.
    mod.write8(0xe7,0);mod.write8(0xe4,1);mod.write8(0xe5,4);mod.write8(0xe2,mod.read8(0xe2)|1);
   }
   if(id===F.afterTrial){s.trialWon=true;s.stage='hunt';s.scene=null;}
   if(id===F.offer)s.offered=true;
   if(id===F.theft){if(!pendingEntrance())return;s.stage='theft';mod.cancelCombat();mod.localFlight=false;mod.localLift=0;cue('waiting');}
   if(id===F.emperorPrelude){mod.cancelCombat();mod.localFlight=false;mod.localLift=0;cue('emperor-wait');}
   if(id===F.sceneClear)s.scene=null;
   // Frieza leaves the altar with the Balls; Hexas and Mech Rider III still
   // stand between Goku and the Fortress. The Death Ball waits for its deck.
   if(id===F.palace){s.stage='palace';cue('altar-leave');mod.playSound?.('flight');}
   if(id===F.deckDeathBall){s.stage='theft';s.deckBall=true;mod.cancelCombat();mod.localFlight=false;mod.localLift=0;cue('waiting');}
   if(id===F.templeExit){s.outdoorIntro=true;cue('temple-exit');mod.playSound?.('flight');}
   if(id===F.coreArrival){s.outdoorIntro=true;if(s.scene?.kind!=='core-arrival')cue('core-arrival');mod.playSound?.('flight');}
   if(id===F.fanhaFinish){cue('fanha-finish');const e=mod.entities().find(e=>e.active&&e.species===111);if(e)s.scene.target={x:e.x,y:e.y};mod.playSound?.('friezaLaser');}
   if(id===F.emperorShot){cue('emperor-shot');const e=mod.entities().find(e=>e.active&&e.species===176);if(e)Object.assign(s.scene,{target:{x:e.x,y:e.y},base:e.base});mod.playSound?.('friezaLaser');}
   if(id===F.emperorFall){const old=s.scene;cue('emperor-fall');Object.assign(s.scene,{target:old?.target,base:old?.base});s.emperorKilled=true;mod.write8(0xcf44,Math.max(3,mod.read8(0xcf44)));}
   if(id===F.treeArrival){s.tree='confrontation';mod.cancelCombat();mod.localFlight=false;mod.localLift=0;cue('tree-arrival');mod.playSound?.('flight');}
   if(id===F.treeCharge)cue('tree-charge');
   if(id===F.treeShot){s.tree='attack';cue('tree-shot');mod.playSound?.('friezaOrb');}
   if(id===F.treeImpact){cue('tree-impact');mod.playSound?.('powerBurst');}
   if(id===F.treeLeave){cue('tree-leave');mod.playSound?.('flight');}
   if(id===F.treeReturn)cue('tree-return');
   if(id===F.treeWake)cue('tree-wake');
   if(id===F.treeDone){s.tree='complete';s.scene=null;}
   if(id===F.reveal){cue('reveal');if(map()===431)s.scene.altar={x:228,y:132,cameraX:mod.read16(0xa8),cameraY:mod.read16(0xaa)};mod.playSound?.('flight');}
   if(id===F.altarApproach)cue('altar-approach');
   if(id===F.steal){s.stolen=true;s.stolenMask=mod.quest?.status.mask??0;cue('steal');mod.playSound?.('charged');}
   if(id===F.coreCharge)cue('core-charge');
   if(id===F.coreShot){cue('core-shot');mod.playSound?.('friezaOrb');}
   if(id===F.coreImpact){s.crisis=newCoreCrisis();cue('core-impact');mod.playSound?.('fortressBreak');}
   if(id===F.escape){activateTwilight(snes.ram);s.stage='hunt';cue('core-escape');mod.playSound?.('flight');if(s.deckBall){s.deckBall=false;s.flyby={age:0,started:false};}}
   if(id===F.leave){s.tree='pursuit';cue('depart');mod.playSound?.('flight');}
   if(id===F.eighth){s.eighth=true;s.stage='hunt';cue('eighth');mod.playSound?.('charged');}
   if(id===F.showdown){s.stage='showdown';s.permanent=false;s.fallen=false;mod.cancelCombat();if(mod.options.superSaiyan)mod.playSound?.('revert');mod.options.superSaiyan=false;s.primmMember=!!(snes.ram[0xe200]&1);s.primm=s.primmMember?Array.from(snes.ram.slice(0xe200,0xe400)):null;s.popoiMember=!!(snes.ram[0xe400]&1);s.popoi=Array.from(snes.ram.slice(0xe400,0xe600));if(!s.popoiMember){
     // An unrecruited Popoi has no actor graphics descriptor yet. Mirror
     // C1:DFD3's descriptor setup before native ADD_CHARACTER animates him.
     snes.ram.set(snes.cart.data.slice(0x100820,0x100830),0xe470);
     mod.write16(0xe465,mod.read16(0xe477));mod.write16(0xe480,(mod.read16(0xe470)&0x3ff)<<6);mod.write8(0xe482,0xd5+((mod.read8(0xe471)>>2)&7));
    }cue('taunt');s.scene.court=true;mod.localFlight=false;mod.localLift=0;laugh();}
   if(id===F.lift){cue('lift');s.scene.lift={x:mod.read16(0xe402),y:mod.read16(0xe404)};mod.playSound?.('charged');}
   if(id===F.explode){const target={x:mod.read16(0xe402),y:mod.read16(0xe404)-mod.read8(0xe445)-12};s.fallen=true;cue('explode');s.scene.target=target;mod.playSound?.('powerBurst');mod.feedback?.pulse(18);}
   if(id===F.gold){s.permanent=true;mod.options.superSaiyan=true;mod.powerIntro?.restore({flight:true,superShown:true});cue('gold');mod.playSound?.('transform');}
   if(id===F.battle)startBattle();
   if(id===F.victory){if(s.boss?.space)returnToFortress();s.scene=null;}
   if(id===F.defeated){s.stage='defeated';s.stolen=false;s.scene=null;mod.quest?.recover?.();}
   if(id===F.revive){
    s.fallen=false;s.eighth=false;
    if(s.primmMember&&s.primm){
     snes.ram.set(s.primm.slice(0x180),0xe380);mod.write8(0xe390,0);mod.write8(0xe391,0);mod.write16(0xe382,mod.read16(0xe384));
    }
    if(s.popoiMember&&s.popoi){
     // Native ADD_CHARACTER owns membership/graphics. Restore earned stats,
     // equipment and magic, then put Popoi beside the actual party.
     snes.ram.set(s.popoi.slice(0x180),0xe580);mod.write8(0xe590,0);mod.write8(0xe591,0);mod.write16(0xe582,mod.read16(0xe584));
    }
   }
  },
  entity(){const b=s.boss;if(!on()||map()!==246||s.stage!=='battle'||!b?.hp)return null;const h=mod.status;return{index:12,base:0,custom:'frieza',species:121,active:true,hp:b.hp,maxHp:FRIEZA_HP,x:b.x,y:b.y+12,screenX:b.x-h.cameraX,screenY:b.y+12-h.cameraY,terrain:b.terrain};},
  hit(enemy,amount){const before=s.boss?.hp??0,damage=(mod.action?.kind==='punch'?melee:hurt)(amount*(s.boss?.stun ? .65 : .15));return{index:enemy.index,species:enemy.species,before,after:before-damage};},
  spaceInput(input){
   const b=s.boss,o=api.orbit;if(!o)return false;
   // Original rings/items still pause the fight and own their normal input.
   if(mod.read8(0xd0)||mod.read8(0xec)&0xfe||!mod.nativeField){o.menuRequest=0;o.charge=0;mod.charging=false;mod.focus(0);return false;}
   // A quick ring tap during native hit recovery used to disappear. Keep
   // that request until the actor can open the real menu, then pass one
   // normal controller pulse. Do not let an attack consume it first.
   if(input&2&&!(mod.lastInput&2))o.menuRequest=90;
   if(o.menuRequest){
    o.menuRequest--;o.charge=0;mod.charging=false;mod.focus(0);
    mod.snes.joypad1State=mod.canAttack?2:0;
    return !mod.canAttack;
   }
   if(input&2)return false;
   if(s.stage!=='battle'||!mod.read16(0xe182)||mod.read8(0xe191)&128||o.intro)return true;
   const wave=!!(input&0x400)&&!!(input&(1<<17)),tap=input&~mod.lastInput;
   const focus=!!(input&0x400)&&!(input&(1|(1<<17)|0x900));
   const direction=()=>orbitAim(o);
   const c=o.clash;
   if(o.duel)return true;
   if(c){
    // This is Goku's scripted counter. The scene charges and releases it;
    // input only owns the tug-of-war once the two beams have met.
    mod.charging=c.phase==='charge';mod.charge=o.charge;
    mod.action=mod.charging?{kind:'charge',age:o.charge,duration:999,super:true,facing:mod.facing}:null;
    if((tap&(1|(1<<17)))&&tapClash(c)){mod.playSound?.('hit');mod.feedback?.pulse(2);}
    return true;
   }
   if(!focus&&!o.beam&&!o.punch&&!(input&1))steerOrbit(o,input);
   if(wave&&!o.beam){o.charge=Math.min(45,o.charge+1);if(o.charge===45&&mod.charge<45)mod.playSound?.('charged');}
   else if(o.charge){
    const strength=o.charge/45,dir=direction();
    o.beam={...o.hero,...dir,age:0,max:strength===1?60:30,width:8+strength*24,damage:400+strength*500};mod.playSound?.('beam');mod.feedback?.pulse(18);
    o.charge=0;
   }
   mod.charging=wave&&!o.beam;mod.charge=o.charge;
   if(mod.charging){mod.powerCharge=0;mod.action={kind:'charge',age:o.charge,duration:999,super:true,facing:mod.facing};}
   else{
    if(mod.action?.kind!=='focus')mod.action=null;
    mod.focus(focus&&!o.beam?0x400:0);
    if(mod.action?.kind==='focus')mod.action.age++;
   }
   // The released wave is anchored at his hands until its tail fades. A
   // teleport or melee input during that shot must not detach the fighter.
   if(c||o.beam)return true;
   if((input&0x401)===0x401&&(tap&1)){o.hero.x=Math.max(14,Math.min(242,b.x-22));o.hero.y=Math.max(20,Math.min(184,b.y));o.heading=0;o.teleport=18;mod.playSound?.('teleport');}
   else if(input&1&&!(input&0x400)&&!o.cooldown){o.cooldown=8;o.punch=8;mod.playSound?.('swing');if(Math.hypot(b.x-o.hero.x,b.y-o.hero.y)<32){melee(550);mod.playSound?.('friezaImpact');}}
   if(input&(1<<17)&&!(input&0x400)&&!o.cooldown&&!o.beam){o.cooldown=6;o.shots.push({...o.hero,...direction(),age:0});mod.playSound?.('blast');}
   return true;
  },
  tick(){
   if(!on())return;
   const here=map();if(s.lastMap!==here){s.lastMap=here;s.offered=false;if(s.scene?.map!==here&&s.scene?.kind!=='tree-return')s.scene=null;}
   // Map IDs change before the old picture fades out. Prime the cliff only
   // while its loader is blank, so Goku is already there as it fades in.
   if(here===236&&api.needsTree&&!s.scene&&snes.ppu.forcedBlank)cue('tree-establish');
   if(here===195&&s.outdoorIntro&&!s.scene&&snes.ppu.forcedBlank)cue('core-arrival');
   if(s.outdoorIntro&&mod.worldFlight)s.outdoorIntro=false;
   if(s.permanent&&!mod.ending?.nativeBoy&&!mod.ending?.defeated)mod.options.superSaiyan=!mod.ending?.relaxed;
   if(s.flyby){
    const f=s.flyby;
    // 1F04's flyby runs while $8C is set; Frieza owns its sky until it ends.
    if(mod.worldFlight&&snes.ram[0x8c])f.started=true;
    if(f.started){
     f.age++;
     if(f.age===deathBallTiming.arrive)laugh();
     if(f.age===deathBallTiming.grow)mod.playSound?.('charged');
     if(f.age===deathBallTiming.throw)mod.playSound?.('friezaOrb');
     if(f.age===deathBallTiming.impact){s.crisis={...newCoreCrisis(),deathBall:true};mod.playSound?.('fortressBreak');mod.feedback?.pulse(24);}
     if(f.age===deathBallTiming.impact+40){mod.playSound?.('powerBurst');laugh();}
     if(f.age===deathBallTiming.announce)mod.radio?.interrupt(deathBallAnnouncement,{kind:'story',frames:220});
     if(f.age>=deathBallTiming.done&&!snes.ram[0x8c]){
      if(!s.crisis)s.crisis={...newCoreCrisis(),deathBall:true};
      s.eighth=true;s.tree='pursuit';s.flyby=null;
     }
    }
   }
   if(s.crisis?.active&&!s.crisis.flightNotified&&mod.worldFlight&&!snes.ram[0x8c]&&!(snes.ram[0xfe]&0xc0)&&!snes.ppu.forcedBlank){
    // 1F04 ends its sinking-continent flyby in the overhead view. Ask the
    // native C0:8779 camera transition for a rear view, so Kai's sky warning
    // arrives over the changed horizon. Do not touch matrices/HDMA/VRAM.
    if(snes.ram[0xf2]&0x80){if(!s.crisis.rearCamera){s.crisis.rearCamera=true;snes.ram[0xf8]=0x90;snes.ram[0xcc]|=0x10;}}
    else if(!(snes.ram[0xf2]&3)){s.crisis.flightNotified=true;mod.radio?.interrupt(s.crisis.deathBall?deathBallAftermath:crisisFlightMessages,{kind:'core-crisis',frames:300});}
   }
   if(eligible()&&!s.hinted){s.hinted=true;mod.radio?.say('DRYAD:Come to the Tree\nPalace. I sense something\nfollowing your ki.',{kind:'quest'});}
   if(pendingEntrance()&&here===431&&!s.emperorKilled&&mod.read8(0xcf44)>=2&&Math.hypot(hero().x-232,hero().y-200)<90&&mod.canAttack)mod.story.request(F.emperorRoom);
   // The retail room only starts its old boss on one floor marker, which
   // flight can skip. Frieza greets Goku on entering after Hexas instead.
   if(pendingEntrance()&&here===419&&s.emperorKilled&&mod.read8(0xcf44)>=6&&mod.canAttack)mod.story.request(F.offer);
   // Rider III's native trigger is one floor marker; flight can skip it.
   // Give the native floor trigger the first chance; only a hero who flew
   // past it, still idle after 45 frames in the room, gets the request.
   if(here!==riderRoom.map)riderRoom={map:here,since:mod.frame};
   if(on()&&s.stage==='palace'&&here===419&&mod.read8(0xcf44)===6&&mod.canAttack&&!mod.read8(0xd0)&&mod.frame-riderRoom.since>45&&mod.story.status.queued===null)mod.story.request(0x4a3);
   if(s.scene){
    const c=s.scene;c.age++;
    if(c.kind==='tree-arrival'&&c.age===treeTiming.arrival+8)laugh();
    if(c.kind==='reveal'&&c.age===(c.altar?introTiming.pan:104))laugh();
    if(c.kind==='emperor-shot'&&c.age===introTiming.hit)mod.playSound?.('friezaImpact');
    if(c.kind==='core-impact'&&c.age===coreTiming.eruption){mod.feedback?.pulse(24);mod.playSound?.('powerBurst');}
    if(c.kind==='temple-exit'&&c.age===48)mod.playSound?.('flight');
    // He flies off the top of the altar room alone; Goku stays behind.
    if(c.kind==='altar-leave'&&c.age>=130)s.scene=null;
    if(c.kind==='emperor-fall'&&c.age>=12&&c.base&&snes.ram[c.base+0x180]===176)snes.ram[c.base]&=~1;
    if(c.kind==='lift'&&snes.ram[0xe400]&1){
     const t=Math.min(1,c.age/48),from=c.lift??{x:c.x-40,y:c.y+24};
     mod.write16(0xe402,Math.round(from.x+(c.x-40-from.x)*t));mod.write16(0xe404,Math.round(from.y+(c.y+24-from.y)*t));mod.write8(0xe445,Math.min(44,Math.floor(c.age*.6)));
    }
    if(c.kind==='gold'&&c.age===28){mod.feedback?.pulse(16);mod.playSound?.('powerBurst');}
    if(['eighth','defeated'].includes(c.kind)&&mod.canAttack)s.scene=null;
   }
   if(s.stage==='won'&&here===246&&mod.canAttack){
    // Keep the visual beat behind actual SPC dispatch, including each
    // explosion. The pouch cannot outrun queued sounds on a busy frame.
    if(victoryAudio.pending)return;
    const b=s.boss;b.age++;if(b.arena)tickFriezaArena(b.arena);
    if(b.space){
     const o=b.space;o.age++;o.clash.age++;
     const age=o.clash.age;
     if(age===victoryTiming.impact)mod.feedback?.pulse(18);
     const deathAge=age-victoryTiming.impact;
     const cue=bossVictoryCue(deathAge);if(cue)victoryAudio.play(cue);
     if(age===victoryTiming.acquire)victoryAudio.play('acquire');
     if(age===victoryTiming.jingle)victoryAudio.play('jingle');
     if(age===victoryTiming.descent)mod.playSound?.('flight');
     if(age>=victoryTiming.return)returnToFortress();
    }
    if(b.age>=victoryTiming.landed)mod.story.request(F.victory);return;
   }
   if(s.stage!=='battle'||here!==246||!s.boss)return;
   // Menus pause this battle; spell/hit messages do not stop its projectiles.
   if(!mod.nativeField||mod.read8(0xd0)||mod.read8(0xec)&0xfe||snes.ppu.forcedBlank||!mod.read16(0xe182)||mod.read8(0xe191)&0x80)return;
   const b=s.boss,h=hero();b.age++;if(b.grace)b.grace--;if(b.hurt)b.hurt--;if(b.recoil)b.recoil--;if(b.guard)b.guard--;
   b.arena??=newFriezaArena();b.afterimages??=[];b.hazards??=[];b.tier??=0;tickFriezaArena(b.arena);
   b.afterimages=b.afterimages.filter(p=>++p.age<16);
   if(!b.surge&&b.tier<2&&b.hp<=(2-b.tier)*FRIEZA_HP/3){
    // A threshold ends the phase, not the shot that earned it. Keep the full
    // beam and its fade on screen before cancelCombat begins the cutscene.
    // Frieza reels here instead of counterattacking through the final hit.
    if(mod.effects.some(e=>e.kind==='beam'&&e.life>0)){b.shots=[];b.warning=null;b.hazards=[];return;}
    b.tier++;b.shots=[];b.warning=null;b.hazards=[];b.stun=0;b.riposte=null;
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
    if(c.kind==='frieza-cosmic'){
     const beat=collateralBeat(c.age);if(beat&&beat.age===beat.shot.hit-12)mod.playSound?.('friezaLaser');if(beat&&beat.age===beat.shot.hit)mod.playSound?.('fortressBreak');
     const air=cosmicBeat(c.age);
     if(air?.shot.kind==='aerial'){
      const pose=aerialMeleePose(air.shot,air.age);
      if(pose.teleport)mod.playSound?.('teleport');
      if(pose.hit){mod.playSound?.('friezaImpact');mod.feedback?.pulse(5);}
      if(pose.explode){mod.playSound?.('powerBurst');mod.feedback?.burst();}
      if(air.age===air.shot.impact+18)mod.playSound?.('fortressBreak');
     }
     if(c.age===pullbackStart+60)mod.playSound?.('beam');
    }
    if(c.age>=(c.kind==='frieza-cosmic'?cosmicDuration:380)){if(c.kind==='frieza-cosmic')enterOrbit(c.target);b.surge=null;b.clock=150;b.grace=60;if(!b.space)evadeMelee();mod.cancelInput();}
    return;
   }
   const firing=b.shots.some(p=>p.kind==='laser'&&p.age<16);let evading=false;
   if(b.space){
    const o=b.space;
    evading=!firing&&orbitDefense(o,b);
    tickOrbit(o,b,{hurt,damage:damagePlayer,sound:mod.playSound,shake:n=>mod.feedback?.pulse(n)});
    if(o.intro)return;
    if(tickOrbitExchange(o,b,{hurt,sound:mod.playSound,shake:n=>mod.feedback?.pulse(n)}))return;
    if(b.hp<=6000&&!o.clash){
     if(o.beam){b.shots=[];b.warning=null;return;}
     beginClash(o,b);b.evade=null;
     mod.cancelCombat();mod.radio?.restore({firstFlight:true});mod.playSound?.('charged');
    }
    if(o.clash){
     if(tickClash(o,b,{sound:mod.playSound,shake:n=>mod.feedback?.pulse(n),damage:damagePlayer,cancel:()=>mod.cancelCombat()}))win();
     return;
    }
   }
   if(b.riposte){
    const age=++b.riposte.age;
    if(age===18){
     if(Math.hypot(h.x-b.x,h.y-b.y)<48){damagePlayer(280);mod.cancelCombat();}
     burst(b.x,b.y);mod.playSound?.('friezaImpact');
    }
    if(age>=30){b.riposte=null;evadeMelee();}
   }else if(b.stun)b.stun--;
   else if(!evading&&!firing){
    // He holds his ground to steer the discs. This gives players a readable
    // anchor to circle behind instead of moving their counter target away.
    const steering=b.shots.some(p=>p.kind==='disc'&&p.age<260);
    if(!steering&&!b.warning&&!b.dash&&!b.windup&&b.age%105===0){b.node=(b.node+1)%b.nodes.length;b.windup=6;}
    if(b.windup&&!--b.windup){b.dash=1;mod.playSound?.('friezaRush');}
    if(b.dash&&!steering&&!b.warning){if(b.dash%3===1)b.afterimages.push({x:b.x,y:b.y,age:0});(b.space?orbitRush:rushStep)(b);if(!b.dash&&b.counter){b.counter=false;b.warning={kind:'laser',age:0,wait:70,x:b.x,y:b.y,target:{...h}};}}
    if(b.warning){if(++b.warning.age>=b.warning.wait)fire();}
    else if(!b.dash&&!b.windup&&--b.clock<=0&&(b.tier||!b.shots.length))attack();
   }
   for(const shot of b.shots){
    // A beam can counter a Death Ball earlier in this same tick. The
    // removed projectile must never run its old collision a second time.
    if(shot.age>=330)continue;
    shot.previousX=shot.x;shot.previousY=shot.y;shot.trail.unshift({x:shot.x,y:shot.y});if(shot.trail.length>8)shot.trail.pop();
    if(shot.kind==='beam'){
     shot.age++;const length=Math.min(360,shot.age*30),width=12*Math.min(1,shot.age/6,(42-shot.age)/8);
     if(shot.age%6===0&&width>0&&sweptDistance(h.x,h.y,shot.x,shot.y,shot.x+shot.dx*length,shot.y+shot.dy*length)<width+4)damagePlayer(180);
     if(shot.age>=42)shot.age=999;
    }else if(shot.kind==='laser'){
     shot.age++;if(shot.age===1&&sweptDistance(h.x,h.y,shot.x,shot.y,shot.x+shot.dx*360,shot.y+shot.dy*360)<8)damagePlayer(170);
     if(shot.age>=16)shot.age=999;
    }else if(shot.kind==='disc'){
     if(b.space)orbitProjectile(shot,h);else homingStep(shot,h,b.hp<FRIEZA_HP/2?.038:.032);
     if(!b.space&&counterShot(shot))continue;
     const hit=discContact(shot,h,b);if(hit==='frieza'){shot.age=999;hurt(12000,true);}else if(hit==='goku'){shot.age=999;damagePlayer(230);}
    }else{
     if(b.space)orbitProjectile(shot);else{shot.age++;pixelStep(shot,Math.cos(shot.angle),Math.sin(shot.angle),shot.speed);}
     if(!b.space&&counterShot(shot))continue;
     const hit=sweptDistance(h.x,h.y,shot.previousX,shot.previousY,shot.x,shot.y)<20;
     const camera=b.space?{cameraX:0,cameraY:0}:mod.status;
     const out=shot.age>15&&(shot.x<camera.cameraX+8||shot.x>camera.cameraX+248||shot.y<camera.cameraY+8||shot.y>camera.cameraY+205);
     if(hit||out){shot.age=999;if(b.space){if(out){const v=orbitVector(shot.heading);ricochet(b.space,shot.x,shot.y,v.dx,v.dy,'frieza');}}else breakFloor(shot.x,shot.y+12,hit?20:28);if(hit)damagePlayer(310);}
    }
   }
   for(const hazard of b.hazards){hazard.age++;if(hazard.age===hazard.wait){breakFloor(hazard.x,hazard.y,32);if(Math.hypot(h.x-hazard.x,h.y+12-hazard.y)<hazard.radius)damagePlayer(280);}}
   b.hazards=b.hazards.filter(v=>v.age<v.wait+24);
   b.shots=b.shots.filter(v=>v.age<330);if(b.shots.length>12)b.shots.splice(0,b.shots.length-12);
  },
  hideOwner(owner){return (api.orbit&&mod.nativeField||api.introHero)&&owner?.base===0xe000&&owner.kind!=='portrait'||api.exteriorScene&&owner?.native?.species===0xa0||api.ownsArena()&&owner?.base>=0xe600||s.fallen&&owner?.base===0xe400;},
  draw(layer){
   if(on()&&s.flyby?.started&&mod.worldFlight&&atlas){drawFlyby(layer);return;}
   if(!on()||mod.worldFlight||snes.ppu.mode!==1||!atlas)return;
   const h=mod.status,c=s.scene?.map===map()?s.scene:null,b=map()===246?s.boss:null;
   const put=(x,y,color)=>layer.pixel(x,y,color,true);
   if(spellLayer!==layer){spellLayer=layer;spellFx=createOrbitEffects(snes,mod,put);}
   const sprite=(frame,x,y,flip=false,ghost=0)=>drawFriezaSprite(api.portraitAtlas,frame,x,y,put,{flip,ghost});
   const fx=(x,y,age)=>spellFx.burst(x,y,age,{large:true});
   if(b?.space)return;
   if(b?.arena)drawFriezaDebris(b.arena,layer,h.cameraX,h.cameraY);
   const follower=api.introHero;
   if(follower){
    const sheet=mod.options.superSaiyan?'ssj':'goku';
    layer.blit(sheet,follower.column,follower.row,follower.x-16,follower.y-31);
    layer.plan.sprite={x:follower.x-16,y:follower.y-31,width:32,height:32,sheet,row:follower.row,column:follower.column,kind:'introFlight'};
   }
   if(c?.kind==='temple-exit'||c?.kind==='altar-leave'){const p=friezaScenePose(c,h);sprite(p.frame,p.x,p.y);}
   if(c?.kind==='fanha-finish'&&c.target){
    const x=c.target.x-h.cameraX,y=c.target.y-20-h.cameraY;
    if(c.age<24)spellFx.beam(280,-16,x,y,2,c.age,true);
    if(c.age>=12&&c.age<72)fx(x,y,c.age-12);
   }
   if(c&&['reveal','altar-approach','steal','depart','taunt','lift','explode','gold','eighth','victory','defeated','core-arrival','core-charge','core-shot','core-impact','trial-entry','trial-taunt','trial-leave','empower','emperor-shot','emperor-fall'].includes(c.kind)){
    const p=friezaScenePose(c,h),{x,y}=p;
    if(!['eighth','defeated','emperor-shot','emperor-fall'].includes(c.kind))sprite(p.frame,x,y);
    if(c.kind==='core-charge'||c.kind==='core-shot'){
     // Outdoors, the fully formed ball extends above the top of the screen.
     // It leaves his hand and plunges completely below the picture before
     // the underground rumble and delayed eruption.
     const ball=friezaDeathBallPose(c,p);
     if(ball.visible)mod.kiArt?.draw('death',ball.frame,ball.x,ball.y,ball.size,put,{cinematic:true});
    }
    if(c.kind==='core-impact'){
     const t=c.age-coreTiming.eruption;
     // A rising column of the cartridge's explosions, rooted below the
     // screen. Stagger each burst so the force travels visibly upward.
     for(const [i,at]of[[80,238],[65,217],[94,214],[80,186],[55,178],[105,170],[80,145]].entries()){
      const age=t-i*12;if(age>=0&&age<74)fx(at[0],at[1],age);
     }
    }
    if(c.kind==='empower'&&c.target&&c.age<140){
     const tx=c.target.x-h.cameraX,ty=c.target.y-h.cameraY;
     for(let i=0;i<3;i++){
      const travel=c.age-i*24;if(travel<0||travel>=72)continue;
      const t=travel/72,px=x-8+(tx-x+8)*t,py=y-20+(ty-y+20)*t;
      spellFx.stamp('charge-orb',1,px,py,0,true);
     }
     if(c.age>=72)layer.aura(tx,ty,c.age-72,{height:32,tone:'pink',power:.7,behindActors:true});
    }
    if(c.kind==='steal'&&(!c.altar||c.age<64))for(let i=0;i<7;i++)if(s.stolenMask>>i&1){
     const t=Math.min(1,c.age/60),a=i*Math.PI*2/7;
     const tx=c.altar?c.altar.x-c.x-8:40,ty=c.altar?c.altar.y-c.y-10:-42,spread=Math.sin(t*Math.PI);
     mod.kiArt?.draw('dragon',i,Math.round(c.x-h.cameraX+tx*t+Math.cos(a)*18*spread),Math.round(c.y-12-h.cameraY+ty*t+Math.sin(a)*14*spread),11,put);
    }
    if(c.kind==='eighth')mod.kiArt?.draw('dragon',7,follower?.x??c.x-h.cameraX,(follower?.y??c.y-h.cameraY)-36,18,put);
    if(c.kind==='explode'&&c.target&&c.age<74)fx(c.target.x-h.cameraX,c.target.y-h.cameraY,c.age);
    if(c.kind==='gold'){
     layer.behindBody=true;
     layer.aura(c.x-h.cameraX,c.y-16-h.cameraY,c.age,{height:32,power:Math.min(1,c.age/28)});
     layer.behindBody=false;
    }
    if(c.kind==='defeated'&&c.age<74)fx(x,y-16,c.age);
   }
   if(s.stage!=='battle'||!b)return;
   const bx=b.x-h.cameraX,by=b.y+8-h.cameraY,face=b.x<h.x;
   for(const p of b.afterimages??[])sprite(5,p.x-h.cameraX,p.y+8-h.cameraY,face,1+Math.floor(p.age/4));
   if(b.surge){
    const t=b.surge.age;
    if(!(mod.frame&1)){
     spellFx.stamp('lightning',t>>3,bx-16,by-18,0,true);
     spellFx.stamp('lightning',t>>3,bx+16,by-18,2,true);
    }
   }
   if(b.surge||b.riposte?.age<18){
    layer.behindBody=true;
    spellFx.aura(bx,by-20,b.surge?.age??b.riposte.age,{height:40,tone:'pink',seed:5,clock:mod.frame});
    layer.behindBody=false;
   }
   const pointer=friezaDeathBeamPose(b);
   if(pointer)sprite(2,pointer.x-h.cameraX,pointer.y-h.cameraY,pointer.flip);
   else sprite(b.hurt?6:b.riposte?2:b.surge||b.windup?4:b.dash?5:b.recoil?2:b.warning?.kind==='disc'?2:b.warning?3:b.tier?4:Math.floor(b.age/16)%2,bx+(b.recoil?(face?1:-1)*Math.ceil(b.recoil/3):0),by,face);
   if(b.riposte){
    const a=b.riposte.age;
    if(a>=18)for(const[dx,dy]of[[1,0],[0,1],[-1,0],[0,-1]])spellFx.stamp('impact-spark',(a-18)>>1,bx+dx*(12+(a-18)*3),by-12+dy*(12+(a-18)*3));
   }
   if(b.surge){
    const age=b.surge.age;
    if(b.surge.kind==='frieza-cosmic'&&age>24&&age<72){
     const r=Math.min(29,(age-24)*.65);mod.kiArt?.draw('death',(age>>3)%12,bx,by-58,r*2.8,put);
     if(age>57)layer.giantBeam(h.screenX,h.screenY-14,0,-1,(age-57)*12,18,age,{taper:20});
    }
    return;
   }
   for(const q of b.hazards??[]){
    const x=q.x-h.cameraX,y=q.y-h.cameraY;
    if(q.age<q.wait)spellFx.stamp('gold-charge-orb',Math.min(4,Math.floor(q.age*5/q.wait)),x,y);
    else fx(x,y,q.age-q.wait);
   }
   for(const p of b.shots){
    if(p.kind==='laser'){
     const x=p.x-h.cameraX,y=p.y-h.cameraY;
     spellFx.deathBeam(x,y,x+p.dx*360,y+p.dy*360,p.age);
    }else if(p.kind==='disc'){
     spellFx.disc(p.x-h.cameraX,p.y-h.cameraY,p.age);
    }else{
     const x=p.x-h.cameraX,y=p.y-h.cameraY;
     mod.kiArt?.draw('death',(p.age>>3)%12,x,y,32,put);
    }
   }
   if(b.warning){const w=b.warning,x=b.x-h.cameraX,y=b.y-24-h.cameraY;
    if(w.kind==='laser')spellFx.fingerCharge(pointer.finger.x-h.cameraX,pointer.finger.y-h.cameraY,w.age);
    else if(w.kind==='orb')mod.kiArt?.draw('death',(w.age>>3)%12,x,y,16+16*Math.floor(w.age*2/w.wait),put);
    else spellFx.disc(x,y,w.age);}

  },
  get status(){return copy({...s,eligible:eligible(),needsTree:api.needsTree,hp:s.boss?.hp??null});},snapshot(){return copy(s);},restore(saved){
   s={...initial(),...copy(saved)};ruinsRevision=-1;renderFrame=-1;altarCamera.reset();
   if(saved&&saved.outdoorIntro===undefined&&map()===195&&(s.stage==='theft'||s.scene?.kind==='eighth'))s.outdoorIntro=true;
   if(saved&&saved.stolenMask===undefined&&s.stolen)s.stolenMask=mod.quest?.status.mask??0;
   if(saved&&saved.trialWon===undefined&&['showdown','battle','won','defeated'].includes(s.stage))s.trialWon=true;
   // Runs already beyond the Tree or inside the final battle keep their
   // progress. Older hunt checkpoints gain the new pursuit when appropriate.
   if(saved&&saved.tree===undefined&&s.stolen)s.tree=mod.read8(0xcf46)>=8||['trial','showdown','battle','won','defeated'].includes(s.stage)?'complete':'pursuit';
   if(saved&&saved.crisis===undefined&&(s.stolen||s.permanent))s.crisis={...newCoreCrisis(),active:!mod.quest?.status.wished,flightNotified:true};
   const b=s.boss;
   if(b){for(const p of[b,...b.nodes??[],...b.shots??[],...b.afterimages??[],b.space?.hero].filter(Boolean)){p.x=Math.round(p.x);p.y=Math.round(p.y);}}
   if(b&&!b.orbital){
    b.orbital=true;
    if(b.tier>0&&b.surge?.kind!=='frieza-breach')b.muscular=true;
    // Older checkpoints ended phase three on the ground. Enter the new
    // orbital phase on its normal transition, without replaying the story.
    if(s.stage==='battle'&&b.tier>=2&&!b.space&&!b.surge){b.tier=1;b.hp=Math.min(b.hp,FRIEZA_HP/3);}
   }
   if(s.permanent&&!mod.ending?.defeated)mod.options.superSaiyan=true;
  },
 };
 return api;
}
