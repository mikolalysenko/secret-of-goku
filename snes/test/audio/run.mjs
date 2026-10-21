#!/usr/bin/env node
// Audio module tests: Node unit/APU-harness tests, then Mesen tests on the
// cartridge (SNES_ROM, default dist/snes/secret-of-goku.sfc) starting from the
// shared waterfall checkpoint. Outputs: .local/snes-test/audio/<test>/.
//   node snes/test/audio/run.mjs [test ...]
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {createApu,loadRom,loadSong} from './apu.mjs';
import {compareSongs} from './songs.mjs';
import {NATIVE_IDS,effectVoices} from '../../gen/audio-resident.mjs';
import {isCustom,isResident7,sampleFloor,nativeEffectVoices,nativeIds,uploadSegments} from './cartridge.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const gen=resolve(repo,'dist/snes/gen/audio');
const outRoot=resolve(repo,process.env.AUDIO_TEST_OUT??'.local/snes-test/audio');
mkdirSync(outRoot,{recursive:true});
let ok=true;

if(!only.length||only.includes('unit')){
 const u=spawnSync(process.execPath,['--test',...['unit','resident','songload','samples','custom-cartridge','beds','contacts','motion'].map(n=>join(here,n+'.test.mjs'))],{cwd:repo,encoding:'utf8'});
 const summary=(u.stdout||'').split('\n').filter(l=>/^ℹ (pass|fail)|^✖/.test(l)).join(' ');
 console.log(`audio unit        ${u.status===0?'pass':'FAIL'} ${summary}`);
 if(u.status!==0){ok=false;console.log((u.stdout||'').slice(-3000));}
}

// Songs $3B-$3F through the cartridge driver in the APU harness versus the
// browser renderer: level, per-bar envelope, octave bands, all tracks alive,
// sequence within the driver's 4608-byte buffer, no clipping.
if(!only.length||only.includes('render')){
 const t0=Date.now(),bad=[],res=await compareSongs();
 for(const r of res){
  const tag=r.id.toString(16),worst=Math.max(...r.bandDiffDb.map(Math.abs));
  if(!(Math.abs(r.levelDb)<1))bad.push(`${tag} level ${r.levelDb.toFixed(2)} dB`);
  if(!(r.envelopeCorr>0.9))bad.push(`${tag} envelope r=${r.envelopeCorr.toFixed(3)}`);
  if(!(worst<3))bad.push(`${tag} octave band off by ${worst.toFixed(1)} dB`);
  if(!r.allTracks)bad.push(`${tag} a track stopped`);
  if(r.bytes>0x1200)bad.push(`${tag} sequence ${r.bytes} B`);
  if(!(r.peak<0.9))bad.push(`${tag} peak ${r.peak.toFixed(2)}`);
 }
 writeFileSync(join(outRoot,'render.json'),JSON.stringify(res,null,1));
 console.log(`audio render      ${bad.length?'FAIL':'pass'} (${((Date.now()-t0)/1000).toFixed(1)} s) ${res.map(r=>`${r.id.toString(16)} ${r.levelDb>=0?'+':''}${r.levelDb.toFixed(1)} dB r=${r.envelopeCorr.toFixed(2)}`).join(', ')}`);
 for(const m of bad)console.log('   '+m);
 if(bad.length)ok=false;
}
// [name, checkpoint (null: power-on)]; arrival and imported import the
// browser state before the sword pull (skipped when the bundle is missing).
const shipping=n=>['native','music','rare','rare-control','rare-boot','loads','loads-boot'].includes(n);
const fromCheckpoint=n=>['stream','songs','native','music','rare','rare-control','loads'].includes(n);
const arrivalBundle=join(mainCheckout(),'.local/snes-import/arrival-research__probe__before-pull');
const mesenTests=[['loads','waterfall'],['loads-boot',null],['native','waterfall'],['music','waterfall'],['rare','waterfall'],['rare-control','waterfall'],['rare-boot',null],['stream','waterfall'],['songs','waterfall'],['arrival',null],['imported',null]]
 .filter(([n])=>!only.length||only.includes(n)).filter(([n])=>n==='rare-boot'||n==='loads-boot'||fromCheckpoint(n)||existsSync(arrivalBundle));
if(!mesenTests.length)process.exit(ok?0:1);

