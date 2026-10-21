// Reproducible storage/rate/loop measurements for round seven. Private output.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildResident7,RESERVE,SAMPLE_BASE} from '../../gen/audio-resident7.mjs';
import {readWav,resample,brrDecode} from '../../gen/audio-brr.mjs';
import {songInventory} from './sample-audit.mjs';
import {measure} from './punch.mjs';
const root=resolve('.local/snes-test/audio/compare7');mkdirSync(root,{recursive:true});
const b=buildResident7(),songs=songInventory().filter(s=>s.id<0x3B||s.kind==='new');
const cap=(s,reserve)=>Math.min(s.echo.edl,Math.floor((0xFA00-1-SAMPLE_BASE-reserve-s.sampleBytes)/0x800));
const options=[2048,2304,2362,3072,4096].map(reserve=>({reserve,belowSafeMinimum:songs.filter(s=>Math.floor((0xFA00-1-SAMPLE_BASE-reserve-s.sampleBytes)/0x800)<1).map(s=>s.id),changes:songs.filter(s=>cap(s,reserve)<s.echo.edl).map(s=>({id:s.id,before:s.echo.edl,after:cap(s,reserve),delayMs:(cap(s,reserve)-s.echo.edl)*16}))}));
const echo=options[1].changes.map(s=>({...s,round6:cap(songs.find(t=>s.id===t.id),2048)}));
const perSong=songs.map(s=>({id:s.id,additionalBytes:0xFA00-Math.max(1,cap(s,RESERVE))*2048-(SAMPLE_BASE+RESERVE+s.sampleBytes)}));
const compactFallback=songs.filter(s=>0xFA00-Math.max(1,cap(s,2048))*2048-(SAMPLE_BASE+RESERVE+s.sampleBytes)<=0).map(s=>s.id);
const energy=a=>a.reduce((s,v)=>s+v*v,0)/a.length;
const rateOptions=[];
for(const name of ['charge','aura','beam','teleport','flight','landing']){
 const w=readWav(readFileSync('assets/audio/dbz/'+name+'.wav'));
 for(const rate of [4000,6000,8000,10000,12000]){
  const p=resample(w.pcm,w.rate,rate),essential=name==='teleport'?.16:name==='beam'?.16:null;
  rateOptions.push({name,rate,fullClipBytes:Math.ceil(p.length/16)*9,energyLossDb:10*Math.log10(energy(p)/energy(w.pcm)),
   ...(essential?{essentialMs:essential*1000,essentialBytes:Math.ceil(rate*essential/16)*9,essentialEnergyLossDb:10*Math.log10(energy(p.slice(0,rate*essential))/energy(w.pcm.slice(0,w.rate*essential)))}:{})});
 }
}
const samples=b.samples.map(({pcm,bytes,...s})=>{
 const decoded=brrDecode(bytes).pcm,body=s.loop<0?decoded:decoded.slice(s.loop/9*16),win=Math.floor(s.rate*.02),rms=[];
 for(let i=0;i<body.length;i+=win){let e=0;for(let j=0;j<win;j++)e+=body[(i+j)%body.length]**2;rms.push(Math.sqrt(e/win));}
 const mean=rms.reduce((x,y)=>x+y,0)/rms.length;
 return {...s,bytes:bytes.length,loopRmsCoefficientOfVariation:Math.sqrt(rms.reduce((x,y)=>x+(y-mean)**2,0)/rms.length)/mean,loopBoundaryDelta:Math.abs(body.at(-1)-body[0])};
});
const dry=[];
const beamSource=readWav(readFileSync('assets/audio/dbz/beam.wav'));
const attack=resample(resample(beamSource.pcm,beamSource.rate,6000).slice(360,552),6000,32000);
function attackCorrelation(pcm){
 let best=0;const ea=attack.reduce((n,v)=>n+v*v,0);
 for(let start=0;start<3200;start++){
  let dot=0,eb=0;for(let i=0;i<attack.length;i++){const v=pcm[start+i]??0;dot+=attack[i]*v;eb+=v*v;}
  best=Math.max(best,dot/Math.sqrt(Math.max(1e-20,ea*eb)));
 }
 return best;
}
for(const tag of ['r4','r6','r7']){
 const rom=readFileSync(tag==='r7'?(process.env.SNES_ROM??'.local/snes-test/audio/round7.sfc'):`.local/snes-test/audio/baseline7/${tag}.sfc`);
 for(const [name,id] of [['hit',0xE7],['kick',0xE8],['impact',tag==='r6'?0xED:0x38],['blast',0xDE],['beam',0xEA],['flight',0xEC],['landing',0xE3],['teleport',0xEB]]){
  const {pcm,...metrics}=measure(rom,id,{echo:name==='beam'});dry.push({tag,name,...metrics,rmsDbFS:10*Math.log10(energy(pcm.slice(0,Math.round(metrics.durationMs*32)))),...(name==='beam'?{sourceAttackCorrelation:attackCorrelation(pcm)}:{})});
 }
}
const report={reserve:b.reserve,used:b.used,free:b.reserve-b.used,sampleBytes:b.sampleBytes,sequenceBytes:b.sequences.reduce((n,s)=>n+s.bytes.length,0),codeBytes:b.codeBytes,samples,echo,reservationOptions:options,
 perSongExtension:{compact2048Fallback:compactFallback,extended2304Fits:64-compactFallback.length,additional1024Fits:perSong.filter(s=>s.additionalBytes>=1024).map(s=>s.id),compactRequired:perSong.filter(s=>s.additionalBytes<1024),all:perSong},rateOptions,dry,
 method:'Energy loss compares mean square before/after windowed-sinc anti-alias resampling, before limiting/BRR. It is bandwidth retention, not a perceptual score. Loop RMS uses circular 20 ms windows of decoded BRR. Dry effects use the original driver/S-DSP with identical command and echo context.'};
writeFileSync(join(root,'analysis7.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({reserve:report.reserve,used:report.used,echo:report.echo,additional1024Fits:report.perSongExtension.additional1024Fits.length,compactRequired:report.perSongExtension.compactRequired},null,2));
