#!/usr/bin/env node
// Reproducible feasibility audit of two independent HDMA wave windows.
// Run Vegeta's clash cases first, then:
//   node snes/test/fx/clash-audit.mjs [recording directory ...]
// Reports exact-outline table sizes, fixed-colour representability and
// browser pictures. No ROM, state or generated audit output is committed.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {parseRecording,cartridgeState} from '../vegeta/replay.mjs';
import {createNativeEffects} from '../../../engine/native-effects.js';
import {drawTrainingClash,trainingBeamPalettes} from '../../../engine/vegeta-clash.js';
import {blank,writePng,readPng} from '../../tools/gfx.mjs';

const repo=resolve(import.meta.dirname,'../../..');
const out=join(repo,'.local/snes-test/fx-clash-audit');mkdirSync(out,{recursive:true});
const sandbox={window:{}};
vm.runInNewContext(readFileSync(join(repo,'engine/sprite-layer.js'),'utf8'),sandbox);
const giant=sandbox.window.ManaSpriteLayer.prototype.giantBeam;
const stamp=sandbox.window.ManaSpriteLayer.prototype.stamp;
const effects=createNativeEffects(readFileSync(join(repo,'rom/secret-of-mana-us.sfc')),JSON.parse(readFileSync(join(repo,'engine/native-effects.json'))));
const rgb=c=>[c&31,c>>5&31,c>>10&31];
const signed=(a,b)=>{const d=rgb(b).map((v,i)=>v-rgb(a)[i]);return d.every(v=>v>=0)||d.every(v=>v<=0);};
// Half-colour math still uses a single add/subtract operation on all channels.
const possible=(a,b)=>{
  const x=rgb(a),y=rgb(b);
  return [1,2].some(scale=>[1,-1].some(sign=>x.every((v,k)=>{
    // Floor division in half mode: either numerator may produce the target.
    return Array.from({length:scale},(_,r)=>sign*(scale*y[k]+r-v)).some(f=>f>=0&&f<=31);
  })));
};
const colourPairs=[];
for(const enemy of ['purple','gold'])for(let band=0;band<4;band++){
  const a=trainingBeamPalettes.blue[band]-1,b=trainingBeamPalettes[enemy][band]-1;
  colourPairs.push({enemy,band,blue:rgb(a),enemyRGB:rgb(b),addOrSubtract:signed(a,b),includingHalf:possible(a,b)||possible(b,a)});
}
// HDMA mode 4: count + four window bytes. Merge identical runs, split at
// 127 lines; include the neutral 127-line late-start guard and end byte.
function tableBytes(rows,step=1){
  let bytes=1,last='',n=0,runs=0;
  const flush=()=>{if(n){bytes+=5*Math.ceil(n/127);runs+=Math.ceil(n/127);}};
  for(let y=0;y<224;y++){
    const row=rows[Math.floor(y/step)*step],key=row.join(',');
    if(key!==last){flush();last=key;n=0;}n++;
  }
  flush();return {bytes:bytes+5,runs:runs+1};
}
const q=a=>{const b=a.slice().sort((a,b)=>a-b);return {n:b.length,min:b[0],median:b[b.length>>1],p90:b[Math.floor(b.length*.9)],max:b.at(-1)};};
const cases=process.argv.slice(2).length?process.argv.slice(2):['.local/snes-test/vegeta/clash-win','.local/snes-test/vegeta/combat-clash','.local/snes-test/vegeta/combat-final'];
const report={bufferBytes:183,colourPairs,cases:[]};
for(const dir of cases){
  if(!existsSync(join(dir,'fight.txt')))throw Error('Run the Vegeta case first: '+dir);
  const recs=parseRecording(readFileSync(join(dir,'fight.txt'),'utf8'));
  const captured=JSON.parse(readFileSync(join(dir,'results.json'))),shotFrames=new Map();
  for(const [key,frame] of Object.entries(captured))if(key.startsWith('shot_clash')){
    // A screenshot is taken at endFrame, the recorded tick at the next
    // instruction boundary (usually the following frame after a lag).
    const nearest=recs.filter(r=>Math.abs(r.frame-frame)<=3).sort((a,b)=>Math.abs(a.frame-frame)-Math.abs(b.frame-frame))[0];
    if(nearest)shotFrames.set(nearest.frame,{name:key.slice(5),frame});
  }
  const comparisons=[];
  const counts=[],over=Array(4).fill(0),phases={},pictures=new Set();
  for(const rec of recs){
    const s=cartridgeState(rec),c=s?.clash;if(!c)continue;
    c.shown/=500000;c.tier=s.tier;
    const camera={cameraX:((rec.goku[2]|rec.goku[3]<<8)-(rec.goku[0x20]|rec.goku[0x21]<<8)),cameraY:((rec.goku[4]|rec.goku[5]<<8)-(rec.goku[0x22]|rec.goku[0x23]<<8))};
    const shot=shotFrames.get(rec.frame);
    if(shot&&existsSync(join(dir,shot.name+'.png'))){
      const pixels=new Map(),put=(x,y,v)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<256&&y>=0&&y<224)pixels.set(y*256+x,v-1);};
      drawTrainingClash({effects,pixel:put,stamp,giantBeam:giant},c,camera);
      const actual=readPng(join(dir,shot.name+'.png')),pair=blank(512,224);
      for(let y=0;y<224;y++)for(let x=0;x<256;x++){
        const p=(y*512+x)*4,v=pixels.get(y*256+x),a=(Math.floor(y*actual.height/224)*actual.width+Math.floor(x*actual.width/256))*4;
        if(v!==undefined)rgb(v).forEach((c,k)=>pair.data[p+k]=c*255/31);
        pair.data[p+3]=255;
        pair.data.set(actual.data.subarray(a,a+4),p+1024);
      }
      const name=dir.split('/').at(-1)+'-'+shot.name+'-compare.png';
      writeFileSync(join(out,name),writePng(pair));comparisons.push({frame:rec.frame,shotFrame:shot.frame,file:name});
    }
    const beams=[];
    drawTrainingClash({giantBeam(...args){beams.push(args);},pixel(){},stamp(){}},c,camera);
    if(beams.length!==2)continue;
    const pixels=[new Map(),new Map()],image=blank(256,224);
    beams.forEach((args,k)=>giant.call({effects:{},stamp(){},pixel(x,y,v){if(x>=0&&x<256&&y>=0&&y<224)pixels[k].set(y*256+x,v-1);}},...args));
    const rows=Array.from({length:224},(_,y)=>pixels.flatMap(p=>{
      const xs=[];for(let x=0;x<256;x++)if(p.has(y*256+x))xs.push(x);
      return xs.length?[xs[0],xs.at(-1)]:[255,0];
    }));
    const sizes=[1,2,4,8].map(step=>tableBytes(rows,step).bytes);
    counts.push(sizes[0]);(phases[c.phase]??=[]).push(sizes[0]);
    sizes.forEach((n,i)=>{if(n+17>183)over[i]++;}); // best-case CGRAM constant + outside + guard + dummy
    const key=s.tier+'-'+c.phase;
    if(!pictures.has(key)&&c.age>=20){
      pictures.add(key);
      for(const p of pixels)for(const [i,v] of p){const a=i*4;rgb(v).forEach((n,k)=>image.data[a+k]=n*255/31);image.data[a+3]=255;}
      const name=dir.split('/').at(-1)+'-'+key;
      writeFileSync(join(out,name+'-browser-waves.png'),writePng(image));
      writeFileSync(join(out,name+'-geometry.json'),JSON.stringify({frame:rec.frame,camera,clash:c,beams,windowBytes:sizes},null,2));
    }
  }
  const result={dir,comparisons,windows:q(counts),byPhase:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,q(v)])),overBudgetAtSteps:[1,2,4,8].map((step,i)=>({step,frames:over[i],of:counts.length}))};
  report.cases.push(result);console.log(JSON.stringify(result));
}
writeFileSync(join(out,'audit.json'),JSON.stringify(report,null,2));
console.log('Colour pairs:',JSON.stringify(colourPairs));
