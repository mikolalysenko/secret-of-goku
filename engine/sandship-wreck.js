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
 // Screen-space breach and soot mask for one camera position.
 function breachMask(b,cx,cy){
  const out=new Uint8Array(256*224),origin=b.origin;
  for(let y=0;y<224;y++)for(let x=0;x<256;x++){
   const wx=x+cx,wy=y+cy,depth=breachDepth(b,wx,wy);
   if(depth>=0){out[y*256+x]=depth<2?3:depth<7?2:1;continue;}
   // Soot: a ring around the opening and the beam's scorched path to it.
   let soot=depth>-16&&((wx*7+wy*13)%5<3-(depth<-9?1:0));
   if(!soot&&origin){
    const ax=b.x-origin.x,ay=b.y-origin.y,len=Math.hypot(ax,ay)||1,t=((wx-origin.x)*ax+(wy-origin.y)*ay)/len;
    const off=Math.abs((wx-origin.x)*ay-(wy-origin.y)*ax)/len;
    soot=t>10&&t<Math.max(len,b.reach??0)&&off<7+Math.sin(t*.3)*2&&(wx*5+wy*3)%4<(off<4?3:2);
   }
   if(soot)out[y*256+x]=4;
  }
  return out;
 }
 const sand=(wx,wy,t)=>{
  // Desert floor rushing past under the moving ship.
  const u=wx+t*1.5,s=Math.sin(u*.16+Math.sin(wy*.09)*2.4)+Math.sin(u*.05-wy*.07)*.6;
  return s>1?rgb(31,25,17):s>.2?rgb(29,21,13):s>-.8?rgb(26,18,11):rgb(21,13,8);
 };

 const color=p.getColor,renderLine=p.renderLine;
 p.getColor=function(sub,x,y){
  const result=color.call(this,sub,x,y);
  if(renderFrame!==mod.frame){renderFrame=mod.frame;renderActive=active();camera=renderActive?mod.status:null;}
  if(!renderActive||sub||this.mode!==1||y>=224||result[1]>1)return result;
  const w=state().wreck,b=w.breach,age=w.age;
  if(b?.map===camera.map){
   const key=`${camera.cameraX}:${camera.cameraY}:${b.x}:${b.y}`;
   if(key!==maskKey){maskKey=key;mask=breachMask(b,camera.cameraX,camera.cameraY);}
   const m=mask[y*256+x];
   if(m===1){const wx=x+camera.cameraX,wy=y+camera.cameraY,c=sand(wx,wy,age),shade=breachDepth(b,wx,wy)<12?3:0;result[0]=rgb((c&31)-shade,(c>>5&31)-shade,(c>>10&31)-shade);return result;}
   if(m===2){result[0]=((x+y+(age>>3))&3)?rgb(5,3,3):rgb(9,5,3);return result;}
   if(m===3){result[0]=((x*3+y+(age>>2))%5<2)?rgb(31,27,10):rgb(31,15,3);return result;}
   if(m===4){const v=result[0];result[0]=rgb((v&31)*.42+1,(v>>5&31)*.36,(v>>10&31)*.34);}
  }
  // Firelight and a slow red alarm. Dialogue (BG3), HUD and sprites keep
  // their native colors so they stay readable.
  const phase=age%120,alarm=phase<24?Math.sin(phase*Math.PI/24)*4:0,flicker=hash(age>>2,(x>>5)+(y>>5)*8)*2,v=result[0];
  result[0]=rgb((v&31)+2+alarm+flicker,(v>>5&31)-alarm*.4+flicker*.5,(v>>10&31)-2-alarm*.5);
  return result;
 };
 p.registerLineHook?.('getColor',p.getColor,color,(ppu,line)=>{
  if(renderFrame!==mod.frame){renderFrame=mod.frame;renderActive=active();camera=renderActive?mod.status:null;}
  return !renderActive||ppu.mode!==1||line>=224;
 });
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
  restore(){sites=null;siteKey='';mask=null;maskKey='';spawn=null;},
  dispose(){p.getColor=color;p.renderLine=renderLine;},
 };
}
