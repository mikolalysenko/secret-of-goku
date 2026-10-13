// Original, deterministic sampled effects inspired by anime ki combat.
// The Japanese chant uses a separate, cancellable sample voice.
import {createKamehamehaVoice} from './kamehameha-voice.js';
const TAU=Math.PI*2;
export const durations={swing:.12,hit:.24,blast:.19,beam:1.05,charged:.21,transform:.9,teleport:.16,teleportIn:.13,flight:.24,charge:1};
export function synthesizeKiSound(name,{rate=22050,superSaiyan=false}={}){
  if(!durations[name])throw Error(`Unknown ki sound: ${name}`);
  const data=new Float32Array(Math.ceil(durations[name]*rate));
  let seed=0x6a09e667,low=0,mid=0,phase=0,phase2=0;
  const pitch=superSaiyan&&name==='beam'?.86:superSaiyan&&name==='blast'?1.12:1;
  for(let i=0;i<data.length;i++){
    const t=i/rate,u=i/(data.length-1),attack=Math.min(1,t/.003),tail=Math.min(1,(1-u)*18);
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;low+=.09*(noise-low);mid+=.43*(noise-mid);
    const hiss=mid-low;
    let value=0;
    if(name==='charge'){
      // Integral cycles make a seamless, rising-pitch looping electric hum.
      value=.20*Math.sin(TAU*120*t+1.4*Math.sin(TAU*60*t))+.13*Math.sin(TAU*360*t)+.05*Math.sin(TAU*780*t);
      value*=.82+.18*Math.sin(TAU*12*t);
    }else if(name==='beam'){
      phase+=TAU*(pitch*(95+500*Math.exp(-t*11)))/rate;
      phase2+=TAU*(pitch*(650+1650*Math.exp(-t*7)))/rate;
      const body=(.75+.25*Math.sin(TAU*47*t))*(1-.7*u);
      value=(hiss*.85+low*.7+Math.sin(phase+2.5*Math.sin(phase2))*.23)*body;
      value+=Math.sin(TAU*58*t)*.34*Math.exp(-t*11)+hiss*.75*Math.exp(-t*32);
      value*=attack*tail;
    }else if(name==='blast'){
      phase+=TAU*pitch*(180+2900*Math.exp(-t*30))/rate;
      value=(Math.sin(phase+1.6*Math.sin(phase*.503))*.40+hiss*.60)*Math.exp(-t*18)*attack*tail;
    }else if(name==='teleport'||name==='teleportIn'){
      const arriving=name==='teleportIn';
      phase+=TAU*(arriving?340+2400*Math.exp(-t*42):420+2300*u*u)/rate;
      value=(Math.sin(phase+2.8*Math.sin(phase*.49))*.42+hiss*.55)*Math.sin(Math.PI*u)**.65*tail;
    }else if(name==='swing'||name==='flight'){
      phase+=TAU*(90+420*(1-u)**2)/rate;
      value=(hiss*.7+Math.sin(phase)*.15)*Math.sin(Math.PI*u)**1.4*tail;
    }else if(name==='hit'){
      phase+=TAU*(48+170*Math.exp(-t*38))/rate;
      value=(Math.sin(phase)*.62*Math.exp(-t*21)+hiss*.85*Math.exp(-t*44)+low*.4*Math.exp(-t*17))*attack*tail;
    }else if(name==='charged'){
      phase+=TAU*(1600-800*u)/rate;
      value=(Math.sin(phase)*.26+Math.sin(phase*1.51)*.15+hiss*.25)*Math.exp(-t*19)*attack*tail;
    }else if(name==='transform'){
      phase+=TAU*(80+85*u)/rate;
      phase2+=TAU*(420+1100*u)/rate;
      value=(Math.sin(phase)*.28+Math.sin(phase2+Math.sin(phase)*2)*.18+hiss*.7)*Math.sin(Math.PI*u)**.6;
    }
    // Headroom for rapid overlapping bolts; 12-bit PCM suits the SNES mix.
    data[i]=Math.round(Math.tanh(value*1.1)*2047)/2047*.68;
  }
  return data;
}

export function createKiSound(mod){
  const speech=createKamehamehaVoice(mod);
  let queue=[],context=null,master=null,charge=null,buffers=new Map();
  const voices=new Set(),stats={played:0,last:null,charge:false};
  function stopCharge(){if(charge){try{charge.source.stop();}catch{}charge=null;}stats.charge=false;}
  function stop(){stopCharge();speech.clear();for(const source of voices){try{source.stop();}catch{}}voices.clear();}
  function buffer(name,superSaiyan){
    const key=name+':'+superSaiyan;
    if(!buffers.has(key)){const samples=synthesizeKiSound(name,{superSaiyan}),b=context.createBuffer(1,samples.length,22050);b.copyToChannel(samples,0);buffers.set(key,b);}
    return buffers.get(key);
  }
  function voice(name,superSaiyan,when,loop=false){
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer(name,superSaiyan);source.loop=loop;gain.gain.value=loop?.16:1;
    source.connect(gain);gain.connect(master);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};source.start(when);
    stats.played++;stats.last=name;return{source,gain};
  }
  const api={
    stats,speech,
    play(name){if(name==='charge')return;if(durations[name]){queue.push({name,frame:mod.frame,superSaiyan:mod.options.superSaiyan});if(queue.length>12)queue.shift();}},
    update(ctx,audible,when){
      if(!audible||!ctx||ctx.state!=='running'){queue=[];stop();return;}
      if(ctx!==context){stop();context=ctx;buffers=new Map();master=ctx.createGain();master.gain.value=.38;master.connect(ctx.destination);}
      when=Math.max(ctx.currentTime,when??ctx.currentTime);
      let beam=false;
      for(const item of queue)if(mod.frame-item.frame<5){voice(item.name,item.superSaiyan,when);beam||=item.name==='beam';}
      queue=[];
      speech.update(ctx,true,when,beam);
      if(mod.charging&&(mod.canAttack||mod.worldFlight)){
        if(!charge)charge=voice('charge',false,when,true);
        const strength=Math.min(1,mod.charge/(mod.options.superSaiyan?45:90));
        charge.source.playbackRate.setTargetAtTime(.7+strength*1.9,ctx.currentTime,.035);
        charge.gain.gain.setTargetAtTime(.16+strength*.38,ctx.currentTime,.035);stats.charge=true;
      }else stopCharge();
    },
    snapshot(){return{queue:structuredClone(queue)};},
    restore(saved){stop();queue=saved?.queue?structuredClone(saved.queue):[];},
    clear(){queue=[];stop();},
    dispose(){api.clear();speech.dispose();master?.disconnect();buffers.clear();},
  };
  mod.playSound=name=>api.play(name);mod.sound=api;return api;
}
