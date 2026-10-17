// Browser-mod reference frames for Goku's arrival: the vendored SnesJs core
// with the browser's own arrival controller (engine/arrival.js: event
// overlay, phases, crater) and sprite layer (engine/sprite-layer.js: pod,
// explosion, Goku), as engine/lab.js wires them, from a SnesJs probe state
// just before the sword pull.
//   import {arrivalReference} from './arrival-ref.mjs';
//   const {frames,log}=await arrivalReference({state,shots:new Map([['3:20','impact-020']])});
// frames: Map name -> 256x224 RGB (8-bit, SnesJs scale; see fromSnesJs).
// Input: B pressed for 3 of every 40 frames while a page waits (D0 = $83),
// as snes/test/title/scene.lua does.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {loadCore} from '../../tools/snesjs-export.mjs';
import {readPng} from '../../tools/gfx.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const eng=p=>import(pathToFileURL(resolve(repo,'engine',p)).href);
export const PHASES=['prologue','queued','descent','impact','ghost','dialogue','complete'];

function atlas(name){
  const png=readPng(resolve(repo,'assets/sprites',name+'.png')),pixels=new Uint16Array(png.width*png.height);
  for(let i=0;i<pixels.length;i++)if(png.data[i*4+3])pixels[i]=1+((png.data[i*4]>>3)|((png.data[i*4+1]>>3)<<5)|((png.data[i*4+2]>>3)<<10));
  return {pixels,width:png.width,height:png.height};
}

export async function arrivalReference({state,shots,frames:maxFrames=1600,until=null}){
  const rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  const s=loadCore(rom);
  const {restore,hash}=await eng('state.js');
  restore(s,{...JSON.parse(readFileSync(state,'utf8')),romHash:hash(s.cart.data)});
  const {installNativeOamOwnership}=await eng('native-oam.js');
  const {drawKiAura}=await eng('ki-aura.js');
  const {createArrival}=await eng('arrival.js');
  const context={window:{},Uint8Array,Uint16Array,Int16Array,Int32Array,Set,Map,Math,JSON,Error,Number,Array,Object};
  for(const f of['goku-animation-data.js','goku-native-actions.js','goku-animation.js','sprite-layer.js'])
    vm.runInNewContext(readFileSync(resolve(repo,'engine',f),'utf8'),context);
  const read8=a=>s.ram[a&0x1ffff],read16=a=>read8(a)|read8(a+1)<<8;
  const mod={
    options:{enabled:true,power:true,superSaiyan:false},frame:0,input:0,effects:[],hiddenLastFrame:[],
    read8,read16,readSigned16:a=>read16(a)<<16>>16,
    write8:(a,v)=>{s.ram[a&0x1ffff]=v&255;},write16(a,v){this.write8(a,v);this.write8(a+1,v>>8);},
    playSound(){},
    get gokuActive(){return !this.arrival||this.arrival.arrived;},
    get status(){const x=read16(0xe002),y=read16(0xe004),sx=read16(0xe020)<<16>>16,sy=read16(0xe022)<<16>>16;return{map:read16(0xdc),x,y,screenX:sx,screenY:sy,cameraX:x-sx,cameraY:y-sy};},
    get canAttack(){return read8(0xe4)===1&&read8(0xe5)===1&&(read8(0xe000)&1)!==0&&(read8(0xe02c)&1)!==0&&(read8(0xec)&0xfe)===0&&!(read8(0xed)&0x40)&&read8(0xd0)===0&&!(read8(0xe190)&0x70)&&!(read8(0xe191)&0xd5);},
  };
  mod.ownership=installNativeOamOwnership(s);
  // lab.js order: the mod's sprite layer, then the arrival (outer getColor).
  const layer=new context.window.ManaSpriteLayer(s,mod);
  layer.drawKiAura=drawKiAura;
  layer.atlas={goku:atlas('goku'),ssj:atlas('ssj')};
  layer.atlas.ssjJab=context.window.ManaSpriteLayer.leadPunchAtlas(layer.atlas);
  const {createNativeEffects}=await eng('native-effects.js');
  layer.effects=createNativeEffects(rom,JSON.parse(readFileSync(resolve(repo,'engine/native-effects.json'),'utf8')));
  mod.spriteLayer=layer;
  const arrival=createArrival(s,mod);
  arrival.load(rom);
  const rgba=new Uint8Array(512*480*4),out=new Map(),log=[];
  const picture=()=>{
    s.setPixels(rgba);
    const img=new Uint8Array(256*224*3);
    for(let y=0;y<224;y++)for(let x=0;x<256;x++){const src=((y*2+16)*512+x*2)*4,dst=(y*256+x)*3;img[dst]=rgba[src];img[dst+1]=rgba[src+1];img[dst+2]=rgba[src+2];}
    return img;
  };
  let lastPhase=null;
  for(let f=1;f<=maxFrames;f++){
    const mask=read8(0xd0)===0x83&&(f%40)<3?1:0;
    s.joypad1State=mask;arrival.beforeFrame();mod.input=mask;mod.frame++;
    s.runFrame(false);
    const phase=PHASES.indexOf(arrival.phase),key=`${phase}:${arrival.ticks}`;
    if(phase!==lastPhase){log.push({phase,frame:f,d0:read8(0xd0)});lastPhase=phase;}
    const name=shots.get(key);
    if(name&&!out.has(name))out.set(name,picture());
    if(until&&until({phase,ticks:arrival.ticks,read8,snes:s}))break;
  }
  return {frames:out,log,name:Array.from(s.ram.slice(0xcc00,0xcc0c))};
}
