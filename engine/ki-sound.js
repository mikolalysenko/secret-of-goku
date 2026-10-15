// DBZ sample playback, with a deterministic emergency synth fallback.
// The Japanese chant uses a separate, cancellable vocal stem.
import {createKamehamehaVoice} from './kamehameha-voice.js';
import {createFriezaScore} from './frieza-score.js';
const TAU=Math.PI*2;
export const durations={swing:.12,hit:.24,blast:.19,beam:1.05,charged:.21,transform:2.55,powerBurst:1.55,teleport:.16,teleportIn:.13,flight:.24,charge:1};
export function synthesizeKiSound(name,{rate=16000,superSaiyan=false}={}){
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
    }else if(name==='powerBurst'){
      phase+=TAU*(48+55*Math.exp(-t*22))/rate;
      phase2+=TAU*(190+620*Math.exp(-t*9))/rate;
      value=(Math.sin(phase)*.9*Math.exp(-t*8)+hiss*Math.exp(-t*11)+
        (low*.7+Math.sin(phase2+2*Math.sin(phase))*.3)*Math.exp(-t*2))*attack*tail;
    }else if(name==='transform'){
      phase+=TAU*(65+100*Math.exp(-t*5))/rate;
      phase2+=TAU*(380+900*Math.exp(-t*3))/rate;
      const surge=Math.exp(-t*.8),rumble=.78+.22*Math.sin(TAU*23*t);
      value=(Math.sin(phase)*.45+Math.sin(phase2+Math.sin(phase)*2)*.18+hiss*.8+low*.6)*surge*rumble*attack*tail;
    }
    // The emergency synth uses the same 10-bit, 16 kHz sample-bank aesthetic.
    data[i]=Math.round(Math.tanh(value*1.1)*.68*512)/512;
  }
  return data;
}

