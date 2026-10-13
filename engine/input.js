// Keyboard aliases and simultaneous touch pointers share a controller without
// releasing one source releasing another. Two sampled frames preserve quick
// taps across the SNES's alternating controller scans.
export class GameInput {
  constructor(){this.held=new Map();this.pulses=new Map();}
  press(source,bit){
    if(this.held.get(source)===bit)return;
    this.held.set(source,bit);this.pulses.set(source,{bit,frames:2});
  }
  release(source){this.held.delete(source);}
  cancel(source){this.held.delete(source);this.pulses.delete(source);}
  releasePrefix(prefix){for(const source of new Set([...this.held.keys(),...this.pulses.keys()]))if(source.startsWith(prefix))this.cancel(source);}
  has(bit){return [...this.held.values()].includes(bit);}
  pulse(bit){this.pulses.set('pulse:'+bit,{bit,frames:2});}
  sample(){
    let mask=0;
    for(const bit of this.held.values())mask|=1<<bit;
    for(const [source,pulse] of this.pulses){mask|=1<<pulse.bit;if(--pulse.frames<=0)this.pulses.delete(source);}
    return mask;
  }
  clear(){this.held.clear();this.pulses.clear();}
}

// Serial SNES order: B Y Select Start Up Down Left Right A X L R.
// Every gameplay action fits this pad. E is an optional talk-only shortcut;
// B also talks/confirms through the cartridge's normal interaction handler.
export const Controls={physical:0,blast:1,modifier:10,ring:9,transform:18,flight:21,fastForward:11,confirm:16};
export const keymap={
  ArrowUp:4,KeyW:4,ArrowDown:5,KeyS:5,ArrowLeft:6,KeyA:6,ArrowRight:7,KeyD:7,
  KeyJ:0,Space:0,KeyZ:0,KeyE:16,KeyQ:9,KeyX:9,Backspace:9,Enter:3,
  ShiftLeft:10,ShiftRight:10,KeyK:8,Tab:2,Comma:10,Period:11,KeyC:1,KeyR:18,KeyF:21,KeyV:11,
};
