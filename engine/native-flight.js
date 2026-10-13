// Secret of Mana USA native flight adapter.
// Bypass only native Drum summon choreography. Keep original map-to-world
// lookup/return bookkeeping, fade, Mode7 world loader, and landing logic.
export function createNativeFlight(snes,{canTakeOff=null,enabled=()=>true,onStart=null,onLand=null}={}){
 const c=snes.cpu,r=snes.ram,priorCycle=c.cycle,read16=a=>r[a]|r[a+1]<<8;
 let requested=false,pending=null,drumPending=false,lastError=null,starts=0;
 const mapAllows=()=>{const map=read16(0xdc),cart=snes.cart?.data;if(!cart||map>=512)return false;const at=0x87000+map*2,header=0x80000+(cart[at]|cart[at+1]<<8);return !!(cart[header+4]&0x80);};
 const worldActive=()=>[0x5c,0xcf,0x88,0x00,0x5c,0x4b,0x8a,0x00].every((v,i)=>r[0x100+i]===v);
 const ground=()=>r[0xe4]===1&&r[0xe5]===1&&r[0xd0]===0&&(r[0xec]&0xfe)===0&&r[0xff]===0&&(r[0xe8]&4)===0;
 const safe=()=>enabled()&&ground()&&mapAllows()&&(!canTakeOff||canTakeOff());
 function fade(){
  // C1:E76D has already initialized FA/FC/F6 and saved native CDxx return
  // state. Reproduce C0:A4E1-EC + C0:8B16 fade request, without dragon art.
  r[0xe8]=0;r[0xff]=0x80;r[0xe0]=0;r[0xe7]=0;r[0xe4]=1;r[0xe5]=4;r[0xe2]|=1;
  starts++;onStart?.();
 }
 c.cycle=function(){
  if(this.cyclesLeft===0){
   const bank=this.r[1],pc=this.br[4],boundary=(bank===0||bank===0xc0)&&pc===0xb073;
   if((bank&0x3f)===0&&pc===0xbc0b&&enabled()&&worldActive()&&(r[0xe8]&1)){
    // The world loader has already chosen the map and landing coordinates.
    // Bit 0 requests the separate BG3 dragon fly-by and hides the party until
    // it passes. Enter the ordinary ground loader instead, keeping its door,
    // collision, party placement, music and fade. Cannon landings use bit 1.
    r[0xe8]&=~1;r[0x52]=0;onLand?.();
   }
   if(boundary&&pending){
    if(this.br[3]!==pending.br[3]){lastError='Native flight dispatcher returned with unexpected stack';requested=false;pending=null;}
    else{const saved=pending;pending=null;this.br.set(saved.br);this.r.set(saved.r);this.setP(saved.p);}
   }
   if((bank&0x3f)===1&&pc===0xdbcd&&enabled()){
    // This PC is reached only by the existing ring's item7 dispatcher, after
    // its normal availability checks and close. No item index guessing.
    this.br[4]=0xdc22;drumPending=true;
   }
   if((bank&0x3f)===1&&pc===0xe837&&enabled()&&r[0xe8]===4){
    // Shared native 0Cxx path: Drum, F, and event opcode1C all finish
    // native coordinate lookup/return bookkeeping here. Include scripted
    // Flammie departures (e.g. Mech Rider2 aftermath / event532).
    drumPending=false;fade();
   }
   if(boundary&&requested&&!pending&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)){
    requested=false;
    const signature=[0xe2,0x20,0x8b,0x48].every((v,i)=>snes.cart?.data[0x1e76d+i]===v);
    if(!signature||!safe()){lastError='Takeoff unavailable in current native state/map';}
    else{
     pending={br:[...this.br],r:[...this.r],p:this.getP()};
     // Original event dispatch is an actual long-call ABI. Unlike setting
     // world position directly, this preserves original return-map details.
     r[0xd4]=0;r[0xd5]=0;this.br[0]=0x0c00|(read16(0xdc)&255);
     this.pushByte(this.r[1]);this.pushWord((this.br[4]-1)&65535);
     this.r[1]=1;this.br[4]=0xe76d;this.cyclesLeft=7;return;
    }
   }
  }
  return priorCycle.call(this);
 };
 return{worldActive,request(){if(!safe()){lastError='Takeoff unavailable in current native state/map';return false;}requested=true;lastError=null;return true;},mapAllows,clear(){requested=false;},get pending(){return requested||!!pending||drumPending;},get starts(){return starts;},get error(){return lastError;},dispose(){c.cycle=priorCycle;},snapshot(){return{requested,pending,drumPending,lastError,starts};},restore(saved){requested=!!saved?.requested;pending=saved?.pending||null;drumPending=!!saved?.drumPending;lastError=saved?.lastError||null;starts=saved?.starts||0;}};
}
