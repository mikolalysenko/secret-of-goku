// Keep native map streaming, parallax and sprite coordinates in step with IT.
// C0:D6AC calls the game's camera dispatcher; its signed-magnitude deltas must
// stay below one 16px map cell so each crossed row/column is uploaded to VRAM.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const packed=n=>n<0?0x80|-n:n;
export function createNativeTeleport(snes,mod,collision){
 const r=snes.ram,c=snes.cpu,cycle=c.cycle,word=a=>r[a]|r[a+1]<<8;
 let pending=null,scrolls=0,scrollFrame=-1;
 function findLanding(target,origin){
  const terrain=target.terrain??r[target.base+11],layer=terrain&128?1:0;
  // Frieza hovers over his broken deck. IT can end in a hover there, using
  // the same bounded flight corridor; ordinary targets still need a floor.
  const airborne=target.custom==='frieza';
  const clear=(x,y)=>{
   if(!collision.canLand(x,y,layer,terrain&3)&&!(airborne&&collision.canFly(x,y,layer)))return false;
   // Do not materialize on a door, a layer-change seam or a scripted pad.
   for(const dx of[-6,0,6])for(const dy of[-4,0,4]){
    const tile=collision.tileAt(x+dx,y+dy,layer);
    if(!tile||(tile.behavior&0x10)||(tile.flags&7)>2)return false;
   }
   return true;
  };
  const ox=origin.x-target.x,oy=origin.y-target.y,preferred=Math.abs(ox)>=Math.abs(oy)?[Math.sign(ox)||1,0]:[0,Math.sign(oy)||1];
  const directions=[preferred,...[[1,0],[-1,0],[0,1],[0,-1]].filter(d=>d[0]!==preferred[0]||d[1]!==preferred[1])];
  for(const distance of[26,22,18,32,38])for(const[dx,dy]of directions){
   const x=Math.round(target.x+dx*distance),y=Math.round(target.y+dy*distance);
   if(!clear(x,y))continue;
   // Stay on the enemy's side of a wall/bank, close enough to punch it.
   let connected=true;
   for(let n=6;n<distance;n+=4)if(!clear(target.x+dx*n,target.y+dy*n)){connected=false;break;}
   if(connected)return{x,y,terrain,layer,air:airborne&&!collision.canLand(x,y,layer,terrain&3),facing:dx<0?1:dx>0?2:dy<0?0:3};
  }
  return null;
 }
 function gather(landing){
  // Bring CPU-controlled companions along. Leaving them on the old screen
  // trips the native party-distance leash and can lock movement or the ring.
  for(const base of[0xe200,0xe400])if((r[base]&1)&&!r[base+0x2c]&&!(r[base+0x0e]&0x80)){
   mod.write16(base+2,landing.x);mod.write16(base+4,landing.y);r[base+11]=landing.terrain;
   r[base+6]=r[base+7]=r[base+0x2d]=r[base+0x45]=0;
  }
 }
 function follow(landing){
  gather(landing);
  // Mode 7 boss arenas use fixed background/matrix setup, not the scrolling
  // overworld tile ring. Uploading ordinary map rows can corrupt the Beast.
  if(snes.ppu?.mode===7){pending=null;return;}
  pending={map:word(0xdc),layer:landing.layer,terrain:landing.terrain,
   // Native camera deltas are integer pixels. A fractional custom enemy
   // position otherwise leaves a subpixel remainder forever, locking IT.
   x:clamp(Math.round(landing.x)-128,0,Math.max(0,word(0xc0)-256)),
   y:clamp(Math.round(landing.y)-112,0,Math.max(0,word(0xc2)-224))};
 }
 c.cycle=function(){
  if(pending&&this.cyclesLeft===0&&(this.r[1]&63)===0){
   if(word(0xdc)!==pending.map||r[0xd0]||r[0xff]||!mod.options.enabled)pending=null;
   else if(this.br[4]===0xd651&&word(0x10)===0){
    // A second main-loop update in the same video frame cannot enqueue a
    // second tile row: the first upload must reach VRAM before we continue.
    if(scrollFrame===(snes.frames??0)){this.br[4]=0xd65c;return cycle.call(this);}
    const at=pending.layer?0xac:0xa8;
    const dx=clamp(pending.x-word(at),-15,15),dy=clamp(pending.y-word(at+2),-15,15);
    if(!dx&&!dy)pending=null;
    else{
     r[0x84]=packed(dx);r[0x86]=packed(dy);r[0x1b]=pending.terrain;
     this.br[4]=0xd6ac;scrolls++;scrollFrame=snes.frames??0;
    }
   }else if(this.br[4]===0xda6e&&word(0x10)!==0){r[0x84]=r[0x86]=0;}
  }
  return cycle.call(this);
 };
 return{findLanding,follow,gather,get pending(){return !!pending;},get scrolls(){return scrolls;},
  snapshot:()=>pending?{...pending,scrollFrame}:null,restore:s=>{pending=s?{...s,x:Math.round(s.x),y:Math.round(s.y)}:null;scrollFrame=s?.scrollFrame??-1;},dispose(){c.cycle=cycle;}};
}
