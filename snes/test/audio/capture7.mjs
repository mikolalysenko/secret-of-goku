// Raw cartridge listening pairs, including canonical echo changes.
// node snes/test/audio/capture7.mjs --rom=... --tag=r4|r7|punch7|motion7 [--songs]
// --only=contacts appends the punch follow-up without replacing earlier takes.
// --only=motion appends swings/ki, including 1/2-frame contacts and 5-frame volleys.
// --only=variation appends six moves, eight whiffs and a five-frame ki volley.
// --only=finisher appends normal/SSJ kicks, combos and beam overlap stress.
// --only=ki appends normal/SSJ shots, five-frame volleys and beam overlaps.
import {readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {wav} from './apu.mjs';
import {isResident7} from './cartridge.mjs';
import {songInventory} from './sample-audit.mjs';
import {RESERVE} from '../../gen/audio-resident7.mjs';
const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(k,d)=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const rom=resolve(opt('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')),tag=opt('tag','r7');
const only=opt('only','');if(only&&!['melee','contacts','motion','variation','finisher','ki'].includes(only))throw Error('unknown capture filter');
const root=join(repo,'.local/snes-test/audio/compare7'),folder='capture-'+tag+(only?'-'+only:''),out=join(root,folder);
mkdirSync(root,{recursive:true});
const bytes=readFileSync(rom),sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const m=sym.match(/^([\dA-F]{2}):([\dA-F]{4}) audio_frame$/mi);if(!m)throw Error('audio_frame symbol missing');
const rows=songInventory().filter(s=>s.id<0x3B||s.kind==='new');
const affected=rows.filter(s=>s.echo.edl>Math.floor((0xFA00-1-0x4DF1-RESERVE-s.sampleBytes)/0x800));
const echo=args.includes('--songs')?affected.map(s=>[s.id,(s.command?.p2??0)&15]):[];
const host=join(import.meta.dirname,'capture-host.py');chmodSync(host,0o755);process.env.MESEN=host;
const pre=`CP_STOP='waterfall'\nONLY=${JSON.stringify(only)}\nROUND7=${isResident7(bytes)}\nAUDIO_FRAME=${parseInt(m[1]+m[2],16)}\nIMPORT=${JSON.stringify(join(repo,'.local/snes-import/'))}\nECHO_PAIRS={${echo.map(s=>'{'+s+'}').join(',')}}\n`;
const test=pre+readFileSync(join(repo,'snes/test/checkpoints.lua'),'utf8')+'\n'+readFileSync(join(repo,'snes/test/world/lib.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'capture7.lua'),'utf8');
const copy=privateRom(rom,'capture7-'+tag);let run;
try{run=await runMesen({rom:copy,test,outDir:out,timeoutMs:600000});}finally{cleanupRom(copy);}
if(run.code!==0||!run.results?.captured)throw Error(JSON.stringify(run.results??run.output));
const manifest=join(root,'manifest-'+tag+'.json');
const previous=only&&existsSync(manifest)?JSON.parse(readFileSync(manifest)):null;
if(previous&&previous.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('cannot append a capture from a different cartridge');
const replaced=new Set(run.results.files.map(f=>f.name+'-'+tag+'.wav'));
const files=(previous?.files??[]).filter(f=>!replaced.has(f.file));
for(const f of run.results.files){
 const pcm=readFileSync(join(out,f.name+'.pcm')),n=pcm.length/4,l=new Int16Array(n),r=new Int16Array(n);
 let peak=0,clipped=0,sum=0;
 for(let i=0;i<n;i++){l[i]=pcm.readInt16LE(i*4);r[i]=pcm.readInt16LE(i*4+2);for(const v of [l[i],r[i]]){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=32767)clipped++;}}
 const file=f.name+'-'+tag+'.wav',data=wav(l,r);writeFileSync(join(root,file),data);
 files.push({file,description:f.description,commandTrace:folder+'/results.json',variant:tag,samples:n,seconds:n/32000,sampleRate:32000,channels:2,
  sha256:createHash('sha256').update(data).digest('hex'),peakDbFS:20*Math.log10(Math.max(1,peak)/32768),clipped,
  rmsDbFS:10*Math.log10(Math.max(1,sum)/(2*n*32768**2))});
}
writeFileSync(manifest,JSON.stringify({tag,rom,sha256:createHash('sha256').update(bytes).digest('hex'),
 renderer:'Pinned Mesen core b9fa69ddc6d0a331fb103fdb5eef6904305703c2, raw 32 kHz stereo DAC; no output gain or normalization.',
 fixtures:['finisher','ki'].includes(only)?'Cold-boot waterfall checkpoint; public cue mailbox and audio-owned form selection for solo, combo and stress requests, with the cartridge song loader.':
  'Solo requests exercise the cartridge selector/dispatcher after power-on. Contexts use the normal browser-import fixture and real controller inputs; world flight starts at waterfall.',
 commandTrace:folder+'/results.json',files},null,2));
console.log(`${tag}: ${files.length} WAVs, ${files.reduce((n,f)=>n+f.clipped,0)} clipped samples; ${affected.length} affected canonical songs`);
