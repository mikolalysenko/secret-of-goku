// Original synthesized sounds; no music or samples copied from either game.
export class AudioEngine {
  constructor(){this.enabled=false;this.ctx=null;this.nextNote=0;this.note=0;}
  async toggle(){
    this.enabled=!this.enabled;
    if(this.enabled){this.ctx??=new(window.AudioContext||window.webkitAudioContext)();await this.ctx.resume();this.nextNote=this.ctx.currentTime;}
    return this.enabled;
  }
  tone(freq,duration=.12,type='sine',volume=.04,delay=0,end=freq){
    if(!this.enabled||!this.ctx)return;
    const ctx=this.ctx,t=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(Math.max(20,freq),t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+duration+.01);
  }
  noise(duration=.15,volume=.03){
    if(!this.enabled||!this.ctx)return;const ctx=this.ctx,buffer=ctx.createBuffer(1,ctx.sampleRate*duration,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**2;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=1900;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start();
  }
  play(name){
    if(!this.enabled)return;
    if(name==='punch'){this.noise(.09,.075);this.tone(140,.1,'triangle',.06,0,45);}
    else if(name==='hit'||name==='break'){this.noise(.24,.12);this.tone(85,.18,'sawtooth',.025,0,30);}
    else if(name==='ki'){this.tone(700,.13,'square',.025,0,150);}
    else if(name==='beam'){this.noise(.75,.17);this.tone(95,.6,'sawtooth',.06,0,38);this.tone(450,.7,'triangle',.05,0,90);}
    else if(name==='transform'){this.noise(.6,.08);[196,293.66,392,587.33].forEach((f,i)=>this.tone(f,.65,'triangle',.04,i*.08,f*1.02));}
    else if(name==='achievement'||name==='heal'){[392,493.88,587.33,783.99].forEach((f,i)=>this.tone(f,.23,'triangle',.05,i*.09));}
    else if(name==='flight'){this.tone(100,.6,'triangle',.05,0,800);this.noise(.4,.04);}
    else if(name==='land'||name==='door'){this.tone(220,.22,'sine',.035,0,110);}
    else if(name==='dash'){this.noise(.14,.045);}
    else if(name==='spirit'){this.tone(196,1.9,'sine',.055,0,784);this.tone(293.66,1.9,'sine',.025,0,1174);}
    else this.tone(name==='tick'?550:740,.045,'sine',.022);
  }
  update(game){
    for(const s of game.sounds)this.play(s);game.sounds.length=0;
    if(!this.enabled||!this.ctx||game.overlay||document.hidden)return;
    const now=this.ctx.currentTime;if(now<this.nextNote)return;
    // A sparse pentatonic melody, deliberately distinct from the original score.
    const melody=[62,69,74,76,69,0,67,74,79,76,74,0,69,67,62,0];
    const note=melody[this.note++%melody.length];if(note)this.tone(440*2**((note-69)/12),.8,'sine',.015);
    if(this.note%4===0)this.tone(146.83,1.9,'triangle',.009);
    this.nextNote=now+(game.mode==='flight'?.34:.44);
  }
}
