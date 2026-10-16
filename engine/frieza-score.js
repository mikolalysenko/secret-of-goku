import {victoryTiming,ease} from './frieza-finale.js';
import {bossVictoryTiming} from './boss-victory.js';
import {createManaScoreRenderer,manaTracks} from './mana-score-renderer.js';

// Separate score bus: never delays a hit or shares the Kamehameha vocal.
// Every cue, from the Five Minutes entrance to the combat and training
// themes, is rendered at runtime from the cartridge's own instrument samples.
export function createFriezaScore(mod,{rom=()=>mod.snes?.cart?.data}={}){
 let ctx=null,output=null,playing=null,lastFrame=-1,renderer=null,bankRom=null;
 const stats={track:null,ready:false,error:null,rendered:[]},pcm=new Map(),buffers=new Map();
 let settle,rendered=new Promise(r=>settle=r);
 function refresh(){stats.ready=manaTracks.every(key=>buffers.has(key));if(manaTracks.every(key=>pcm.has(key)))settle();}
 function buffer(key){
  if(buffers.has(key)||!ctx)return buffers.get(key);
  const data=pcm.get(key);if(!data)return;
  const b=ctx.createBuffer(2,data.left.length,data.rate);b.copyToChannel(data.left,0);b.copyToChannel(data.right,1);buffers.set(key,b);refresh();return b;
 }
 function render(){
  const cartridge=rom();if(!cartridge||cartridge===bankRom)return;
  renderer?.dispose();bankRom=cartridge;pcm.clear();for(const key of manaTracks)buffers.delete(key);rendered=new Promise(r=>settle=r);
  renderer=createManaScoreRenderer(cartridge,(key,data)=>{pcm.set(key,data);stats.rendered=[...pcm.keys()];buffer(key);refresh();},error=>{stats.error=error;settle();});
 }
 function stop(){if(playing){try{playing.source.stop();playing.source.disconnect();}catch{}playing=null;}stats.track=null;}
 function update(context,audible,when){
  render();
  if(!audible||!context||context.state!=='running'){stop();return;}
  if(context!==ctx){stop();output?.disconnect();ctx=context;output=ctx.createGain();output.gain.value=.32;output.connect(ctx.destination);buffers.clear();stats.ready=false;
   for(const key of manaTracks)buffer(key);
  }
  const key=mod.ending?.active?null:mod.trial?.music??mod.frieza?.music;
  if(!key){stop();return;}
  if(playing?.key!==key||mod.frame<lastFrame){stop();const b=buffer(key);if(b){const source=ctx.createBufferSource();source.buffer=b;source.loop=true;source.connect(output);const start=Math.max(ctx.currentTime,when??ctx.currentTime);source.start(start);playing={key,source,when:start};stats.track=key;}}
  const ending=mod.frieza?.orbit?.clash;
  let gain=mod.charging?.22:.32;
  // As in the native boss deaths, the music plays on under the explosions
  // and fades with the game's own fade command into the white-out. Neither
  // the pickup nor the fanfare is ducked.
  if(ending?.phase==='win'){const t=ending.age-victoryTiming.impact-bossVictoryTiming.fade;gain=.32*(1-ease(t/(bossVictoryTiming.white-bossVictoryTiming.fade)));}
  lastFrame=mod.frame;output.gain.setTargetAtTime(gain,ctx.currentTime,.12);
 }
 return{stats,update,clear:stop,resync(now){if(playing?.when>now)stop();},dispose(){stop();renderer?.dispose();output?.disconnect();},
  get ready(){render();return bankRom?rendered:Promise.resolve();},get nativeGain(){return playing&&mod.frieza?.orbit?.clash?.phase!=='win'?.018:1;},connect(node){output?.connect(node);}};
}
