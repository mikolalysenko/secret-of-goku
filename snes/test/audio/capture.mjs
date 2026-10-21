// Mesen cartridge recordings. First run capture-build.mjs; then:
// node snes/test/audio/capture.mjs --rom=... --tag=unmatched [--songs]
import {readFileSync,writeFileSync,mkdirSync,readdirSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {wav} from './apu.mjs';
import {isCustom,customSegments} from './cartridge.mjs';
const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(key,f)=>args.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??f;
const rom=resolve(opt('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')),tag=opt('tag','custom');
const root=join(repo,'.local/snes-test/audio/compare6'),out=join(root,tag),custom=isCustom(readFileSync(rom));
mkdirSync(root,{recursive:true});
const host=join(import.meta.dirname,'capture-host.py');chmodSync(host,0o755);process.env.MESEN=host;
const bank=customSegments(readFileSync(rom)).find(s=>s.addr===0x4DF1)?.bytes;
const saturation=bank?0x4DF1+bank.findIndex((v,i)=>v===0xE8&&bank[i+1]===0x7F&&i>=0x5580-0x4DF1):0;
if(bank&&saturation<0x5580)throw Error('custom gain saturation label not found');
const test=`CP_STOP='waterfall'\nSATURATION=${saturation}\nIDS={hit=231,kick=232,impact=${custom?237:56},beam=234}\nSONG_PAIRS=${args.includes('--songs')}\n`+
 readFileSync(join(repo,'snes/test/checkpoints.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'capture.lua'),'utf8');
const copy=privateRom(rom,'capture-'+tag);
const run=await runMesen({rom:copy,test,outDir:out,timeoutMs:600000});cleanupRom(copy);
if(run.code!==0||!run.results?.captured)throw Error(JSON.stringify(run.results??run.output));
const files=[];
for(const file of readdirSync(out).filter(f=>f.endsWith('.pcm'))){
 const pcm=readFileSync(join(out,file)),n=pcm.length/4,l=new Int16Array(n),r=new Int16Array(n);
 let peak=0,clipped=0,sum=0;
 for(let i=0;i<n;i++){l[i]=pcm.readInt16LE(i*4);r[i]=pcm.readInt16LE(i*4+2);for(const v of [l[i],r[i]]){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=32767)clipped++;}}
 const path=join(root,file.replace('.pcm',`-${tag}.wav`));writeFileSync(path,wav(l,r));
 const ff=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',path,'-af','ebur128=framelog=verbose','-loglevel','verbose','-f','null','-'],{encoding:'utf8',maxBuffer:4e6});
 if(ff.status!==0)throw Error(ff.stderr);
 const windows=[...ff.stderr.matchAll(/t:\s*([\d.]+).*?M:\s*([-\d.]+).*?S:\s*([-\d.]+)/g)].map(m=>({t:+m[1],momentary:+m[2],shortTerm:+m[3]}));
 files.push({file:path.slice(root.length+1),samples:n,peakDbFS:20*Math.log10(peak/32768),clipped,
  rmsDbFS:10*Math.log10(sum/(2*n*32768**2)),momentaryMax:Math.max(...windows.map(w=>w.momentary)),
  shortTerm3s:windows.find(w=>w.t>=2.99)?.shortTerm,windows});
}
const result={rom,sha256:createHash('sha256').update(readFileSync(rom)).digest('hex'),custom,tag,
 renderer:'Pinned Mesen core, raw 32 kHz stereo DAC tap; cartridge power-on and CPU song/effect dispatch, no sample injection or output gain',
 loudness:'FFmpeg ebur128 K-weighted stereo, 400 ms momentary and 3 s short-term LUFS; no normalization',volumeSaturations:run.results.volume_saturations,files};
writeFileSync(join(root,`manifest-${tag}.json`),JSON.stringify(result,null,2));
console.log(`${tag}: ${files.length} cartridge WAVs, peak ${Math.max(...files.map(f=>f.peakDbFS)).toFixed(2)} dBFS, clipped ${files.reduce((n,f)=>n+f.clipped,0)}`);
