import {Controls} from './input.js';
// Inline vector pictograms have no selectable text or long-press image menu.
const icons={
 up:'<path d="m6 15 6-7 6 7"/>',down:'<path d="m6 9 6 7 6-7"/>',left:'<path d="m15 6-7 6 7 6"/>',right:'<path d="m9 6 7 6-7 6"/>',
 ring:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="4" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="19" cy="16" r="2"/>',
 talk:'<path d="M4 4h16v12h-9l-5 4v-4H4Z"/><path d="m8 10 3 3 5-6"/>',
 hover:'<path d="m3 15 9-9 9 9M3 20h18M7 15l5-5 5 5"/>',
 ki:'<circle cx="15" cy="9" r="5"/><path d="m3 14 5-5m-4 9 5-5m-2 9 6-6"/>',
 wave:'<circle cx="5" cy="12" r="3"/><path d="m8 10 13-6M8 14l13 6M10 12h11M13 8l8-1m-8 9 8 1"/>',
 super:'<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>',
 focus:'<circle cx="12" cy="12" r="4"/><path d="M8 3 3 8m13-5 5 5M3 16l5 5m8 0 5-5"/>',
 teleport:'<path d="m14 3 7 5-7 5M21 8H9m1 13-7-5 7-5M3 16h12"/>',
 fly:'<path d="m3 21 6-2L20 4l-4-1L5 15Zm5-6 4 3M2 12l6-6h6m-2 13 6-6v-6"/>',
 attack:'<path d="M6 12V7a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v2a2 2 0 0 1 3 1v5l-4 7H9l-6-7a2 2 0 0 1 3-2Z"/>',
 fast:'<path d="m3 5 8 7-8 7Zm10 0 8 7-8 7Z"/>',
 start:'<path d="m7 4 13 8-13 8Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',party:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
};
export function mountTouchControls(root,input,{ready=()=>true,resume=()=>{},fly=()=>{},pause=()=>{},cancel=()=>{}}={}){
 if(!root)return{clear(){}};
 const button=(icon,label,bit)=>`<button type="button" aria-label="${label}" title="${label}" ${typeof bit==='number'?`data-snes="${bit}"`:`data-action="${bit}"`} data-icon="${icon}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[icon]}</svg></button>`;
 root.innerHTML=`<div class="touch-left"><div class="touch-directions" aria-label="Move">${button('up','Up',4)}${button('left','Left',6)}${button('down','Down',5)}${button('right','Right',7)}</div><div class="touch-utility">${button('start','Start',3)}${button('party','Select: Switch party member',2)}${button('pause','Pause or resume','pause')}</div></div><div class="touch-actions">${button('focus','L: Focus / hold with B to teleport or Y to charge',Controls.modifier)}${button('ring','X: Ring menu / back',Controls.ring)}${button('fast','R: Hold to fast-forward dialogue',Controls.fastForward)}${button('ki','Y: Ki blast / L + Y charges Kamehameha',Controls.blast)}${button('attack','B: Punch / hold for combo / confirm / descend',Controls.physical)}${button('hover','A: Hold to fly fast / ascend',8)}${button('wave','L + Y: Hold Kamehameha / release to fire',Controls.wave)}${button('teleport','L + B: Instant Transmission',Controls.teleport)}${button('super','L + A: Hold to transform / tap to return to normal',Controls.transform)}${button('fly','L + R: Take off; hold B to descend in flight',Controls.flight)}</div>`;
 const pad=root.querySelector('.touch-directions'),pointers=new Map();
 root.addEventListener('contextmenu',e=>e.preventDefault());
 root.addEventListener('selectstart',e=>e.preventDefault());
 function move(e){
  const box=pad.getBoundingClientRect(),x=e.clientX-box.x-box.width/2,y=e.clientY-box.y-box.height/2;
  const magnitude=Math.hypot(x,y),bits=[];
  if(magnitude>box.width*.1){if(Math.abs(x)>magnitude*.38)bits.push(x<0?6:7);if(Math.abs(y)>magnitude*.38)bits.push(y<0?4:5);}
  const prefix=`touch:${e.pointerId}:dir:`;
  for(const bit of[4,5,6,7]){const key=prefix+bit;if(bits.includes(bit))input.press(key,bit);else input.cancel(key);}
  highlight();
 }
 function highlight(){for(const el of root.querySelectorAll('[data-snes]'))el.classList.toggle('is-held',input.has(Number(el.dataset.snes)));}
 function dropCapture(id,pointer){
  if(pointer.capture.hasPointerCapture(id))pointer.capture.releasePointerCapture(id);
 }
 function clear(){
  // Forget owners before releasing capture: lostpointercapture may fire
  // synchronously. A cancelled gesture must not leave another finger's half
  // of a chord held, or restart a charge when the player returns to the app.
  const previous=[...pointers];pointers.clear();input.releasePrefix('touch:');
  for(const[id,pointer]of previous)dropCapture(id,pointer);
  root.querySelectorAll('.is-held').forEach(el=>el.classList.remove('is-held'));
  cancel();
 }
 function release(e,aborted=false){
  const pointer=pointers.get(e.pointerId);if(!pointer)return;
  if(aborted){clear();return;}
  if(pointer.pad)input.releasePrefix(`touch:${e.pointerId}:dir:`);
  else input.release(`touch:${e.pointerId}`);
  pointers.delete(e.pointerId);pointer.button?.classList.remove('is-held');highlight();
  dropCapture(e.pointerId,pointer);
 }
 root.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const el=e.target.closest('button');if(!el&&!pad.contains(e.target))return;
  e.preventDefault();if(!ready())return;
  const onPad=pad.contains(e.target),capture=onPad?pad:el;
  // Window-level release below is also a fallback for browsers that lose or
  // decline capture during fullscreen/orientation changes.
  try{capture.setPointerCapture(e.pointerId);}catch{/* Still track its release. */}
  pointers.set(e.pointerId,{pad:onPad,button:el,capture});
  el?.classList.add('is-held');
  if(el?.dataset.action==='pause')pause();
  else{const resumed=resume();if(onPad)move(e);else if(el.dataset.action==='fly')fly();else if(!(resumed&&el.dataset.snes==='3'))input.press(`touch:${e.pointerId}`,Number(el.dataset.snes));}
  highlight();
 });
 root.addEventListener('pointermove',e=>{if(pointers.get(e.pointerId)?.pad){e.preventDefault();move(e);}});
 window.addEventListener('pointerup',e=>release(e),true);
 window.addEventListener('pointercancel',e=>release(e,true),true);
 root.addEventListener('lostpointercapture',e=>release(e,true));
 window.addEventListener('blur',clear);
 window.addEventListener('pagehide',clear);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 document.addEventListener('fullscreenchange',clear);
 screen.orientation?.addEventListener('change',clear);
 root.addEventListener('click',e=>{
  // Keyboard / assistive activation has no pointerdown. Normal pointer clicks
  // have already been handled; never send a second action on release.
  if(e.detail!==0||e.pointerType||!ready())return;const el=e.target.closest('button');if(!el)return;
  if(el.dataset.action==='pause')pause();else{const resumed=resume();if(el.dataset.action==='fly')fly();else if(!(resumed&&el.dataset.snes==='3'))input.pulse(Number(el.dataset.snes));}
 });
 return{clear};
}
