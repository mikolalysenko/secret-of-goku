import {friezaEvents as F} from './frieza-events.js';
import {FRIEZA_HP,homingStep,discContact,sweptDistance} from './frieza-combat.js';
import {encodeText} from './event-codec.js';
const copy=s=>s?structuredClone(s):null;
const initial=()=>({stage:'dormant',stolen:false,eighth:false,permanent:false,fallen:false,popoiMember:false,popoi:null,scene:null,boss:null,offered:false,lastMap:null,hinted:false,discHits:0,playerHits:0});
export function createFrieza(snes,mod){
 let s=initial(),atlas=null;
 const img=new Image(),url=new URL('../assets/sprites/frieza.png',import.meta.url);url.search=new URL(import.meta.url).search;img.src=url.href;
 const ready=img.decode().then(()=>{
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  const rgba=ctx.getImageData(0,0,c.width,c.height).data,pixels=new Uint16Array(c.width*c.height),frames=[];
  for(let i=0;i<pixels.length;i++)if(rgba[i*4+3]>=128)pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  for(let i=0;i<8;i++){
   const x0=Math.round(i%4*c.width/4),x1=Math.round((i%4+1)*c.width/4),y0=Math.round((i>>2)*c.height/2),y1=Math.round(((i>>2)+1)*c.height/2);
   let left=x1,right=x0,top=y1,bottom=y0;
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[y*c.width+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   frames.push({x:left,y:top,w:right-left+1,h:bottom-top+1});
  }
  atlas={pixels,width:c.width,frames};
 });
 const map=()=>mod.read16(0xdc);
 const on=()=>mod.options.enabled&&mod.gokuActive;
 const eligible=()=>on()&&s.stage==='dormant'&&mod.quest?.status.seedMask===127&&!mod.quest?.status.wished&&mod.read8(0xcf4e)<6&&!mod.worldKi?.status.fortressDestroyed;
 const hero=()=>({x:mod.read16(0xe002),y:mod.read16(0xe004)-12});
 function cue(name){
  s.scene={kind:name,age:0,map:map(),x:mod.read16(0xe002),y:mod.read16(0xe004)};
 }
 function laugh(){mod.playSound?.('friezaLaugh');}
 function burst(x,y,kind='impact'){mod.effects.push({kind,x,y,dx:1,dy:0,life:12,max:12,super:true});mod.playSound?.('impact');mod.feedback?.pulse(8);}
 function damagePlayer(amount){
  const b=s.boss;if(s.stage!=='battle'||!b||b.grace||mod.read8(0xe191)&0x80||!mod.read16(0xe182))return;
  mod.write16(0xe1f1,Math.max(mod.read16(0xe1f1),amount));mod.write8(0xe1f0,0);mod.write8(0xe1ec,0);b.grace=48;s.playerHits++;burst(hero().x,hero().y);
 }
 function hurt(amount,disc=false){
  const b=s.boss;if(!b||s.stage!=='battle')return 0;
  const hit=Math.min(b.hp,Math.max(0,Math.floor(amount)));b.hp-=hit;b.hurt=10;
  if(disc){s.discHits++;b.stun=75;burst(b.x,b.y);mod.playSound?.('powerBurst');}
  if(b.hp<=0){s.stage='won';b.shots=[];b.warning=null;b.age=0;cue('victory');mod.cancelCombat();mod.feedback?.burst();}
  return hit;
 }
 function startBattle(){
  s.stage='battle';s.scene=null;
  const h=hero(),terrain=mod.read8(0xe00b),nodes=[];
  for(const[dx,dy]of[[-60,-50],[60,-50],[60,30],[-60,30],[0,-30]]){
   const x=h.x+dx,y=h.y+dy;
   if(mod.localFlightHook.canLand(x,y+12,terrain&128?1:0,terrain&3))nodes.push({x,y});
  }
  if(!nodes.length)nodes.push({x:h.x,y:h.y-24});
  s.boss={x:nodes[0].x,y:nodes[0].y,nodes,node:0,hp:FRIEZA_HP,age:0,clock:55,cycle:0,stun:0,grace:0,hurt:0,warning:null,shots:[],terrain};
  mod.cancelCombat();mod.radio?.restore({firstFlight:true});
 }
 function attack(){
  const b=s.boss,h=hero(),enraged=b.hp<FRIEZA_HP/2,discs=b.cycle++%2===1;
  b.warning={kind:discs?'disc':'orb',age:0,wait:enraged?38:52,x:b.x,y:b.y,target:{...h}};
 }
 function fire(){
  const b=s.boss,w=b.warning,angle=Math.atan2(w.target.y-w.y,w.target.x-w.x),enraged=b.hp<FRIEZA_HP/2;
  if(w.kind==='disc')for(const sign of[-1,1])b.shots.push({kind:'disc',x:b.x,y:b.y,angle:angle+sign*.85,speed:enraged?3.7:3.1,age:0,trail:[]});
  else for(const offset of(enraged?[-.45,0,.45]:[-.23,.23]))b.shots.push({kind:'orb',x:w.x,y:w.y,angle:angle+offset,speed:enraged?3.5:2.8,age:0,trail:[]});
  b.warning=null;b.clock=enraged?62:85;mod.playSound?.(w.kind==='disc'?'friezaDisc':'friezaOrb');
  if(b.cycle===2||b.cycle===8)laugh();
 }
 // This arena reserves BG2 for Dark Lich's dynamically streamed body.
 // With that boss absent it retains unrelated VRAM. Frieza uses OBJ pixels;
 // show the complete native BG1 floor and BG3 windows without the old boss
 // plane. Never change the PPU registers or affect other maps/menus.
 const color=snes.ppu.getColor;
 snes.ppu.getColor=function(sub,x,y){
  if(!api.ownsArena()||this.mode!==1)return color.call(this,sub,x,y);
  const screens=sub?this.subScreenEnabled:this.mainScreenEnabled,old=screens[1];screens[1]=false;
  try{return color.call(this,sub,x,y);}finally{screens[1]=old;}
 };
 const api={
  ready,get eligible(){return eligible();},get active(){return s.stage!=='dormant';},get unresolved(){return s.stolen;},get eighth(){return s.eighth;},get permanent(){return s.permanent;},get fallen(){return s.fallen;},get popoiMember(){return s.popoiMember;},get fighting(){return s.stage==='battle'||s.stage==='won';},
  ownsArena(){return on()&&api.active&&map()===246;},
  onEvent(id){
   if(id===F.offer)s.offered=true;
   if(id===F.theft){if(!eligible())return;s.stage='theft';mod.cancelCombat();cue('waiting');}
   if(id===F.reveal){cue('reveal');laugh();mod.playSound?.('teleportIn');mod.feedback?.pulse(12);}
   if(id===F.steal){s.stolen=true;cue('steal');mod.playSound?.('charged');}
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
   if(id===F.victory)cue('victory');
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
  tick(){
   if(!on())return;
   const here=map();if(s.lastMap!==here){s.lastMap=here;s.offered=false;if(s.scene?.map!==here)s.scene=null;}
   if(s.permanent&&!mod.ending?.nativeBoy)mod.options.superSaiyan=true;
   if(eligible()&&!s.hinted){s.hinted=true;mod.radio?.say('DRYAD:Seven Balls...\nCome to the Tree Palace.\nSomeone is following you.',{kind:'quest'});}
   if(eligible()&&here===431&&!s.offered&&Math.hypot(hero().x-232,hero().y-200)<90&&mod.canAttack)mod.story.request(F.offer);
   if(s.scene){
    const c=s.scene;c.age++;
    if(c.kind==='lift'&&snes.ram[0xe400]&1){mod.write16(0xe402,c.x+35);mod.write16(0xe404,c.y-10);mod.write8(0xe445,Math.min(55,Math.floor(c.age*.8)));}
    if(c.kind==='gold'&&c.age===28){mod.feedback?.pulse(16);mod.playSound?.('powerBurst');}
    if(['eighth','defeated'].includes(c.kind)&&mod.canAttack)s.scene=null;
   }
   if(s.stage==='won'&&here===246&&mod.canAttack){mod.story.request(F.victory);return;}
   if(s.stage!=='battle'||here!==246||!s.boss)return;
   // Menus pause this battle; spell/hit messages do not stop its projectiles.
   if(!mod.nativeField||mod.read8(0xd0)||mod.read8(0xec)&0xfe||snes.ppu.forcedBlank||mod.read8(0xe191)&0x80)return;
   const b=s.boss,h=hero();b.age++;if(b.grace)b.grace--;if(b.hurt)b.hurt--;
   if(b.stun)b.stun--;
   else{
    if(b.age%105===0)b.node=(b.node+1)%b.nodes.length;
    const to=b.nodes[b.node],dx=to.x-b.x,dy=to.y-b.y,d=Math.hypot(dx,dy),speed=b.hp<FRIEZA_HP/2?2.8:2.1;
    if(d>1){b.x+=dx/d*Math.min(d,speed);b.y+=dy/d*Math.min(d,speed);}
    if(b.warning){if(++b.warning.age>=b.warning.wait)fire();}else if(--b.clock<=0)attack();
   }
   for(const shot of b.shots){
    shot.previousX=shot.x;shot.previousY=shot.y;shot.trail.unshift({x:shot.x,y:shot.y});if(shot.trail.length>8)shot.trail.pop();
    if(shot.kind==='disc'){
     homingStep(shot,h,b.hp<FRIEZA_HP/2?.038:.032);
     const hit=discContact(shot,h,b);if(hit==='frieza'){shot.age=999;hurt(12000,true);}else if(hit==='goku'){shot.age=999;damagePlayer(230);}
    }else{shot.age++;shot.x+=Math.cos(shot.angle)*shot.speed;shot.y+=Math.sin(shot.angle)*shot.speed;if(sweptDistance(h.x,h.y,shot.previousX,shot.previousY,shot.x,shot.y)<22){shot.age=999;damagePlayer(310);}}
   }
   b.shots=b.shots.filter(v=>v.age<330);if(b.shots.length>12)b.shots.splice(0,b.shots.length-12);
  },
  hideOwner(owner){return api.ownsArena()&&owner?.base>=0xe600||s.fallen&&owner?.base===0xe400;},
  draw(layer){
   if(!on()||mod.worldFlight||snes.ppu.mode!==1||!atlas)return;
   const h=mod.status,c=s.scene?.map===map()?s.scene:null,b=map()===246?s.boss:null;
   const put=(x,y,color)=>layer.pixel(x,y,color,true),rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
   const sprite=(frame,x,y,flip=false)=>{
    const f=atlas.frames[frame],height=frame===7?27:frame===4||frame===5?34:40,width=Math.round(f.w*height/f.h);
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
     const color=atlas.pixels[(f.y+Math.floor(py*f.h/height))*atlas.width+f.x+Math.floor((flip?width-1-px:px)*f.w/width)];
     if(color)put(x-width/2+px,y-height+py,color);
    }
   };
   const ball=(x,y,r,color)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const d=dx*dx+dy*dy;if(d<=r*r)put(x+dx,y+dy,d<(r-2)**2?color:rgb(8,2,14));}};
   const fx=(x,y,n)=>{for(let i=0;i<8;i++){const a=i*Math.PI/4;layer.stamp(i&1?'impact-spark':'gold-charge-orb',n>>2,x+Math.cos(a)*n,y+Math.sin(a)*n);}};
   if(c&&['reveal','steal','depart','taunt','lift','explode','gold','eighth','victory','defeated'].includes(c.kind)){
    let x=c.x+40-h.cameraX,y=c.y-40-h.cameraY;
    if(['reveal','steal','depart'].includes(c.kind))y-=c.kind==='reveal'?Math.max(0,64-c.age*2):c.kind==='depart'?Math.min(150,c.age*4):0;
    if(!['eighth','defeated'].includes(c.kind))sprite(c.kind==='lift'||c.kind==='explode'?3:c.kind==='victory'?7:Math.floor(c.age/20)%2,x,y);
    if(c.kind==='steal')for(let i=0;i<7;i++){const t=Math.min(1,c.age/48),a=i*Math.PI*2/7;ball(c.x-h.cameraX+(40+Math.cos(a)*18)*t,c.y-12-h.cameraY+(-42+Math.sin(a)*14)*t,3,rgb(31,20,2));}
    if(c.kind==='eighth'){ball(c.x-h.cameraX,c.y-36-h.cameraY,6,rgb(31,20,2));for(let i=0;i<8;i++)put(c.x-h.cameraX-3+i%4*2,c.y-38-h.cameraY+(i>>2)*3,rgb(24,2,1));}
    if(c.kind==='explode'&&c.age<48)fx(c.x+35-h.cameraX,c.y-60-h.cameraY,Math.min(28,c.age));
    if(c.kind==='gold'){
     for(let i=0;i<12;i++){const a=i*Math.PI/6;layer.stamp(i&1?'gold-arc':'lightning',c.age>>2,c.x-h.cameraX+Math.cos(a)*23,c.y-16-h.cameraY+Math.sin(a)*25);}
    }
    if(c.kind==='defeated'&&c.age<45)fx(x,y-16,Math.min(40,c.age));
   }
   if(s.stage!=='battle'||!b)return;
   const bx=b.x-h.cameraX,by=b.y+8-h.cameraY;
   sprite(b.hurt?6:b.warning?.kind==='disc'?2:b.warning?3:b.hp<FRIEZA_HP/2?4:Math.floor(b.age/16)%2,bx,by,b.x<h.x);
   for(const p of b.shots){
    if(p.kind==='disc'){
     p.trail.forEach((t,i)=>{if(i%2===0)put(t.x-h.cameraX,t.y-h.cameraY,rgb(24-i,12,22));});
     const x=p.x-h.cameraX,y=p.y-h.cameraY;
     for(let dy=-3;dy<=3;dy++)for(let dx=-12;dx<=12;dx++)if(dx*dx/144+dy*dy/9<=1)put(x+dx,y+dy,Math.abs(dy)<2?rgb(31,31,20):rgb(31,4,22));
    }else{const x=p.x-h.cameraX,y=p.y-h.cameraY;ball(x,y,13,rgb(21,3,21));ball(x-3,y-3,6,rgb(31,13,28));layer.stamp('lightning',p.age>>3,x,y);}
   }
   if(b.warning){const w=b.warning,x=w.x-h.cameraX,y=w.y-h.cameraY;for(let i=0;i<8;i++){const a=i*Math.PI/4+w.age/15;put(x+Math.cos(a)*18,y+Math.sin(a)*18,rgb(31,7,25));}if(w.kind==='orb')ball(x,y,Math.floor(4+w.age/w.wait*8),rgb(22,4,26));}
   // Compact native-font boss name and three life segments leave the arena
   // visible. No HTML UI is introduced over the original game's graphics.
   const text=encodeText(b.stun?'FRIEZA  STAGGERED':'FRIEZA  FULL POWER');
   text.forEach((code,col)=>{for(let y=0;y<12;y++)for(let x=0;x<8;x++)if(snes.cart.data[0x12d600+code*12+y]>>(7-x)&1){put(57+col*8+x,1+y,1);put(56+col*8+x,y,0x8000);}});
   for(let y=14;y<18;y++)for(let x=48;x<208;x++)put(x,y,y===14||y===17||x%53===48?rgb(23,19,27):x-48<160*b.hp/FRIEZA_HP?rgb(27,4,20):rgb(5,2,7));
  },
  get status(){return copy({...s,eligible:eligible(),hp:s.boss?.hp??null});},snapshot(){return copy(s);},restore(saved){s={...initial(),...copy(saved)};if(s.permanent)mod.options.superSaiyan=true;},
 };
 return api;
}
