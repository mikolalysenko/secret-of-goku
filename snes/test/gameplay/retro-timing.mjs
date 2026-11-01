#!/usr/bin/env node
// Real-input field-update timing on the local libretro SNES cores. core_frame
// advances only for completed field logic, so a zero delta is a missed update.
//   node snes/test/gameplay/retro-timing.mjs --case=rider-punch [--core=bsnes]
//   [--rom=path] [--repeat=1] [--max-misses=0] [--out=dir]
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {GAMEPLAY_CASES} from './cases.mjs';
import {RetroHost,buildHost,findCore} from '../emulators/retro.mjs';
import {playPreset,presetSetup,maxFramesOf,PRESET_POWER_ON} from '../emulators/presets.mjs';

const args=process.argv.slice(2),opt=(name,fallback)=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const name=opt('case','rider-punch'),coreName=opt('core','bsnes'),repeat=Number(opt('repeat','1'));
const maxMisses=Number(opt('max-misses','-1'));
const preset={ 'rider-punch':'rider','hexas-punch':'hexas','beast-punch':'beast',
  'thanatos-fight':'thanatos','thanatos-walk':'thanatos',punch:'battle',walk:'battle','vegeta-intro':'trial'}[name];
const row=name==='vegeta-intro'?[name,'trial','taps:1500']:GAMEPLAY_CASES.find(c=>c[0]===name);
if(!preset||!row)throw Error(`unsupported retro timing case: ${name}`);
if(!['snes9x','bsnes','bsnes-accurate'].includes(coreName))throw Error(`unknown core: ${coreName}`);
if(!Number.isInteger(repeat)||repeat<1||repeat>100)throw Error('--repeat must be 1..100');
const rom=resolve(opt('rom','dist/snes/secret-of-goku.sfc'));
const out=resolve(opt('out',`.local/snes-test/retro-timing/${name}-${coreName}`));
const {kinds,work}=presetSetup(rom),index=kinds.indexOf(preset);
const options=coreName==='snes9x'?{}:{bsnes_entropy:'None',...(coreName==='bsnes-accurate'?{bsnes_ppu_fast:'OFF',bsnes_dsp_fast:'OFF'}:{})};
const h=await RetroHost.start({host:buildHost(),core:findCore(coreName==='bsnes-accurate'?'bsnes':coreName),rom,out,options,...PRESET_POWER_ON});
const input=async(script,measure=false)=>{
  const rows=[];
  for(const part of script.split(',')){
    const m=/^([^:]*):(\d+)$/.exec(part);if(!m)throw Error(`bad input step: ${part}`);
    for(let i=0;i<Number(m[2]);i++){
      if(m[1]==='taps'){
        if((h.frame%8)<2)await h.hold('a',1);else await h.wait(1);
      }else if(m[1]&&m[1]!=='none')await h.hold(m[1],1);else await h.wait(1);
      if(measure){
        const core=await h.r16(0x7ED700),delta=(core-input.prev)&65535;
        rows.push({frame:rows.length+1,core,delta,buttons:m[1]});input.prev=core;
      }
    }
  }
  return rows;
};
try{
  const p=await playPreset(h,{index,work,maxFrames:maxFramesOf(preset)});
  if(p.error||p.status!==2)throw Error(`preset ${preset} failed: ${JSON.stringify(p).slice(0,1200)}`);
  if(row[4])await input(row[4]);
  input.prev=await h.r16(0x7ED700);
  const rows=[];
  for(let i=0;i<repeat;i++)rows.push(...await input(row[2],true));
  const party=[];for(let i=0;i<3;i++)party.push((await h.r8(0x7EE000+i*0x200))&1);
  const missed=rows.filter(r=>!r.delta),advances=rows.reduce((n,r)=>n+r.delta,0);
  const result={case:name,core:coreName,rom,preset:p.status,party,frames:rows.length,
    missedVblanks:missed.length,advances,misses:missed.map(r=>r.frame),rows};
  writeFileSync(resolve(out,'timing.json'),JSON.stringify(result,null,2));
  await h.shot('end');
  const fullParty=!['punch','walk','vegeta-intro'].includes(name);
  const valid=(!fullParty||party.every(x=>x===1))&&rows.length>0&&advances>0;
  const pass=valid&&(maxMisses<0||missed.length<=maxMisses);
  console.log(`${name} on ${coreName}: ${pass?'pass':'FAIL'}; missed field updates ${missed.length}/${rows.length}; party ${party.join('/')}; first ${missed.slice(0,24).map(r=>r.frame).join(',')}`);
  if(!valid)throw Error('gameplay did not remain active with a full party');
  if(!pass)process.exitCode=1;
}finally{await h.close();}
