import {radioPixels} from './native-radio.js';
import {endingResult} from './ending-rules.js';
import {newKaiScene,tickKaiScene} from './kai-planet.js';
import {createManaTreeVista} from './mana-tree-vista.js';
import {createWishFlight,wishFlightTiming} from './wish-flight.js';
import {createOrbitEffects} from './orbit-effects.js';
import {departureTiming,departurePose} from './ending-departure.js';
import {bossRushDeathTiming as deathTiming} from './boss-rush-death.js';
import {clashCamera} from './frieza-finale.js';

// Native-sized picture surface, before the PPU's brightness and color math.
// Dialogue remains the cartridge's own BG3 window and event interpreter.
export function createShenronEnding(snes,mod){
 const p=snes.ppu,previous=p.getColor,surface=new Uint16Array(256*224);
 let state=null,prepared=-1,dragon=null,endCard=null,clearing=null,departureWhite=0;
 const image=new Image(),url=new URL('../assets/sprites/shenron.png',import.meta.url);url.search=new URL(import.meta.url).search;image.src=url.href;
 const ready=image.decode().then(()=>{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,pixels=new Uint16Array(image.width*image.height);
  for(let i=0;i<pixels.length;i++)if(rgba[i*4+3])pixels[i]=1+(rgba[i*4]>>3)+((rgba[i*4+1]>>3)<<5)+((rgba[i*4+2]>>3)<<10);
  dragon={pixels,width:image.width,height:image.height};
 });
 const rgb=(r,g,b)=>1+r+(g<<5)+(b<<10);
 const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
 function blit(a,x,y,w,h,sourceX=0,sourceY=0,sw=a.width,sh=a.height){
  for(let py=0;py<h;py++)for(let px=0;px<w;px++){
   const c=a.pixels[(sourceY+Math.floor(py*sh/h))*a.width+sourceX+Math.floor(px*sw/w)];if(c)put(x+px,y+py,c);
  }
 }
 const flight=createWishFlight(snes,mod,{put,rgb,blit}),fx=createOrbitEffects(snes,mod,put);
 function brighten(amount){for(let i=0;i<surface.length;i++){const c=surface[i]-1,mix=n=>Math.round(n+(31-n)*amount);surface[i]=rgb(mix(c&31),mix(c>>5&31),mix(c>>10&31));}}
 function dim(amount){for(let i=0;i<surface.length;i++){const c=surface[i]-1,mix=n=>Math.round(n*(1-amount));surface[i]=rgb(mix(c&31),mix(c>>5&31),mix(c>>10&31));}}
 function treeVista(scroll,foreground=false,destroyed=false){
  clearing??=createManaTreeVista(snes.cart.data);
  clearing(put,{foreground,destroyed,
   x:foreground?0:30,y:foreground?156-scroll:44-Math.round(scroll/4)});
 }
 function prepare(){
  prepared=mod.frame;surface.fill(0);if(!state)return;
  const departing=state.phase==='scatter',phase=departing&&state.age<30?'wish':state.phase;
  const village=phase==='village'||phase==='complete',age=departing&&state.age<30?96:state.age;
  const goku=mod.spriteLayer.atlas[mod.options.superSaiyan?'ssj':'goku'];
  if(phase==='scatter'){const light=flight(age,dragon);if(light)brighten(light);if(age<60)dim((60-age)/30);return;}
  if(phase==='depart'){
   const pose=departurePose(age,state.departure);
   departureWhite=pose.white;
   if(goku&&pose.y>-32)blit(goku,pose.x-16,pose.y-31,32,32,pose.column*32,32+pose.row*32,32,32);
   if(age>=departureTiming.charge&&age<departureTiming.launch+16){
    fx.stamp('charge-orb',age>>3,pose.x-13,pose.y-14);
    fx.stamp('charge-orb',(age>>3)+2,pose.x+13,pose.y-8);
   }
   return;
  }
  if(village){
   // Randi is the original native boy actor again; Goku stands beside him.
   const x=mod.readSigned16(0xe020),y=mod.readSigned16(0xe022);
   if(goku)blit(goku,x+10,y-31,32,32,0,32,32,32);
   if(phase==='complete'){
    endCard??=radioPixels(snes.cart.data,'       SECRET OF GOKU\n          THE END\nOriginal game by SQUARE');
    for(let y=0;y<64;y++)for(let x=0;x<240;x++){const c=endCard[y*240+x];if(c)put(x+8,y+8,c);}
   }
   return;
  }
  const rise=phase==='dragon'?Math.max(0,1-age/96):phase==='wish'?0:1;
  const scroll=Math.round(8*(1-rise*rise));
  // Shenron floats in the sky above the distant canopy. Draw the complete
  // native background first: metatile-shaped cutouts must never mask him.
  treeVista(scroll,false,phase!=='wish');
  if(['dragon','wish'].includes(phase)&&dragon){
   const y=66+Math.round(160*rise*rise);
   blit(dragon,92,y,72,79);
  }
  treeVista(scroll,true);
  for(let i=0;i<7;i++){
   const angle=i*Math.PI*2/7-Math.PI/2;
   const x=Math.round(128+Math.cos(angle)*28),y=Math.round(184+scroll+Math.sin(angle)*12);
   mod.kiArt?.draw('dragon',i,x,y,12,put);
  }
  if(mod.frieza?.eighth)mod.kiArt?.draw('dragon',7,128,172+scroll,12,put);
  // The final falling flakes are explicitly called fallout in the dialogue.
  if(phase==='summon')for(let i=0;i<32;i++)put((i*61+age/12|0)%256,(i*47+age/3|0)%224,rgb(21,24,17));
  if(goku)blit(goku,112,172+scroll,32,32,0,32+3*32,32,32);
  if(phase==='dragon'&&age<96){
   for(let i=0;i<4;i++)fx.stamp('gold-spark',(age>>2)+i,106+i*15,172+scroll-((age*3+i*29)%112));
  }
  if(phase==='wish'&&age<72){
   for(let i=0;i<4;i++)fx.stamp('gold-spark',(age>>3)+i,114+(i&1)*24,132+(i>>1)*26);
   if(age<36)brighten(.65*(1-age/36));
  }
  if(departing)dim(state.age/30);
  if(phase==='summon'&&age<48)dim(1-age/48);
 }
 // The whole effect on the inner [color, layer, pixel] (c or a new array).
 function shade(sub,x,y,c){
  if(!state||state.fatal||state.phase==='reunion'||!mod.options.enabled||y>224)return c;
  // Results are written into c (the caller's fresh triple).
  if(state.phase==='transition'){
   const fade=Math.max(0,1-state.age/48),color=c[0];
   c[0]=Math.round((color&31)*fade)|(Math.round((color>>5&31)*fade)<<5)|(Math.round((color>>10&31)*fade)<<10);c[1]=4;c[2]=0x86;return c;
  }
  if(sub)return c;
  const phase=state.phase;
  if(y===224&&phase!=='village'&&phase!=='depart'&&phase!=='complete'){c[0]=0;c[1]=4;c[2]=0x86;return c;}
  if(prepared!==mod.frame)prepare();
  if(phase==='depart'){
   const color=(surface[y*256+x]||c[0]+1)-1,white=departureWhite;
   const mix=n=>Math.round(n+(31-n)*white);
   c[0]=mix(color&31)|(mix(color>>5&31)<<5)|(mix(color>>10&31)<<10);c[1]=4;c[2]=0x86;return c;
  }
  if(phase!=='scatter'&&c[1]===2&&y<170)return c; // no dialogue or combat HUD in the departure shot
  const pixel=surface[y*256+x];if(pixel){c[0]=pixel-1;c[1]=4;c[2]=0x86;}return c;
 }
 p.getColor=function(sub,x,y){return shade(sub,x,y,previous.call(this,sub,x,y));};
 // shade() for a whole scanline as compositor ops (Ppu.registerLineHook).
 const rows=Array.from({length:224},(_,y)=>surface.subarray(y*256,y*256+256)),none=new Uint16Array(256),black=new Uint16Array(256).fill(1);
 const tint={type:'channels',layers:63,r:new Int32Array(32),g:null,b:null,layer:4,pixel:0x86,mainOnly:false};tint.g=tint.b=tint.r;
 const paint={type:'paint',layers:63,colors:null,skipZero:true,layer:4,pixel:0x86,mainOnly:true};
 function plan(y,linePlan){
  // idle(): a live state (not fatal or reunion) and y <= 224.
  const phase=state.phase;linePlan.skipPost=true;
  if(phase==='transition'){
   const fade=Math.max(0,1-state.age/48);for(let c=0;c<32;c++)tint.r[c]=Math.round(c*fade);
   tint.mainOnly=false;linePlan.extra.push(tint);return true;
  }
  if(y===224&&phase!=='village'&&phase!=='depart'&&phase!=='complete'){
   paint.layers=63;paint.colors=black;paint.skipZero=false;paint.layer=4;linePlan.extra.push(paint);return true;
  }
  if(prepared!==mod.frame)prepare();
  paint.colors=y<224?rows[y]:none;paint.skipZero=true;
  if(phase==='depart'){
   // The surface, else the inner color, mixed toward white as one pixel.
   const white=departureWhite;for(let c=0;c<32;c++)tint.r[c]=Math.round(c+(31-c)*white);
   paint.layers=63;paint.layer=-1;tint.mainOnly=true;linePlan.extra.push(paint,tint);return true;
  }
  paint.layers=phase!=='scatter'&&y<170?63&~4:63;paint.layer=4;linePlan.extra.push(paint);return true;
 }
 p.registerLineHook?.('getColor',p.getColor,previous,(ppu,line)=>!state||state.fatal||state.phase==='reunion'||!mod.options.enabled||line>224,{name:'shenron',
  plan:(ppu,line,linePlan)=>plan(line,linePlan),
  post:(ppu,sub,x,y,r)=>{const t=shade(sub,x,y,r);if(t!==r){r[0]=t[0];r[1]=t[1];r[2]=t[2];}}});
 return{
  ready,
  lose(encounter){
   if(state)return;
   mod.cancelCombat();mod.cancelInput();mod.sound?.clear();
   const orbit=mod.frieza?.orbit?structuredClone(mod.frieza.orbit):null;
   if(orbit)orbit.deathCamera=structuredClone(orbit.clash?clashCamera(orbit):orbit.camera);
   state={outcome:'bad',reason:'defeat',fatal:true,encounter,phase:'collapse',age:0,orbit,gold:mod.options.superSaiyan};prepared=-1;
   mod.localFlight=false;mod.localLift=0;mod.flightTransition=null;
  },
  begin(){if(state)return;mod.cancelCombat();mod.sound?.clear();mod.localFlight=false;mod.localLift=0;const result=endingResult(mod);state={...result,phase:result.outcome==='good'?'transition':'doomed',age:0,party:Number(!!(snes.ram[0xe200]&1))|Number(!!(snes.ram[0xe400]&1))<<1};},
  cue(phase){
   if(!state)return;
   if(state.outcome==='bad')phase=({dragon:'explode',wish:'escape',village:'kai'})[phase]??phase;
   state.phase=phase;state.age=0;prepared=-1;
   if(phase==='summon')mod.options.superSaiyan=false;
   if(phase==='escape')mod.playSound?.('teleport');
   if(phase==='depart')state.departure={x:mod.readSigned16(0xe020)+26,y:mod.readSigned16(0xe022)};
   if(phase==='kai'){state.kai??=newKaiScene();mod.playSound?.('teleportIn');}
   if(phase==='dragon'){mod.playSound?.('powerBurst');}
   if(phase==='wish'){mod.quest?.wish();mod.playSound?.('charged');}
   if(phase==='scatter')mod.cancelCombat();
   if(phase==='village'){
    // End with a living Randi, never a ghost left by the battle state.
    snes.ram[0xe190]=snes.ram[0xe191]=0;mod.write16(0xe182,mod.read16(0xe184));
   }
  },
  tick(){if(state){
   state.age++;
   if(state.fatal){
    if(state.age===deathTiming.revert){mod.options.superSaiyan=false;if(state.gold)mod.playSound?.('revert');}
    if(state.age===deathTiming.planet)mod.playSound?.('friezaOrb');
    if(state.age===deathTiming.blast)mod.playSound?.('fortressBreak');
    if(state.age>=deathTiming.gameOver)state.phase='gameover';return;
   }
   if(state.phase==='explode'&&state.age===48)mod.playSound?.('powerBurst');if(state.phase==='scatter'){if(state.age===wishFlightTiming.rise)mod.playSound?.('flight');if(state.age===wishFlightTiming.scatter)mod.playSound?.('charged');}if(state.phase==='depart'&&state.age===departureTiming.launch)mod.playSound?.('flight');if(['kai','complete'].includes(state.phase))tickKaiScene(state.kai??=newKaiScene());}},
  get charging(){return state?.phase==='depart'&&state.age>=departureTiming.charge&&state.age<departureTiming.launch;},
  get musicMuted(){return state?.fatal||state?.phase==='scatter';},
  get nativeDeath(){return !!state?.fatal&&!state.orbit&&state.age<deathTiming.black;},
  get airborne(){return state?.fatal?!!state.orbit&&state.age>=deathTiming.fall&&state.age<deathTiming.fallen:state?.phase==='scatter'&&state.age>=wishFlightTiming.rise&&state.age<wishFlightTiming.settle||state?.phase==='depart'&&state.age>=departureTiming.launch&&state.age<departureTiming.fade;},
  get active(){return !!state;},get relaxed(){return state?.outcome==='good'&&state.phase!=='transition';},get complete(){return ['complete','gameover'].includes(state?.phase);},get defeated(){return !!state?.fatal;},
  get nativeBoy(){return state?.outcome!=='bad'&&['village','depart'].includes(state?.phase);},
  get reunion(){return state?.outcome==='good'&&state.phase==='reunion';},
  get planetScene(){return state&&(state.outcome==='bad'||['kai','complete'].includes(state.phase)||state.phase==='depart'&&state.age>=departureTiming.space)?state:null;},
  get status(){return structuredClone(state);},
  snapshot(){return structuredClone(state);},restore(saved){state=saved?structuredClone(saved):null;prepared=-1;},
  dispose(){p.getColor=previous;},
 };
}
