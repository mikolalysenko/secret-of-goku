// Browser-mod reference frames for the title module, rendered in the vendored
// SnesJs core with the browser's own layers (engine/title-layer.js) and the
// browser's name-editor prefill (engine/lab.js prefillName, reproduced here
// and kept in sync by snes/gen/title.mjs's literal check).
//   import {referenceFrames,toRgb5,diff5} from './ref.mjs';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadCore} from '../../tools/snesjs-export.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..','..');

// Pad mask bits in SnesJs order (B=1 ... R=2048), same as the browser presets.
export const PAD={b:1,y:2,select:4,start:8,up:16,down:32,left:64,right:128,a:256,x:512,l:1024,r:2048};

// Final picture as 512x224 RGB bytes (hires columns; low-res pixels appear
// twice). pixelOutput row 1 is scanline 1, the first visible line.
export const W=512,H=224;
function picture(snes){
  const o=snes.ppu.pixelOutput,img=new Uint8Array(W*H*3);
  img.set(o.subarray(512*3,512*3+W*H*3));
  return img;
}

// Runs the original cartridge from power-on with the browser's title layer and
// name prefill. `script` is a list of [frames, padMask]; `capture` is a set of
// absolute frame numbers (frame n = picture after n emulated frames).
export async function referenceFrames({script,capture,extra=0}){
  const rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  const snes=loadCore(rom);
  const {createTitleLayer}=await import(pathToFileURL(resolve(repo,'engine/title-layer.js')).href);
  const title=createTitleLayer(snes.ppu);
  const ram=snes.ram,r16=a=>ram[a]|ram[a+1]<<8,w16=(a,v)=>{ram[a]=v&255;ram[a+1]=v>>8;};
  let seeded=false;
  const prefill=()=>{
    if(seeded||ram[0xe4]!==0||ram[0xe5]!==0||ram[0xa156]!==3||ram[0xa157]!==0x12||ram[0xa1cc]!==0||r16(0x90d0)!==0x2022||r16(0x9306)!==0x2058||r16(0x9308)!==0x205c)return;
    [0x205c,0x2090,0x20b8].forEach((tile,i)=>{w16(0x90d2+i*2,tile);w16(0x9112+i*2,tile+2);});
    ram[0xa1cc]=3;ram[0xa157]=0x18;ram[0xa20a]|=2;seeded=true;
  };
  const plan=[];for(const [n,mask=0] of script)for(let i=0;i<n;i++)plan.push(mask);
  for(let i=0;i<extra;i++)plan.push(0);
  const frames=new Map(),info=new Map();
  for(let f=0;f<plan.length;f++){
    snes.joypad1State=plan[f];snes.runFrame(false);prefill();
    if(capture.has(f+1)){frames.set(f+1,picture(snes));info.set(f+1,{brightness:snes.ppu.brightness,forcedBlank:!!snes.ppu.forcedBlank,mode:snes.ppu.mode,titleActive:title.active,credit:title.creditVisible});}
  }
  return {frames,info,snes};
}

// 5-bit channels. SnesJs scales channel c by 8.2 at full brightness; Mesen
// screenshots expand c as (c<<3)|(c>>2). Only full-brightness frames compare.
export const fromSnesJs=rgb=>Uint8Array.from(rgb,v=>Math.round(v/8.2));
export const fromMesen=rgb=>Uint8Array.from(rgb,v=>v>>3);

export function diff5(a,b){
  let n=0,first=null;
  for(let i=0;i<a.length;i+=3)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]){n++;if(!first){const p=i/3;first={x:p%W,y:Math.floor(p/W),a:[a[i],a[i+1],a[i+2]],b:[b[i],b[i+1],b[i+2]]};}}
  return {pixels:n,first};
}

// Mesen PNG (256x224, or 512x448 for hires) -> 512x224 RGB.
export async function readShot(path){
  const {createRequire}=await import('node:module');
  const require=createRequire(resolve(repo,'package.json'));
  const {PNG}=require('pngjs');
  const png=PNG.sync.read(readFileSync(path));
  const sy=png.height/H,img=new Uint8Array(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=Math.floor(x*png.width/W),i=((y*sy)*png.width+sx)*4,j=(y*W+x)*3;img[j]=png.data[i];img[j+1]=png.data[i+1];img[j+2]=png.data[i+2];}
  return img;
}
