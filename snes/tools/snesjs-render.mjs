#!/usr/bin/env node
// Renders frames of a private SnesJs probe state in the vendored core (the
// original game only — no browser-mod overlay) for quick visual reference.
//   node snes/tools/snesjs-render.mjs <state.json> <frames> <out.png> [buttonsMask]
// buttonsMask uses SnesJs bit order: B=1, Y=2, Select=4, Start=8, Up=16,
// Down=32, Left=64, Right=128, A=256, X=512, L=1024, R=2048.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCore} from './snesjs-export.mjs';
import {writePng,blank} from './gfx.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..');
const {restore,hash}=await import(resolve(repo,'engine/state.js'));
const [state,framesArg,out,maskArg]=process.argv.slice(2);
const s=loadCore(new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc'))));
restore(s,{...JSON.parse(readFileSync(state,'utf8')),romHash:hash(s.cart.data)});
const frames=Number(framesArg??1),mask=Number(maskArg??0);
for(let i=0;i<frames;i++){s.joypad1State=mask;s.runFrame(false);}
const rgba=new Uint8Array(512*480*4);s.setPixels(rgba);
const img=blank(256,224);
for(let y=0;y<224;y++)for(let x=0;x<256;x++){const src=((y*2+16)*512+x*2)*4,dst=(y*256+x)*4;img.data[dst]=rgba[src];img.data[dst+1]=rgba[src+1];img.data[dst+2]=rgba[src+2];img.data[dst+3]=255;}
writeFileSync(out,writePng(img));
console.log('wrote',out);
