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
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
};
export function mountTouchControls(root,input,{ready=()=>true,resume=()=>{},fly=()=>{},pause=()=>{},cancel=()=>{}}={}){
 if(!root)return{clear(){}};
 const button=(icon,label,bit,caption='')=>{
  const name=caption&&!label.toLowerCase().includes(caption.toLowerCase())?`${caption}: ${label}`:label;
  return `<button type="button" aria-label="${name}" title="${name}" ${typeof bit==='number'?`data-snes="${bit}"`:`data-action="${bit}"`} data-icon="${icon}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[icon]}</svg>${caption?`<span aria-hidden="true">${caption}</span>`:''}</button>`;
 };
 root.innerHTML=`<div class="touch-left"><div class="touch-directions" aria-label="Move">${button('up','Up',4)}${button('left','Left',6)}${button('down','Down',5)}${button('right','Right',7)}</div><div class="touch-utility">${button('start','Start',3,'Start')}${button('pause','Pause or resume','pause','Pause')}${button('more','More controls','more','More')}</div></div><div class="touch-actions" id="touch-main">${button('ring','Menu / back',Controls.ring,'Menu')}${button('hover','Hold to fly fast / ascend',8,'Fly')}${button('teleport','Instant Transmission',Controls.teleport,'Warp')}${button('ki','Ki blast / hold for rapid fire',Controls.blast,'Ki')}${button('attack','Punch / hold for combo / confirm / descend',Controls.physical,'Punch')}${button('wave','Hold Kamehameha / release to fire',Controls.wave,'Beam')}${button('focus','Hold to charge ki / break stun',Controls.modifier,'Power')}</div><div class="touch-actions" id="touch-more" hidden>${button('focus','Hold to focus / recover from sleep or petrification',Controls.modifier,'Focus')}${button('fast','Hold to fast-forward dialogue',Controls.fastForward,'Skip')}${button('party','Switch party member',2,'Party')}${button('fly','Take off into world flight',Controls.flight,'Take off')}${button('super','Hold to become Super Saiyan / tap to return to normal',Controls.transform,'SSJ')}${button('back','Back to main controls','more','Back')}</div>`;
 const more=root.querySelector('.touch-utility [data-action="more"]');
 more.setAttribute('aria-controls','touch-more');more.setAttribute('aria-expanded','false');
 function toggleMore(){
  clear();const expanded=more.getAttribute('aria-expanded')!=='true';
  root.querySelector('#touch-main').hidden=expanded;root.querySelector('#touch-more').hidden=!expanded;
  more.setAttribute('aria-expanded',String(expanded));
  more.setAttribute('aria-label',expanded?'Back to main controls':'More controls');
  more.title=more.getAttribute('aria-label');more.querySelector('span').textContent=expanded?'Back':'More';
 }
 const pad=root.querySelector('.touch-directions'),pointers=new Map();
 root.addEventListener('contextmenu',e=>e.preventDefault());
 root.addEventListener('selectstart',e=>e.preventDefault());
 root.addEventListener('dragstart',e=>e.preventDefault());
 function move(e){
  const box=pad.getBoundingClientRect(),x=e.clientX-box.x-box.width/2,y=e.clientY-box.y-box.height/2;
  const magnitude=Math.hypot(x,y),bits=[];
  if(magnitude>box.width*.1){if(Math.abs(x)>magnitude*.38)bits.push(x<0?6:7);if(Math.abs(y)>magnitude*.38)bits.push(y<0?4:5);}
  const prefix=`touch:${e.pointerId}:dir:`;
  for(const bit of[4,5,6,7]){const key=prefix+bit;if(bits.includes(bit))input.press(key,bit);else input.cancel(key);}
  highlight();
 }
 function highlight(){
  // A controller holding the same bit must not leave a released touch button
  // lit: controller changes do not dispatch pointer events to refresh it.
  const held=new Set([...input.held].filter(([source])=>source.startsWith('touch:')).map(([,bit])=>bit));
  for(const el of root.querySelectorAll('[data-snes]'))el.classList.toggle('is-held',held.has(Number(el.dataset.snes)));
 }
 function dropCapture(id,pointer){
  try{if(pointer.capture.hasPointerCapture(id))pointer.capture.releasePointerCapture(id);}catch{/* A webview may have already discarded the pointer. */}
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
  if(el?.dataset.action==='more'){toggleMore();return;}
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
 window.addEventListener('pointermove',e=>{if(pointers.get(e.pointerId)?.pad){e.preventDefault();move(e);}},{passive:false});
 window.addEventListener('pointerup',e=>release(e),true);
 window.addEventListener('pointercancel',e=>release(e,true),true);
 root.addEventListener('lostpointercapture',e=>release(e,true));
 window.addEventListener('blur',clear);
 window.addEventListener('pagehide',clear);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 document.addEventListener('fullscreenchange',clear);
 screen.orientation?.addEventListener('change',clear);
 window.addEventListener('orientationchange',clear);
 window.addEventListener('resize',clear);
 root.addEventListener('click',e=>{
  // Keyboard / assistive activation has no pointerdown. Normal pointer clicks
  // have already been handled; never send a second action on release.
  if(e.detail!==0||e.pointerType||!ready())return;const el=e.target.closest('button');if(!el)return;
  if(el.dataset.action==='more'){toggleMore();return;}
  if(el.dataset.action==='pause')pause();else{const resumed=resume();if(el.dataset.action==='fly')fly();else if(!(resumed&&el.dataset.snes==='3'))input.pulse(Number(el.dataset.snes));}
 });
 return{clear};
}
