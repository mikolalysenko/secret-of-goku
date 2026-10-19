#!/usr/bin/env node
// Integrated gameplay timing with real audio and an active Goku. --pcm
// installs the optional extension for comparison with AUDIO_PCM builds.
// Default: palette/meter/OBJ/vblank checks for every case, zero missed
// frames for solo attacks and water flight.
// --strict-timing requires zero misses in crowded party scenes too.
// --repeat=N extends each deterministic input sequence. Generated output
// stays in .local/snes-test/gameplay (or GAMEPLAY_OUT).
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {hiromToPc} from '../../tools/w65816.mjs';
const repo=resolve(import.meta.dirname,'../../..');
const rom=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const args=process.argv.slice(2), only=args.filter(x=>!x.startsWith('--'));
const repeat=Number(args.find(x=>x.startsWith('--repeat='))?.slice(9)??1);
if(!Number.isInteger(repeat)||repeat<1||repeat>100)throw Error('--repeat must be an integer from 1 to 100');
const symbols=new Map([...readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gmi)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
const romBytes=readFileSync(rom),auraCells=new Set();
if(symbols.has('fx_aura_asm_id')){
  const base=romBytes.readUInt16LE(hiromToPc(symbols.get('fx_aura_asm_id'),romBytes.length));
  const ptr=hiromToPc(symbols.get('fx_asm_ptr'),romBytes.length),data=hiromToPc(symbols.get('fx_asm_data'),romBytes.length);
  for(let i=0;i<12;i++){
    const offset=data+romBytes.readUInt16LE(ptr+(base+i)*2);
    for(let c=0;c<romBytes[offset+1];c++)auraCells.add(romBytes.readUInt16LE(offset+6+c*2)&0x1FF);
  }
}
const modules=readFileSync(join(repo,'snes/src/modules.asm'),'utf8').split('modules_field_frame:')[1].split('RTL')[0].match(/JSL \w+/g).map(s=>s.slice(4));
const gfxDma=['core_native_tiles','core_native_weapon_0','core_native_weapon_511']
  .filter(n=>symbols.has(n+'_dma_setup')).map(n=>`{${symbols.get(n+'_dma_setup')},${symbols.get(n+'_copied')}}`);
const spans=modules.map((n,i)=>`{${JSON.stringify(n)},${symbols.get(n)},${symbols.get('modules_field_frame')+4*(i+1)}}`);
const nmiModules=readFileSync(join(repo,'snes/src/modules.asm'),'utf8').split('modules_field_nmi:')[1].split('RTL')[0].match(/JSL \w+/g).map(s=>s.slice(4));
for(const [i,n] of nmiModules.entries())spans.push(`{${JSON.stringify('nmi_'+n)},${symbols.get(n)},${symbols.get('modules_field_nmi')+4*(i+1)}}`);
spans.push('{"nmi_native",49320,49496}'); // C0A8 -> C158
spans.push(`{"combat_logic",${symbols.get('cb_hook_logic_read')},${symbols.get('cb_hook_logic_read')+17}}`);
const fastField=symbols.has('core_field_scroll');
const calls=[0xB08C,0xB0A0,0xB0A3,0xB0A6,0xB0AC,0xB0B2,0xB0B8,...(fastField?[]:[0xB0BB]),0xB0BF,0xB0C3,0xB0C7,...(fastField?[]:[0xB0CA]),0xB0D0];
for(let i=0;i<calls.length-1;i++){
  if(fastField&&calls[i]===0xB0C7){
    const prepare=symbols.get('core_field_actors_prepare');
    spans.push(`{"native_b0c7",${calls[i]},${prepare}}`);
    spans.push(`{"native_b0ca",${prepare},${calls[i+1]}}`);
  }else spans.push(`{"native_${calls[i].toString(16)}",${calls[i]},${calls[i+1]}}`);
}
spans.push(`{"core_tail",${symbols.get('core_frame_end')},${symbols.get('core_event_pump')}}`);
spans.push('{"native_party0",8451255,8451258}'); // 80:F4B7 -> F4BA
spans.push('{"native_ai",8452329,8452333}'); // 80:F8E9 -> F8ED
spans.push('{"native_status",8451337,8451341}'); // 80:F509 -> F50D
if(symbols.has('core_party_actor')){
  spans.push(`{"native_companion_update",${symbols.get('core_party_actor')},${symbols.get('core_party_actor_done')}}`);
}else{
  for(const [name,start,end] of [['party1',0x80F4BD,0x80F4C0],['party2',0x80F4C3,0x80F4C6]])spans.push(`{${JSON.stringify('native_'+name)},${start},${end}}`);
}
for(const [module,prefix] of [['flight','fl_'],['fx','fx_'],['combat','cb_']])if(args.includes(`--${module}-profile`)){
  const bytes=readFileSync(rom),labels=new Map([...symbols].filter(([n])=>n.startsWith(prefix)).map(([n,p])=>[p,n]));
  const base=symbols.get(`${module}_code_start`);
  for(let p=base;p<symbols.get(`${module}_code_end`)-2;p++){
    const off=hiromToPc(p,bytes.length),target=(p&0xFF0000)|bytes.readUInt16LE(off+1);
    if(bytes[off]===0x20&&labels.has(target))spans.push(`{${JSON.stringify(module+'_'+labels.get(target)+'@'+p.toString(16))},${p},${p+3}}`);
  }
}
const cases=[
  ['solo-punch','danger-progress__waterfall','b:180,none:60'],
  ['solo-ki','danger-progress__waterfall','y:180,none:60'],
  ['walk','animation-audit__native__rabite-field-a',Array(15).fill('right:8,left:8').join(',')],
  ['punch','animation-audit__native__rabite-field-a','right:12,b:180,none:48'],
  ['ki','animation-audit__native__rabite-field-a','right:4,y:180,none:56'],
  ['fly','animation-audit__native__rabite-field-a',Array(3).fill('a+right:8,none:32,a+left:8,none:32').join(',')],
  ['fly-ki','animation-audit__native__rabite-field-b',Array(15).fill('a+right+y:8,a+left+y:8').join(',')],
  ['fly-punch','animation-audit__native__rabite-field-b',Array(15).fill('a+right+b:8,a+left+b:8').join(',')],
  ['water-flight','danger-progress__waterfall','a+right:30,none:20,a+left+y:30,none:20,a+up:30,none:20,a+down:30,none:60'],
  ['teleport','animation-audit__native__rabite-field-b',Array(8).fill('l+b:2,none:28').join(',')],
  ['charge','animation-audit__native__rabite-field-a','right:4,l+y:100,none:136'],
  ['focus-grass','animation-audit__native__rabite-field-b','l:120,none:120','down:2,b:60,none:15,down:24,none:15'],
  ['transform-grass','animation-audit__native__rabite-field-b','l:100,l+a:4,none:136','down:2,b:60,none:15,down:24,none:15'],
];
for(const name of only)if(!cases.some(c=>c[0]===name))throw Error('unknown gameplay case: '+name);
const zeroFrameCases=new Set(['solo-punch','solo-ki','water-flight','focus-grass']);
const root=resolve(repo,process.env.GAMEPLAY_OUT??'.local/snes-test/gameplay');
mkdirSync(root,{recursive:true});
const summary=[];
for(const [name,bundle,script,setup=''] of cases){
  if(only.length&&!only.includes(name))continue;
  const copy=privateRom(rom,'gameplay-'+name);
  const pre=`PCM=${args.includes('--pcm')}\nPROFILE_NATIVE=${args.includes('--native-profile')}\nBUNDLE=${JSON.stringify(join(repo,'.local/snes-import',bundle))}\nSETUP=${JSON.stringify(setup)}\nSCRIPT=${JSON.stringify(Array(repeat).fill(script).join(','))}\nSPANS={${spans.join(',')}}\nFX_TILES=${symbols.get('fx_entry_tile')}\nAURA_CELLS={${[...auraCells].map(c=>`[${c}]=true`).join(',')}}\nUPLOAD=${JSON.stringify(join(repo,'dist/snes/gen/audio/upload.bin'))}\n`;
  const test=pre+`GFX_DMA={${gfxDma.join(',')}}\n`+readFileSync(join(repo,'snes/test/audio/lib.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'gameplay.lua'),'utf8');
  const r=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),test,outDir:join(root,name),exactFrames:true});
  cleanupRom(copy);
  const v=r.results??{};
  const running=v.completed>=v.videoFrames/4&&v.nmiFrames>=v.videoFrames-1&&v.visibleFrames>0&&Object.keys(v.maps??{}).length===1;
  const action=name.includes('punch')?16:name.includes('ki')?19:name==='teleport'?20:name==='charge'?17:name==='focus-grass'?24:name==='transform-grass'?21:0;
  const powerPass=!name.endsWith('-grass')||(v.grassCuts>0&&v.maxPower>=96&&v.auraFrames>5&&v.maxAuraSprites>=6&&v.auraBgWrites===0&&(args.includes('--pcm')||(v.chargeTailVoices===0&&v.sounds?.['223']>0)));
  const transformPass=name!=='transform-grass'||(v.forms?.['1']>0&&(args.includes('--pcm')||v.sounds?.['224']>0));
  const gameplayPass=running&&powerPass&&transformPass&&(!action||v.actions?.[action]>0)&&(!name.includes('fly')&&!name.includes('flight')||v.flightFrames>0)&&(!['walk','fly','water-flight'].includes(name)||v.maxTravel>2);
  const hardwarePass=r.code===0&&!v.error&&v.paletteErrors===0&&v.staminaFrames===0&&v.spriteOverflowFrames===0&&v.nmiOverruns===0&&v.gfxDmaOverruns===0;
  const timingPass=v.lag===0&&v.missedVblanks===0;
  const requireTiming=zeroFrameCases.has(name)||args.includes('--strict-timing');
  const pass=gameplayPass&&hardwarePass&&(!requireTiming||timingPass);
  summary.push({name,pass,gameplayPass,hardwarePass,timingPass,requireTiming,...v});
  console.log(`${name}: ${pass?'pass':'FAIL'}; CPU misses ${v.missedVblanks}/${v.videoFrames}${timingPass?'':requireTiming?' (timing FAIL)':' (open timing issue)'}; palette ${v.paletteErrors}, stamina ${v.staminaFrames}, sprite overflow ${v.spriteOverflowFrames}, vblank overrun ${v.nmiOverruns}`);
  if(args.includes('--profile'))console.log(v.profile);
  if(!gameplayPass)console.log('  gameplay did not exercise the expected state:',{completed:v.completed,nmi:v.nmiFrames,visible:v.visibleFrames,flight:v.flightFrames,actions:v.actions,travel:v.maxTravel});
  if(v.error)console.log(v.error);
}
writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));
process.exit(summary.every(r=>r.pass)?0:1);
