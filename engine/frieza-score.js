// Separate score bus: never delays a hit or shares the Kamehameha vocal.
export function createFriezaScore(mod){
 let ctx=null,output=null,playing=null,pending=null,decoded=new Map(),lastFrame=-1;
 const stats={track:null,ready:false,error:null};
 const bytes=Promise.all(['arrival','battle','orbit'].map(async key=>{const url=new URL(`../assets/audio/music/${key}.wav`,import.meta.url);url.search=new URL(import.meta.url).search;const r=await fetch(url);if(!r.ok)throw Error(`Score unavailable: ${key}`);return[key,await r.arrayBuffer()];})).catch(e=>{stats.error=e.message;return[];});
 function stop(){if(playing){try{playing.source.stop();playing.source.disconnect();}catch{}playing=null;}stats.track=null;}
 function update(context,audible,when){
  if(!audible||!context||context.state!=='running'){stop();return;}
  if(context!==ctx){stop();output?.disconnect();ctx=context;output=ctx.createGain();output.gain.value=.32;output.connect(ctx.destination);stats.ready=false;
   pending=bytes.then(async files=>{const pairs=await Promise.all(files.map(async([key,b])=>[key,await ctx.decodeAudioData(b.slice(0))]));if(context===ctx){decoded=new Map(pairs);stats.ready=decoded.size===3;}}).catch(e=>stats.error=e.message);
  }
  const key=mod.frieza?.music;
  if(!key){stop();return;}
  if(playing?.key!==key||mod.frame<lastFrame){stop();const buffer=decoded.get(key);if(buffer){const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(output);source.start(Math.max(ctx.currentTime,when??ctx.currentTime));playing={key,source};stats.track=key;}}
  lastFrame=mod.frame;output.gain.setTargetAtTime(mod.charging?.22:.32,ctx.currentTime,.12);
 }
 return{stats,update,clear:stop,dispose(){stop();output?.disconnect();},get ready(){return pending??bytes;},get nativeGain(){return playing ? .018 : 1;},connect(node){output?.connect(node);}};
}
