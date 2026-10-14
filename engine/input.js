// Keyboard aliases and simultaneous touch pointers share a controller without
// releasing one source releasing another. Action taps span four frames to reach the slower native menu scans;
// directional taps keep their shorter two-frame movement response.
export class GameInput {
  constructor(){this.held=new Map();this.pulses=new Map();}
  press(source,bit){
    if(this.held.get(source)===bit)return;
    this.held.set(source,bit);this.pulses.set(source,{bit,frames:bit>=4&&bit<=7?2:4});
  }
  release(source){this.held.delete(source);}
  cancel(source){this.held.delete(source);this.pulses.delete(source);}
  releasePrefix(prefix){for(const source of new Set([...this.held.keys(),...this.pulses.keys()]))if(source.startsWith(prefix))this.cancel(source);}
  has(bit){return [...this.held.values()].includes(bit);}
  pulse(bit){this.pulses.set('pulse:'+bit,{bit,frames:4});}
  sample(){
    let mask=0;
    for(const bit of this.held.values())mask|=1<<bit;
    for(const [source,pulse] of this.pulses){mask|=1<<pulse.bit;if(--pulse.frames<=0)this.pulses.delete(source);}
    return mask;
  }
  clear(){this.held.clear();this.pulses.clear();}
}

// Serial SNES order: B Y Select Start Up Down Left Right A X L R.
// Every gameplay action fits this pad. B talks/confirms through the cartridge's
// normal interaction handler. Arrows alone move; letter keys are pad buttons.
export const Controls={physical:0,blast:1,modifier:10,ring:9,transform:18,flight:21,wave:22,teleport:23,fastForward:11};
export const keymap={
  ArrowUp:4,ArrowDown:5,ArrowLeft:6,ArrowRight:7,
  KeyZ:8,KeyX:0,KeyC:1,KeyA:9,ShiftLeft:10,ShiftRight:10,KeyD:11,
  Space:3,KeyS:2,Enter:3,Backspace:9,
};
