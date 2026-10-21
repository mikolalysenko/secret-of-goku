// The browser's own picture of the orbital battle, frame by frame: the
// fight reference (fight-ref.mjs, the browser's frieza.js tick) drawn by
// planet-view.js itself, read back through the getColor it installs on a
// stand-in PPU (as montage-ref.mjs does for the pullback), with the sprite
// layer, Frieza's full-power sheet and the ki art built as the browser
// builds them. Also the plain picture of the same frame (the globe and the
// sky alone, reference.mjs), so a test can tell the sprites' pixels apart.
//
//   const v=await fightView({frames, pad, wram, want:f=>bool});
//   v.get(f) -> {px (BGR555 per pixel), plain, cls, state}
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {readPng} from '../../tools/gfx.mjs';
import {runFightReference} from './fight-ref.mjs';
import {renderSpace} from './reference.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

// Image / canvas stand-ins (the ki art's dragon sheet reads a PNG)
function installImage(){
  if(globalThis.Image?.fightView)return;
  class Img{static fightView=true;set src(v){this._src=String(v);}get src(){return this._src;}
    decode(){const u=new URL(this._src);u.search='';const p=readPng(fileURLToPath(u));this.width=p.width;this.height=p.height;this.png=p;return Promise.resolve();}}
  globalThis.Image=Img;
  globalThis.document={createElement:()=>{const c={width:0,height:0,img:null,getContext:()=>({drawImage(img){c.img=img;},getImageData:()=>({data:c.img.png.data})})};return c;}};
}

export async function fightView({frames,pad,wram,start={},want=()=>true}){
  installImage();
  let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  if(rom.length%0x8000===512)rom=rom.slice(512);
  globalThis.window??={};
  if(!globalThis.window.GokuAnimationData){const ctx={window:{}};vm.runInNewContext(readFileSync(resolve(repo,'engine/goku-animation-data.js'),'utf8'),ctx);globalThis.window.GokuAnimationData=ctx.window.GokuAnimationData;}
  const {createPlanetView}=await import(resolve(repo,'engine/planet-view.js'));
  const {createKiArt}=await import(resolve(repo,'engine/ki-art.js'));
  const {createNativeEffects}=await import(resolve(repo,'engine/native-effects.js'));
  const {clashCamera}=await import(resolve(repo,'engine/frieza-finale.js'));
  const {orbitTargets,orbitTarget}=await import(resolve(repo,'engine/frieza-orbit.js'));
  const {atlas,friezaFull}=await import(resolve(repo,'snes/gen/orbit-sprites.mjs'));
  const effects=createNativeEffects(rom,JSON.parse(readFileSync(resolve(repo,'engine/native-effects.json'),'utf8')));
  const {frieza:sheet}=await friezaFull(repo);
  const spriteLayer={atlas:{ssj:atlas(repo,'ssj'),goku:atlas(repo,'goku')},effects};
  const ppu={getColor:()=>[0,0,0]},pv={ppu,cart:{data:rom}};
  const kiArt=createKiArt(pv);await kiArt.ready;
  const pictures=new Map();let view=null;
  await runFightReference({rom,frames,pad,wram,start,onFrame:async({f,frieza,mod})=>{
    if(!view){
      // the battle's state, the browser's art; the distant bodies and what
      // follows their shattering (debris, impacts, Luna's remark) left out,
      // as the cartridge does not draw them yet
      const hide={destroyed:[0,1,2],debris:[],grit:[],dust:[],impacts:[],aside:null,collateral:null};
      const seen=new WeakMap();
      const scene=o=>{if(!o)return o;if(!seen.has(o))seen.set(o,new Proxy(o,{get:(t,k)=>k in hide?hide[k]:Reflect.get(t,k,t)}));return seen.get(o);};
      const fz=new Proxy(frieza,{get:(t,k)=>k==='portraitAtlas'?sheet:k==='orbit'?scene(t.orbit):Reflect.get(t,k,t)});
      const rmod=new Proxy(mod,{get:(t,k)=>k==='spriteLayer'?spriteLayer:k==='kiArt'?kiArt:k==='frieza'?fz:Reflect.get(t,k,t)});
      view=createPlanetView(pv,rmod);view.load(rom);await view.ready;
    }
    if(!want(f))return;
    const o=frieza.orbit;if(!o)return;
    const px=new Uint16Array(256*224);
    for(let y=0;y<224;y++)for(let x=0;x<256;x++)px[y*256+x]=ppu.getColor(0,x,y)[0];
    const cam=o.clash?clashCamera(o):o.camera;
    const plain=renderSpace({x:cam.x,y:cam.y,r:cam.r,lon:cam.longitude??o.camera.longitude,lat:cam.latitude??o.camera.latitude,
      travelX:o.camera.travelX??0,travelY:o.camera.travelY??0,age:o.age});
    // the distant bodies' discs (not on the cartridge yet): a mask
    const bodies=new Uint8Array(256*224);
    orbitTargets.forEach((_,index)=>{
      if(o.destroyed.includes(index))return;
      const t=orbitTarget(o,index,cam),r=t.r+1;
      for(let y=Math.max(0,t.y-r);y<=Math.min(223,t.y+r);y++)for(let x=Math.max(0,t.x-r);x<=Math.min(255,t.x+r);x++)bodies[y*256+x]=1;
    });
    pictures.set(f,{px,plain:plain.px,cls:plain.cls,bodies,state:{age:o.age,boss:frieza.status.boss?.age,clash:o.clash?{phase:o.clash.phase,age:o.clash.age}:null}});
  }});
  return pictures;
}
