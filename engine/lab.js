import {snapshot,restore,hash,checkpointStore} from './state.js';
import {createBatteryStore} from './battery.js';
import {createNativeEffects} from './native-effects.js';
import {createTitleLayer} from './title-layer.js';
import {createArrival} from './arrival.js';
import {GameInput,keymap} from './input.js';
import {GamepadInput} from './gamepad.js';
import {mountTouchControls} from './touch-controls.js';
import {createKiSound} from './ki-sound.js';
import {createNativeCombatSound} from './native-combat-sound.js';
import {createNativePlants} from './native-plants.js';
import {demolitionEffects} from './dungeon-demolition.js';
import {createNativeFeedback} from './native-feedback.js';
import {installFlightDialogue} from './flight-dialogue.js';
import {installNativeOamOwnership} from './native-oam.js';
import {createNativeFlight} from './native-flight.js';
import {createNativeLocalFlight} from './native-local-flight.js';
import {createNativeTeleport} from './native-teleport.js';
import {createNativeGapFlight} from './native-gap-flight.js';
import {createChargeLightning} from './charge-lightning.js';
import {createNativeOrbs} from './native-orbs.js';
import {createNativeStory} from './native-story.js';
import {createWorldKi} from './world-ki.js';
import {createNativeBarriers} from './native-barriers.js';
import {createNativeInteraction} from './native-interaction.js';
import {createNativeHitRecovery} from './native-hit-recovery.js';
import {createNativeSenzu} from './native-senzu.js';
import {createNativeEquipment} from './native-equipment.js';
import {createNativeRadio} from './native-radio.js';
import {createNativeModSave} from './native-mod-save.js';
import {createFrieza} from './frieza.js';
import {createDragonQuest} from './dragon-quest.js';
import {createCeilingEscape} from './ceiling-escape.js';
import {createBeastChallenge} from './beast-challenge.js';
import {createPowerIntro} from './power-intro.js';
import {createShenronEnding} from './shenron-ending.js';
import {buildQuickStart,quickStartLabels,quickStartRevision} from './quick-start.js';
import {createWorldScars} from './world-scars.js';
import {createSceneFastForward,sceneFastForwardRate} from './scene-fast-forward.js';
import {fetchDefaultRom,validateRom} from './rom-loader.js';
import {createDragonRadar} from './dragon-radar.js';
import {createPotosGatekeeper} from './potos-story.js';
const effectsManifest=fetch(new URL('./native-effects.json',import.meta.url)).then(response=>{if(!response.ok)throw Error('Native effect descriptors could not be loaded.');return response.json();});
const $=id=>document.getElementById(id),snes=new window.Snes(),canvas=$('screen'),context=canvas.getContext('2d'),pixels=context.createImageData(512,480);
const message=text=>{$('lab-message').textContent=text;};
const battery=createBatteryStore({onError:()=>message('Browser storage is unavailable. Keep this page open to retain in-game saves.')});
const originalMode=document.body.dataset.mode==='original';
const logs=[];
const mod=new window.ManaMod(snes,{gokuUrl:'assets/sprites/goku.png',ssjUrl:'assets/sprites/ssj.png',onLog:text=>{logs.push(text);if(logs.length>100)logs.shift();if(!originalMode&&!text.startsWith('Mod:'))message(text);}});
const title=createTitleLayer(snes.ppu);
const arrival=createArrival(snes,mod);
const sound=createKiSound(mod);
mod.combatSound=createNativeCombatSound(snes,mod);
mod.gapFlight=createNativeGapFlight(snes,mod);
mod.feedback=createNativeFeedback(snes,mod);
mod.ownership=installNativeOamOwnership(snes);
mod.plants=createNativePlants(snes,{canCut:()=>mod.options.enabled&&mod.canAttack,sceneryReplacement:tile=>mod.localFlightHook?.breakScenery(tile),demolitionPlan:(tiles,attack)=>mod.localFlightHook?.dungeon.demolish(tiles,attack)??[],onCut:result=>{
  mod.localFlightHook?.dungeon.invalidate();
  demolitionEffects(mod,result);
  for(const tile of result.tiles)mod.effects.push({kind:'impact',x:tile.tx*16+8,y:tile.ty*16+8,dx:1,dy:0,life:8,max:8,super:false});
  if(result.tiles.length)mod.playSound('impact');
}});
mod.flight=createNativeFlight(snes,{enabled:()=>mod.options.enabled&&mod.gokuActive,canTakeOff:()=>mod.canAttack,onStart:()=>{
  mod.localFlight=false;mod.localLift=0;mod.flightTransition={kind:'takeoff',age:0};if(!mod.ceiling?.busy)mod.playSound('flight');
},onLand:({fortress})=>{mod.flightTransition={kind:'landing',age:0,fortress};},onDock:()=>mod.playSound('flight')});
mod.localFlightHook=createNativeLocalFlight(snes,{
  active:()=>mod.options.enabled&&mod.gokuActive&&(mod.localFlight||mod.charging)&&mod.canAttack,
  phase:()=>mod.localFlight,
  onCross:({map,from,to})=>{
    mod.teleport?.gather(to);
    // Only a full crossing between Karon's piers before his ferry is
    // available is a sequence break. Routine gaps/ledges stay quiet.
    if(map===32&&!snes.ram[0xcf94]&&Math.min(from.y,to.y)<18*16&&Math.max(from.y,to.y)>=44*16)mod.radio?.defeatedBarrier('moon-ferry',{map});
  },
  onCarry:position=>mod.teleport?.gather(position),
  speed:()=>{
    const speed=mod.localFlight&&(mod.input&0x100)?(mod.options.superSaiyan?8:6):2;
    return mod.charging?speed/2:speed;
  },
});
mod.lightning=createChargeLightning(mod);
mod.teleport=createNativeTeleport(snes,mod,mod.localFlightHook);
mod.orbs=createNativeOrbs(snes,mod);
mod.story=createNativeStory(snes,mod);
mod.potosGatekeeper=createPotosGatekeeper(mod);
mod.worldKi=createWorldKi(snes,mod);
mod.barriers=createNativeBarriers(mod);
mod.interaction=createNativeInteraction(snes,mod);
mod.hitRecovery=createNativeHitRecovery(snes,mod);
mod.senzu=createNativeSenzu(snes,mod);
mod.equipment=createNativeEquipment(snes,mod);
mod.radio=createNativeRadio(snes,mod);
mod.quest=createDragonQuest(mod);
mod.ceiling=createCeilingEscape(mod);
mod.challenge=createBeastChallenge(snes,mod);
mod.powerIntro=createPowerIntro(mod);
mod.worldScars=createWorldScars(snes,mod);
mod.ending=createShenronEnding(snes,mod);
mod.frieza=createFrieza(snes,mod);
mod.nativeSave=createNativeModSave(snes,mod,battery);
const fastForward=createSceneFastForward(mod);
mod.radar=createDragonRadar(snes,mod);
let loaded=false,running=false,busy=false,lastTime=0,accumulator=0,checkpoint=null,frameCount=0,fpsTime=performance.now();
let nameSeeded=false,originalBoot=false;
let originalRom=null;
const quickCache=new Map();
let flightDialogue=null;
const controls=new GameInput();
const gamepads=new GamepadInput(controls,{
  fly,pause:()=>running?pause():play(),start:()=>{if(loaded&&!busy&&!running){play();return true;}return false;},
  disconnect:()=>mod.cancelInput(),
  status:label=>{const node=$('gamepad-status');if(node)node.textContent=label||'Connect a controller, then press a button.';},
});
const touch=mountTouchControls(document.querySelector('.touch-pad'),controls,{
  ready:()=>loaded&&!busy,resume:()=>{if(!running){play();return true;}return false;},fly,pause:()=>running?pause():play(),cancel:()=>mod.cancelInput(),
});
let audioContext=null,audioEnabled=false,nextAudio=0;
const nextPaint=()=>new Promise(resolve=>setTimeout(resolve,0));

