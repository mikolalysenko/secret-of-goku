import {createManaTreeVista} from './mana-tree-vista.js';
import {drawFriezaSprite} from './frieza-sprite.js';
import {createOrbitEffects} from './orbit-effects.js';
import {treeFriezaPose,friezaDeathBallPose} from './frieza-staging.js';
export {treeTiming,treeFriezaPose} from './frieza-staging.js';
export function createFriezaTreeView(snes,mod,getScene,getAtlas){
 const surface=new Uint16Array(256*224);let vista=null,prepared=-1;
 const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)surface[y*256+x]=c;};
 const fx=createOrbitEffects(snes,mod,put);
 // Retain recruited companions' real SNES cells/palettes, repositioned onto
 // the same cliff as Goku. No native camera actor is used as a body anchor.
 function companion(species,x,y){
  const p=snes.ppu;
  for(let i=254;i>=0;i-=2){
   const owner=mod.ownership?.ppuOwners[i/2];if(owner?.kind!=='body'||owner.native.species!==species)continue;
   const attr=p.oam[i+1],ex=attr>>8,tile=attr&255;
   let ox=(p.oam[i]&255)|((p.highOam[i>>4]>>(i&15)&1)<<8);if(ox>255)ox-=512;
   let oy=p.oam[i]>>8;const size=p.spriteSizes[p.objSize+((p.highOam[i>>4]>>(i&15)&2)?8:0)];if(oy>=256-size*8)oy-=256;
   const adr=p.sprAdr1+((ex&1)?p.sprAdr2:0),left=x+ox-owner.anchor.x,top=y+oy-owner.anchor.renderedFeetY;
   for(let py=0;py<size*8;py++)for(let px=0;px<size*8;px++){
    const sy=ex&128?size*8-1-py:py,sx=ex&64?size*8-1-px:px;
    const n=(tile+p.spriteTileOffsets[(sy>>3)*8+(sx>>3)])&255,shift=7-(sx&7);
    const lo=p.vram[(adr+n*16+(sy&7))&32767],hi=p.vram[(adr+n*16+(sy&7)+8)&32767];
    const c=(lo>>shift&1)|(lo>>(8+shift)&1)<<1|(hi>>shift&1)<<2|(hi>>(8+shift)&1)<<3;
    if(c)put(left+px,top+py,1+p.cgram[128+c+16*(ex>>1&7)]);
   }
  }
 }
 function prepare(scene){
  prepared=mod.frame;vista??=createManaTreeVista(snes.cart.data);
  const {kind,age}=scene,impact=kind==='tree-impact',destroyed=['tree-leave','tree-return'].includes(kind)||impact&&age>=18;
  const shake=impact&&age<48?(age%8<4?-1:1):0;
  const draw=(x,y,c)=>put(x+shake,y,c);
  surface.fill(0);vista(draw,{destroyed});
  const p=treeFriezaPose(kind,age,(scene.clock??0)+age);
  if(!['tree-establish','tree-return'].includes(kind))drawFriezaSprite(getAtlas(),p.frame,p.x,p.y,draw,{tiny:true});
  if(kind==='tree-charge'||kind==='tree-shot'){
   const ball=friezaDeathBallPose(scene,p,{tree:true});
   if(ball.visible)mod.kiArt?.draw('death',ball.frame,ball.x,ball.y,ball.size,draw,{cinematic:true});
  }
  if(impact){
   for(let i=0;i<5;i++){const t=age-i*12;if(t>=0&&t<74)fx.burst(150+(i%3-1)*14,123+(i>>1)*16,t,{large:true});}
  }
  vista(draw,{foreground:true,x:0,y:184});
  const a=mod.spriteLayer.atlas[mod.options.superSaiyan?'ssj':'goku'];
  if(a)for(let y=0;y<32;y++)for(let x=0;x<32;x++){const c=a.pixels[(128+y)*a.width+x];if(c)draw(112+x,156+y,c);}
  companion(139,102+shake,200);companion(140,154+shake,200);
  if(impact&&age<20){const light=(20-age)/24;for(let i=0;i<surface.length;i++){
   const c=surface[i]-1,mix=n=>Math.round(n+(31-n)*light);
   surface[i]=1+mix(c&31)+(mix(c>>5&31)<<5)+(mix(c>>10&31)<<10);
  }}
 }
 return{idle(ppu,line){
  // True when color() returns its native argument for the whole line.
  const scene=getScene();if(!scene||!mod.options.enabled||ppu.mode!==1||line>224)return true;
  return scene.kind!=='tree-wake'&&scene.kind!=='tree-return'&&(scene.map!==236||!scene.kind.startsWith('tree-')||mod.read16(0xdc)!==236);
 },color(ppu,sub,x,y,native){
  const scene=getScene();if(!scene||!mod.options.enabled||sub||ppu.mode!==1||y>224)return native;
  const dim=(color,amount)=>Math.round((color&31)*amount)|(Math.round((color>>5&31)*amount)<<5)|(Math.round((color>>10&31)*amount)<<10);
  if(scene.kind==='tree-wake')return[dim(native[0],Math.min(1,scene.age/40)),native[1],native[2]];
  if(scene.kind==='tree-return'){
   if(scene.age>=48||y===224)return[0,4,0x86];
   if(prepared!==mod.frame)prepare(scene);
   return[dim(surface[y*256+x]-1,1-scene.age/48),4,0x86];
  }
  if(scene.map!==236||!scene.kind.startsWith('tree-')||mod.read16(0xdc)!==236)return native;
  if(y===224)return[0,4,0x86];
  if(prepared!==mod.frame)prepare(scene);
  if(native[1]===2&&y<170)return native;
  return[surface[y*256+x]-1,4,0x86];
 }};
}
