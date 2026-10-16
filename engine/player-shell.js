// Keep embedded browsers usable even when they refuse the Fullscreen API or
// change their visible height as their own navigation bars appear and disappear.
export function mountPlayerShell(player,{clearInput=()=>{}}={}){
 if(!player)return;
 const button=player.querySelector('#native-fullscreen');
 let height=0;
 function viewport(){
  if(window.visualViewport&&window.visualViewport.scale!==1)return;
  const next=Math.round(window.visualViewport?.height??window.innerHeight);
  if(next===height)return;
  height=next;player.style.setProperty('--viewport-height',`${height}px`);clearInput();
 }
 function fullscreen(){
  clearInput();viewport();
  const expanded=!!document.fullscreenElement||player.classList.contains('is-expanded');
  document.documentElement.classList.toggle('player-expanded',expanded);
  button.setAttribute('aria-pressed',String(expanded));
  button.setAttribute('aria-label',expanded?'Exit expanded view':'Expand game');
  button.title=button.getAttribute('aria-label');
 }
 button.addEventListener('click',async()=>{
  clearInput();
  if(player.classList.contains('is-expanded'))player.classList.remove('is-expanded');
  else if(document.fullscreenElement){try{await document.exitFullscreen();}catch{/* Keep the exit control available. */}}
  else{
   try{if(!player.requestFullscreen)throw Error('Fullscreen unavailable');await player.requestFullscreen();}
   catch{player.classList.add('is-expanded');}
  }
  fullscreen();
 });
 document.addEventListener('fullscreenchange',fullscreen);
 window.addEventListener('resize',viewport);
 window.visualViewport?.addEventListener('resize',viewport);
 const surface=player.querySelector('.game-surface');
 // Include overlays and gaps between controls: a gesture can start there
 // before either finger reaches a button. Keep these guards local to play.
 for(const event of ['contextmenu','selectstart','dragstart','gesturestart','gesturechange'])surface?.addEventListener(event,e=>e.preventDefault(),{passive:false});
 viewport();
}