// Voices sounding in the first 4 s of each song (frames 15-225 after the
// tracks start), from the APU harness, for the Mesen check.
function expectedVoices(rom,s,blob){
 const h=createApu({rom}),frame=1000/60.0988;h.ms(60);
 loadSong(h,rom,{blob,instruments:s.instruments.map(i=>i.id),echo:s.echo,song:s.id,p2:0x10,p3:0xff});
 h.waitFor(()=>h.ram[0xAD]===0xFF&&h.dspReg(0x2C)===s.echo.evol,4e7);
 h.ms(10*frame);
 let mask=0;
 for(let f=1;f<=240;f++){h.ms(frame);if(f>=15&&f<=225)for(let v=0;v<8;v++)if(h.dspReg(v*16+8)>0)mask|=1<<v;}
 return mask;
}
const ids=readFileSync(join(gen,'ids.asm'),'utf8').split('\n').map(l=>l.match(/^!(AUDIO_\w+) = (\d+)/)).filter(Boolean).map(m=>`${m[1]}=${m[2]}`);
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
 console.log('audio: making checkpoints in',cps);
 const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
 if(r.status!==0){console.error('audio: checkpoints failed');process.exit(1);}
}
const baseSongs=JSON.parse(readFileSync(join(gen,'songs.json'),'utf8')),songs=structuredClone(baseSongs);
const cart=readFileSync(rom),custom=isCustom(cart);
if(custom)for(const s of songs)s.echo.edl=Math.min(s.echo.edl,Math.floor((0xFA00-1-sampleFloor(cart)-s.sampleBytes)/0x800));
const native=loadRom(),songFile=s=>join(gen,`song_${s.id.toString(16)}.bin`);
const songLua=list=>'SONGS={'+list.map(s=>`{id=${s.id},edl=${s.echo.edl},evol=${s.echo.evol},efb=${s.echo.efb},voices=${expectedVoices(native,s,readFileSync(songFile(s)))},file=${JSON.stringify(songFile(s))}}`).join(',')+'}';
const songsLua=songLua(songs),pcmSongsLua=custom?songLua(baseSongs):songsLua;
// modules whose sound flags the audio module consumes (built in?)
const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const label=n=>{const m=sym.match(new RegExp(`^([\\dA-F]{2}):([\\dA-F]{4}) ${n}$`,'mi'));return m?parseInt(m[1]+m[2],16):0;};
const consumers=[`DESTROY=${/ audio_destroy_cues$/m.test(sym)}`];
const upload=join(outRoot,'upload.bin'),segments=uploadSegments(cart),bytes=[];
for(const s of segments)bytes.push(s.addr&255,s.addr>>8,s.bytes.length&255,s.bytes.length>>8,...s.bytes);
writeFileSync(upload,Buffer.from([...bytes,0,0,0,0]));
const lib=[`CUSTOM=${custom}\nROUND7=${isResident7(cart)}\nFLOOR=${sampleFloor(cart)}\nUPLOAD=${JSON.stringify(upload)}`,...ids,...consumers,songsLua,
 `AUDIO_FRAME=${label('audio_frame')}\nAUDIO_DONE=${label('audio_frame_done')}\nAUDIO_PAUSE=${label('audio_pause')}\nAUDIO_CANCEL=${label('audio_cancel')}`,
 `NATIVE_CUES={${nativeIds(cart,NATIVE_IDS).slice(1,28).map((v,i)=>`{${i+1},${v},${nativeEffectVoices(cart,v)}}`).join(',')}}`,readFileSync(join(here,'lib.lua'),'utf8')].join('\n');
const tests=mesenTests;
const summary=[];
let pcmRom=null;
for(const [name,cp] of tests){
 // The historical streaming tests still exercise the optional PCM build;
 // native exercises the shipping cartridge, including its real driver.
 if(!shipping(name)&&!pcmRom){
   pcmRom=resolve(repo,'.local/snes-test/roms/audio-pcm.sfc');
   const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict','-DAUDIO_PCM=1',`--out=${pcmRom}`],{cwd:repo,stdio:'inherit',env:{...process.env,SNES_BUILD_DEFINES:''}});
   if(b.status!==0)throw Error('audio PCM diagnostic build failed');
 }
 const copy=privateRom(shipping(name)?rom:pcmRom,`audio-${name}`);
 const t0=Date.now();
 const pre=fromCheckpoint(name)?'':`IMPORT=${JSON.stringify(arrivalBundle)}\n`;
 const testLib=shipping(name)?lib:lib.replace(`CUSTOM=${custom}`, 'CUSTOM=false').replace(JSON.stringify(upload),JSON.stringify(join(gen,'upload.bin'))).replace(songsLua,pcmSongsLua);
 const body=name==='loads-boot'?`CP_STOP='waterfall'\nLOAD_NONCANONICAL=${custom}\n`+readFileSync(join(here,'../checkpoints.lua'),'utf8')+'\nlocal boot=test\n'+readFileSync(join(here,'loads.lua'),'utf8')+'\nlocal loads=test\nfunction test() boot();loads() end\n':readFileSync(join(here,`${name}.lua`),'utf8');
 const r=await runMesen({rom:copy,test:pre+testLib+'\n'+body,outDir:join(outRoot,name),state:cp?join(cps,`${cp}.mss`):null,timeoutMs:600000});
 cleanupRom(copy);
 const res=r.results??{};
 const fails=Object.entries(res).filter(([k,v])=>typeof v==='string'&&v.startsWith('FAIL'));
 const pass=r.code===0&&!res.error&&res.failures===0;
 if(!pass)ok=false;
 summary.push({test:name,pass,seconds:((Date.now()-t0)/1000).toFixed(1),fails,error:res.error});
 console.log(`audio ${name.padEnd(12)} ${pass?'pass':'FAIL'} (${((Date.now()-t0)/1000).toFixed(1)} s)`);
 for(const [k,v] of fails)console.log(`   ${k}: ${v}`);
 if(res.error)console.log('   error:',res.error);
 if(!pass&&r.code!==0&&!res.error)console.log(r.output.slice(-1500));
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
process.exit(ok?0:1);