function configure(){mod.configure({enabled:$('goku-enabled').checked,power:$('power-enabled').checked,superSaiyan:$('super-enabled').checked});}
function clearInput(){controls.clear();touch.clear();gamepads.suspend();snes.joypad1State=0;mod.cancelInput();}
function prefillName(){
  // Use the original editable name field and native redraw flag. A one-shot
  // signature prevents overwriting a name the player edits or clears later.
  if(!originalBoot||nameSeeded||mod.read8(0xe4)!==0||mod.read8(0xe5)!==0||mod.read8(0xa156)!==3||mod.read8(0xa157)!==0x12||mod.read8(0xa1cc)!==0||mod.read16(0x90d0)!==0x2022||mod.read16(0x9306)!==0x2058||mod.read16(0x9308)!==0x205c)return;
  [0x205c,0x2090,0x20b8].forEach((tile,i)=>{mod.write16(0x90d2+i*2,tile);mod.write16(0x9112+i*2,tile+2);});
  mod.write8(0xa1cc,3);mod.write8(0xa157,0x18);mod.write8(0xa20a,mod.read8(0xa20a)|2);nameSeeded=true;mod.nameEditor=true;
}
function step(mask=0,audible=false,skipPicture=false){
  mask=fastForward.input(mask);
  snes.joypad1State=mask;arrival.beforeFrame();mod.beforeFrame(mask);snes.runFrame(skipPicture);mod.afterFrame();prefillName();battery.tick();
  if(audible&&audioEnabled&&audioContext?.state==='running'){
    const samples=Math.round(audioContext.sampleRate/60),buffer=audioContext.createBuffer(2,samples,audioContext.sampleRate);
    snes.setSamples(buffer.getChannelData(0),buffer.getChannelData(1),samples);
    const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=buffer;gain.gain.value=.4;source.connect(gain);gain.connect(audioContext.destination);
    nextAudio=Math.max(nextAudio,audioContext.currentTime+.025);source.start(nextAudio);sound.update(audioContext,true,nextAudio);nextAudio+=1/60;
  }else {snes.apu.dsp.sampleOffset=0;sound.update(null,false);}
}
function render(){
  snes.setPixels(pixels.data);context.putImageData(pixels,0,0);mod.draw(context);
  if(!loaded)return;
  const r=mod.status,ratio=r.charge/(mod.options.superSaiyan?45:90);
  if(!busy)for(const [id,key]of [['goku-enabled','enabled'],['power-enabled','power'],['super-enabled','superSaiyan']])$(id).checked=mod.options[key];
  $('native-charge').hidden=!mod.charging;
  $('native-charge').querySelector('i').style.width=`${Math.min(1,ratio)*100}%`;
  $('native-charge').querySelector('span').textContent=ratio>=1?'HA!!!':'KA… ME… HA… ME…';
  $('engine-state').textContent=busy?'RUNNING EVENT':running?(r.worldFlight?'WORLD FLIGHT':'ORIGINAL ENGINE LIVE'):'PAUSED';
  const values=[['Map $00DC',r.map],['World position',`${r.x}, ${r.y}`],['Camera',`${r.cameraX}, ${r.cameraY}`],['HP $E182',r.hp],['Attack $E198',r.attack],['Stamina $E1ED',r.staminaRemaining],['Hidden OAM',r.hiddenOamSlots.join(', ')||'—']];
  $('memory-readout').replaceChildren(...values.flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return[dt,dd];}));
}
function play(){if(!loaded||busy)return;running=true;lastTime=performance.now();fpsTime=lastTime;frameCount=0;accumulator=0;$('native-pause').hidden=true;$('native-toggle').querySelector('span').textContent='Pause';}
function pause(){running=false;clearInput();sound.clear();if(loaded&&!busy)$('native-pause').hidden=false;$('native-toggle').querySelector('span').textContent='Resume';render();}
function tick(now){
  try{gamepads.poll(navigator.getGamepads?.()||[],{enabled:loaded&&!busy,focused:!document.hidden&&document.hasFocus()});}catch{/* The browser may disable controller access. Keyboard and touch remain available. */}
  if(running&&!busy){
    accumulator+=Math.min(.1,(now-lastTime)/1000);let steps=0;
    while(accumulator>=1/60&&steps<4){
      const mask=controls.sample(),fast=fastForward.state(mask).active;
      if(fast){
        nextAudio=0;
        // CPU, audio processor, DMA and events keep running; render only the
        // last frame. Bound each batch so touch release/pause stays responsive.
        const deadline=performance.now()+18;
        for(let i=1;i<sceneFastForwardRate&&fastForward.state(mask).active&&performance.now()<deadline;i++){step(mask,false,true);frameCount++;}
      }
      step(mask,!fast);frameCount++;
      accumulator-=1/60;steps++;if(fast){accumulator=0;break;}
    }
    if(steps)render();
    if(now-fpsTime>=1000){$('fps').textContent=`${Math.round(frameCount*1000/(now-fpsTime))} FPS`;frameCount=0;fpsTime=now;}
  }
  lastTime=now;requestAnimationFrame(tick);
}

