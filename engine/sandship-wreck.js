// The Sandship after Goku's full-power breakout: a white-out, then the same
// rooms wrecked. The hull breach and soot are drawn into the native BG
// layers; fires use the original Exploder/Fireball cells. Guards are gone
// and desert monsters come in through the hole. Both use the native object
// loader through a read view. Source map/event bytes stay untouched.
import {createNativeCombustion} from './native-combustion.js';

export const shipMaps=[98,99,270,271,318,319,324,339];
// Soldiers and guards have fled, and so have the freed engine crew (Sergo,
// the slave, the cook). Morie and the captive companions stay for their
// scenes. Enemy rooms hold about three live objects; fleeing NPCs leave
// those slots to the monsters.
const fled=new Set([168,182,183,196,201]);
// Kakkara's sand stinger and its Flame Saber caster: two species per room,
// within the loader's enemy graphics budget.
const monsters=[28,36];
const monsterCount={270:3,271:3,318:3,319:2,324:3};
const escapeDoor=0x1a9;
// Every room load sends the ship's own song (25h). In the wreck it becomes
// the cartridge's boss battle theme (04h, as the Mech Rider and the boss
// rooms play it, with the sound test's 04 FF): an under-attack alarm rather
// than Thanatos's ominous crisis cue. The white-out reloads the same room,
// which sends no song, so the escape script starts it itself.
export const shipSong=0x25,alarmSong=[1,0x04,0x04,0xff];

const hash=(a,b=0)=>{let h=Math.imul(a^0x9e3779b9,0x85ebca6b)^Math.imul(b+0x632be5ab,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x27d4eb2f);return((h^h>>>13)>>>0)/4294967296;};
const rgb=(r,g,b)=>Math.max(0,Math.min(31,r|0))|Math.max(0,Math.min(31,g|0))<<5|Math.max(0,Math.min(31,b|0))<<10;

// The wave tore down through the hull just ahead of Goku, so the opening is
// always in view when the white fades; its soot runs on to the far wall.
// It stops short of the wall when he fired across a narrow room.
export function findBreach(canLand,{x,y,dx,dy},radius=34){
 let inside=false,wall=0,edge=null;
 for(let d=8;d<=260&&edge===null;d+=4){
  if(canLand(x+dx*d,y+dy*d)){inside=true;wall=0;continue;}
  if(inside&&(wall+=4)>=12)edge=d-12;
 }
 edge??=200;
 // Keep a downward breach clear of the HUD at the bottom of the screen.
 const d=Math.max(radius+10,Math.min(dy>.5?radius+16:radius+40,edge-radius*.5));
 return{x:Math.round(x+dx*d),y:Math.round(y+dy*d),radius,reach:edge,stand:{x,y}};
}
// A jagged, slightly flattened opening (the view is three-quarter top-down).
const reach=(b,a)=>b.radius*(1+.18*Math.sin(a*5+b.x)+.1*Math.sin(a*11+b.y)+.06*Math.sin(a*23));
function breachDepth(b,x,y){
 const dx=x-b.x,dy=(y-b.y)*1.25,d=Math.hypot(dx,dy);
 return reach(b,Math.atan2(dy,dx))-d;
}

