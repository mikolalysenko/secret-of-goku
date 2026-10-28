#!/usr/bin/env node
// Integrated gameplay timing with real audio and an active Goku. --pcm
// installs the optional extension for comparison with AUDIO_PCM builds.
// Default: palette/meter/OBJ/vblank checks for every case, zero missed
// frames for solo attacks, crowded ground punches/ki and water flight.
// --strict-timing requires zero misses in crowded party scenes too.
// --repeat=N extends each deterministic input sequence.
// --routine-profile measures native emitter/caller/contact CPU cycles and
// master clocks, grouped by field update (including updates that miss NMI).
// --record-native also saves private CPU/WRAM inputs for actor-hot.test.mjs.
// --flight-corridor steers aerial ki repeats between two nearby points
// using real input, so missed reversal frames cannot drift into a map exit.
// --offsets=0,1,2,3,4 runs every case once per start-phase offset: that many
// idle frames after the import settles and the setup input ran, so the
// native five-phase round robin and the actors meet the script at other
// points. Many crowded frames end within a line of the deadline, so one
// run's miss count is chaotic; judge CPU changes by the sum over offsets.
// Offset 0 is the default run (output <case>/), others go to <case>+<k>/;
// the zero-miss requirements apply to offset 0 only.
// --jobs=N runs N Mesen instances at once (emulation stays deterministic).
// --<module>-profile adds a span for every JSR to a label inside that
// module's code bank (flight, goku, ui, audio, world, destroy, fx, ...).
// Generated output stays in .local/snes-test/gameplay (or GAMEPLAY_OUT).
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {GAMEPLAY_CASES} from './cases.mjs';
import {NATIVE_BEDS} from '../../gen/audio-resident.mjs';
import {isResident7} from '../audio/cartridge.mjs';
import {resolve,join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {hiromToPc} from '../../tools/w65816.mjs';
import {destroyAbi} from '../destroy/abi.mjs';
const repo=resolve(import.meta.dirname,'../../..');
const rom=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
const args=process.argv.slice(2), only=args.filter(x=>!x.startsWith('--'));
const repeat=Number(args.find(x=>x.startsWith('--repeat='))?.slice(9)??1);
if(!Number.isInteger(repeat)||repeat<1||repeat>100)throw Error('--repeat must be an integer from 1 to 100');
const offsets=(args.find(x=>x.startsWith('--offsets='))?.slice(10)??'0').split(',').map(Number);
if(!offsets.length||offsets.some(k=>!Number.isInteger(k)||k<0||k>600)||new Set(offsets).size!==offsets.length)throw Error('--offsets must list distinct integers from 0 to 600');
const jobs=Number(args.find(x=>x.startsWith('--jobs='))?.slice(7)??1);
if(!Number.isInteger(jobs)||jobs<1||jobs>16)throw Error('--jobs must be an integer from 1 to 16');
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
const destroyScans=['dst_scan_attack','dst_barrier_hit'].map(n=>symbols.get(n));
const spans=modules.map((n,i)=>`{${JSON.stringify(n)},${symbols.get(n)},${symbols.get('modules_field_frame')+4*(i+1)}}`);
const nmiModules=readFileSync(join(repo,'snes/src/modules.asm'),'utf8').split('modules_field_nmi:')[1].split('RTL')[0].match(/JSL \w+/g).map(s=>s.slice(4));
for(const [i,n] of nmiModules.entries())spans.push(`{${JSON.stringify('nmi_'+n)},${symbols.get(n)},${symbols.get('modules_field_nmi')+4*(i+1)}}`);
if(symbols.has('fx_preupload'))spans.push(`{"nmi_fx_preupload",${symbols.get('fx_preupload')},${symbols.get('modules_field_preupload')+12}}`);
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
for(const module of args.filter(x=>/^--\w+-profile$/.test(x)).map(x=>x.slice(2,-8)).filter(m=>symbols.has(`${m}_code_start`))){
  const base=symbols.get(`${module}_code_start`),end=symbols.get(`${module}_code_end`);
  // Shortest local label per address in the module's code bank.
  const labels=new Map();
  for(const [n,p] of symbols)if(p>=base&&p<end&&/^[A-Za-z_]\w*$/.test(n)&&(!labels.has(p)||n.length<labels.get(p).length))labels.set(p,n);
  for(let p=base;p<end-2;p++){
    const off=hiromToPc(p,romBytes.length),target=(p&0xFF0000)|romBytes.readUInt16LE(off+1);
    if(romBytes[off]===0x20&&labels.has(target))spans.push(`{${JSON.stringify(module+'_'+labels.get(target)+'@'+p.toString(16))},${p},${p+3}}`);
  }
}
const cases=GAMEPLAY_CASES;
for(const name of only)if(!cases.some(c=>c[0]===name))throw Error('unknown gameplay case: '+name);
const zeroFrameCases=new Set(['solo-punch','solo-ki','punch','ki','water-flight','focus-grass']);
const root=resolve(repo,process.env.GAMEPLAY_OUT??'.local/snes-test/gameplay');
mkdirSync(root,{recursive:true});
const runs=[];
for(const c of cases)if(!only.length||only.includes(c[0]))for(const offset of offsets)runs.push({c,offset});
async function runCase({c:[name,bundle,script,setup=''],offset}){
  const tag=offset?`${name}+${offset}`:name;
  const copy=privateRom(rom,'gameplay-'+tag);
  const hotFrames=args.find(x=>x.startsWith('--native-profile='))?.slice(17).split(',').map(Number)??[];
  const pre=`PCM=${args.includes('--pcm')}\nPROFILE_NATIVE=${args.some(x=>x==='--native-profile'||x.startsWith('--native-profile='))}\nPROFILE_FRAMES={${hotFrames.map(f=>`[${f}]=true`).join(',')}}\nBUNDLE=${JSON.stringify(join(repo,'.local/snes-import',bundle))}\nSTART_OFFSET=${offset}\nSETUP=${JSON.stringify(setup)}\nSCRIPT=${JSON.stringify(Array(repeat).fill(script).join(','))}\nSPANS={${spans.join(',')}}\nFX_TILES=${symbols.get('fx_entry_tile')}\nAURA_CELLS={${[...auraCells].map(c=>`[${c}]=true`).join(',')}}\nUPLOAD=${JSON.stringify(join(repo,'dist/snes/gen/audio/upload.bin'))}\n`;
  const corridor=args.includes('--flight-corridor')&&name==='fly-ki';
  const nativeProfile=args.includes('--routine-profile')||args.includes('--record-native');
  const test=pre+`FLIGHT_CORRIDOR=${corridor}\nCHECK_AURA=${name.endsWith('-grass')}\nGFX_DMA={${gfxDma.join(',')}}\nDESTROY_SCANS={${destroyScans.join(',')}}\nDESTROY_ATTACK_ID=${destroyAbi().arg_id}\nRECORD_NATIVE=${args.includes('--record-native')}\nNATIVE_BODY=${symbols.get('core_native_body')}\n`+readFileSync(join(repo,'snes/test/audio/lib.lua'),'utf8')+'\n'+(nativeProfile?readFileSync(join(import.meta.dirname,'native-routines.lua'),'utf8')+'\n':'')+readFileSync(join(import.meta.dirname,'gameplay.lua'),'utf8');
  let r;
  try{r=await runMesen({rom:copy,state:join(checkpointDir(),'waterfall.mss'),test,outDir:join(root,tag),exactFrames:true});}
  finally{cleanupRom(copy);}
  return {name,tag,offset,corridor,r};
}
function report({name,tag,offset,corridor,r}){
  const v=r.results??{};
  const running=v.completed>=v.videoFrames/4&&v.nmiFrames>=v.videoFrames-1&&v.visibleFrames>0&&Object.keys(v.maps??{}).length===1;
  const action=name.includes('punch')?16:name.includes('ki')?19:name==='teleport'?20:name==='charge'?17:name==='focus-grass'?24:name==='transform-grass'?21:0;
  const powerPass=!name.endsWith('-grass')||(v.grassCuts>0&&v.maxPower>=96&&v.auraFrames>5&&v.maxAuraSprites>=6&&v.auraBgWrites===0&&(args.includes('--pcm')||(v.chargeTailVoices===0&&v.sounds?.[isResident7(romBytes)?0xED:NATIVE_BEDS.charge]>0)));
  const transformPass=name!=='transform-grass'||(v.forms?.['1']>0&&(args.includes('--pcm')||v.sounds?.['224']>0));
  const corridorPass=!corridor||(v.flightCorridorTurns>=2&&v.maxTravel<128);
  const gameplayPass=running&&powerPass&&transformPass&&corridorPass&&v.destroyRepeatFrames===0&&(!action||v.actions?.[action]>0)&&(!name.includes('fly')&&!name.includes('flight')||v.flightFrames>0)&&(!['walk','fly','water-flight'].includes(name)||v.maxTravel>2);
  const hardwarePass=r.code===0&&!v.error&&v.paletteErrors===0&&v.staminaFrames===0&&v.spriteOverflowFrames===0&&v.nmiOverruns===0&&v.gfxDmaOverruns===0;
  const timingPass=v.lag===0&&v.missedVblanks===0;
  const requireTiming=offset===0&&(zeroFrameCases.has(name)||args.includes('--strict-timing'));
  const pass=gameplayPass&&hardwarePass&&(!requireTiming||timingPass);
  console.log(`${tag}: ${pass?'pass':'FAIL'}; CPU misses ${v.missedVblanks}/${v.videoFrames}${timingPass?'':requireTiming?' (timing FAIL)':' (open timing issue)'}; palette ${v.paletteErrors}, stamina ${v.staminaFrames}, sprite overflow ${v.spriteOverflowFrames}, vblank overrun ${v.nmiOverruns}`);
  if(v.destroyRepeatFrames)console.log(`  scenery/barrier work repeated in ${v.destroyRepeatFrames} field updates`);
  if(args.includes('--profile'))console.log(v.profile);
  if(!gameplayPass)console.log('  gameplay did not exercise the expected state:',{completed:v.completed,nmi:v.nmiFrames,visible:v.visibleFrames,flight:v.flightFrames,actions:v.actions,travel:v.maxTravel});
  if(v.error)console.log(v.error);
  return {name,offset,pass,gameplayPass,hardwarePass,timingPass,requireTiming,...v};
}
// Results print as runs finish; summary.json keeps case/offset order.
const summary=new Array(runs.length);
let nextRun=0;
await Promise.all(Array.from({length:Math.min(jobs,runs.length)},async()=>{
  while(nextRun<runs.length){const i=nextRun++;summary[i]=report(await runCase(runs[i]));}
}));
if(offsets.length>1){
  console.log(`\nCPU misses per start-phase offset (${offsets.join(', ')}) and their sum:`);
  let total=0;
  for(const name of [...new Set(summary.map(s=>s.name))]){
    const counts=offsets.map(k=>summary.find(s=>s.name===name&&s.offset===k)?.missedVblanks);
    const sum=counts.reduce((a,b)=>a+(b??NaN),0);total+=sum;
    console.log(`  ${name.padEnd(16)} ${counts.map(n=>String(n).padStart(3)).join(' ')}   sum ${sum}`);
  }
  console.log(`  ${'all cases'.padEnd(16)} ${''.padStart(4*offsets.length-1)}   sum ${total}`);
}
writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));
process.exit(summary.every(r=>r.pass)?0:1);
