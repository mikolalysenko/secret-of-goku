// Round-eight cartridge auditions. Private DAC captures, never normalized.
// node snes/test/audio/capture8.mjs --rom=path.sfc --tag=before|rupture|arc|storm [--candidates]
import {readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {wav} from './apu.mjs';
import {extendedInfo} from './cartridge.mjs';
const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(k,d)=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const rom=resolve(opt('rom',process.env.SNES_ROM??'dist/snes/secret-of-goku.sfc')),tag=opt('tag','rupture');
const root=join(repo,'.local/snes-test/audio/compare8'),out=join(root,'capture-'+tag);
mkdirSync(root,{recursive:true});
const bytes=readFileSync(rom),sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8');
const label=n=>{const m=sym.match(new RegExp(`^([\\dA-F]{2}):([\\dA-F]{4}) ${n}$`,'mi'));if(!m)throw Error(n);return parseInt(m[1]+m[2],16);};
const host=join(import.meta.dirname,'capture-host.py');chmodSync(host,0o755);process.env.MESEN=host;
const pre=`CP_STOP='waterfall'\nEXTENDED=${!!extendedInfo(bytes)}\nCANDIDATES_ONLY=${args.includes('--candidates')}\nAUDIO_FRAME=${label('audio_frame')}\nIMPORT=${JSON.stringify(join(repo,'.local/snes-import/'))}\n`;
const test=pre+readFileSync(join(repo,'snes/test/checkpoints.lua'),'utf8')+'\n'+readFileSync(join(repo,'snes/test/world/lib.lua'),'utf8')+'\n'+readFileSync(join(import.meta.dirname,'capture8.lua'),'utf8');
const copy=privateRom(rom,'capture8-'+tag);let run;
try{run=await runMesen({rom:copy,test,outDir:out,timeoutMs:600000});}finally{cleanupRom(copy);}
if(run.code!==0||!run.results?.captured)throw Error(JSON.stringify(run.results??run.output));
const files=[];
for(const f of run.results.files){
 const pcm=readFileSync(join(out,f.name+'.pcm')),n=pcm.length/4,l=new Int16Array(n),r=new Int16Array(n);let peak=0,clipped=0,sum=0;
 for(let i=0;i<n;i++){l[i]=pcm.readInt16LE(i*4);r[i]=pcm.readInt16LE(i*4+2);for(const v of [l[i],r[i]]){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=32767)clipped++;}}
 const file=f.name+'-'+tag+'.wav',data=wav(l,r);writeFileSync(join(root,file),data);
 files.push({file,description:f.description,bank:f.bank,variant:tag,samples:n,seconds:n/32000,sampleRate:32000,channels:2,
  sha256:createHash('sha256').update(data).digest('hex'),peakDbFS:20*Math.log10(Math.max(1,peak)/32768),clipped,rmsDbFS:10*Math.log10(Math.max(1,sum)/(2*n*32768**2))});
}
const manifest={tag,rom,sha256:createHash('sha256').update(bytes).digest('hex'),renderer:'Pinned Mesen raw 32 kHz stereo DAC. No output gain, normalization or offline effects.',commandTrace:'capture-'+tag+'/results.json',files};
writeFileSync(join(root,'manifest-'+tag+'.json'),JSON.stringify(manifest,null,2)+'\n');
const path=join(root,'manifest.json'),all=existsSync(path)?JSON.parse(readFileSync(path)):{round:8,default:'rupture',candidates:['arc','rupture','storm'],versions:{},files:[]};
all.versions[tag]={romSha256:manifest.sha256,manifest:'manifest-'+tag+'.json',commandTrace:manifest.commandTrace};
all.files=all.files.filter(f=>f.variant!==tag).concat(files);writeFileSync(path,JSON.stringify(all,null,2)+'\n');
console.log(`${tag}: ${files.length} WAVs, ${files.reduce((n,f)=>n+f.clipped,0)} clipped samples`);
