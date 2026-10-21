// Auditions of the musical/effect cost of making resident sample room.
// Nothing here is installed in a cartridge. Uses the existing songs renderer.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {driverChunks,romSong,loadRom,wav} from './apu.mjs';
import {renderCartridge} from './songs.mjs';
import {measure,writePcm} from './punch.mjs';
import {features} from './effects.mjs';
import {brrDecode,brrEncode,resample} from '../../gen/audio-brr.mjs';
import {out,root,hex,songInventory,sampleInventory} from './sample-audit.mjs';
import {effectRam,trackBytes} from '../../gen/audio-resident-storage.mjs';

const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/Math.max(a.length,1));
const db=x=>20*Math.log10(Math.max(x,1e-12));
const stereoRms=s=>Math.hypot(rms(s.l),rms(s.r))/Math.SQRT2;
export function writeStereo(file,{l,r}){
 const convert=a=>Int16Array.from(a,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768))));
 writeFileSync(file,wav(convert(l),convert(r)));
}
function tailMetric(render){
 const reference=stereoRms({l:render.l.slice(-6400),r:render.r.slice(-6400)});
 const t=render.tail,env=[];
 for(let i=0;i<t.l.length;i+=160)env.push(stereoRms({l:t.l.subarray(i,i+160),r:t.r.subarray(i,i+160)}));
 let end=env.length-1;while(end>=0&&env[end]<reference*.01)end--;
 return {referenceDbFS:db(reference),tail40Ms:(end+1)*5,censored:end===env.length-1,
  tailEnergy:([...t.l,...t.r].reduce((s,v,i)=>s+(i%t.l.length>=640?v*v:0),0)/2/32000),
  note:'Last 5 ms RMS window above -40 dB relative to the stereo RMS of the 200 ms before the cut. Energy excludes the first 20 ms (dry voice release), FS² seconds.'};
}
export function echoOptions(shipping,songs=songInventory()){
 const dir=join(out,'options');mkdirSync(dir,{recursive:true});
 const retail=loadRom(),rows=[];
 for(const s of songs.filter(s=>s.command&&s.free<2048)){
  const rom=s.kind==='retail'?retail:shipping,source=romSong(rom,s.id),versions={};
  for(const [version,edl] of [['r4',s.echo.edl],['edl-minus1',s.echo.edl-1]]){
   const render=renderCartridge(rom,{...s,blob:source.blob,ids:source.instruments,
    echo:{...s.echo,edl},p2:s.command.p2,p3:s.command.p3},8,{tailSeconds:4,alignStart:true});
   const file=`echo-${s.kind}-${hex(s.id)}-${version}.wav`;
   writeStereo(join(dir,file),{l:Float32Array.from([...render.l,...render.tail.l]),r:Float32Array.from([...render.r,...render.tail.r])});
   versions[version]={file:'options/'+file,edl,delayMs:16*edl,musicRms:stereoRms(render),...tailMetric(render)};
  }
  const before=versions.r4,after=versions['edl-minus1'];
  const row={kind:s.kind,id:s.id,name:s.name,echo:s.echo,freedBytes:2048,versions,
   musicLevelChangeDb:db(after.musicRms/before.musicRms),tailEnergyChangeDb:10*Math.log10(after.tailEnergy/before.tailEnergy)};
  rows.push(row);console.log(`echo ${s.kind} $${hex(s.id)}: ${before.tail40Ms} → ${after.tail40Ms} ms; music ${row.musicLevelChangeDb.toFixed(3)} dB`);
 }
 return rows;
}