async function loadROM(source,{potos=false}={}){
  const bytes=await validateRom(source);
  battery.flush();
  originalRom=bytes.slice();
  await Promise.all([mod.ready,mod.frieza.ready]);mod.spriteLayer.effects=createNativeEffects(bytes,await effectsManifest);mod.worldScars.load(bytes);running=false;clearInput();mod.configure({enabled:false});
  const patched=window.gokuDialoguePatch(potos?window.potosPatch(bytes):window.originalGamePatch(bytes));
  if(!snes.loadRom(patched,true))throw Error('The SNES core rejected this ROM.');
  snes.reset(true);battery.attach(snes.cart,hash(bytes));mod.reset();arrival.load(bytes,{potos});flightDialogue?.dispose();flightDialogue=installFlightDialogue(snes.cart,()=>mod.options.enabled&&mod.gokuActive);mod.gapFlight.load();mod.senzu.load();mod.equipment.load();mod.story.load();nameSeeded=false;originalBoot=!potos;loaded=true;render();return patched;
}
async function pump(frames,buttons=[]){
  const mask=buttons.reduce((a,b)=>a|(1<<b),0);
  for(let i=0;i<frames;i+=20){for(let j=0;j<Math.min(20,frames-i);j++)step(mask);render();await nextPaint();}
}
async function enableGameControls(){
  $('boot-screen').hidden=true;
  for(const id of ['native-fly','native-toggle','native-save','native-start',...Object.keys(quickStartLabels).map(k=>`quick-${k}`)])if($(id))$(id).disabled=false;
  try{checkpoint=await checkpointStore();if(checkpoint?.state.romHash!==hash(snes.cart.data))checkpoint=null;}catch{checkpoint=null;}
  $('native-restore').disabled=!checkpoint;
}
async function bootOriginal(source){
  if(busy)return;busy=true;$('boot-local').disabled=true;$('rom-file').disabled=true;
  try{
    await loadROM(source);configure();await enableGameControls();
    message('Space / Enter = Start · X = confirm · A = ring / back · Arrows = move / menu.');
  }catch(error){loaded=false;$('boot-status').textContent=error.message;message(error.message);throw error;}
  finally{busy=false;$('boot-local').disabled=false;$('rom-file').disabled=false;if(loaded){play();render();}}
  const requested=new URLSearchParams(location.search).get('start');
  if(loaded&&requested in quickStartLabels)await quickStart(requested);
}
async function bootPotos(source){
  if(busy)return;busy=true;$('boot-local').disabled=true;$('boot-track').hidden=false;$('rom-file').disabled=true;
  $('boot-status').textContent='Running the original startup and entering Potos…';
  try{
    await loadROM(source,{potos:true});
    const sequence=[[960],[2,[3]],[180],[2,[0]],[180],[2,[0]],[2],[2,[3]],[1600]],total=sequence.reduce((s,[f])=>s+f,0);let done=0;
    for(const[frames,buttons=[]]of sequence){
      for(let i=0;i<frames;i+=20){const count=Math.min(20,frames-i);await pump(count,buttons);done+=count;$('boot-progress').style.width=`${done/total*100}%`;}
    }
    if(mod.read16(0xdc)!==131)throw Error('Startup did not reach Potos. Reload the page and try again.');
    // Original six-byte name field, using the game's own character encoding.
    snes.ram.set([0xa1,0x8f,0x8b,0x95,0,0],0xcc00);configure();step(0);render();
    await enableGameControls();
    message('Potos is live. X punches; Shift+C charges Kamehameha. Shift+D takes off; D fast-forwards dialogue.');
  }catch(error){loaded=false;$('boot-status').textContent=error.message;message(error.message);throw error;}
  finally{busy=false;$('boot-local').disabled=false;$('rom-file').disabled=false;if(loaded){play();render();}}
}

