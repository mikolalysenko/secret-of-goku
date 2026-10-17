// Native pixel staging for the Emperor hit and the altar reveal.
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const introTiming={hit:6,blackEnd:22,beamEnd:28,shot:40,pan:300,entry:140};
export function altarPose(scene,camera){
 const a=scene.altar,t=scene.kind==='reveal'?ease((scene.age-introTiming.entry)/(introTiming.pan-introTiming.entry)):1;
 const leave=['temple-exit','altar-leave'].includes(scene.kind)?Math.min(1,scene.age/120)**2:0;
 return{x:Math.round(a.x+(400-a.x)*(1-t)+64*leave-camera.cameraX),
  y:Math.round(a.y-320*leave-camera.cameraY),frame:0};
}
export function altarCamera(scene){
 if(!scene?.altar)return null;
 const a=scene.altar,t=scene.kind==='reveal'?ease(scene.age/introTiming.pan):1;
 return{x:a.cameraX,y:Math.round(a.cameraY+(64-a.cameraY)*t)};
}

// Use the cartridge's camera dispatcher, so tiles stream at every crossed
// row and NPCs stay attached to the room. No PPU-scroll or map-RAM edits.
export function installAltarCamera(snes,mod,getScene){
 const cpu=snes.cpu,cycle=cpu.cycle,r=snes.ram,w=a=>r[a]|r[a+1]<<8,pack=n=>n<0?128|-n:n;
 let lastFrame=-1;
 cpu.cycle=function(){
  const scene=getScene(),target=mod.options.enabled&&scene?.map===w(0xdc)?scene.court?{x:152,y:260}:w(0xdc)===431?altarCamera(scene):null:null;
  if(target&&!r[0xff]&&this.cyclesLeft===0&&(this.r[1]&63)===0){
   const pc=this.br[4],leader=w(0x10)===0;
   // A stationary actor normally skips camera work altogether.
   if(pc===0xd651&&leader&&!(r[0x1e]|r[0x1f]))this.br[4]=0xd6ac;
   if(this.br[4]===0xda6e){
    let dx=0,dy=0;
    if(leader&&lastFrame!==snes.frames){
     dx=Math.max(-1,Math.min(1,target.x-w(0xa8)));dy=Math.max(-1,Math.min(1,target.y-w(0xaa)));
     lastFrame=snes.frames;
    }
    r[0x84]=pack(dx);r[0x86]=pack(dy);r[0x1b]=r[0xe00b];
   }
  }
  return cycle.call(this);
 };
 cpu.registerBreakpoints?.(cpu.cycle,cycle,[[0,0xd651],[0,0xda6e]]);
 return{reset(){lastFrame=-1;},dispose(){cpu.cycle=cycle;}};
}

// Sample the Emperor's actual OAM cells for the hit silhouette. His chest
// follows the same anchor as the native body, even while the camera moves.
export function createEmperorBeamView(snes,mod,getScene){
 const surface=new Uint16Array(256*224);let prepared=-1,chest=null;
 const lineColors=new Uint16Array(256),paint={type:'paint',layers:63,colors:lineColors,skipZero:true,layer:4,pixel:0x86,mainOnly:true};
 const pink=1+31+(8<<5)+(23<<10),rim=1+20+(2<<5)+(14<<10),white=0x8000;
 const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
 function prepare(scene){
  prepared=mod.frame;surface.fill(0);const p=snes.ppu;
  const owners=mod.ownership.ppuOwners;
  const body=owners.find(o=>o?.base===scene.base&&o.kind==='body');
  chest=body?{x:body.anchor.x,y:body.anchor.renderedFeetY-15}:null;
  if(!chest)return;
  const impact=scene.age>=introTiming.hit&&scene.age<introTiming.blackEnd;
  if(impact)for(let i=254;i>=0;i-=2){
   const owner=owners[i/2];if(owner?.base!==scene.base||owner.kind!=='body')continue;
   const attr=p.oam[i+1],ex=attr>>8,tile=attr&255;
   let x=(p.oam[i]&255)|((p.highOam[i>>4]>>(i&15)&1)<<8);if(x>255)x-=512;
   let y=p.oam[i]>>8;const size=p.spriteSizes[p.objSize+((p.highOam[i>>4]>>(i&15)&2)?8:0)];if(y>=256-size*8)y-=256;
   const adr=p.sprAdr1+((ex&1)?p.sprAdr2:0);
   for(let py=0;py<size*8;py++)for(let px=0;px<size*8;px++){
    const sy=ex&128?size*8-1-py:py,sx=ex&64?size*8-1-px:px;
    const n=(tile+p.spriteTileOffsets[(sy>>3)*8+(sx>>3)])&255,bit=7-(sx&7);
    const lo=p.vram[(adr+n*16+(sy&7))&32767],hi=p.vram[(adr+n*16+(sy&7)+8)&32767];
    const c=(lo>>bit&1)|(lo>>(8+bit)&1)<<1|(hi>>bit&1)<<2|(hi>>(8+bit)&1)<<3;
    if(c)put(x+px,y+py,scene.age===13||scene.age===14?pink:white);
   }
  }
  // One piercing ray from stage right, through the chest and out the left.
  // Its hot core is one pixel wide. There is no angle quantization that can
  // move the endpoint below the victim or toward Goku.
  if(scene.age<introTiming.beamEnd){
   const head=scene.age<=introTiming.hit?Math.round(280+(chest.x-280)*scene.age/introTiming.hit):Math.round(chest.x-(scene.age-introTiming.hit)*80);
   for(let x=Math.max(0,head);x<256;x++)for(let y=-1;y<=1;y++)put(x,chest.y+y,y===0?white:scene.age<22?pink:rim);
  }
  if(scene.age>=introTiming.hit&&scene.age<36){
   const t=scene.age-introTiming.hit,frames=mod.spriteLayer.effects['impact-spark'],cell=frames?.[Math.floor(t/3)%frames.length];
   if(cell)for(const side of[-1,1])for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const c=cell[y*16+x];if(c)put(chest.x+side*(3+Math.min(9,t>>1))+x-8,chest.y+y-8,t<10?white:pink);
   }
  }
 }
 return{idle(ppu,line){
  const scene=getScene();return !mod.options.enabled||scene?.kind!=='emperor-shot'||scene.map!==mod.read16(0xdc)||ppu.mode!==1||line>224;
 },color(ppu,sub,x,y,native){
  const scene=getScene();if(!mod.options.enabled||scene?.kind!=='emperor-shot'||scene.map!==mod.read16(0xdc)||sub||ppu.mode!==1||y>224)return native;
  if(prepared!==mod.frame)prepare(scene);
  // Writes the result into native (the caller's fresh triple) and returns it.
  const c=surface[y*256+x];
  if(c){native[0]=c-1;native[1]=4;native[2]=0x86;return native;}
  if(chest&&scene.age>=introTiming.hit&&scene.age<introTiming.blackEnd){native[0]=0;native[1]=4;native[2]=0x86;return native;}
  return native;
 },plan(ppu,y,linePlan){
  // color() for a whole line as one paint, when idle() is false: the
  // picture, and black elsewhere during the impact.
  const scene=getScene();if(prepared!==mod.frame)prepare(scene);
  const black=chest&&scene.age>=introTiming.hit&&scene.age<introTiming.blackEnd;
  for(let x=0,at=y*256;x<256;x++){const c=surface[at+x];lineColors[x]=c||(black?1:0);}
  paint.skipZero=!black;linePlan.extra.push(paint);
 },get chest(){return chest;}};
}
