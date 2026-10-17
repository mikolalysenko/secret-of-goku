#!/usr/bin/env node
// Reference frames from the browser mod's own renderer: engine/sprite-layer.js
// (with engine/goku-animation.js and engine/native-oam.js) installed on the
// vendored SnesJs core, for a private probe state and scripted input.
//   node snes/test/goku/jsref.mjs <state.json> <outDir> [--ssj] [--script=up:12,right:12,...]
// Writes <outDir>/js-NNN.png per sampled frame plus js.json (pose log).
// Inputs use SnesJs joypad bits (B=1 Y=2 Select=4 Start=8 Up=16 Down=32 Left=64 Right=128).
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {loadCore} from '../../tools/snesjs-export.mjs';
import {readPng,writePng,blank} from '../../tools/gfx.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const {restore,hash}=await import(resolve(repo,'engine/state.js'));
const {installNativeOamOwnership}=await import(resolve(repo,'engine/native-oam.js'));
const {drawKiAura}=await import(resolve(repo,'engine/ki-aura.js'));

export const BUTTONS={b:1,y:2,select:4,start:8,up:16,down:32,left:64,right:128,a:256,x:512,l:1024,r:2048};

function engineContext(){
  const context={window:{},Uint8Array,Uint16Array,Int16Array,Int32Array,Set,Map,Math,JSON,Error,Number,Array,Object};
  for(const f of['goku-animation-data.js','goku-native-actions.js','goku-animation.js','sprite-layer.js'])
    vm.runInNewContext(readFileSync(resolve(repo,'engine',f),'utf8'),context);
  return context;
}
function atlas(name){
  const png=readPng(resolve(repo,'assets/sprites',name+'.png')),pixels=new Uint16Array(png.width*png.height);
  for(let i=0;i<pixels.length;i++)if(png.data[i*4+3])pixels[i]=1+((png.data[i*4]>>3)|((png.data[i*4+1]>>3)<<5)|((png.data[i*4+2]>>3)<<10));
  return {pixels,width:png.width,height:png.height};
}

// steps: [{buttons, frames, shot}] ; returns per-shot info
export async function renderJsRef({state,outDir,superSaiyan=false,steps,goku=true}){
  mkdirSync(outDir,{recursive:true});
  const s=loadCore(new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc'))));
  restore(s,{...JSON.parse(readFileSync(state,'utf8')),romHash:hash(s.cart.data)});
  const context=engineContext(),w=context.window;
  const read8=a=>s.ram[a&0x1ffff],read16=a=>read8(a)|read8(a+1)<<8;
  const mod={
    options:{enabled:goku,power:true,superSaiyan},gokuActive:goku,frame:0,input:0,
    effects:[],hiddenLastFrame:[],read8,read16,
    ownership:installNativeOamOwnership(s),
    get status(){const x=read16(0xe002),y=read16(0xe004),sx=read16(0xe020)<<16>>16,sy=read16(0xe022)<<16>>16;return{map:read16(0xdc),x,y,screenX:sx,screenY:sy,cameraX:x-sx,cameraY:y-sy};},
    get canAttack(){return read8(0xe4)===1&&read8(0xe5)===1&&(read8(0xe000)&1)!==0&&(read8(0xe02c)&1)!==0&&(read8(0xec)&0xfe)===0&&!(read8(0xed)&0x40)&&read8(0xd0)===0&&!(read8(0xe190)&0x70)&&!(read8(0xe191)&0xd5);},
  };
  const layer=new w.ManaSpriteLayer(s,mod);
  layer.drawKiAura=drawKiAura;
  layer.atlas={goku:atlas('goku'),ssj:atlas('ssj')};
  layer.atlas.ssjJab=w.ManaSpriteLayer.leadPunchAtlas(layer.atlas);
  mod.spriteLayer=layer;
  const rgba=new Uint8Array(512*480*4),log=[];
  let shot=0;
  const capture=tag=>{
    s.setPixels(rgba);
    const img=blank(256,224);
    for(let y=0;y<224;y++)for(let x=0;x<256;x++){const src=((y*2+16)*512+x*2)*4,dst=(y*256+x)*4;img.data[dst]=rgba[src];img.data[dst+1]=rgba[src+1];img.data[dst+2]=rgba[src+2];img.data[dst+3]=255;}
    const name=`js-${String(++shot).padStart(3,'0')}${tag?'_'+tag:''}`;
    writeFileSync(join(outDir,name+'.png'),writePng(img));
    const sp=layer.plan?.sprite;
    log.push({name,frame:mod.frame,sprite:sp?{x:sp.x,y:sp.y,row:sp.row,column:sp.column,sheet:sp.sheet,kind:sp.kind}:null,sx:read16(0xe020),sy:read16(0xe022),anim:read8(0xe011)});
  };
  for(const st of steps){
    for(let i=0;i<(st.frames??1);i++){
      s.joypad1State=st.buttons??0;mod.input=s.joypad1State;mod.frame++;
      s.runFrame(false);
    }
    if(st.shot)capture(st.shot===true?'':st.shot);
  }
  writeFileSync(join(outDir,'js.json'),JSON.stringify(log,null,1));
  return log;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [state,outDir]=process.argv.slice(2);
  const ssj=process.argv.includes('--ssj');
  const script=(process.argv.find(a=>a.startsWith('--script='))?.slice(9)??'none:1').split(',');
  const steps=[{frames:1,shot:'start'}];
  for(const part of script){const [b,n]=part.split(':');const mask=b.split('+').reduce((m,k)=>m|(BUTTONS[k]??0),0);for(let i=0;i<Number(n);i++)steps.push({buttons:mask,frames:3,shot:b});}
  const log=await renderJsRef({state,outDir,superSaiyan:ssj,steps});
  console.log(log.map(l=>`${l.name} ${l.sprite?`${l.sprite.sheet}:${l.sprite.column}:${l.sprite.row} ${l.sprite.kind} @${l.sprite.x},${l.sprite.y}`:'-'} anim ${l.anim.toString(16)}`).join('\n'));
}
