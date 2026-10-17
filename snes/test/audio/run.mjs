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
import {checkpointDir,privateRom,cleanupRom} from '../checkpoints.mjs';
import {createApu,loadRom,loadSong} from './apu.mjs';
import {compareSongs} from './songs.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const gen=resolve(repo,'dist/snes/gen/audio');
const outRoot=resolve(repo,'.local/snes-test/audio');
mkdirSync(outRoot,{recursive:true});
let ok=true;

if(!only.length||only.includes('unit')){
 const u=spawnSync(process.execPath,['--test',join(here,'unit.test.mjs')],{cwd:repo,encoding:'utf8'});
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
const mesenTests=[['stream','waterfall'],['songs','waterfall']].filter(([n])=>!only.length||only.includes(n));
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
const songs=JSON.parse(readFileSync(join(gen,'songs.json'),'utf8'));
const native=loadRom(),songFile=s=>join(gen,`song_${s.id.toString(16)}.bin`);
const songsLua='SONGS={'+songs.map(s=>`{id=${s.id},edl=${s.echo.edl},evol=${s.echo.evol},efb=${s.echo.efb},voices=${expectedVoices(native,s,readFileSync(songFile(s)))},file=${JSON.stringify(songFile(s))}}`).join(',')+'}';
const lib=[`UPLOAD=${JSON.stringify(join(gen,'upload.bin'))}`,...ids,songsLua,readFileSync(join(here,'lib.lua'),'utf8')].join('\n');
const tests=mesenTests;
const summary=[];
for(const [name,cp] of tests){
 const copy=privateRom(rom,`audio-${name}`);
 const t0=Date.now();
 const r=await runMesen({rom:copy,test:lib+'\n'+readFileSync(join(here,`${name}.lua`),'utf8'),outDir:join(outRoot,name),state:join(cps,`${cp}.mss`),timeoutMs:600000});
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
