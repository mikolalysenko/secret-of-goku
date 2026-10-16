import {victoryTiming,ease} from './frieza-finale.js';

// Separate score bus: never delays a hit or shares the Kamehameha vocal.
export function createFriezaScore(mod){
 let ctx=null,output=null,playing=null,pending=null,decoded=new Map(),lastFrame=-1;
 const stats={track:null,ready:false,error:null};
 const tracks=['arrival','battle','orbit','vegeta','vegeta-full-power'];
 const bytes=Promise.all(tracks.map(async key=>{const url=new URL(`../assets/audio/music/${key}.wav`,import.meta.url);url.search=new URL(import.meta.url).search;const r=await fetch(url);if(!r.ok)throw Error(`Score unavailable: ${key}`);return[key,await r.arrayBuffer()];})).catch(e=>{stats.error=e.message;return[];});
 function stop(){if(playing){try{playing.source.stop();playing.source.disconnect();}catch{}playing=null;}stats.track=null;}
 function update(context,audible,when){
  if(!audible||!context||context.state!=='running'){stop();return;}
  if(context!==ctx){stop();output?.disconnect();ctx=context;output=ctx.createGain();output.gain.value=.32;output.connect(ctx.destination);stats.ready=false;
   pending=bytes.then(async files=>{const pairs=await Promise.all(files.map(async([key,b])=>[key,await ctx.decodeAudioData(b.slice(0))]));if(context===ctx){decoded=new Map(pairs);stats.ready=decoded.size===tracks.length;}}).catch(e=>stats.error=e.message);
  }
  const key=mod.ending?.active?null:mod.trial?.music??mod.frieza?.music;
  if(!key){stop();return;}
  if(playing?.key!==key||mod.frame<lastFrame){stop();const buffer=decoded.get(key);if(buffer){const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(output);const start=Math.max(ctx.currentTime,when??ctx.currentTime);source.start(start);playing={key,source,when:start};stats.track=key;}}
  const ending=mod.frieza?.orbit?.clash;
  let gain=mod.charging?.22:.32;
  // Yield to the native boss-death sequence as the beam breaks through.
  // The score stops at impact; neither pickup nor fanfare is ducked.
  if(ending?.phase==='win')gain=.32*(1-ease(ending.age/victoryTiming.impact));
  lastFrame=mod.frame;output.gain.setTargetAtTime(gain,ctx.currentTime,.12);
 }
 return{stats,update,clear:stop,resync(now){if(playing?.when>now)stop();},dispose(){stop();output?.disconnect();},get ready(){return pending??bytes;},get nativeGain(){return playing ? .018 : 1;},connect(node){output?.connect(node);}};
}