export function createSandshipWreck(snes,mod,state){
 const r=snes.ram,p=snes.ppu,word=a=>r[a]|r[a+1]<<8;
 let combustion=null,sites=null,siteKey='',mask=null,maskKey='',renderFrame=-1,renderActive=false,camera=null,loads=0,spawn=null;
 const onShip=()=>shipMaps.includes(word(0xdc));
 const active=()=>!!state().wreck&&mod.options.enabled&&mod.gokuActive&&onShip()&&p.mode===1;
 const terrain=()=>r[0xe00b];
 const canLand=(x,y)=>!!mod.localFlightHook?.canLand(x,y,terrain()&128?1:0,terrain()&3);
 // C3:0004 is the native sound dispatcher; swap the command before its
 // SPC transfer, so the change lands with the room's own fade.
 const c=snes.cpu,cycle=c.cycle;let songs=0,lastSong=null,songCommands=0;
 c.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===3&&this.br[4]===4&&r[0x1e00]===1){
   if(state().wreck&&mod.options.enabled&&onShip()){
    if(r[0x1e01]===shipSong)r.set(alarmSong,0x1e00);
    if(r[0x1e01]===alarmSong[1])songs++;
   }
   // The song actually sent, for status and checks.
   lastSong=r[0x1e01];songCommands++;
  }
  return cycle.call(this);
 };
 c.registerBreakpoints?.(c.cycle,cycle,[[3,0x0004]]);

 // Native object loader read view (C8:xxxx), active only while wrecked.
 function read(address,data){
  const s=state();
  if(s.cut&&!s.cut.crash&&address>=0x3000+escapeDoor*4&&address<0x3004+escapeDoor*4){
   // The escape reloads the room Goku is standing in, through its own
   // door loader, so guards leave and the monsters arrive with the fade.
   const c=s.cut,i=address-0x3000-escapeDoor*4;s.cut.door=true;
   return[c.map&255,c.tx*2|c.map>>8,c.ty*2|c.layer,data[0x83000+escapeDoor*4+3]][i];
  }
  if(!s.wreck)return;
  const map=word(0xdc);if(!shipMaps.includes(map))return;
  const table=a=>data[0x87000+a*2]|data[0x87001+a*2]<<8,start=table(map),end=table(map+1);
  const count=monsterCount[map]??0,extended=end+count*8;
  if(address===0x7000+map*2){loads++;spawn=null;}
  if(address===0x7000+(map+1)*2)return extended&255;
  if(address===0x7001+(map+1)*2)return extended>>8;
  // Enemy-map palettes and stats: the same header byte the desert uses.
  if(address===start+7){if(s.cut?.door)s.cut.loaded=true;if(count)return 0xff;}
  if(address>start+8&&address<end&&(address-start-8)%8===1&&fled.has(data[0x80000+address+4]))return 0xf0;
  if(address>=end&&address<extended){
   // Collision and Goku's arrival are already in WRAM when objects load.
   if(!spawn)spawn=placeMonsters(map,count);
   return spawn[address-end];
  }
 }
 function floorSpots(map,step,away){
  const spots=[],w=word(0xc0),h=word(0xc2),me={x:word(0xe002),y:word(0xe004)};
  for(let y=step/2;y<h;y+=step)for(let x=step/2;x<w;x+=step)
   if(canLand(x,y)&&Math.hypot(x-me.x,y-me.y)>=away)spots.push({x,y,order:hash(map*977+x,y)});
  return spots.sort((a,b)=>a.order-b.order);
 }
 function spread(spots,count,gap){
  const out=[];
  for(const s of spots){if(out.length>=count)break;if(out.every(o=>Math.hypot(o.x-s.x,o.y-s.y)>=gap))out.push(s);}
  return out;
 }
 function placeMonsters(map,count){
  const chosen=spread(floorSpots(map,16,72),count,40),bytes=[];
  for(let i=0;i<count;i++){
   const s=chosen[i];
   // An unplaced record stays hidden (impossible visibility range).
   if(!s){bytes.push(0,0xf0,0,0,0x40,monsters[0],1,0xc0);continue;}
   bytes.push(0,0x0f,Math.floor(s.x/16),Math.floor(s.y/16),0x40,monsters[i%2],1,0xc0);
  }
  return bytes;
 }
 function prepareSites(){
  const map=word(0xdc),key=`${map}:${loads}`;
  if(siteKey===key)return sites;
  // Wait until this room's collision is loaded under Goku's feet; during a
  // door transition it can still describe the previous room.
  if(!mod.nativeField||!(r[0xe000]&1)||p.forcedBlank||!canLand(word(0xe002),word(0xe004)))return null;
  siteKey=key;mask=null;maskKey='';
  const list=spread(floorSpots(map,24,40),map===271||map===99||map===98||map===318?10:7,52).map((s,i)=>({x:s.x,y:s.y-4,seed:i*7+3}));
  const b=state().wreck?.breach;
  if(b?.map===map)for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5+.4,rr=reach(b,a);
   list.push({x:b.x+Math.cos(a)*rr,y:b.y+Math.sin(a)*rr/1.25-4,seed:40+i*5,rim:true});
  }
  sites=list;return sites;
 }
 // The breach and soot mask value of one world pixel (0 = untouched), with
 // the sand's depth shade (3 within 12 of the rim, else 0) in bits 3+.
 function breachValue(b,wx,wy){
  const origin=b.origin,depth=breachDepth(b,wx,wy);
  if(depth>=0)return depth<2?3:depth<7?2:1|(depth<12?3<<3:0);
  // Soot: a ring around the opening and the beam's scorched path to it.
  let soot=depth>-16&&((wx*7+wy*13)%5<3-(depth<-9?1:0));
  if(!soot&&origin){
   const ax=b.x-origin.x,ay=b.y-origin.y,len=Math.hypot(ax,ay)||1,t=((wx-origin.x)*ax+(wy-origin.y)*ay)/len;
   const off=Math.abs((wx-origin.x)*ay-(wy-origin.y)*ax)/len;
   soot=t>10&&t<Math.max(len,b.reach??0)&&off<7+Math.sin(t*.3)*2&&(wx*5+wy*3)%4<(off<4?3:2);
  }
  return soot?4:0;
 }
 // breachValue depends on the breach alone, so it is memoized over a box
 // that holds every non-zero value: the opening's ring (depth >= -16 lies
 // within 1.34 radius + 16 of the centre, the y offset scaled by 1.25) and
 // the beam's soot path (within 9 of its segment). A camera's screen mask
 // is then a lookup, not some 57,000 fresh evaluations per new position.
 let memoKey='',memo=null,known=null,boxX=0,boxY=0,boxW=0,boxH=0;
 const screenMask=new Uint8Array(256*224),screenShade=new Uint8Array(256*224);
 // Each row's first and past-last column with a nonzero mask value.
 const maskFirst=new Uint16Array(224),maskEnd=new Uint16Array(224);
 function memoize(b){
  const key=`${b.x}:${b.y}:${b.radius}:${b.reach}:${b.origin?.x}:${b.origin?.y}`;
  if(key===memoKey)return;
  memoKey=key;const r=b.radius*1.34+18;
  let x0=b.x-r,x1=b.x+r,y0=b.y-r/1.25,y1=b.y+r/1.25;const o=b.origin;
  if(o){
   const ax=b.x-o.x,ay=b.y-o.y,len=Math.hypot(ax,ay)||1,end=Math.max(len,b.reach??0)+2;
   for(const t of[8,end]){const px=o.x+ax/len*t,py=o.y+ay/len*t;x0=Math.min(x0,px-11);x1=Math.max(x1,px+11);y0=Math.min(y0,py-11);y1=Math.max(y1,py+11);}
  }
  boxX=Math.floor(x0);boxY=Math.floor(y0);boxW=Math.ceil(x1)+1-boxX;boxH=Math.ceil(y1)+1-boxY;
  memo=new Uint8Array(boxW*boxH);known=new Uint8Array(boxW*boxH);
 }
 // Screen-space breach and soot mask for one camera position.
 function breachMask(b,cx,cy){
  memoize(b);const out=screenMask;out.fill(0);screenShade.fill(0);maskFirst.fill(0);maskEnd.fill(0);
  const yA=Math.max(0,boxY-cy),yB=Math.min(224,boxY+boxH-cy),xA=Math.max(0,boxX-cx),xB=Math.min(256,boxX+boxW-cx);
  for(let y=yA;y<yB;y++){
   let first=-1,last=-1;
   for(let x=xA,i=(y+cy-boxY)*boxW+(xA+cx-boxX);x<xB;x++,i++){
    if(!known[i]){known[i]=1;memo[i]=breachValue(b,x+cx,y+cy);}
    const v=memo[i];out[y*256+x]=v&7;screenShade[y*256+x]=v>>3;
    if(v&7){if(first<0)first=x;last=x;}
   }
   if(first>=0){maskFirst[y]=first;maskEnd[y]=last+1;}
  }
  return out;
 }
 const sand=(wx,wy,t)=>{
  // Desert floor rushing past under the moving ship.
  const u=wx+t*1.5,s=Math.sin(u*.16+Math.sin(wy*.09)*2.4)+Math.sin(u*.05-wy*.07)*.6;
  return s>1?rgb(31,25,17):s>.2?rgb(29,21,13):s>-.8?rgb(26,18,11):rgb(21,13,8);
 };

 // The breach is hull decoration: place it from the tile stream's origin
 // and each scanline's actual BG1 scroll, never from the actor camera,
 // which trails the background while scrolling and is offset in flight.
 // Its soot and fire patterns are in world coordinates for the same reason.
 const view={map:0,cameraX:0,cameraY:0};let viewLine=-1;
 const sceneView=y=>{
  if(viewLine!==y){
   viewLine=y;const x0=word(0xa8),y0=word(0xaa);view.map=word(0xdc);
   view.cameraX=x0+((p.bgHoff[0]-x0+8)&15)-8;view.cameraY=y0+((p.bgVoff[0]-y0+8)&15)-8;
  }
  return view;
 };
 const soot=(wx,wy,age)=>((wx+wy+16+(age>>3))&3)?rgb(5,3,3):rgb(9,5,3);
 const fire=(wx,wy,age)=>((wx*3+wy+40+(age>>2))%5<2)?rgb(31,27,10):rgb(31,15,3);
 const color=p.getColor,renderLine=p.renderLine;
 p.getColor=function(sub,x,y){
  const result=color.call(this,sub,x,y);
  if(renderFrame!==mod.frame){renderFrame=mod.frame;renderActive=active();viewLine=-1;}
  if(!renderActive||sub||this.mode!==1||y>=224||result[1]>1)return result;
  camera=sceneView(y);
  const w=state().wreck,b=w.breach,age=w.age;
  if(b?.map===camera.map){
   const key=`${camera.cameraX}:${camera.cameraY}:${b.x}:${b.y}`;
   if(key!==maskKey){maskKey=key;mask=breachMask(b,camera.cameraX,camera.cameraY);}
   const m=mask[y*256+x];
   if(m===1){const wx=x+camera.cameraX,wy=y+camera.cameraY,c=sand(wx,wy,age),shade=screenShade[y*256+x];result[0]=rgb((c&31)-shade,(c>>5&31)-shade,(c>>10&31)-shade);return result;}
   if(m===2){result[0]=soot(x+camera.cameraX,y+camera.cameraY,age);return result;}
   if(m===3){result[0]=fire(x+camera.cameraX,y+camera.cameraY,age);return result;}
   if(m===4){const v=result[0];result[0]=rgb((v&31)*.42+1,(v>>5&31)*.36,(v>>10&31)*.34);}
  }
  // Firelight and a slow red alarm. Dialogue (BG3), HUD and sprites keep
  // their native colors so they stay readable.
  const phase=age%120,alarm=phase<24?Math.sin(phase*Math.PI/24)*4:0,flicker=hash(age>>2,(x>>5)+(y>>5)*8)*2,v=result[0];
  result[0]=rgb((v&31)+2+alarm+flicker,(v>>5&31)-alarm*.4+flicker*.5,(v>>10&31)-2-alarm*.5);
  return result;
 };
 // The wrapper over a whole main-screen scanline, for the compositor
 // (Ppu.registerLineHook): the same per-pixel arithmetic on BG1/BG2 pixels,
 // with the flicker computed once per 32-pixel block.
 // rgb() clamps each channel on its own, so the firelight tint is a
 // channel table per 32x32 block (alarm per frame, flicker per block), and
 // the soot darkening one table per channel: the same arithmetic per value.
 const flickers=new Float64Array(8);let lineMask=null,lineWreck=null,tintAge=-1,tintRow=-1;
 const tintR=new Uint8Array(256),tintG=new Uint8Array(256),tintB=new Uint8Array(32);
 const channel=n=>Math.max(0,Math.min(31,n|0));
 const darkR=new Uint8Array(32),darkG=new Uint8Array(32),darkB=new Uint8Array(32);
 for(let c=0;c<32;c++){darkR[c]=channel(c*.42+1);darkG[c]=channel(c*.36);darkB[c]=channel(c*.34);}
 const wreckLine=(sub,y,colors,layers)=>{
  const w=lineWreck,b=w.breach,age=w.age,cut=b?.map===camera.map?lineMask:null;
  if(age!==tintAge||(y>>5)!==tintRow){
   tintAge=age;tintRow=y>>5;
   const phase=age%120,alarm=phase<24?Math.sin(phase*Math.PI/24)*4:0;
   for(let k=0;k<8;k++)flickers[k]=hash(age>>2,k+(y>>5)*8)*2;
   for(let k=0;k<8;k++){const flicker=flickers[k];for(let c=0;c<32;c++){tintR[k*32+c]=channel(c+2+alarm+flicker);tintG[k*32+c]=channel(c-alarm*.4+flicker*.5);}}
   for(let c=0;c<32;c++)tintB[c]=channel(c-2-alarm*.5);
  }
  // Outside the columns the mask marks on this line, the tint alone.
  const first=cut?maskFirst[y]:0,end=cut?maskEnd[y]:0;
  tint(colors,layers,0,first);tint(colors,layers,end,256);
  // sand(wx, wy, age) with its row term computed once per line.
  const wy=y+camera.cameraY,row=Math.sin(wy*.09)*2.4;
  for(let x=first,at=y*256;x<end;x++){
   if(layers[x]>1)continue;
   const v=colors[x];let r=v&31,g=v>>5&31,bl=v>>10&31;
   {
    const m=cut[at+x];
    if(m===1){
     const u=x+camera.cameraX+age*1.5,s=Math.sin(u*.16+row)+Math.sin(u*.05-wy*.07)*.6;
     const c=s>1?rgb(31,25,17):s>.2?rgb(29,21,13):s>-.8?rgb(26,18,11):rgb(21,13,8),shade=screenShade[at+x];
     colors[x]=rgb((c&31)-shade,(c>>5&31)-shade,(c>>10&31)-shade);continue;
    }
    if(m===2){colors[x]=soot(x+camera.cameraX,y+camera.cameraY,age);continue;}
    if(m===3){colors[x]=fire(x+camera.cameraX,y+camera.cameraY,age);continue;}
    if(m===4){r=darkR[r];g=darkG[g];bl=darkB[bl];}
   }
   const k=(x>>5)*32;
   colors[x]=tintR[k+r]|(tintG[k+g]<<5)|(tintB[bl]<<10);
  }
 };
 const tint=(colors,layers,x0,x1)=>{
  for(let x=x0;x<x1;x++){
   if(layers[x]>1)continue;
   const v=colors[x],k=(x>>5)*32;
   colors[x]=tintR[k+(v&31)]|(tintG[k+(v>>5&31)]<<5)|(tintB[v>>10&31]<<10);
  }
 };
 const wreckOp={type:'line',layers:3,mainOnly:true,fn:wreckLine};
 p.registerLineHook?.('getColor',p.getColor,color,(ppu,line)=>{
  if(renderFrame!==mod.frame){renderFrame=mod.frame;renderActive=active();viewLine=-1;}
  return !renderActive||ppu.mode!==1||line>=224;
 },{name:'sandship-wreck',plan:(ppu,y,plan)=>{
  camera=sceneView(y);lineWreck=state().wreck;const b=lineWreck.breach;
  if(b?.map===camera.map){const key=`${camera.cameraX}:${camera.cameraY}:${b.x}:${b.y}`;if(key!==maskKey){maskKey=key;mask=breachMask(b,camera.cameraX,camera.cameraY);}}
  lineMask=mask;plan.extra.push(wreckOp);plan.skipPost=true;return true;
 }});
 // The white-out runs through the native fade and door load, so it is
 // applied to the finished line, after brightness and forced blank.
 p.renderLine=function(line){
  const result=renderLine.call(this,line),white=state().flash??0;
  if(white>0&&line>0&&line<225&&mod.options.enabled){
   const out=this.pixelOutput,base=line*1536;
   for(let i=0;i<1536;i++)out[base+i]=out[base+i]+(255-out[base+i])*white;
  }
  return result;
 };

 return{
  read,
  get active(){return active();},
  floorHole(x,y){const b=state().wreck?.breach;return !!(b&&active()&&b.map===word(0xdc)&&breachDepth(b,x,y)>=0);},
  breach(beam){return{...findBreach(canLand,beam),map:word(0xdc)};},
  status(){return{active:active(),loads,songs,lastSong,songCommands,sites:sites?.length??0,monsters:mod.entities().filter(e=>e.active&&monsters.includes(e.species)).length};},
  tick(){
   const w=state().wreck;if(!w||!active())return;
   const list=prepareSites();if(!list?.length)return;
   // Something aboard keeps exploding: one burst every couple of seconds.
   if(w.age%150===75){
    const s=list[Math.floor(hash(w.age,loads)*list.length)];
    w.blasts=[...(w.blasts??[]).filter(b=>w.age-b.age<48),{x:s.x,y:s.y,age:w.age}];
    mod.playSound?.('fortressBreak');mod.feedback?.pulse(6);
   }
  },
  draw(layer){
   const w=state().wreck;if(!w||!active())return;
   const list=prepareSites();if(!list)return;
   combustion??=createNativeCombustion(snes.cart.data);
   const {cameraX:cx,cameraY:cy}=mod.status,t=w.age,put=(x,y,c)=>layer.pixel(x,y,c,true);
   for(const s of list){
    const x=s.x-cx,y=s.y-cy;if(x<-24||x>280||y<-32||y>240)continue;
    // A dithered smoke column first, so the flames read in front of it.
    for(let k=0;k<2;k++){
     const age=(t+s.seed*11+k*60)%120,rad=Math.floor(3+age*.09),sx=Math.round(x+Math.sin((age+s.seed)*.05)*6),sy=Math.round(y-14-age*.55);
     if(age<10)continue;
     // Every other pixel only, thinning at the rim: the room shows through.
     const dark=1+rgb(5+age/24,4+age/24,4+age/24),light=1+rgb(9+age/20,8+age/20,8+age/20);
     for(let py=-rad;py<=rad;py++)for(let px=-rad;px<=rad;px++){
      const d=px*px+py*py*1.4;if(d>rad*rad||((sx+px+sy+py)&1))continue;
      if(d>rad*rad*.5&&hash(sx+px,sy+py+(t>>3))<.5)continue;
      put(sx+px,sy+py,py<-rad/3?light:dark);
     }
    }
    // Steady fires in three sizes: the Exploder's flame frames swell and
    // settle in a loop; the smallest are flickering Fireball embers.
    const size=s.rim?1:s.seed%3,step=Math.floor((t+s.seed*5)/7);
    // Frames 3-5 billow and smoulder; 0-2 are the white flash of a blast.
    if(size===0)combustion('burst',3+(step&1),x,y,put,{flip:!!((step>>1)&1)});
    if(size===1)combustion('burst',4+(step&1),x,y+4,put,{flip:!!((step>>1)&1)});
    combustion('ember',Math.floor(t/5+s.seed)%3,x+(s.seed%5-2)*2,y-(size===2?2:10)-(t+s.seed*5)%24*.6,put,{turn:s.seed%4});
    if(size===2)combustion('ember',Math.floor(t/5+s.seed+1)%3,x+5,y+2,put,{turn:(s.seed+1)%4});
   }
   for(const b of w.blasts??[]){
    const dt=t-b.age;
    for(let i=0;i<5;i++){
     const age=dt-i*3;if(age<0||age>=42)continue;
     const a=i*2.39996,spread=i?8+Math.min(age,12)*1.3:0;
     combustion('burst',Math.floor(age/6),b.x-cx+Math.cos(a)*spread,b.y-cy+Math.sin(a)*spread*.6,put,{flip:!!(i&1),turn:i%4});
    }
   }
  },
  restore(){sites=null;siteKey='';mask=null;maskKey='';memoKey='';spawn=null;},
  dispose(){p.getColor=color;p.renderLine=renderLine;},
 };
}
