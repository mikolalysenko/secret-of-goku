// Combat test scenarios: an import bundle (its browser-mod source state comes
// from .local/snes-import/catalog.json), an input script (button[+button]:frames
// per step) and optional set-up. Both the cartridge and the browser engine run
// the same script from the same state; run.mjs compares the traces.
const RABITES='animation-audit__native__rabite-field-a';   // Goku (288,602), Rabites 3-5
const BATTLE='snes-ref__battle__state';                     // preset battle (map 246): Goku (280,426), Frieza's fight
export const SCENARIOS=[
  // One jab kills the Rabite to the right: 999 queued, 1 HP left for the
  // native lethal hit, death effect F9 flies 56 px, 1 XP each, 2 GP.
  {name:'punch',bundle:RABITES,script:'right:12,b:3,none:40'},
  // Tapping chains jab -> cross -> kick (buffered after frame 9), misses
  // pulse native B; an idle gap resets the chain.
  {name:'combo',bundle:RABITES,script:'left:3,b:1,none:5,b:1,none:5,b:1,none:5,b:1,none:40,b:1,none:20'},
  // Holding B chains the combo too.
  {name:'combo-held',bundle:RABITES,script:'left:3,b:60,none:20'},
  // Super Saiyan: 7-frame punches, strike after 1 frame, 88 px launch.
  {name:'ssj-punch',bundle:RABITES,ssj:true,script:'right:12,b:2,none:30'},
  // Ki: one shot per tap, 14 px per frame, 40% damage, first contact only.
  {name:'ki',bundle:RABITES,script:'right:4,y:1,none:30,y:1,none:30'},
  {name:'ki-held',bundle:RABITES,script:'right:4,y:40,none:30'},
  {name:'ki-ssj',bundle:RABITES,ssj:true,script:'right:4,y:30,none:30'},
  // Kamehameha: full base charge (90 frames), release toward the Rabites.
  {name:'beam',bundle:RABITES,script:'right:4,l+y:95,none:50'},
  {name:'beam-partial',bundle:RABITES,script:'right:4,l+y:30,none:40'},
  // Full Super Saiyan wave (45 frames): 64-frame beam, 6-frame pulses.
  {name:'wave',bundle:RABITES,ssj:true,script:'right:4,l+y:50,none:80'},
  // Focus builds 96 frames; L+A at full power transforms (first reveal: 72
  // frames, the burst on age 26 hits everything within 56 px). The walk
  // ends where the browser's does (x 324) on both sides: a lagging field
  // frame walks 2 px less, and a Rabite 4 px farther stays out of the
  // burst's reach (and ignores Goku).
  {name:'transform',bundle:RABITES,radial:88,script:'right:20,l:100,l+a:4,l:2,none:90',pokes:[[22,0x7EE002,324,2]]},
  // Mantis Ant (boss species $57): one jab leaves 1 HP, the native lethal hit
  // starts its own death and the cave's defeat/rescue event; bosses never fly.
  {name:'mantis',bundle:'emulator-probe__map-260-state',script:'up:2,b:2,none:420',
    check:(js,cart)=>{const f=[];const ev=t=>t.some(x=>x.d0);if(ev(js)&&!ev(cart))f.push('the native defeat event never started');
      if(cart.some(x=>x.kb))f.push('the boss was launched');return f;}},
  // A boss hit on Goku (queued at C0:4053 by the Mantis, slot 3): Saiyan
  // resilience scales it to ceil(300/4) = 75 (cap 80; SSJ /8, cap 40), the
  // native consumer subtracts it and the recovery ends after 24 / 8 frames.
  {name:'boss-hit',bundle:'emulator-probe__map-260-state',script:'none:120',pokes:[[10,0x7EE1F1,300,2],[10,0x7EE1F0,3]],
    check:(js,cart)=>{const f=[];const loss=t=>t[0].ghp-Math.min(...t.map(x=>x.ghp));if(loss(js)!==loss(cart))f.push(`HP loss: browser ${loss(js)}, cartridge ${loss(cart)}`);return f;}},
  {name:'boss-hit-ssj',bundle:'emulator-probe__map-260-state',ssj:true,script:'none:120',pokes:[[10,0x7EE1F1,300,2],[10,0x7EE1F0,3]],
    check:(js,cart)=>{const f=[];const loss=t=>t[0].ghp-Math.min(...t.map(x=>x.ghp));if(loss(js)!==loss(cart))f.push(`HP loss: browser ${loss(js)}, cartridge ${loss(cart)}`);return f;}},
  // An ordinary hit (a Rabite, slot 3): ceil(60/20) = 3 (SSJ ceil(60/50) = 2).
  {name:'chip-hit',bundle:RABITES,script:'none:90',pokes:[[10,0x7EE1F1,60,2],[10,0x7EE1F0,3]],
    check:(js,cart)=>{const f=[];const loss=t=>t[0].ghp-Math.min(...t.map(x=>x.ghp));if(loss(js)!==loss(cart))f.push(`HP loss: browser ${loss(js)}, cartridge ${loss(cart)}`);return f;}},
  {name:'chip-hit-ssj',bundle:RABITES,ssj:true,script:'none:90',pokes:[[10,0x7EE1F1,60,2],[10,0x7EE1F0,3]],
    check:(js,cart)=>{const f=[];const loss=t=>t[0].ghp-Math.min(...t.map(x=>x.ghp));if(loss(js)!==loss(cart))f.push(`HP loss: browser ${loss(js)}, cartridge ${loss(cart)}`);return f;}},
  // Rabites attacking Goku: the Saiyan defense absorbs ordinary hits; base
  // form deflects every third clean contact, Super Saiyan two of three
  // (24 frames apart) through the retail dodge path.
  {name:'deflect',bundle:RABITES,rewards:false,script:'right:30,none:900',
    check:(js,cart)=>{const d=t=>t[t.length-1].deflected;return d(cart)<1?['no deflection']:[];}},
  {name:'deflect-ssj',bundle:RABITES,ssj:true,rewards:false,script:'right:30,none:900',
    check:(js,cart)=>{const d=t=>t[t.length-1].deflected;return d(cart)<2?['fewer than two deflections']:[];}},
  // Heavy Gi through the native armor ring (X opens it, B confirms), as
  // tests/browser/training-gear.spec.mjs: off -> strength 255, agility back;
  // on again -> 230 and floor(agility * 0.8); the ring rebuild never stacks.
  {name:'heavy-gi',bundle:'graphics-audit__party',rewards:false,ringProbes:true,
    script:'none:4,x:2,none:90,b:2,none:90'+',b:2,none:90,b:2,none:90'.repeat(2)+',x:2,none:90,x:2,none:90,x:2,none:90',
    check:(js,cart)=>{
      const seq=t=>{const o=[];let last='';for(const f of t){const k=`${f.armor}/${f.str}/${f.agi}`;if(k!==last){o.push(k);last=k;}}return o;};
      const a=seq(js),b=seq(cart),f=[];
      if(JSON.stringify(a)!==JSON.stringify(b))f.push(`armor/str/agi: browser ${a.join(' > ')}, cartridge ${b.join(' > ')}`);
      return f;}},
  {name:'heavy-gi-ssj',bundle:'graphics-audit__party',ssj:true,rewards:false,ringProbes:true,
    script:'none:4,x:2,none:90,b:2,none:90'+',b:2,none:90,b:2,none:90'.repeat(2)+',x:2,none:90,x:2,none:90,x:2,none:90',
    check:(js,cart)=>{
      const seq=t=>{const o=[];let last='';for(const f of t){const k=`${f.armor}/${f.str}/${f.agi}/${f.pdef}`;if(k!==last){o.push(k);last=k;}}return o;};
      const a=seq(js),b=seq(cart),f=[];
      if(JSON.stringify(a)!==JSON.stringify(b))f.push(`armor/str/agi/def: browser ${a.join(' > ')}, cartridge ${b.join(' > ')}`);
      return f;}},
  // Super Saiyan: a fresh L+A reverts in 10 frames.
  {name:'revert',bundle:RABITES,ssj:true,script:'l:4,l+a:3,none:30'},
  // Frieza, a virtual target (frieza.js entity() index 12 / hit()), in the
  // battle reference: Goku (permanent Super Saiyan) at (280, 426); Frieza
  // pinned with his feet at (x, y) (entity() and the boxes use y + 12), no
  // attack due; the browser runs its own frieza.js hit(). Checked: every
  // hit() call (damage, melee, HP taken) and its frame, Frieza's HP, the
  // contact hold, the ki shot spent at its first contact, the impact
  // sparks, beam pulses (8 / 6 frames), no launch, no native queue.
  // Jab, cross, kick from 26 px (15% of 8191 / 12287 while punching).
  {name:'frieza-punch',bundle:BATTLE,ssj:true,frieza:{x:310,y:414},script:'right:2,b:1,none:5,b:1,none:5,b:1,none:40'},
  // Ki from 115 px: the shot travels 14 px a frame and stops at Frieza.
  {name:'frieza-ki',bundle:BATTLE,ssj:true,frieza:{x:400,y:414},script:'right:2,y:1,none:40'},
  {name:'frieza-ki-held',bundle:BATTLE,ssj:true,frieza:{x:400,y:414},script:'right:2,y:30,none:40'},
  // A partial Kamehameha (20 of 45 frames): one pulse every 8 frames.
  {name:'frieza-beam',bundle:BATTLE,ssj:true,frieza:{x:400,y:414},script:'right:2,l+y:20,none:50'},
  // The full Super Saiyan wave: 64 frames, a pulse every 6.
  {name:'frieza-wave',bundle:BATTLE,ssj:true,frieza:{x:400,y:414},script:'right:2,l+y:50,none:90'},
  // The transformation burst (base form; the permanent form off on both
  // sides): Frieza 30 px away takes 75% of 8191 radially, no launch.
  {name:'frieza-burst',bundle:BATTLE,frieza:{x:310,y:414,permanent:false},script:'right:2,l:100,l+a:4,l:2,none:60'},
  // combat_api_beam (test ROM, asked at every frame end) equals the
  // browser's beamGeometry() at every age: a partial beam, the full wave.
  {name:'beam-api',bundle:RABITES,testRom:true,beamApi:true,script:'right:4,l+y:30,none:40'},
  {name:'wave-api',bundle:RABITES,ssj:true,testRom:true,beamApi:true,script:'right:4,l+y:50,none:80'},
  // combat_api_input_hold (test ROM mailbox; mana-mod.js trial.inputLocked):
  // held from 3 frames after a full Kamehameha's release for 40 frames: the
  // beam runs out and keeps hitting the Rabites, launches pause, B (held
  // across the release) starts nothing until the hold ends, then punches.
  {name:'input-hold',bundle:RABITES,testRom:true,script:'right:4,l+y:95,none:3,b:50,none:30',locks:[[102,'hold'],[142,'unlock']]},
  // Receive hooks (test ROM: modules_combat_receive) see Goku's queued
  // damage first: the Mantis's 300 capped at 110 by the hook, then the boss
  // rule ceil(110 / 4) = 28 (the browser has no hook: checked against the
  // rule); a hook answering 0 takes the hit away.
  {name:'receive-cap',bundle:'emulator-probe__map-260-state',testRom:true,script:'none:120',
    pokes:[[10,0x7EE1F1,300,2],[10,0x7EE1F0,3]],cartPokes:[[5,0x317F04,1,2],[5,0x317F06,110,2]],
    check:(js,cart)=>receiveCheck(cart,{loss:28,seen:300})},
  {name:'receive-none',bundle:'emulator-probe__map-260-state',testRom:true,script:'none:120',
    pokes:[[10,0x7EE1F1,300,2],[10,0x7EE1F0,3]],cartPokes:[[5,0x317F04,2,2]],
    check:(js,cart)=>receiveCheck(cart,{loss:0,seen:300})},
];
// Goku's HP loss and what the test receive hook saw.
function receiveCheck(cart,{loss,seen}){
  const f=[],lost=cart[0].ghp-Math.min(...cart.map(x=>x.ghp)),last=cart[cart.length-1].rx;
  if(lost!==loss)f.push(`HP loss ${lost}, expected ${loss}`);
  if(!last||last.n<1)f.push('the receive hook never ran');
  else if(last.seen!==seen)f.push(`the receive hook saw ${last.seen}, expected ${seen}`);
  return f;
}
