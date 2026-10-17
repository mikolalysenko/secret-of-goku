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

const ids=readFileSync(join(gen,'ids.asm'),'utf8').split('\n').map(l=>l.match(/^!(AUDIO_\w+) = (\d+)/)).filter(Boolean).map(m=>`${m[1]}=${m[2]}`);
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
 console.log('audio: making checkpoints in',cps);
 const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
 if(r.status!==0){console.error('audio: checkpoints failed');process.exit(1);}
}
const lib=[`UPLOAD=${JSON.stringify(join(gen,'upload.bin'))}`,...ids,readFileSync(join(here,'lib.lua'),'utf8')].join('\n');
const tests=[['stream','waterfall']].filter(([n])=>!only.length||only.includes(n));
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
