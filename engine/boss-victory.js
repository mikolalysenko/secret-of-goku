import {orbitVectors} from './orbit-pixels.js';
import {createNativeBossParticles} from './native-boss-particles.js';
const particleArt=new WeakMap();

// Captured from the unmodified Mantis Ant defeat: repeated explosion cue,
// music fade, then the original boss victory fanfare. The SPC plays the ROM's
// own samples and sequence; no recording or substitute jingle is embedded.
export const bossVictoryCommands={stop:[0xf0,0,0,0],death:[2,0x94,15,0x80],burst:[2,0x15,15,0],fade:[0x80,0x80,0,0],acquire:[2,0xd8,0,0x88],jingle:[1,0x18,0x44,0x8f]};
// Native frame offsets from the fatal hit. Mantis Ant's fanfare starts at
// frame 375, about 50 frames after the last burst while the screen is still
// white, and plays for about 513 frames; leave 540 before travel, dialogue
// or replacement music. The native item chime follows the fanfare, and D8h
// still sounds after the fanfare's sample upload.
export const bossVictoryTiming={bursts:[36,56,76,96,116,137,157,177,197,217,237,257,326],fade:143,white:306,vanish:326,jingle:375,reveal:631,clear:791,acquireFrames:120,jingleFrames:540};
export function bossVictoryCue(age){
 // 94h is the opening boss-death effect, not the D8h item-acquisition
 // chime. Replacing it with 15h loses the characteristic death sound.
 return age===0?'death':bossVictoryTiming.bursts.includes(age)?'burst':age===bossVictoryTiming.fade?'fade':null;
}
export function bossDeathColor(color,age){
 if(!color||age<0)return color;
 const c=color-1,shade=Math.round(((c&31)*3+(c>>5&31)*6+(c>>10&31))/10),phase=Math.floor(age/(age<180?8:4))%4;
 if(shade<5)return 1+shade;
 if(phase>=2)return 0x8000;
 return 1+31+(Math.max(0,shade-24)<<5);
}
export function createBossVictoryAudio(snes,mod,getState){
 const cpu=snes.cpu,cycle=cpu.cycle;
 const state=()=>getState().nativeAudio??=( {queue:[],pending:null,lastFrame:-1,played:[],completed:[]} );
 cpu.cycle=function(){
  const boundary=this.cyclesLeft===0&&(this.r[1]&63)===0&&this.br[4]===0xb073;
  if(boundary){
   const s=state();
   if(s.pending&&this.br[3]===s.pending.sp){
    this.setP(s.pending.p);(s.completed??=[]).push({name:s.pending.name,frame:mod.frame});if(s.completed.length>20)s.completed.shift();s.pending=null;
   }
   const safe=!s.pending&&s.queue.length&&s.lastFrame!==snes.frames&&mod.options.enabled&&mod.canAttack&&!this.waiting&&!this.stopped&&!this.nmiWanted&&!this.abortWanted&&(!this.irqWanted||this.i)&&snes.ram[0x1e00]===0;
   if(safe&&[0xe2,0x20,0xa9,1].every((v,i)=>snes.cart.data[0xb073+i]===v)){
    const q=s.queue.shift();
    // Preserve the original sound for older mid-victory checkpoints too.
    if(q.name==='hit')q.name='death';
    s.lastFrame=snes.frames;s.pending={name:q.name,p:this.getP(),sp:this.br[3]};
    // C3:0198 skips an already selected song. A previous native boss may
    // have left 18h cached after its fanfare ended; explicitly restart it.
    if(q.name==='jingle'&&snes.ram[0x1e05]===0x18)snes.ram[0x1e05]=0xff;
    snes.ram.set(bossVictoryCommands[q.name],0x1e00);s.played.push({name:q.name,frame:mod.frame});if(s.played.length>20)s.played.shift();
    this.pushByte(this.r[1]);this.pushWord((this.br[4]-1)&65535);this.r[1]=0xc3;this.br[4]=4;this.cyclesLeft=7;return;
   }
  }
  return cycle.call(this);
 };
 return{play(name){if(name in bossVictoryCommands)state().queue.push({name,frame:mod.frame});},
  get pending(){const s=state();return !!s.pending||s.queue.length>0;}};
}

export function bossVictoryWhite(age){
 if(age<bossVictoryTiming.fade)return 0;
 if(age<bossVictoryTiming.white)return Math.floor(31*(age-bossVictoryTiming.fade)/(bossVictoryTiming.white-bossVictoryTiming.fade))/31;
 if(age<bossVictoryTiming.reveal)return 1;
 return Math.max(0,Math.ceil(31*(bossVictoryTiming.clear-age)/(bossVictoryTiming.clear-bossVictoryTiming.reveal))/31);
}

export function drawBossVictory(x,y,age,{put,disc},rom){
 if(age<0||age>bossVictoryTiming.vanish+525)return;
 // The small white-hot bursts precede the original generated particle oval.
 const word=a=>1+(rom[a]|rom[a+1]<<8),white=word(0x2fd28+6),gold=word(0x2fd28+4);
 for(let i=0;i<bossVictoryTiming.bursts.length-1;i++){
  const t=age-bossVictoryTiming.bursts[i];if(t<0||t>26)continue;const [vx,vy]=orbitVectors[(i*7)&15],px=x+((vx*(12+i%4*5))>>8),py=y+((vy*(12+i%4*5))>>8),r=Math.max(2,Math.min(15,t+3,28-t));
  disc(px,py,r,gold);disc(px,py,Math.max(1,r-2),white);
 }
 if(!particleArt.has(rom))particleArt.set(rom,createNativeBossParticles(rom));
 particleArt.get(rom)(x,y,age-bossVictoryTiming.vanish,put);
}
