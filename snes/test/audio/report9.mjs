// Round-nine loudness tables: SFX against the field music, small-speaker
// check and the 0.5–5 kHz band, for the PC edition, main and this build.
//   node snes/test/audio/report9.mjs --before=main.sfc [--after=dist/snes/secret-of-goku.sfc]
// PC: engine/ki-sound.js's chain in Chromium (pc9.mjs) against the field
// song through an echo-less DSP at the browser's .4 native-music gain.
// Cartridge: the ROM's SPC image (cues9.mjs) against its own field song.
// Writes .local/snes-test/audio/round9/report/{loudness.json,tables.md}.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {renderPc,pcJobs,PC_RATE,PC_MUSIC_GAIN} from './pc9.mjs';
import {cartCues,renderCart,renderMusic,hitVariants} from './cues9.mjs';
import {createApu,loadSong,romSong,romEcho} from './apu.mjs';
import {cueMetrics,musicMetrics,momentary} from './loudness.mjs';
const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(k,d)=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const out=resolve(repo,opt('out','.local/snes-test/audio/round9/report'));
const powerMean=xs=>10*Math.log10(xs.reduce((s,v)=>s+10**(v/10),0)/xs.length);
// Release: loudest 400 ms window that starts in the first 200 ms of the
// wave. Sustain: power mean of windows starting 0.4–0.8 s into it.
function windows(x,rate,small=false){
 const m=momentary(x,rate,{small});
 return {release:Math.max(...m.filter(w=>w.start<=.2).map(w=>w.lufs)),sustain:powerMean(m.filter(w=>w.start>=.4&&w.start<=.8).map(w=>w.lufs))};
}
// Song-volume trace of a wave release over the field song: the duck's
// effect on the music, as mean power over the same windows.
export function duckWindows(rom,id=0xEA){
 const h=createApu({rom});h.ms(60);
 const s=romSong(rom,0x1C),e=romEcho(rom,10);
 loadSong(h,rom,{blob:s.blob,instruments:s.instruments,echo:e,song:0x1C,p2:10,p3:255});
 h.waitFor(()=>h.ram[0xAD]!==0,4e7);h.ms(800);
 const base=h.ram[0x84],trace=[];h.nativeCmd(2,id,0x0F,0x88);
 for(let ms=0;ms<1300;ms++){h.ms(1);trace.push((h.ram[0x84]/base)**2);}
 const mean=(a,b)=>10*Math.log10(trace.slice(a,b).reduce((s,v)=>s+v,0)/(b-a));
 // Each window's music power, then the same power means as windows().
 const at=t=>mean(Math.round(t*1000),Math.round(t*1000)+400);
 const starts=[];for(let t=0;t<=.8001;t+=.01)starts.push(+t.toFixed(2));
 return {release:Math.min(...starts.filter(t=>t<=.2).map(at)),sustain:powerMean(starts.filter(t=>t>=.4).map(at)),base};
}
function cartRows(rom){
 const music=musicMetrics(renderMusic(rom),32000),rows={};
 for(const [name,c] of Object.entries(cartCues(rom))){
  const x=renderCart(rom,c.script,{seconds:c.seconds}),m=cueMetrics(x,32000);
  rows[name]={...m,ratio:m.momentaryLufs-music.integratedLufs,small:m.smallLufs-music.smallLufs,band:m.bandMaxDb-music.bandMeanDb};
  if(name.startsWith('release')){
   for(const extended of [false,true]){
    const y=extended?renderCart(rom,c.script,{seconds:c.seconds,extended:true}):x;if(!y)continue;
    const w=windows(y,32000),ws=windows(y,32000,true),d=duckWindows(rom,name==='release'?0xEA:0xF0);
    const key=name+(extended?'Ext':'');
    const base=extended?cueMetrics(y,32000):rows[name];
    rows[key]={...base,band:base.bandMaxDb-music.bandMeanDb,
     releaseLufs:w.release,sustainLufs:w.sustain,
     ratio:w.release-music.integratedLufs,small:ws.release-music.smallLufs,sustainRatio:w.sustain-music.integratedLufs,sustainSmall:ws.sustain-music.smallLufs,
     duck:{release:d.release,sustain:d.sustain},
     ratioDucked:w.release-music.integratedLufs-d.release,sustainDucked:w.sustain-music.integratedLufs-d.sustain,
     smallDucked:ws.release-music.smallLufs-d.release,sustainSmallDucked:ws.sustain-music.smallLufs-d.sustain};
   }
  }
 }
 const variants=hitVariants(rom).map(x=>cueMetrics(x,32000).momentaryLufs-music.integratedLufs);
 rows.hit.variants=variants;
 return {music,rows};
}
async function pcRows(before){
 const dry=renderMusic(before,{echo:false}).map(c=>c.map(v=>v*PC_MUSIC_GAIN));
 const music=musicMetrics(dry,32000),jobs=pcJobs(),names=Object.keys(jobs);
 const renders=await renderPc(names.map(n=>jobs[n])),rows={};
 names.forEach((n,i)=>{
  const x=renders[i],m=cueMetrics(x,PC_RATE);
  rows[n]={...m,ratio:m.momentaryLufs-music.integratedLufs,small:m.smallLufs-music.smallLufs,band:m.bandMaxDb-music.bandMeanDb};
  if(n==='beam'){const w=windows(x,PC_RATE),ws=windows(x,PC_RATE,true);Object.assign(rows[n],{releaseLufs:w.release,sustainLufs:w.sustain,ratio:w.release-music.integratedLufs,small:ws.release-music.smallLufs,sustainRatio:w.sustain-music.integratedLufs,sustainSmall:ws.sustain-music.smallLufs});}
 });
 const hits=['hit','hit2','hit3'].map(n=>rows[n].momentaryLufs);
 rows.hitMean={momentaryLufs:powerMean(hits),ratio:powerMean(hits)-music.integratedLufs,small:powerMean(['hit','hit2','hit3'].map(n=>rows[n].smallLufs))-music.smallLufs,band:10*Math.log10(['hit','hit2','hit3'].reduce((s,n)=>s+10**(rows[n].bandMaxDb/10),0)/3)-music.bandMeanDb};
 return {music,rows};
}
// Table rows: [label, PC key, cartridge key, metric suffix].
export const TABLE=[
 ['Punch hit (PC hit-1 / mean of 3)','hit','hit'],['Kick','kick','kick'],['SSJ kick','kick','kickSsj'],
 ['Ki fire','blast','ki'],['SSJ ki fire','blast','kiSsj'],['Ki contact','impact','kiContact'],
 ['Kamehameha start','chargeStart','chargeStart'],['SSJ Kamehameha start','chargeStartSsj','chargeStartSsj'],
 ['Kamehameha release (compact)','beam','release'],['Kamehameha release (extended)','beam','releaseExt'],
 ['Kamehameha sustain (compact)','beam','release','sustain'],['Kamehameha sustain (extended)','beam','releaseExt','sustain'],
];
if(process.argv[1]===import.meta.filename){
 const beforePath=opt('before');if(!beforePath)throw Error('--before=main.sfc required');
 const afterPath=resolve(repo,opt('after','dist/snes/secret-of-goku.sfc'));
 const before=readFileSync(beforePath),after=readFileSync(afterPath);
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const result={before:{rom:beforePath,sha256:hash(before),...cartRows(before)},after:{rom:afterPath,sha256:hash(after),...cartRows(after)},pc:await pcRows(before),
  method:'Max momentary (400 ms) BS.1770 loudness of each isolated cue minus the gated integrated loudness of the field song ($1C, preset 10). Small: both after a 4th-order 200 Hz high-pass. Band: loudest 400 ms of 0.5–5 kHz power minus the music mean. PC: ki-sound chain in Chromium vs the dry field song at .4. Release/sustain: windows starting 0–0.2 s / 0.4–0.8 s into the wave; "ducked" subtracts the song-volume trace of the release duck.'};
 mkdirSync(out,{recursive:true});
 writeFileSync(join(out,'loudness.json'),JSON.stringify(result,null,1));
 const f=v=>v===undefined||Number.isNaN(v)?'—':(v>=0?'+':'')+v.toFixed(1);
 const lines=['| Cue | PC LU | Main LU | Round 9 LU | PC small | Main small | Round 9 small | PC band | Main band | Round 9 band |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
 for(const [label,p,c,metric] of TABLE){
  const pick=(r,k)=>metric==='sustain'?(k==='ratio'?r.sustainRatio:k==='small'?r.sustainSmall:undefined):r[k];
  const duck=(r,k)=>metric==='sustain'?(k==='ratio'?r.sustainDucked:r.sustainSmallDucked):(k==='ratio'?r.ratioDucked:r.smallDucked);
  const pc=result.pc.rows[p],b=result.before.rows[c],a=result.after.rows[c];
  const pcCell=k=>p==='hit'?`${f(pick(pc,k))} / ${f(pick(result.pc.rows.hitMean,k))}`:f(pick(pc,k));
  const aCell=k=>a&&a.duck&&k!=='band'?`${f(pick(a,k))} (${f(duck(a,k))} ducked)`:f(a?pick(a,k):undefined);
  lines.push(`| ${label} | ${pcCell('ratio')} | ${f(b?pick(b,'ratio'):undefined)} | ${aCell('ratio')} | ${pcCell('small')} | ${f(b?pick(b,'small'):undefined)} | ${aCell('small')} | ${pcCell('band')} | ${f(b?pick(b,'band'):undefined)} | ${aCell('band')} |`);
 }
 lines.push('',`Field music integrated: PC ${result.pc.music.integratedLufs.toFixed(2)} LUFS (dry ×.4), main ${result.before.music.integratedLufs.toFixed(2)}, round 9 ${result.after.music.integratedLufs.toFixed(2)}.`);
 lines.push(`Round-9 HIT pitch variants: ${result.after.rows.hit.variants.map(f).join(' / ')} LU; main ${result.before.rows.hit.variants.map(f).join(' / ')} LU.`);
 writeFileSync(join(out,'tables.md'),lines.join('\n')+'\n');
 console.log(lines.join('\n'));
}
