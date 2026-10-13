import {Game} from './game.js';
import {Renderer,loadAssets} from './render.js';
import {AudioEngine} from './audio.js';
import {SAVE_KEY,TECHNIQUES,LANDINGS,CREDITS} from './data.js';

const $=id=>document.getElementById(id),game=new Game(),audio=new AudioEngine();
const down=new Set(),pressed=new Set(),released=new Set();
const keymap={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyJ:'attack',Space:'attack',KeyX:'punch',KeyK:'ki',ShiftLeft:'dash',ShiftRight:'dash',KeyH:'home',Digit1:'slot1',Digit2:'slot2',Digit3:'slot3'};
let renderer,assets,last=performance.now(),uiTime=0,lastSave=0,modalKind=null,saved=null,saveFailed=false;
let previousForm=null,previousDialogue=null,previousOverlay=null,previousToast=null,previousBanner=null;
const icons={
 star:'<path d="M16 2l3 9 9 5-9 3-3 11-4-11-10-3 10-5z"/><path d="M25 3l-3 5M3 25l5-3"/>',
 wave:'<circle cx="8" cy="16" r="5"/><path d="M13 12h15M13 16h18M13 20h15M2 6l4 3M2 26l4-3"/>',
 blast:'<path d="M25 4L12 17M28 10L18 20M19 3L8 14"/><circle cx="8" cy="20" r="5"/><path d="M3 29l4-4"/>',
 orb:'<circle cx="16" cy="12" r="9"/><path d="M16 3v18M7 12h18M10 6c7 4 7 8 0 12M22 6c-7 4-7 8 0 12M9 30l3-5h8l3 5"/>',
 flight:'<path d="M3 23L28 4 20 29l-5-11-12 5zM15 18L28 4M2 30l6-6"/>',
 bean:'<path d="M24 6c-6-5-10 0-11 5s-9 3-10 10 8 11 15 6 13-14 6-21zM10 22c7 0 5-11 11-11"/>',
};

for(const [i,t] of TECHNIQUES.entries()){
  const button=document.createElement('button');button.className='technique';button.setAttribute('aria-label',`${t.name}, ${t.cost}`);button.dataset.index=i;
  button.innerHTML=`<svg viewBox="0 0 32 32" aria-hidden="true">${icons[t.icon]}</svg><kbd>${i+1}</kbd>`;
  button.style.left=`${50+Math.sin(i*Math.PI/3)*50}%`;button.style.top=`${50-Math.cos(i*Math.PI/3)*50}%`;
  button.addEventListener('mouseenter',()=>{game.ringIndex=i;updateRing();});
  button.addEventListener('click',()=>{game.castTechnique(i);clearInput();updateUI();});$('ring-items').append(button);
}

try{saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(saved?.version!==1)saved=null;}catch{saved=null;}
$('continue-button').hidden=!saved;

function clearInput(){down.clear();pressed.clear();released.clear();game.cancelCharge();game.player.moving=false;}
function focusGame(){$('game-shell').focus({preventScroll:true});}
function begin(continueSaved=false){game.start(continueSaved?saved:null);clearInput();modalKind=null;previousOverlay=null;updateUI();focusGame();}
function save(){
  if(game.mode==='title')return;
  try{saved=game.serialize();localStorage.setItem(SAVE_KEY,JSON.stringify(saved));game.saveDirty=false;saveFailed=false;$('save-status').textContent='SAVED LOCALLY';}
  catch{if(!saveFailed)game.notify('SAVE UNAVAILABLE','Your browser is blocking local storage. This adventure will last for this session.');saveFailed=true;$('save-status').textContent='SESSION ONLY';}
}
function toggleRing(){
  if(game.mode==='title'||game.dialogue||game.overlay)return;
  game.ring=!game.ring;clearInput();audio.play('menu');updateUI();
}
function action(name){
  if(name==='interact'){if(game.overlay)return;if(game.ring)game.castTechnique();else if(game.mode!=='title')game.interact();}
  if(name==='fly'&&!game.frozen){game.takeOff();clearInput();}
  updateUI();
}