async function fly(){
  if(!loaded||busy)return;
  if(!arrival.arrived){message('Goku has not arrived yet. Keep following the original opening.');return;}
  if(mod.ceiling.busy)return;
  if(!mod.worldFlight&&mod.ceiling.bossActive){message('Finish the boss fight before taking flight.');return;}
  if(!mod.worldFlight&&!mod.canAttack){message('Finish the current dialogue or close the ring before taking flight.');return;}
  if(mod.worldFlight){message('Flight: Z (SNES A) ascends; X (SNES B) descends to land. Shift+C / L+Y charges Kamehameha.');return mod.status;}
  clearInput();
  if(mod.requestFlight())message('Taking flight! Z (SNES A) ascends; X (SNES B) descends to land. Shift+C / L+Y charges Kamehameha.');
  else{message('Finish this scene before taking flight, or move to the next room.');return mod.status;}
  if(!running)play();render();
  return mod.status;
}
async function saveCheckpoint(){
  if(!loaded||busy)return;
  checkpoint={state:{...snapshot(snes),arrival:arrival.snapshot(),goku:mod.snapshot()},form:mod.options.superSaiyan,facing:mod.facing,nameEditor:mod.nameEditor,nameSeeded,originalBoot,time:Date.now()};
  $('native-restore').disabled=false;
  try{await checkpointStore(checkpoint);message('Checkpoint saved in this browser. Load your ROM next time, then Restore checkpoint.');}
  catch{message('Checkpoint saved for this session. Browser storage is unavailable.');}
}
function restoreCheckpoint(){
  if(!loaded||!checkpoint||busy)return;clearInput();
  try{restore(snes,checkpoint.state);mod.restore(checkpoint.state.goku);arrival.restore(checkpoint.state.arrival);if(!checkpoint.state.goku){mod.options.superSaiyan=!!checkpoint.form;mod.facing=checkpoint.facing||0;}mod.nameEditor=!!checkpoint.nameEditor;nameSeeded=checkpoint.nameSeeded??(mod.nameEditor||nameSeeded);originalBoot=checkpoint.originalBoot??originalBoot;clearInput();render();message('Checkpoint restored.');}
  catch(error){message(error.message);}
}

