// Punch audit, independent of browser similarity. Actual retail SPC700 +
// sample-accurate S-DSP, 32 kHz, fixed native command and echo context.
// node snes/test/audio/punch.mjs --before=path.sfc [--retail]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderEffect} from './effects.mjs';
import {wav,loadRom} from './apu.mjs';
import {effectRam,trackBytes} from '../../gen/audio-resident-storage.mjs';
import {RESIDENT} from '../../gen/audio-resident.mjs';

export const RATE=32000;
const root=resolve(import.meta.dirname,'../../..');
export const compareDir=resolve(root,'.local/snes-test/audio/compare4');
const db=x=>20*Math.log10(Math.max(x,1e-12));
// Window-corrected band energy (FS² ms), rectangular time bounds and a Hann
// window within them. Zero padding only interpolates the spectrum. Sum both
// frequency halves, divide by FFT length, sample rate and mean window power.
function bandEnergy(pcm,start,ms,lo,hi){
 const count=Math.round(ms*RATE/1000);let n=1;while(n<count)n*=2;
 const re=new Float64Array(n),im=new Float64Array(n);let win2=0;
 for(let i=0;i<count;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(count-1));re[i]=(pcm[start+i]??0)*w;win2+=w*w;}
 for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let len=2;len<=n;len*=2)for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){
  const w=-2*Math.PI*j/len,c=Math.cos(w),s=Math.sin(w),k=i+j,q=k+len/2;
  const x=re[q]*c-im[q]*s,y=re[q]*s+im[q]*c;
  re[q]=re[k]-x;im[q]=im[k]-y;re[k]+=x;im[k]+=y;
 }
 let sum=0;for(let k=0;k<=n/2;k++)if(k*RATE/n>=lo&&k*RATE/n<hi)sum+=(re[k]**2+im[k]**2)*(k===0||k===n/2?1:2);
 return sum/n/RATE*1000/(win2/count);
}
export function punchMetrics(pcm){
 let peak=0,peakAt=0;for(let i=0;i<pcm.length;i++)if(Math.abs(pcm[i])>peak){peak=Math.abs(pcm[i]);peakAt=i;}
 const onset=pcm.findIndex(v=>Math.abs(v)>Math.max(1/32768,peak*.001));
 if(onset<0)return {silent:true};
 const env=[];for(let p=onset;p<pcm.length;p+=160){let e=0;for(const v of pcm.subarray(p,p+160))e+=v*v;env.push(Math.sqrt(e/160));}
 const threshold=Math.max(...env)*.01;let end=env.length-1;while(end>0&&env[end]<=threshold)end--;
 const last=Math.min(pcm.length,onset+(end+1)*160),a=pcm.subarray(onset,last);
 const rms=Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
 return {onsetMs:onset/RATE*1000,timeToPeakMs:(peakAt-onset)/RATE*1000,peakDbFS:db(peak),
  crestDb:db(peak/rms),low80Energy:bandEnergy(pcm,onset,80,0,200),
  high30Energy:bandEnergy(pcm,onset,30,4000,16001),durationMs:a.length/RATE*1000};
}
export function writePcm(path,pcm){const p=Int16Array.from(pcm,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768))));writeFileSync(path,wav(p,p));}
export function measure(rom,id,options={}){
 const r=renderEffect(rom,id,options);
 return {...punchMetrics(r.pcm),voices:r.voices,voiceMs:r.voiceMs,ownershipMs:r.ms,ended:r.ended,pcm:r.pcm};
}
function mapFromRom(path){
 const rom=readFileSync(path),sym=readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8');
 const m=sym.match(/^([0-9A-F]{2}):([0-9A-F]{4}) audio_native_ids$/mi);
 if(!m)throw Error('audio_native_ids missing from symbols');
 const at=parseInt(m[1]+m[2],16)&0x3FFFFF;
 return {rom,ids:Array.from(rom.subarray(at,at+34))};
}
export function report(before){
 mkdirSync(compareDir,{recursive:true});
 const after=mapFromRom(process.env.SNES_ROM??resolve(root,'dist/snes/secret-of-goku.sfc')),old=mapFromRom(before);
 const rows=[];
 for(const [cue,index] of [['hit',3],['kick',4],['impact',6],['beam',8]]){
  const row={cue,echo:cue==='beam',versions:{}};
  for(const [version,source] of [['before',old],['after',after]]){
   const {pcm,...metrics}=measure(source.rom,source.ids[index],{echo:row.echo});
   writePcm(resolve(compareDir,`${cue}-${version}.wav`),pcm);
   row.versions[version]={effect:source.ids[index],...metrics};
  }
  rows.push(row);
 }
 // Alternatives are auditions only; shipping uses the ROM above. None of
 // these RAM-only substitutions changes the cartridge or its storage map.
 const hit=RESIDENT.find(r=>r.id===0xE7).tracks,kick=RESIDENT.find(r=>r.id===0xE8).tracks;
 const wave=RESIDENT.find(r=>r.id===0xEA).tracks;
 const change=(tracks,voice,index,value)=>tracks.map((t,v)=>t.map((b,i)=>v===voice&&i===index?value:b));
 const choices={
  hit:[{tracks:change(hit,0,3,30),note:'Slightly darker 16 kHz crack; same short bass body.'},
       {id:0x37,note:'Unmodified retail two-voice weapon impact; longer, softer attack.'}],
  kick:[{tracks:change(kick,0,3,28),note:'Darker 8 kHz crunch; same bass body and length.'},
        {tracks:change(kick,1,5,3),note:'Bass body one octave lower; same noise crack.'}],
  impact:[{id:0x36,note:'Unmodified retail explosion with a longer 425 ms tail.'},
          {id:0xC0,note:'Unmodified retail burst with a sharp attack and 560 ms tail.'}],
  beam:[{tracks:change(wave,0,4,25),note:'Lower 4 kHz noise clock, warmer roar; same one-second body.'},
        {tracks:change(wave,0,4,29),note:'Brighter 10.7 kHz noise clock; same one-second body.'}],
 };
 for(const row of rows){
  row.note=row.cue==='beam'?'Partial and full Super Saiyan waves share this sustained cue; no extra CPU selector or retrigger.':
   row.cue==='impact'?'Ki and beam contacts, world collisions, scenery and pod impacts use retail $38; blast remains the launch sound.':
   'Full-volume first tick, short noise transient plus a falling low tone; swings unchanged.';
  row.alternates=choices[row.cue].map((option,i)=>{
   const {pcm,...metrics}=measure(after.rom,option.id??0xDC,{tracks:option.tracks,echo:row.echo});
   const file=`${row.cue}-alt${i+1}.wav`;writePcm(resolve(compareDir,file),pcm);
   return {file,note:option.note,...metrics};
  });
 }
 const manifest={rate:RATE,renderer:'Original SPC700 driver and sample-accurate S-DSP; centred 02 ee 0F 88, no gain normalization',
  echo:'beam pairs use silent song and native preset 4: EDL 4 / EVOL 64 / EFB 30 / FIR 0; hits dry',
  metrics:'Peak is sample peak; time to peak starts at -60 dB relative amplitude onset. Duration uses 5 ms RMS windows to -40 dB relative RMS; crest uses this audible span. Band energy is Hann-corrected FS² ms over the first 80/30 ms from onset. Voices count ownership, including silent tails.',
  cues:rows};
 writeFileSync(resolve(compareDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.table(rows.flatMap(r=>Object.entries(r.versions).map(([version,m])=>({cue:r.cue,version,peakMs:m.timeToPeakMs.toFixed(2),peakDb:m.peakDbFS.toFixed(2),crestDb:m.crestDb.toFixed(2),low80:m.low80Energy.toFixed(5),high30:m.high30Energy.toFixed(5),durationMs:m.durationMs,voices:m.voices}))));
 return manifest;
}
// Retail auditions are deliberately not ranked by the browser clips.
export function retail(){
 mkdirSync(compareDir,{recursive:true});const rom=loadRom(),ram=effectRam(rom),rows=[];
 for(let id=0;id<220;id++){
  const tracks=[0,1].map(v=>{const a=0x2C00+4*id+2*v;return trackBytes(ram,ram[a]|ram[a+1]<<8);});
  let safe=true;
  for(const t of tracks)for(let p=0;p<t.length;){const op=t[p++];if([0xF0,0xF1,0xF3,0xF4,0xF8,0xF9,0xFA,0xFB].includes(op)||(op===0xEA&&t[p]>11))safe=false;if(op>=0xD2)p+=ram[0x1484+op-0xD2];}
  if(!safe)continue;
  const {pcm,...m}=measure(rom,id,{limit:2500});
  rows.push({id,...m,tracks:tracks.map(t=>Array.from(t))});
 }
 writeFileSync(resolve(compareDir,'retail.json'),JSON.stringify(rows,null,2)+'\n');
 console.table(rows.filter(r=>r.ended&&r.durationMs<600&&r.durationMs>60).sort((a,b)=>b.low80Energy-a.low80Energy).slice(0,25).map(r=>({id:r.id.toString(16),ms:r.durationMs,peak:r.peakDbFS.toFixed(1),low:r.low80Energy.toFixed(3),high:r.high30Energy.toFixed(3),voices:r.voices})));
}
if(process.argv[1]===import.meta.filename){
 if(process.argv.includes('--retail'))retail();
 else {const before=process.argv.find(a=>a.startsWith('--before='))?.slice(9);if(!before)throw Error('--before=path.sfc required');report(before);}
}
