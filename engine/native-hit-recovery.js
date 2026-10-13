// Goku flinches, but a bee must not pin him behind the native two-second
// damage-number bounce. Finish that overlay through its original cleanup;
// retain damage, poison, sleep, death, boss scripts and other party members.
export function createNativeHitRecovery(snes,mod){
 const r=snes.ram,c=snes.cpu,cycle=c.cycle;
 let hit=null,recovered=0;
 const enabled=()=>mod.options.enabled&&mod.gokuActive&&!mod.nativeFlight&&
   (r[0xe000]&1)&&(r[0xe02c]&1)&&!r[0xd0]&&!(r[0xec]&0xfe)&&
   !(r[0xe190]&0x70)&&!(r[0xe191]&0xd5);
 const hurt=()=>r[0xe011]===0x8d||r[0xe011]===0x8e;
 const old=()=>hit&&snes.frames-hit.frame>=24;
 c.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[1]===0&&this.br[4]===0xf590&&old()&&enabled()&&hurt())r[0xe012]=0;
  if(this.cyclesLeft===0&&(this.r[1]&63)===1&&this.br[1]===0&&this.br[4]===0x8355&&hit&&old()&&enabled()){
   // E11F is the native damage-number fade counter. 1 underflows at
   // C1:8377 and enters C1:83F9, which restores the actor and frees the OBJ.
   r[0xe11f]=1;r[0xe012]=Math.min(r[0xe012],1);recovered++;
  }
  return cycle.call(this);
 };
 return{
  tick(){
   const map=r[0xdc]|r[0xdd]<<8;
   if(!enabled()||!hurt()){hit=null;return;}
   if(!hit||hit.map!==map)hit={map,frame:snes.frames};
   if(old())r[0xe012]=Math.min(r[0xe012],1);
  },
  get recovered(){return recovered;},
  snapshot(){return{hit:hit?{...hit}:null,recovered};},
  restore(s){hit=s?.hit?{...s.hit}:null;recovered=s?.recovered??0;},
  dispose(){c.cycle=cycle;},
 };
}