const captureQuick=()=>({state:{...snapshot(snes),arrival:arrival.snapshot(),goku:mod.snapshot()},nameSeeded,nameEditor:mod.nameEditor,originalBoot});
function applyQuick(saved){const saves=snes.cart.sram.slice();restore(snes,saved.state);snes.cart.sram.set(saves);mod.restore(saved.state.goku);arrival.restore(saved.state.arrival);nameSeeded=!!saved.nameSeeded;mod.nameEditor=!!saved.nameEditor;originalBoot=!!saved.originalBoot;clearInput();render();}
async function quickStart(kind){
  if(!loaded||busy||!(kind in quickStartLabels))return false;
  const backup=captureQuick(),wasRunning=running,source=originalRom;
  busy=true;running=false;clearInput();sound.clear();$('native-pause').hidden=true;
  $('boot-local').disabled=true;$('rom-file').disabled=true;
  for(const id of Object.keys(quickStartLabels).map(k=>`quick-${k}`))if($(id))$(id).disabled=true;
  const key=slot=>`${quickStartRevision}:${hash(snes.cart.data)}:${slot}`;
  const cache=async(slot,value)=>{quickCache.set(key(slot),value);try{await checkpointStore(value,key(slot));}catch{/* Session cache still works without IndexedDB. */}};
  let success=false;
  try{
    let saved=quickCache.get(key(kind));
    if(!saved)try{saved=await checkpointStore(undefined,key(kind));}catch{/* Build locally. */}
    if(saved){applyQuick(saved);quickCache.set(key(kind),saved);}
    else await buildQuickStart(kind,{
      fresh:async()=>{await loadROM(source);mod.configure({enabled:true,power:true,superSaiyan:false});},
      pump,mod,arrival,capture:captureQuick,cache,
      progress:text=>message(`${text} First use builds a private checkpoint; later jumps are instant.`),
    });
    success=true;message(`${quickStartLabels[kind]} checkpoint ready. Your manual checkpoint is unchanged.`);
  }catch(error){
    // Rebuild the original cartridge/adapters if the user came from the Potos
    // test entry. Restore the complete state instead of abandoning their run.
    await loadROM(source,{potos:!backup.originalBoot});applyQuick(backup);message(`Quick start failed: ${error.message} Your game was restored.`);
  }finally{
    busy=false;$('boot-local').disabled=false;$('rom-file').disabled=false;
    for(const id of Object.keys(quickStartLabels).map(k=>`quick-${k}`))if($(id))$(id).disabled=false;
    if(success||wasRunning)play();else pause();render();
  }
  return success;
}

