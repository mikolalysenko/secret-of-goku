// Keep embedded browsers usable even when they refuse the Fullscreen API or
// change their visible height as their own navigation bars appear and disappear.
export function mountPlayerShell(player,{clearInput=()=>{}}={}){
 if(!player)return;
 const button=player.querySelector('#native-fullscreen');
 let height=0,expanded=false,nativeEntered=false;
 const nativeElement=()=>document.fullscreenElement??document.webkitFullscreenElement;
 function viewport(){
  if(window.visualViewport&&window.visualViewport.scale!==1)return;
  const next=Math.round(window.visualViewport?.height??window.innerHeight);
  if(next===height)return;
  height=next;player.style.setProperty('--viewport-height',`${height}px`);clearInput();
 }
 function update(){
  clearInput();viewport();
  player.classList.toggle('is-expanded',expanded);
  document.documentElement.classList.toggle('player-expanded',expanded);
  button.setAttribute('aria-pressed',String(expanded));
  button.setAttribute('aria-label',expanded?'Exit expanded view':'Expand game');
  button.title=button.getAttribute('aria-label');
 }
 function exitNative(){
  const exit=document.exitFullscreen??document.webkitExitFullscreen;
  const failed=()=>{expanded=nativeElement()===player;update();};
  try{if(!exit)failed();else Promise.resolve(exit.call(document)).catch(failed);}
  catch{failed();}
 }
 function leave(){
  expanded=false;update();
  if(nativeElement()===player)exitNative();
 }
 function fullscreen(){
  if(nativeElement()===player){
   nativeEntered=true;
   // A delayed browser request must not trap someone who already tapped Exit.
   if(!expanded){exitNative();return;}
  }else if(nativeEntered){nativeEntered=false;expanded=false;}
  update();
 }
 button.addEventListener('click',()=>{
  if(expanded){leave();return;}
  // Expand immediately, even if an embedded browser never settles its promise.
  // One class also avoids relying on Safari's support for :fullscreen styling.
  expanded=true;update();
  const request=player.requestFullscreen??player.webkitRequestFullscreen;
  try{Promise.resolve(request?.call(player)).catch(()=>{});}
  catch{/* The expanded page remains available when native fullscreen is denied. */}
 });
 document.addEventListener('fullscreenchange',fullscreen);
 document.addEventListener('webkitfullscreenchange',fullscreen);
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&expanded&&nativeElement()!==player){
   e.preventDefault();e.stopImmediatePropagation();leave();button.focus();
  }
 },{capture:true});
 window.addEventListener('resize',viewport);
 window.visualViewport?.addEventListener('resize',viewport);
 const surface=player.querySelector('.game-surface');
 // Include overlays and gaps between controls: a gesture can start there
 // before either finger reaches a button. Keep these guards local to play.
 for(const event of ['contextmenu','selectstart','dragstart','gesturestart','gesturechange'])surface?.addEventListener(event,e=>e.preventDefault(),{passive:false});
 if(navigator.standalone||window.matchMedia('(display-mode: standalone)').matches){expanded=true;update();}
 else viewport();
}
