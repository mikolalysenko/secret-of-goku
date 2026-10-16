// The cartridge always draws its dialogue window at the top of the screen
// (BG3 tilemap rows 1-8, screen lines 8-71), so a speaker standing near the
// top of a small room talks from behind it. When a window opens over more
// characters than the lower band would cover, show that window above the
// HUD instead (lines 136-199) by re-rendering BG3 with a vertical offset.
// The tilemap, text engine, timing and input are untouched. Choices are BG3
// text and move with the window; shops and ring menus keep their position.
export const windowBands={top:[8,72],bottom:[136,200]};
const shift=windowBands.top[0]-windowBands.bottom[0];
const blank=w=>w===0||w===0x2000;

export function createWindowPlacement(snes,mod){
  const ppu=snes.ppu,renderLine=ppu.renderLine;
  // One placement per scene: decided as the event's first window starts to
  // draw and kept for every later window, page and door of that event, so a
  // window never jumps while it is up or between lines of one conversation.
  let session=null,idle=0,present=false,lower=false,decisions=0;
  // HDMA rewrites BG3's palette (CGRAM 0-31) mid-frame for the HUD. A moved
  // line keeps the colors its source line had in the window band.
  const palettes=Array.from({length:windowBands.top[1]},()=>new Uint16Array(32));
  const rowsBlank=(from,to)=>{
    const base=ppu.tilemapAdr[2];
    for(let row=from;row<to;row++)for(let c=0;c<32;c++)if(!blank(ppu.vram[(base+row*32+c)&0x7fff]))return false;
    return true;
  };
  // Any tile in the window rows: the open animation's first frame counts,
  // so the decision lands before the window is ever shown at the top.
  const windowPresent=()=>!rowsBlank(windowBands.top[0]>>3,windowBands.top[1]>>3);
  // Count faces, not feet: a head sits about 24 px above the feet, and a
  // window over a listener's legs is fine while the speaker stays visible.
  const covered=([top,bottom])=>mod.entities().filter(e=>e.active&&e.screenX>-16&&e.screenX<272&&e.screenY-24>=top-8&&e.screenY-24<bottom).length;
  // Another BG3 window (a gold or item display) already uses the lower band.
  const bandFree=()=>rowsBlank(windowBands.bottom[0]>>3,windowBands.bottom[1]>>3);
  const field=()=>mod.options.enabled&&ppu.mode===1&&!mod.nameEditor&&!mod.ending?.active;
  const menu=()=>!!(mod.read8(0xec)&0x7e);
  function frame(){
    const event=mod.read8(0xd0)!==0;
    // Chained events hand over within a few frames; a scene ends only after
    // the interpreter has been idle for half a second.
    idle=event?0:idle+1;if(idle>30)session=null;
    present=windowPresent();
    if(present&&event&&!session){
      session={lower:field()&&!menu()&&bandFree()&&covered(windowBands.top)>covered(windowBands.bottom)};
      if(session.lower)decisions++;
    }
    // Shops and ring menus draw their own BG3 layout: that scene stays native.
    if(session&&menu())session.lower=false;
    lower=present&&!!session?.lower&&field();
  }
  ppu.renderLine=function(line){
    if(line===0)frame();
    if(!lower||line<windowBands.top[0]||line>=windowBands.bottom[1]||(line>=windowBands.top[1]&&line<windowBands.bottom[0]))return renderLine.call(this,line);
    if(line<windowBands.top[1]){
      palettes[line].set(this.cgram.subarray(0,32));
      const main=this.mainScreenEnabled[2],sub=this.subScreenEnabled[2];
      this.mainScreenEnabled[2]=false;this.subScreenEnabled[2]=false;
      try{return renderLine.call(this,line);}finally{this.mainScreenEnabled[2]=main;this.subScreenEnabled[2]=sub;}
    }
    const voff=this.bgVoff[2],colors=this.cgram.slice(0,32);
    this.bgVoff[2]=(voff+shift)&0x3ff;this.cgram.set(palettes[line+shift]);
    try{return renderLine.call(this,line);}finally{this.bgVoff[2]=voff;this.cgram.set(colors);}
  };
  return{
    get status(){return{open:present,lower,session:session?{...session}:null,decisions};},
    dispose(){if(ppu.renderLine!==renderLine)ppu.renderLine=renderLine;},
  };
}