const boot=originalMode?bootOriginal:bootPotos;
async function loadDefault(){
  $('boot-local').disabled=true;$('rom-file').disabled=true;
  $('boot-status').textContent='Looking for a Secret of Mana (USA) ROM…';
  const found=await fetchDefaultRom();
  if(found){try{await boot(found.bytes);return;}catch{/* The boot status explains the error. */}}
  else $('boot-status').textContent='Choose your Secret of Mana (USA) ROM to play. It stays in this browser.';
  $('boot-local').textContent='Choose ROM';$('boot-local').disabled=false;$('rom-file').disabled=false;
}
// The main player checks automatically; the developer Potos entry checks
// when Start is pressed because building its shortcut takes several seconds.
let defaultChecked=originalMode;
$('boot-local').addEventListener('click',()=>{if(defaultChecked)$('rom-file').click();else{defaultChecked=true;loadDefault();}});
$('rom-file').addEventListener('change',async e=>{try{if(e.target.files[0])await boot(new Uint8Array(await e.target.files[0].arrayBuffer()));}catch{}});
for(const id of ['goku-enabled','power-enabled','super-enabled'])$(id).addEventListener('change',configure);
$('native-fly').addEventListener('click',fly);$('native-toggle').addEventListener('click',()=>running?pause():play());$('native-resume').addEventListener('click',play);
$('native-save').addEventListener('click',saveCheckpoint);$('native-restore').addEventListener('click',restoreCheckpoint);
for(const kind of Object.keys(quickStartLabels))$(`quick-${kind}`)?.addEventListener('click',()=>quickStart(kind));
const soundButton=document.createElement('button');soundButton.innerHTML='<span>Sound on</span>';$('native-save').before(soundButton);
async function activateAudio(){
  try{audioContext??=new AudioContext();await audioContext.resume();audioEnabled=true;nextAudio=0;soundButton.querySelector('span').textContent='Mute';}
  catch{message('Audio is unavailable in this browser.');}
}
soundButton.addEventListener('click',()=>{if(audioEnabled){audioEnabled=false;sound.clear();soundButton.querySelector('span').textContent='Sound on';}else activateAudio();});
if(originalMode){
  window.addEventListener('pointerdown',()=>{if(!audioContext)activateAudio();},{once:true});
  window.addEventListener('keydown',()=>{if(!audioContext)activateAudio();},{once:true});
}
$('native-start')?.addEventListener('click',()=>{if(loaded&&!busy){if(!running)play();else controls.pulse(3);canvas.focus();}});
$('native-fullscreen')?.addEventListener('click',async()=>{
  const player=document.querySelector('.player');
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(player.requestFullscreen)await player.requestFullscreen();else player.classList.toggle('is-expanded');}
  catch{player.classList.toggle('is-expanded');}
});
$('show-touch')?.addEventListener('change',e=>{document.querySelector('.player').classList.toggle('show-touch',e.target.checked);touch.clear();});
window.addEventListener('keydown',e=>{
  if(!loaded||busy||e.ctrlKey||e.metaKey||e.altKey||e.target instanceof HTMLInputElement)return;
  if(keymap[e.code]!==undefined){e.preventDefault();if(e.repeat)return;const bit=keymap[e.code];if(!running&&bit===3)play();else if(running)controls.press(e.code,bit);return;}
  if(e.code==='Escape'){e.preventDefault();if(e.repeat)return;
    if(e.code==='Escape')running?pause():play();
  }
});
window.addEventListener('keyup',e=>controls.release(e.code));
window.addEventListener('blur',()=>{clearInput();if(!busy&&loaded)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){battery.flush();clearInput();if(!busy&&loaded)pause();}});
window.addEventListener('pagehide',()=>battery.flush());
window.addEventListener('mana-log',e=>{logs.push(e.detail);if(logs.length>100)logs.shift();});

window.mana={snes,mod,title,arrival,battery,bootOriginal,bootPotos,fly,play,pause,render,configure,logs,controls,gamepads,fastForward,
  run(frames=1,buttons=[]){running=false;const mask=buttons.reduce((a,b)=>a|1<<b,0);for(let i=0;i<frames;i++)step(mask);render();return mod.status;},
  snapshot:()=>({...snapshot(snes),arrival:arrival.snapshot(),goku:mod.snapshot(),opening:{nameSeeded,originalBoot}}),restore:state=>{controls.clear();restore(snes,state);mod.restore(state.goku);arrival.restore(state.arrival);nameSeeded=state.opening?.nameSeeded??nameSeeded;originalBoot=state.opening?.originalBoot??originalBoot;render();},
  saveCheckpoint,restoreCheckpoint,quickStart,hash,
  read8:addr=>mod.read8(addr),read16:addr=>mod.read16(addr),write8:(addr,v)=>mod.write8(addr,v),write16:(addr,v)=>mod.write16(addr,v),
  get ready(){return loaded&&!busy;},get running(){return running;},get pixels(){return pixels.data;}
};
requestAnimationFrame(tick);

if(originalMode)loadDefault();