function keydown(e){
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  if(e.code==='Tab'&&(game.mode==='title'||game.overlay||game.dialogue))return;
  if(e.code==='Enter'&&e.target instanceof HTMLButtonElement&&!game.ring)return;
  const recognized=keymap[e.code]||['KeyE','KeyF','KeyQ','KeyR','KeyM','Escape','Enter','Tab','Digit4','Digit5','Digit6'].includes(e.code);
  if(!recognized||e.metaKey||e.ctrlKey||e.altKey)return;
  e.preventDefault();if(e.repeat)return;
  if(e.code==='Escape'){
    if(game.ring){game.ring=false;clearInput();}
    else if(game.overlay)closeModal();
    else if(game.dialogue)game.advanceDialogue();
    else if(game.mode!=='title')openModal('pause');
    updateUI();return;
  }
  if(game.overlay){if(e.code==='Enter')closeModal();return;}
  if(game.dialogue){if(['KeyE','Enter','Space'].includes(e.code))game.advanceDialogue();updateUI();return;}
  if(game.mode==='title'){if(e.code==='Enter')begin(!!saved);return;}
  if(e.code==='KeyQ'||e.code==='Tab'){toggleRing();return;}
  if(game.ring){
    if(['ArrowRight','KeyD','ArrowDown','KeyS'].includes(e.code))game.ringIndex=(game.ringIndex+1)%6;
    else if(['ArrowLeft','KeyA','ArrowUp','KeyW'].includes(e.code))game.ringIndex=(game.ringIndex+5)%6;
    else if(['Enter','KeyE','Space'].includes(e.code)){game.castTechnique();clearInput();}
    else if(/^Digit[1-6]$/.test(e.code)){game.castTechnique(Number(e.code.at(-1))-1);clearInput();}
    updateUI();return;
  }
  if(e.code==='KeyE'||e.code==='Enter'){action('interact');return;}
  if(e.code==='KeyF'){action('fly');return;}
  if(game.mode==='flight'&&/^Digit[1-3]$/.test(e.code)){game.flight.landing=Number(e.code.at(-1))-1;updateUI();return;}
  if(game.mode==='flight'&&e.code==='KeyH'){
    // Apply menu-like flight commands immediately, even between animation frames.
    game.updateFlight(0,{x:0,y:0,pressed:new Set(['home'])});updateUI();return;
  }
  if(e.code==='KeyM'){openModal('journal');return;}
  if(e.code==='KeyR'){game.transform();updateUI();return;}
  const mapped=keymap[e.code];if(mapped){down.add(mapped);pressed.add(mapped);}
}
window.addEventListener('keydown',keydown);
window.addEventListener('keyup',e=>{const action=keymap[e.code];if(action){down.delete(action);released.add(action);}});
window.addEventListener('blur',()=>{clearInput();if(game.mode!=='title'&&!game.overlay&&!game.dialogue&&!game.ring)openModal('pause');save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();save();}});
window.addEventListener('pagehide',save);

$('start-button').addEventListener('click',()=>begin());$('continue-button').addEventListener('click',()=>begin(true));
$('help-button').addEventListener('click',()=>openModal('controls'));
$('credits-button').addEventListener('click',()=>openModal('credits'));
$('journal-button').addEventListener('click',()=>openModal('journal'));
$('close-modal').addEventListener('click',closeModal);
$('ring-button').addEventListener('click',toggleRing);
$('dialogue').querySelector('button').addEventListener('click',()=>{game.advanceDialogue();updateUI();focusGame();});
$('sound-button').addEventListener('click',async()=>{
  try{const enabled=await audio.toggle();$('sound-button').setAttribute('aria-label',enabled?'Mute sound':'Enable sound');$('sound-button').title=enabled?'Mute sound':'Enable sound';$('sound-button').querySelector('span').hidden=enabled;}
  catch{game.notify('AUDIO UNAVAILABLE','The game will continue without sound.');}
});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game-shell').requestFullscreen();}catch{game.notify('FULLSCREEN UNAVAILABLE','Your browser is keeping the game in its window.');}});

const touch=matchMedia('(pointer:coarse)').matches;
if(touch)$('game-shell').classList.add('touch-enabled');
for(const b of document.querySelectorAll('[data-hold]')){
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);down.add(b.dataset.hold);pressed.add(b.dataset.hold);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{down.delete(b.dataset.hold);released.add(b.dataset.hold);});
}
for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('click',()=>action(b.dataset.action));

