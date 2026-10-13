// Preserve the continuous Japanese performance. Charge strength no longer
// truncates syllables or speeds the voice up in Super Saiyan. Only releasing
// the attack interrupts the build-up and triggers the separately cut HA.
const names=['charge','release'];
export function createKamehamehaVoice(mod){
  let context=null,buffers=new Map(),decoding=null,chant=null,release=null,charging=false,started=false;
  const stats={ready:false,error:null,played:0,last:null,history:[],speaking:false,durations:{}};
  const data=Promise.all(names.map(async name=>{
    const response=await fetch(new URL(`../assets/audio/kamehameha-${name}.wav`,import.meta.url));
    if(!response.ok)throw Error(`Japanese voice sample unavailable: ${name}`);
    return[name,await response.arrayBuffer()];
  })).catch(error=>{stats.error=error.message;return[];});
  function stopVoice(voice,fade=false){
    if(!voice)return;
    try{
      if(fade&&context?.state==='running'){
        const now=context.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);voice.gain.gain.linearRampToValueAtTime(0,now+.03);voice.source.stop(now+.035);
      }else{voice.source.stop();voice.source.disconnect();voice.gain.disconnect();}
    }catch{}
  }
  function stopChant(fade=false){stopVoice(chant,fade);chant=null;charging=false;started=false;stats.speaking=!!release;}
  function clear(){stopChant();stopVoice(release);release=null;stats.speaking=false;}
  function play(name,when){
    const buffer=buffers.get(name);if(!buffer)return null;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=name==='release'?.36:.32;
    source.connect(gain);gain.connect(context.destination);
    const voice={source,gain};source.onended=()=>{source.disconnect();gain.disconnect();if(chant===voice)chant=null;if(release===voice)release=null;stats.speaking=!!(chant||release);};
    source.start(when);stats.played++;stats.last=name;stats.speaking=true;
    stats.history.push({name,frame:mod.frame,when,duration:buffer.duration});if(stats.history.length>24)stats.history.shift();
    return voice;
  }
  return{
    stats,clear,
    update(ctx,audible,when,beam=false){
      if(!audible||!ctx||ctx.state!=='running'){clear();return;}
      if(ctx!==context){
        clear();context=ctx;buffers=new Map();stats.ready=false;
        decoding=data.then(async clips=>{
          const decoded=await Promise.all(clips.map(async([name,bytes])=>[name,await ctx.decodeAudioData(bytes.slice(0))]));
          if(context===ctx){buffers=new Map(decoded);stats.durations=Object.fromEntries(decoded.map(([n,b])=>[n,b.duration]));stats.ready=buffers.size===names.length;}
        }).catch(error=>{stats.error=error.message;});
      }
      when=Math.max(ctx.currentTime,when??ctx.currentTime);
      if(!mod.charging||!(mod.canAttack||mod.worldFlight))stopChant(true);
      else{
        if(!charging){charging=true;started=false;stopVoice(release,true);release=null;}
        if(stats.ready&&!started){chant=play('charge',when);started=true;}
      }
      if(beam){stopChant(true);stopVoice(release,true);release=play('release',when);}
    },
    get ready(){return decoding||data;},
    dispose(){clear();buffers.clear();},
  };
}
