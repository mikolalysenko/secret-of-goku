// Saiyan resilience still uses the cartridge's defense calculation, dodge,
// damage-number cleanup and death paths. Never heal HP to simulate armor.
export function createNativeHitRecovery(snes,mod){
 const r=snes.ram,c=snes.cpu,cycle=c.cycle;
 const word=a=>r[a]|r[a+1]<<8,write=(a,v)=>{r[a]=v;r[a+1]=v>>8;};
 let hit=null,recovered=0,defense=null,reaction=null,contacts=0,deflected=0,parryUntil=0;
 const powered=()=>mod.options.enabled&&mod.options.power&&mod.gokuActive;
 const enabled=()=>mod.options.enabled&&mod.gokuActive&&!mod.nativeFlight&&
   (r[0xe000]&1)&&(r[0xe02c]&1)&&!r[0xd0]&&!(r[0xec]&0xfe)&&
   !(r[0xe190]&0x70)&&!(r[0xe191]&0xd5);
 const hurt=()=>r[0xe011]===0x8d||r[0xe011]===0x8e;
 const old=()=>hit&&snes.frames-hit.frame>=(powered()&&hit.tier==='ordinary'?(mod.options.superSaiyan?4:8):powered()&&mod.options.superSaiyan?8:24);
 const dangerous=()=>mod.trial?.dangerous||mod.challenge?.dangerous||mod.challenge?.empoweredLich||mod.frieza?.fighting;
 function threat(){
   if(dangerous())return 'dangerous';
   const enemy=i=>i>=3&&i<12&&(r[0xe000+i*512]&1)&&word(0xe182+i*512)>0&&!(r[0xe191+i*512]&0x80);
   const boss=i=>enemy(i)&&r[0xe180+i*512]>=0x57&&r[0xe180+i*512]<0x80;
   // Physical hits retain the actor index. Native spells use FF instead;
   // classify those by the live encounter, never by stale attacker data.
   const source=r[0xe1f0];
   if(enemy(source))return boss(source)?'boss':'ordinary';
   for(let i=3;i<12;i++)if(boss(i))return 'boss';
   return 'ordinary';
 }
 function receive(){
   const damage=word(0xe1f1);
   if(!damage||!powered()||!(r[0xe000]&1)||!word(0xe182)||mod.nativeFlight)return;
   // Retail caps queued damage at 999. Scale AFTER that same cap and let
   // the cartridge subtract HP, display the number and handle lethal hits.
   // E1B0:1000 converts damage into healing: leave that native path alone.
   const tier=threat(),gold=mod.options.superSaiyan;
   if(tier!=='dangerous'&&!(word(0xe1b0)&0x1000)){
     const divisor=tier==='ordinary'?(gold?50:20):(gold?8:4),cap=tier==='ordinary'?(gold?5:12):(gold?40:80);
     write(0xe1f1,Math.min(cap,Math.max(1,Math.ceil(Math.min(999,damage)/divisor))));
   }
   hit={map:word(0xdc),frame:snes.frames,tier,recoil:0};
   if(defending()&&tier==='ordinary')reaction={kind:'resist',frame:snes.frames,map:hit.map,facing:mod.facing};
 }
 function softenRecoil(apply){
   if(!powered()||!enabled()||!hurt()||hit?.tier!=='ordinary'||hit.map!==word(0xdc))return;
   // Limit the existing signed-magnitude velocity before collision. Count
   // only movement that reaches the native position commit (C0:D890), so
   // blocked contacts cannot move him through walls or consume a new hit.
   if(apply){hit.recoil+=Math.max(r[0x1e]&0x7f,r[0x1f]&0x7f);return;}
   const gold=mod.options.superSaiyan,budget=Math.max(0,(gold?2:4)-hit.recoil),speed=Math.min(gold?1:2,budget);
   for(const at of[0x1e,0x1f]){const magnitude=Math.min(r[at]&0x7f,speed);r[at]=magnitude?magnitude|(r[at]&0x80):0;}
 }
 function stats(rebuilt=false){
   // C0:4A75 computes physical DEF at E1A5 and magic DEF at E1A8.
   // Add to the real equipment totals; track writes so bonuses cannot stack
   // on each frame, level-up, gear change, checkpoint or form change.
   const addresses=[0xe1a5,0xe1a8],values=addresses.map(word);
   if(!powered()){
     if(defense)addresses.forEach((a,i)=>{if(values[i]===defense.written[i])write(a,defense.base[i]);});
     defense=null;return;
   }
   if(!(r[0xe000]&1))return;
   const base=values.map((v,i)=>!rebuilt&&defense&&v===defense.written[i]?defense.base[i]:v);
   const bonus=mod.options.superSaiyan?[320,160]:[160,80],written=base.map((v,i)=>Math.min(999,v+bonus[i]));
   addresses.forEach((a,i)=>write(a,written[i]));defense={base,written};
 }
 const defending=()=>enabled()&&powered()&&mod.nativeField&&
   !mod.poisoned&&!dangerous()&&!mod.flightTransition;
 function parry(attacker){
   // Ordinary physical contacts only: magic, status weapons, bosses and the
   // upgraded seed-fed Beast remain dangerous. No RNG means exact replays.
   const base=0xe000+attacker;
   if(attacker<0x600||attacker>0x1600||attacker%0x200||!(r[base]&1)||r[base+0x180]>=0x57||word(base+0x199)||word(0xe1f1))return false;
   contacts++;
   if(snes.frames<parryUntil||(mod.options.superSaiyan?contacts%3===0:contacts%3!==0))return false;
   const dx=word(base+2)-word(0xe002),dy=word(base+4)-word(0xe004);
   const facing=Math.abs(dx)>Math.abs(dy)?dx<0?2:1:dy<0?3:0;
   reaction={kind:'deflect',frame:snes.frames,map:word(0xdc),facing};deflected++;parryUntil=snes.frames+24;
   mod.playSound?.('deflect');return true;
 }
 c.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[1]===0){
   if(this.br[4]===0x4afe)stats(true);
   if(this.br[4]===0x514b&&defending()&&parry(this.br[2])){
     // Tail-call the retail dodge routine: its RTS returns to the physical
     // resolver normally, without manufacturing damage or a knockdown.
     this.br[4]=0x4e6f;
   }
   if(this.br[4]===0x4053)receive();
  }
  if(this.cyclesLeft===0&&(this.r[1]&63)===0&&word(0x10)===0){
   if(this.br[4]===0xd651)softenRecoil(false);
   if(this.br[4]===0xd890)softenRecoil(true);
  }
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
   stats();
   const map=r[0xdc]|r[0xdd]<<8;
   if(reaction&&(!defending()||reaction.map!==map||snes.frames-reaction.frame>=8))reaction=null;
   if(!enabled()||!hurt()){hit=null;return;}
   if(!hit||hit.map!==map)hit={map,frame:snes.frames,tier:threat(),recoil:0};
   if(old())r[0xe012]=Math.min(r[0xe012],1);
  },
  get recovered(){return recovered;},
  get reaction(){return reaction;},
  get deflected(){return deflected;},
  draw(layer,x,y,size){
   if(reaction?.kind!=='deflect'||!defending())return;
   const age=snes.frames-reaction.frame,[dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]][reaction.facing];
   const px=x+size/2+dx*12,py=y+size/2+dy*10;
   layer.stamp('impact-spark',age>>1,px+dx*age,py+dy*age,dx,dy);
   if(age<5)layer.stamp(mod.options.superSaiyan?'gold-arc':'lightning-impact',age>>1,px,py,dx,dy);
  },
  snapshot(){return structuredClone({hit,recovered,defense,reaction,contacts,deflected,parryUntil});},
  restore(s){hit=s?.hit?{...s.hit}:null;recovered=s?.recovered??0;defense=s?.defense?structuredClone(s.defense):null;reaction=s?.reaction?{...s.reaction}:null;contacts=s?.contacts??0;deflected=s?.deflected??0;parryUntil=s?.parryUntil??0;},
  dispose(){c.cycle=cycle;},
 };
}