// Halve the reference playback rate of the four longer looped retail
// samples; round intro/loop independently to BRR blocks, preserve amplitude.
// This is lossy and is expressly not a "native sounds unchanged" option.
export function lowerRetailSample(retail,s){
 assert.ok(s.id>=7&&s.id<=10&&s.tune===0);
 const ram=new Uint8Array(65536);for(const c of driverChunks(retail))ram.set(c.bytes,c.addr);
 const brr=ram.slice(s.start,s.end),loopByte=s.loop-s.start,source=brrDecode(brr).pcm;
 const introCount=loopByte/9*16;
 // Decode several loops with real BRR history; use the last loop as the
 // circular resampling source, not an artificial zero-history loop attack.
 const repeated=new Uint8Array(brr.length+(brr.length-loopByte)*8);repeated.set(brr);
 for(let i=0;i<8;i++)repeated.set(brr.subarray(loopByte),brr.length+i*(brr.length-loopByte));
 const loop=brrDecode(repeated,{all:true}).pcm.slice(-s.loopSamples);
 const prefix=resample(Float32Array.from(source.slice(0,introCount),v=>v/16384),32000,16000,{length:Math.ceil(introCount/2/16)*16});
 const sustain=resample(Float32Array.from(loop,v=>v/16384),32000,16000,{length:Math.ceil(loop.length/2/16)*16,circular:true});
 const pcm=Float32Array.from([...prefix,...sustain]);
 const r=brrEncode(pcm,{resetAt:new Set([0,prefix.length/16])});r.bytes[r.bytes.length-9]|=3;
 return {id:s.id,bytes:r.bytes,loop:prefix.length/16*9,tune:0x80,snr:r.snr,
  oldBytes:s.bytes,newBytes:r.bytes.length,saved:s.bytes-r.bytes.length,
  introMsBefore:introCount/32,introMsAfter:prefix.length/16,
  loopMsBefore:s.loopSamples/32,loopMsAfter:sustain.length/16};
}
export function retailTuningPatches(retail,id){
 const ram=effectRam(retail),word=a=>ram[a]|ram[a+1]<<8,patches=new Map();
 for(let effect=0;effect<0xDC;effect++)for(let voice=0;voice<2;voice++){
  const start=word(0x2C00+4*effect+2*voice),bytes=trackBytes(ram,start);let ins=4;
  for(let p=0;p<bytes.length;){
   const op=bytes[p++];if(op===0xEA)ins=bytes[p];
   if(op===0xE9&&ins===id){
    // For these samples tune=0 originally; E9 offsets are positive and
    // below $80. Halving the base AND offset preserves the playback ratio
    // to the nearest tuning unit; halving the base alone detunes $96 badly.
    assert.ok(bytes[p]<0x80,'negative/wrapped E9 needs a different octave strategy');
    patches.set(start+p,{addr:start+p,before:bytes[p],after:Math.round(bytes[p]/2)});
   }
   if(op>=0xD2)p+=ram[0x1484+op-0xD2];
  }
 }
 return [...patches.values()];
}
export function retailOptions(retail=loadRom(),samples=sampleInventory()){
 const dir=join(out,'options');mkdirSync(dir,{recursive:true});
 const rows=[];
 // One observed native caller per sample where possible. Sample 9's $97
 // is a static dependency, absent from the fresh trace, not claimed unused.
 for(const [id,effect] of [[7,0x96],[8,0x32],[9,0x97],[10,0x81]]){
  const s=samples[id],small=lowerRetailSample(retail,s),tuningPatches=retailTuningPatches(retail,id),versions={};
  for(const version of ['r4','half-rate']){
   const setup=version==='r4'?null:h=>{
    h.ram.set(small.bytes,s.start);const lp=s.start+small.loop;
    h.ram[0x1902+4*id]=lp&255;h.ram[0x1903+4*id]=lp>>8;
    h.ram[0x1800+2*id]=small.tune;
    for(const p of tuningPatches)h.ram[p.addr]=p.after;
   };
   const {pcm,...metrics}=measure(retail,effect,{setup});
   const file=`retail-sample-${id}-effect-${hex(effect)}-${version}.wav`;
   writePcm(join(dir,file),pcm);const {levelDb,centroid,bands}=features(pcm);
   versions[version]={file:'options/'+file,...metrics,levelDb,centroid,bands};
  }
  const {bytes,...info}=small;rows.push({...info,effect,tuningPatches,versions});
 }
 return rows;
}
export function optionsReport(){
 const shipping=readFileSync(process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'));
 const result={echo:echoOptions(shipping),retail:retailOptions()};
 writeFileSync(join(out,'options.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]===import.meta.filename)optionsReport();