// Short source effects are independent from the vocal stem. Animation cues
// select one-shots; held states own seamless loops. The synth above is only a
// network-failure fallback so offline failures never leave a charge silent.
export const cues={
 friezaLaugh:{clips:['frieza-laugh'],gain:.60,cap:1},friezaOrb:{clips:['frieza-orb'],gain:.55,cap:2},friezaDisc:{clips:['frieza-disc'],gain:.42,cap:2},
 friezaLaser:{clips:['blast'],gain:.42,cap:1,rate:1.65},
 friezaImpact:{clips:['impact'],gain:.72,cap:2,rate:.76},fortressBreak:{clips:['power-burst'],gain:.72,cap:1,rate:.82},friezaRush:{clips:['flight'],gain:.52,cap:1,rate:1.25},friezaCharge:{clips:['charge'],gain:.40,loop:true},
 swing:{clips:['swing','swing-2'],gain:.44,cap:2},kickSwing:{clips:['kick-swing'],gain:.46,cap:2},hit:{clips:['hit-1','hit-2','hit-3'],gain:.64,cap:3},
 kick:{clips:['kick'],gain:.70,cap:2},blast:{clips:['blast'],gain:.38,cap:5},impact:{clips:['impact'],gain:.48,cap:3},
 distantImpact:{clips:['impact'],gain:.16,cap:2},
 beam:{clips:['beam'],gain:.80,cap:1},charged:{clips:['charged'],gain:.42,cap:1},
 transform:{clips:['transform'],gain:.78,cap:1},revert:{clips:['revert'],gain:.50,cap:1},
 powerBurst:{clips:['power-burst'],gain:.92,cap:1},deflect:{clips:['deflect'],gain:.55,cap:2},
 teleport:{clips:['teleport'],gain:.74,cap:2},teleportIn:{clips:['teleport'],gain:.46,cap:2},
 flight:{clips:['flight'],gain:.48,cap:1},landing:{clips:['landing'],gain:.36,cap:1},
 charge:{clips:['charge'],gain:.55,loop:true},aura:{clips:['aura'],gain:.30,loop:true},air:{clips:['air'],gain:.25,loop:true},
};
const fallback={friezaImpact:'hit',fortressBreak:'powerBurst',friezaRush:'flight',friezaCharge:'charge',friezaLaugh:'charged',friezaOrb:'beam',friezaDisc:'blast',kickSwing:'swing',kick:'hit',impact:'hit',distantImpact:'hit',deflect:'hit',revert:'transform',landing:'flight',aura:'charge',air:'charge'};
export function createKiSound(mod){
  const speech=createKamehamehaVoice(mod);
  const music=createFriezaScore(mod);
  let queue=[],context=null,master=null,compressor=null,decoding=null,buffers=new Map(),fallbackBuffers=new Map();
  const voices=new Set(),tails=new Set(),loops=new Map(),variants=new Map(),lastCue=new Map();
  const stats={ready:false,error:null,played:0,last:null,charge:false,loops:[],history:[]};
  const data=Promise.all([...new Set(Object.values(cues).flatMap(c=>c.clips))].map(async name=>{
    const url=new URL(`../assets/audio/dbz/${name}.wav`,import.meta.url);url.search=new URL(import.meta.url).search;
    const response=await fetch(url);
    if(!response.ok)throw Error(`DBZ effect unavailable: ${name}`);return[name,await response.arrayBuffer()];
  })).catch(error=>{stats.error=error.message;return[];});
  function stopVoice(v,when=0,fade=0){
    if(!v)return;voices.delete(v);
    try{
      if(fade&&context?.state==='running'){
        tails.add(v);
        const time=Math.max(context.currentTime,when);v.gain.gain.cancelScheduledValues(time);
        v.gain.gain.setValueAtTime(v.gain.gain.value,time);v.gain.gain.linearRampToValueAtTime(0,time+fade);v.source.stop(time+fade+.005);
      }else{tails.delete(v);v.source.stop();v.source.disconnect();v.gain.disconnect();}
    }catch{}
  }
  function stopLoop(name,when=0,fade=0){stopVoice(loops.get(name),when,fade);loops.delete(name);}
  function stop(){for(const v of new Set([...voices,...tails]))stopVoice(v);loops.clear();stats.charge=false;stats.loops=[];speech.clear();music.clear();}
  function buffer(clip,name,superSaiyan){
    if(buffers.has(clip))return buffers.get(clip);
    const synth=fallback[name]||name,key=synth+':'+superSaiyan;
    if(!fallbackBuffers.has(key)){const pcm=synthesizeKiSound(synth,{superSaiyan}),b=context.createBuffer(1,pcm.length,16000);b.copyToChannel(pcm,0);fallbackBuffers.set(key,b);}
    return fallbackBuffers.get(key);
  }
  function voice(name,when,superSaiyan=false,frame=mod.frame){
    const cue=cues[name],variant=variants.get(name)||0;variants.set(name,variant+1);
    const peers=[...voices].filter(v=>v.name===name);while(peers.length>=(cue.cap||1))stopVoice(peers.shift(),when,.012);
    // Bound overlap during continuous SSJ barrages, without delaying a shot.
    while([...voices].filter(v=>!v.loop).length>=12)stopVoice([...voices].find(v=>!v.loop),when,.012);
    const source=context.createBufferSource(),gain=context.createGain(),clip=cue.clips[variant%cue.clips.length];
    source.buffer=buffer(clip,name,superSaiyan);source.loop=!!cue.loop;
    source.playbackRate.value=cue.rate??((name==='hit'||name==='swing'||name==='blast')?[1,1.035,.975][variant%3]:1);
    gain.gain.value=cue.loop?0:cue.gain;source.connect(gain);gain.connect(master);
    const v={source,gain,name,loop:!!cue.loop};voices.add(v);
    source.onended=()=>{voices.delete(v);tails.delete(v);source.disconnect();gain.disconnect();};source.start(when);
    stats.played++;stats.last=name;stats.history.push({name,clip,frame,when,sampled:buffers.has(clip)});if(stats.history.length>120)stats.history.shift();return v;
  }
  function loop(name,on,level,when,rate=1){
    if(!on){stopLoop(name,when,.065);return;}
    if(!loops.has(name))loops.set(name,voice(name,when));
    const v=loops.get(name);v.gain.gain.setTargetAtTime(cues[name].gain*level,when,.055);v.source.playbackRate.setTargetAtTime(rate,when,.08);
  }
  const api={
    stats,speech,cues,music,
    play(name){
      if(!cues[name]||cues[name].loop)return;
      if((name==='hit'||name==='impact')&&mod.frame-(lastCue.get(name)??-100)<2)return;
      lastCue.set(name,mod.frame);queue.push({name,frame:mod.frame,superSaiyan:mod.options.superSaiyan});if(queue.length>24)queue.shift();
    },
    update(ctx,audible,when){
      if(!audible||!ctx||ctx.state!=='running'){queue=[];stop();return;}
      if(ctx!==context){
        stop();master?.disconnect();compressor?.disconnect();context=ctx;buffers=new Map();fallbackBuffers=new Map();stats.ready=false;
        master=ctx.createGain();master.gain.value=.55;compressor=ctx.createDynamicsCompressor();
        compressor.threshold.value=-10;compressor.knee.value=12;compressor.ratio.value=6;compressor.attack.value=.003;compressor.release.value=.16;
        master.connect(compressor);compressor.connect(ctx.destination);
        decoding=data.then(async clips=>{
          const decoded=await Promise.all(clips.map(async([n,b])=>[n,await ctx.decodeAudioData(b.slice(0))]));
          if(context===ctx){buffers=new Map(decoded);stats.ready=buffers.size===new Set(Object.values(cues).flatMap(c=>c.clips)).size;
            // Replace a fallback loop if the first gesture preceded decoding.
            for(const name of [...loops.keys()])stopLoop(name,ctx.currentTime,.04);
          }
        }).catch(error=>{stats.error=error.message;});
      }
      when=Math.max(ctx.currentTime,when??ctx.currentTime);let beam=false;
      music.update(ctx,true,when);
      for(const item of queue)if(mod.frame-item.frame<5){
        // A quick return to base form cuts off the power-up's long tail.
        if(item.name==='revert')for(const v of [...voices])if(v.name==='transform'||v.name==='powerBurst')stopVoice(v,when,.05);
        voice(item.name,when,item.superSaiyan,item.frame);beam||=item.name==='beam';
      }
      queue=[];speech.update(ctx,true,when,beam);
      const focusing=mod.action?.kind==='focus',revealing=mod.action?.kind==='transform',focus=Math.min(1,mod.powerCharge/96);
      const charging=mod.charging&&(mod.canAttack||mod.worldFlight),strength=Math.min(1,mod.charge/(mod.options.superSaiyan?45:90));
      // Never key energy to the chant's duration: an indefinite hold keeps its
      // own rumble, with a small pitch rise instead of a sped-up voice/whine.
      loop('charge',charging||focusing||revealing,focusing?.22+focus*.85:revealing?.85:.48+strength*.52,when,focusing?.72+focus*.3:.94+strength*.12);
      loop('aura',(focusing&&focus>.4)||revealing||(charging&&mod.options.superSaiyan&&strength>.35),focusing?focus:revealing?1:strength,when,focusing?.8+focus*.2:1);
      loop('air',mod.options.enabled&&mod.gokuActive&&(mod.localFlight||mod.worldFlight||mod.gapFlight?.active||mod.frieza?.orbit),charging?.35:1,when);
      const enemyCharge=mod.options.enabled&&mod.gokuActive?(mod.frieza?.chargeSound??0):0;
      loop('friezaCharge',enemyCharge>0,enemyCharge,when,.76);
      stats.charge=loops.has('charge');stats.loops=[...loops.keys()];
    },
    get ready(){return Promise.all([decoding||data,music.ready]);},
    get nativeGain(){return music.nativeGain;},
    get output(){return compressor;},
    connect(node){compressor?.connect(node);},
    cancelCombat(){
      queue=queue.filter(v=>!['swing','kickSwing','blast','beam','charged'].includes(v.name));
      stopLoop('charge');stopLoop('aura');speech.clear();
      for(const v of [...voices])if(v.name==='beam')stopVoice(v,context?.currentTime,.035);
      stats.charge=false;stats.loops=[...loops.keys()];
    },
    snapshot(){return{queue:structuredClone(queue)};},
    restore(saved){stop();lastCue.clear();variants.clear();queue=saved?.queue?structuredClone(saved.queue):[];},
    clear(){queue=[];lastCue.clear();stop();},
    dispose(){api.clear();speech.dispose();music.dispose();master?.disconnect();compressor?.disconnect();buffers.clear();},
  };
  mod.playSound=name=>api.play(name);mod.sound=api;return api;
}