function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function statsHTML(){return `<div class="stats-row"><div><strong>${Math.floor(game.stats.time/60)}:${String(Math.floor(game.stats.time%60)).padStart(2,'0')}</strong><small>PLAY TIME</small></div><div><strong>${game.stats.kills}</strong><small>OVERKILLS</small></div><div><strong>${game.breaks.length}</strong><small>SEQUENCE BREAKS</small></div></div>`;}
function openModal(kind){
  modalKind=kind;game.overlay=kind;clearInput();audio.play('menu');renderModal(kind);updateUI();$('close-modal').focus({preventScroll:true});
}
function closeModal(){game.overlay=null;modalKind=null;updateUI();focusGame();}
function renderModal(kind){
  let content='';
  if(kind==='controls')content=`<div class="modal-kicker">A HERO'S FIELD GUIDE</div><h2 id="modal-title">A few small advantages.</h2><dl class="key-guide"><dt><kbd>W A S D</kbd></dt><dd>Move. Arrow keys work too. <kbd>SHIFT</kbd> bursts forward.</dd><dt><kbd>J</kbd> / <kbd>SPACE</kbd></dt><dd>Tap to punch. Hold to charge a Kamehameha; release to fire. Face your target first.</dd><dt><kbd>X</kbd> / <kbd>K</kbd></dt><dd>Hold X for rapid punches. Hold K for ki blasts.</dd><dt><kbd>Q</kbd> / <kbd>TAB</kbd></dt><dd>Open the technique ring. Arrows select; Enter uses a technique. 1–6 select directly.</dd><dt><kbd>E</kbd></dt><dd>Talk, enter doors, read signs, and investigate the glowing crack. E or Enter continues dialogue.</dd><dt><kbd>F</kbd></dt><dd>Take off immediately. Arrows steer; Up accelerates. H returns over Potos, 1–3 choose a landing, F lands.</dd><dt><kbd>R</kbd> / <kbd>M</kbd></dt><dd>Quick Super Saiyan toggle / adventure log. Your progress saves in this browser.</dd></dl><p>Try talking to the Elder, then investigate the crack east of the square. Or punch through the south gate. Prophecies are more of a guideline.</p>`;
  if(kind==='credits')content=`<div class="modal-kicker">BUILT ON THE ORIGINAL</div><h2 id="modal-title">Two worlds, one village.</h2>${CREDITS.map(([t,d])=>`<p><strong>${escapeHTML(t)}</strong><br>${escapeHTML(d)}</p>`).join('')}<p>The Potos and overworld data are extracted from the supplied US ROM. The browser chapter uses new JavaScript gameplay and a bounded story; the <a href="engine.html">original engine lab</a> runs the SNES game with live mod hooks.</p><p><a href="CREDITS.md" target="_blank" rel="noopener">Asset sources & acknowledgements ↗</a> · <a href="docs/rom-research.md" target="_blank" rel="noopener">ROM research ↗</a></p>`;
  if(kind==='journal')content=`<div class="modal-kicker">ADVENTURE LOG</div><h2 id="modal-title">The road less necessary.</h2>${statsHTML()}<p>${escapeHTML(game.objective)}</p>${game.breaks.length?game.breaks.map(b=>`<div class="journal-entry"><strong>✦ ${escapeHTML(b.title)}</strong><p>${escapeHTML(b.text)}</p></div>`).join(''):'<div class="journal-entry"><p>No sequence breaks. Yet.<br>Try flying before meeting the Elder, breaking a sealed obstacle, or visiting the other side of a locked gate.</p></div>'}<p>Senzu beans: ${game.stats.beans} · Damage dealt: ${Math.round(game.stats.damage).toLocaleString()}</p>`;
  if(kind==='pause')content=`<div class="modal-kicker">TAKE A BREATHER</div><h2 id="modal-title">The world can wait.</h2>${statsHTML()}<p>${escapeHTML(game.objective)}</p><button class="primary-button" id="resume-button">RESUME ADVENTURE <span>→</span></button><p><button class="text-button" id="pause-help">View controls</button><button class="text-button" id="return-title">Save & return to title</button></p>`;
  if(kind==='ending')content=`<div class="modal-kicker">POTOS CHAPTER COMPLETE</div><h2 id="modal-title">A legend. In record time.</h2><p>${game.flags.bossDefeated?'The monster is defeated. The village is saved. Its insurance premiums will never recover.':'The prophecy asked for a hero. The hero asked where lunch was. You have successfully skipped the mandatory introduction.'}</p>${statsHTML()}<p>This playable chapter ends at Potos. Keep exploring its homes, try the other techniques, or take a flight over the original world map.</p><button class="primary-button" id="resume-button">KEEP EXPLORING <span>→</span></button>`;
  $('modal-content').innerHTML=content;
  $('resume-button')?.addEventListener('click',closeModal);
  $('pause-help')?.addEventListener('click',()=>openModal('controls'));
  $('return-title')?.addEventListener('click',()=>{save();game.mode='title';game.overlay=null;modalKind=null;clearInput();$('continue-button').hidden=!saved;updateUI();});
}

