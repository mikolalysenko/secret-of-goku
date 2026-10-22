// The cartridge's combat feel in the browser references. By the
// maintainer's request (2026-10-21) the cartridge's combat timing and power
// no longer follow engine/mana-mod.js (snes/gen/snes-feel.mjs FEEL): the
// hit stop is graded harder and a kill holds Goku longer, a press after the
// combo buffer opens starts the next blow at once, the punch's map strike
// and a miss's native B pulse wait for the next frame, and launches fly
// farther and higher (the Kamehameha's farther still). The browser mod
// keeps its own values. Test references that replay the browser's code
// against the cartridge apply these textual patches to the browser's own
// sources first, so those expectations are explicit and every other aspect
// of the comparison stays exact (damage, HP, rewards, story state, every
// other timing). Each patch must apply exactly once.
import {FEEL} from '../gen/snes-feel.mjs';

const j=JSON.stringify;
const PATCHES={
  'mana-mod.js':[
    // the graded hit stop
    ['static HIT_STOP=[[5,6,10],[4,5,9]];',`static HIT_STOP=${j(FEEL.hitStop)};`],
    // Goku holds a blow that kills a native actor at least the kill's stop
    ['action.hitPause=contacts.length?ManaMod.HIT_STOP[action.super?1:0][action.combo]:0;',
     `action.hitPause=contacts.length?ManaMod.HIT_STOP[action.super?1:0][action.combo]:0;const stop=action.hitPause;if(targets.some((e,i)=>!e.custom&&contacts.includes(e)&&hits[i]?.after===0))action.hitPause=Math.max(action.hitPause,${j(FEEL.killStop)}[action.super?1:0]);`],
    // the struck targets, their spark and the native shake keep the blow's
    // own stop (a kill's longer hold is Goku's alone: the target already flies)
    ['hit.hold=action.hitPause+1;','hit.hold=stop+1;'],
    ['hold:action.hitPause,super:action.super});','hold:stop,super:action.super});'],
    ['this.write8(enemy.base+0x0d,(action.hitPause<<4)|(dx?1:2));','this.write8(enemy.base+0x0d,(stop<<4)|(dx?1:2));'],
    // a press after the combo buffer opens starts the next blow at once
    ["else if(this.action.kind==='punch'&&(!(this.lastInput&1)||this.attackHeld>=12))this.queuedPunch=true;",
     "else if(this.action.kind==='punch'&&(!(this.lastInput&1)||this.attackHeld>=12)){this.queuedPunch=true;if(this.action.age>=(this.action.super?4:9)){this.queuedPunch=false;this.punch();}}"],
    // launches fly farther (the Kamehameha's farther still) and higher
    ['distance:slide?ManaMod.SLIDE[ssj]:ssj?88:56',
     `distance:slide?ManaMod.SLIDE[ssj]:launch==='beam'?${j(FEEL.beamLaunch)}[ssj]:${j(FEEL.launch)}[ssj]`],
    ['this.hit(enemy,effect.damage,effect.dx,effect.dy,true);',"this.hit(enemy,effect.damage,effect.dx,effect.dy,beam?'beam':true);"],
    ['Math.round(Math.sin(t*Math.PI)*20)',`Math.round(Math.sin(t*Math.PI)*${FEEL.lift})`],
    // the punch's map strike and a miss's native B pulse wait for the next
    // frame (combat cb_punch_map: off the strike's own, heaviest frame)
    ['if(!hits.length)this.nativeTapFrames=2;','if(!hits.length)this.snesTapPending=true;'],
    ['if(this.barriers?.punch({...origin,dx,dy}))this.nativeTapFrames=0;','if(this.barriers?.punch({...origin,dx,dy}))this.snesTapPending=false;'],
    ['for(const effect of this.effects){if(effect.hold>0)effect.hold--;else effect.life--;}',
     'if(this.snesTapPending){this.snesTapPending=false;this.nativeTapFrames=2;}for(const effect of this.effects){if(effect.hold>0)effect.hold--;else effect.life--;}'],
  ],
};

// The source of an engine file as the cartridge's feel expects it (other
// files unchanged).
export function snesFeel(file,text){
  const name=file.split('/').pop();
  for(const [from,to] of PATCHES[name]??[]){
    const n=text.split(from).length-1;
    if(n!==1)throw Error(`snes-feel: ${name}: ${n} matches for ${from.slice(0,60)}`);
    text=text.replace(from,to);
  }
  return text;
}
