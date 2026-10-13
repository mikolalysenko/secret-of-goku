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

// Bits 16+ are wrapper actions. Only the low twelve reach the SNES.
export const Controls={confirm:16,blast:17,transform:18,teleport:19};
export const keymap={
  ArrowUp:4,KeyW:4,ArrowDown:5,KeyS:5,ArrowLeft:6,KeyA:6,ArrowRight:7,KeyD:7,
  KeyJ:0,Space:0,KeyZ:0,KeyE:16,KeyQ:1,KeyX:1,Backspace:1,Enter:3,
  ShiftLeft:8,ShiftRight:8,KeyK:8,Tab:2,Comma:10,Period:11,KeyC:17,KeyR:18,
};
