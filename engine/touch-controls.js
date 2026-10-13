// Inline vector pictograms have no selectable text or long-press image menu.
const icons={
 up:'<path d="m6 15 6-7 6 7"/>',down:'<path d="m6 9 6 7 6-7"/>',left:'<path d="m15 6-7 6 7 6"/>',right:'<path d="m9 6 7 6-7 6"/>',
 ring:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="4" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="19" cy="16" r="2"/>',
 talk:'<path d="M4 4h16v12h-9l-5 4v-4H4Z"/><path d="m8 10 3 3 5-6"/>',
 hover:'<path d="m3 15 9-9 9 9M3 20h18M7 15l5-5 5 5"/>',
 ki:'<circle cx="15" cy="9" r="5"/><path d="m3 14 5-5m-4 9 5-5m-2 9 6-6"/>',
 super:'<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>',
 teleport:'<path d="m14 3 7 5-7 5M21 8H9m1 13-7-5 7-5M3 16h12"/>',
 fly:'<path d="m3 21 6-2L20 4l-4-1L5 15Zm5-6 4 3M2 12l6-6h6m-2 13 6-6v-6"/>',
 attack:'<path d="M6 12V7a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v2a2 2 0 0 1 3 1v5l-4 7H9l-6-7a2 2 0 0 1 3-2Z"/>',
 start:'<path d="m7 4 13 8-13 8Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',party:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
};
export function mountTouchControls(root,input,{ready=()=>true,resume=()=>{},fly=()=>{},pause=()=>{},cancel=()=>{}}={}){
 if(!root)return{clear(){}};
 const button=(icon,label,bit)=>`<button type="button" aria-label="${label}" title="${label}" ${typeof bit==='number'?`data-snes="${bit}"`:`data-action="${bit}"`} data-icon="${icon}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[icon]}</svg></button>`;
 root.innerHTML=`<div class="touch-left"><div class="touch-directions" aria-label="Move">${button('up','Up',4)}${button('left','Left',6)}${button('down','Down',5)}${button('right','Right',7)}</div><div class="touch-utility">${button('start','Start',3)}${button('party','Switch party member',2)}${button('pause','Pause or resume','pause')}</div></div><div class="touch-actions">${button('ring','Ring menu / back',1)}${button('talk','Talk / confirm',16)}${button('hover','Hold to fly fast / ascend',8)}${button('ki','Ki barrage',17)}${button('super','Super Saiyan',18)}${button('teleport','Instant Transmission',19)}${button('fly','World flight / land','fly')}${button('attack','Attack / hold to charge Kamehameha',0)}</div>`;
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
 function release(e,aborted=false){
  const pointer=pointers.get(e.pointerId);if(!pointer)return;
  if(pointer.pad)input.releasePrefix(`touch:${e.pointerId}:dir:`);
  else if(aborted)input.cancel(`touch:${e.pointerId}`);else input.release(`touch:${e.pointerId}`);
  pointers.delete(e.pointerId);pointer.button?.classList.remove('is-held');highlight();
  if(aborted&&!input.has(0))cancel();
 }
 root.addEventListener('pointerdown',e=>{
  const el=e.target.closest('button');if(!el&&!pad.contains(e.target))return;
  e.preventDefault();if(!ready())return;
  const onPad=pad.contains(e.target),capture=onPad?pad:el;
  capture.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{pad:onPad,button:el});
  el?.classList.add('is-held');
  if(el?.dataset.action==='pause')pause();
  else{resume();if(onPad)move(e);else if(el.dataset.action==='fly')fly();else input.press(`touch:${e.pointerId}`,Number(el.dataset.snes));}
  highlight();
 });
 root.addEventListener('pointermove',e=>{if(pointers.get(e.pointerId)?.pad){e.preventDefault();move(e);}});
 root.addEventListener('pointerup',e=>release(e));
 root.addEventListener('pointercancel',e=>release(e,true));
 root.addEventListener('lostpointercapture',e=>release(e,true));
 root.addEventListener('click',e=>{
  // Keyboard / assistive activation has no pointerdown. Normal pointer clicks
  // have already been handled; never send a second action on release.
  if(e.detail!==0||!ready())return;const el=e.target.closest('button');if(!el)return;
  if(el.dataset.action==='pause')pause();else{resume();if(el.dataset.action==='fly')fly();else input.pulse(Number(el.dataset.snes));}
 });
 return{clear(){input.releasePrefix('touch:');pointers.clear();root.querySelectorAll('.is-held').forEach(el=>el.classList.remove('is-held'));}};
}