function updateRing(){
  const t=TECHNIQUES[game.ringIndex];$('ring-name').textContent=t.id==='super'&&game.player.super?'Base form':t.name;
  $('ring-cost').textContent=t.id==='senzu'?`${game.stats.beans} BEANS LEFT`:t.cost;
  $('ring-caption').textContent=t.caption;
  for(const b of $('ring-items').children){const selected=Number(b.dataset.index)===game.ringIndex;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
}
function updateUI(){
  const title=game.mode==='title',p=game.player;
  $('title-screen').hidden=!title;$('hud').hidden=title||!!game.overlay||!!game.dialogue||game.ring;
  $('touch-controls').hidden=!touch||title||game.frozen;
  $('game-shell').classList.toggle('super-active',p.super);
  $('hp-fill').style.width=`${p.hp/9999*100}%`;$('hp-number').textContent=Math.ceil(p.hp);
  $('ki-fill').style.width=`${p.ki}%`;$('ki-number').textContent=Math.floor(p.ki);
  $('power-number').textContent=game.power.toLocaleString();$('form-name').textContent=p.super?'SUPER SAIYAN':'BASE FORM';
  $('location-name').textContent=game.mode==='flight'?'Above the world':game.level.name;
  $('location-tag').hidden=game.mode==='flight';
  $('objective').textContent=title?'A stranger arrives in Potos Village.':game.objective;
  $('break-count').textContent=game.breaks.length;
  $('charge-hud').hidden=!p.charging||p.charge<.1||game.frozen;
  $('charge-fill').style.width=`${game.chargeFraction*100}%`;$('charge-label').textContent=game.chargeFraction>=1?'HA!!!':game.chargeFraction>.5?'HA… ME…':'KA… ME…';
  const hint=game.context();$('context-hint').hidden=!hint||game.frozen||game.mode==='flight'||p.charging;
  if(hint)$('context-hint').querySelector('span').textContent=hint.label;
  $('flight-hud').hidden=game.mode!=='flight';$('landing-name').textContent=LANDINGS[game.flight.landing].name;
  $('ring').hidden=!game.ring;if(game.ring)updateRing();
  $('dialogue').hidden=!game.dialogue;
  const d=game.dialogue?.lines[game.dialogue.index];
  if(d!==previousDialogue){previousDialogue=d;if(d){$('dialogue').querySelector('.dialogue-speaker').textContent=d.speaker;$('dialogue').querySelector('p').textContent=d.text;}}
  $('toast').hidden=!game.toast||title||!!game.dialogue||!!game.overlay||game.ring||!!game.banner;
  if(game.toast!==previousToast){previousToast=game.toast;if(game.toast){$('toast').querySelector('strong').textContent=game.toast.title;$('toast').querySelector('p').textContent=game.toast.text;}}
  $('chapter-banner').hidden=!game.banner||title||!!game.dialogue||!!game.overlay||game.ring;
  if(game.banner!==previousBanner){previousBanner=game.banner;if(game.banner){$('chapter-banner').querySelector('small').textContent=game.banner.subtitle;$('chapter-banner').querySelector('strong').textContent=game.banner.title;}}
  $('modal').hidden=!game.overlay;
  if(game.overlay&&game.overlay!==modalKind){modalKind=game.overlay;renderModal(modalKind);}
  if(assets&&previousForm!==p.super){previousForm=p.super;const c=$('portrait').getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,36,36);c.drawImage(assets[p.super?'ssj':'goku'],0,32,32,32,2,4,32,32);}
}

function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  const input={down,pressed,released,x:(down.has('right')?1:0)-(down.has('left')?1:0),y:(down.has('down')?1:0)-(down.has('up')?1:0)};
  game.step(dt,input);pressed.clear();released.clear();renderer.draw(game,dt);audio.update(game);
  if(now-uiTime>45){updateUI();uiTime=now;}
  if(now-lastSave>5000){save();lastSave=now;}
  requestAnimationFrame(frame);
}

try{
  const romPromise=fetch('assets/data/potos-rom.json').then(r=>{if(!r.ok)throw new Error('Missing ROM data');return r.json();});
  [assets,game.romMaps]=await Promise.all([loadAssets(f=>{$('load-progress').style.width=`${f*100}%`;}),romPromise]);
  renderer=new Renderer($('game'),assets);$('loading').hidden=true;updateUI();requestAnimationFrame(frame);
  if(new URLSearchParams(location.search).has('debug'))window.__game={game,renderer,begin,save,updateUI,clearInput};
}catch(error){
  $('loading').querySelector('p').textContent='The village could not load.';
  const details=document.createElement('p');details.textContent=`${error.message}. Run npm run dev from the project folder.`;$('loading').append(details);console.error(error);
}
