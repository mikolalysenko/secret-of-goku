#!/usr/bin/env node
// Real-input Action Grid regression: Goku's replacement and the moved marker
// must remain above the native grid in both forms.
import {resolve} from 'node:path';
import {RetroHost,buildHost,findCore} from '../emulators/retro.mjs';
import {playPreset,presetSetup,maxFramesOf,PRESET_POWER_ON} from '../emulators/presets.mjs';

const rom=resolve(process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc');
const out=resolve('.local/snes-test/goku/action-grid');
const {kinds,work}=presetSetup(rom);
const h=await RetroHost.start({host:buildHost(),core:findCore('bsnes'),rom,out,
  options:{bsnes_entropy:'None'},...PRESET_POWER_ON});
const entries=async()=>(await h.bytes('wram',0x7E9C00,512)).map((v,i)=>({attr:v})).filter((e,i)=>(i&3)===3);
try{
  const p=await playPreset(h,{index:kinds.indexOf('late'),work,maxFrames:maxFramesOf('late')});
  if(p.error||p.status!==2)throw Error('could not reach a menu-capable field');
  for(const form of [0,1]){
    await h.w8(0x7ED740,form);
    await h.wait(20);
    await h.hold('x',20);
    await h.wait(50);
    for(let i=0;i<4;i++)await h.tap('left',4,30);
    await h.tap('b',4,150);
    const initial=await entries();
    if(!initial.some(e=>(e.attr&0x30)===0x30))throw Error(`hidden Action Grid Goku in form ${form}`);
    await h.tap('left',6,40);
    const moved=await entries();
    if(!moved.some(e=>(e.attr&0x30)===0x30))throw Error(`hidden moved Action Grid Goku in form ${form}`);
    await h.shot(`form-${form}-action-grid`);
    console.log(`Action Grid form ${form}: priority 3 after opening and moving`);
    await h.tap('b',4,60);
  }
}finally{await h.close();}
