// Round-five storage investigation. Read-only cartridge analysis; reports,
// traces and recordings belong in this worktree's .local/snes-test/audio.
// node snes/test/audio/sample-audit.mjs [--trace=path/to/results.json] [--rates]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadRom,driverChunks,romSong,romInstrument,romEcho,createApu} from './apu.mjs';
import {effectRam,trackBytes,residentLayout} from '../../gen/audio-resident-storage.mjs';
import {RESIDENT} from '../../gen/audio-resident.mjs';
import {driverPitch} from '../../gen/audio-seq.mjs';
import {parseEvent} from '../../../engine/event-codec.js';
import {staticAudit} from './audit.mjs';

export const root=resolve(import.meta.dirname,'../../..');
export const out=join(root,'.local/snes-test/audio/compare5');
export const hex=(n,width=2)=>n.toString(16).toUpperCase().padStart(width,'0');
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const word=(b,a)=>b[a]|b[a+1]<<8;

export function songInstrumentSelectors(rom){
 const ram=effectRam(rom),rows=[];
 for(let id=0;id<64;id++){
  const {blob}=romSong(rom,id),delta=20-word(blob,0),none=word(blob,18),todo=[],seen=new Set(),ids=new Set();
  for(let v=0;v<8;v++)if(word(blob,2+2*v)!==none)todo.push(word(blob,2+2*v)+delta);
  while(todo.length){
   let p=todo.pop();
   while(p>=20&&p<blob.length&&!seen.has(p)){
    seen.add(p);const op=blob[p],n=op<0xD2?1:1+ram[0x1484+op-0xD2];
    if(op===0xEA)ids.add(blob[p+1]);
    if([0xF9,0xFA,0xFB].includes(op))todo.push(word(blob,p+1+(op===0xF9?1:0))+delta);
    if(op===0xFA||op===0xF2)break;p+=n;
   }
  }
  rows.push({id,instruments:[...ids].sort((a,b)=>a-b)});
 }
 return rows;
}

export function songInventory(retail=loadRom()){
 const canonical=new Map(),commands=[];
 for(let event=0;event<0x800;event++)for(const op of parseEvent(retail,event).ops){
  if(op.op!==0x40||op.bytes[1]!==1)continue;
  const c={event,id:op.bytes[2],p2:op.bytes[3],p3:op.bytes[4]};commands.push(c);
  // These events include the reordered fanfares at $721-$723/$72E-$730.
  if(event>=0x700&&event<=0x73A)canonical.set(c.id,c);
 }
 const row=(rom,id,kind,echo,command,name=null)=>{
  const {blob,instruments}=romSong(rom,id),ids=[...new Set(instruments)];
  // The CPU cache shares repeated ids (e.g. $18's two strike entries).
  const bytes=ids.reduce((s,i)=>s+romInstrument(rom,i).brr.length,0);
  const end=0x4DF1+bytes,esa=0xFA00-Math.max(1,echo.edl)*0x800;
  assert.ok(end<=esa,`song ${kind} $${hex(id)} overlaps echo`);
  return {kind,id,name,command,echo,instruments,uniqueInstruments:ids,sequenceBytes:blob.length,
   sampleBytes:bytes,end,esa,free:esa-end,
   commandPresets:kind==='retail'?[...new Set(commands.filter(c=>c.id===id).map(c=>c.p2&15))]:[],
   extraPerEdlStep:echo.edl>1?2048:0};
 };
 const songs=[];
 for(let id=0;id<64;id++){
  const c=canonical.get(id)??null;
  songs.push(row(retail,id,'retail',romEcho(retail,c?c.p2&15:0),c,
   c?null:'unused placeholder; no canonical song command; preset 0 shown explicitly'));
 }
 const built=readFileSync(process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'));
 for(const s of JSON.parse(readFileSync(join(root,'dist/snes/gen/audio/songs.json'),'utf8'))){
  const r=row(built,s.id,'new',s.echo,{id:s.id,p2:0x10,p3:0xFF},s.key);
  assert.equal(r.sampleBytes,s.sampleBytes);assert.equal(r.free,s.free);songs.push(r);
 }
 assert.equal(songs.length,69);
 return songs;
}

// Conservative sequencer control flow: finite loops include their back and
// exit edges. Track state is (PC, instrument, NON); all original tracks have
// no address-dependent jumps (trackBytes asserts that). Noise still decodes
// BRR, so report its dependencies separately, not as reclaimable storage.
export function effectDependencies(rom){
 const ram=effectRam(rom),effects=[];
 for(let id=0;id<0xDC;id++){
  const samples=new Set(),noiseSamples=new Set(),selected=new Set(),tracks=[];
  for(let voice=0;voice<2;voice++){
   const start=word(ram,0x2C00+4*id+2*voice),bytes=trackBytes(ram,start);
   if(!start)continue;
   tracks.push({voice,start,length:bytes.length});
   const back=new Map(),stack=[];
   for(let p=0;p<bytes.length;){
    const op=bytes[p],n=op<0xD2?1:1+ram[0x1484+op-0xD2];
    if(op===0xF0)stack.push(p+n);
    if(op===0xF1){assert.ok(stack.length);back.set(p,stack.pop());}
    p+=n;
   }
   const todo=[[0,4,false]],seen=new Set();
   while(todo.length){
    let [p,ins,noise]=todo.pop();
    if(p>=bytes.length)continue;
    const key=`${p}/${ins}/${noise}`;if(seen.has(key))continue;seen.add(key);
    const op=bytes[p],n=op<0xD2?1:1+ram[0x1484+op-0xD2];
    if(op===0xF2)continue;
    if(op===0xEA)ins=bytes[p+1];
    if(op===0xDE)noise=true;if(op===0xDF)noise=false;
    selected.add(ins);
    if(op<180)(noise?noiseSamples:samples).add(ins);
    if(back.has(p))todo.push([back.get(p),ins,noise]);
    todo.push([p+n,ins,noise]);
   }
  }
  const sorted=s=>[...s].sort((a,b)=>a-b);
  effects.push({id,samples:sorted(samples),noiseSamples:sorted(noiseSamples),selected:sorted(selected),tracks});
 }
 return effects;
}

export function sampleInventory(retail=loadRom(),effects=effectDependencies(retail)){
 const ram=new Uint8Array(65536);for(const c of driverChunks(retail))ram.set(c.bytes,c.addr);
 const samples=[];
 for(let id=0;id<12;id++){
  const start=word(ram,0x1900+4*id),loop=word(ram,0x1902+4*id),tune=word(ram,0x1800+2*id);
  const deps=field=>effects.filter(e=>e[field].includes(id)).map(e=>e.id);
  if(id===11){assert.equal(start,0);samples.push({id,bytes:0,sampleEffects:deps('samples'),noiseEffects:deps('noiseSamples'),note:'No boot DIR entry or BRR payload; ADSR/tuning entry only.'});continue;}
  let end=start;do{assert.ok(end<0x4DF1);end+=9;}while(!(ram[end-9]&1));
  assert.equal(end,id===10?0x4DF1:word(ram,0x1900+4*(id+1)));
  const bytes=end-start;
  samples.push({id,start,end,loop,bytes,blocks:bytes/9,decodedSamples:bytes/9*16,
   loopSamples:(end-loop)/9*16,tune,adsr:word(ram,0x1880+2*id),
   // BRR stores no sample rate. This is an explicitly named pitch anchor,
   // NOT an invented recording rate for an oscillator used across octaves.
   octave5ARate:driverPitch(59,tune&255,tune>>8)*32000/4096,
   sampleEffects:deps('samples'),noiseEffects:deps('noiseSamples')});
 }
 assert.equal(samples.reduce((n,s)=>n+s.bytes,0),1521);
 return samples;
}

export function sequenceSpace(retail=loadRom()){
 const ram=effectRam(retail),used=new Uint8Array(65536),tracks=[];
 for(const e of effectDependencies(retail))for(const t of e.tracks){
  used.fill(1,t.start,t.start+t.length);tracks.push(trackBytes(ram,t.start));
 }
 const gaps=[];
 for(let p=0x3000;p<0x4800;){if(used[p]){p++;continue;}const start=p;while(p<0x4800&&!used[p])p++;gaps.push({start,end:p,bytes:p-start});}
 const unique=[];
 for(const bytes of tracks.sort((a,b)=>b.length-a.length)){
  if(!unique.some(u=>bytes.every((v,i)=>v===u[u.length-bytes.length+i])))unique.push(bytes);
 }
 const minimum=unique.reduce((n,b)=>n+b.length,0),layout=residentLayout(retail,RESIDENT);
 return {gaps,retailSuffixPackedBytes:minimum,retailSuffixSavings:0x1800-minimum,
  round4Capacity:layout.capacity,round4Used:layout.used,round4Spare:layout.capacity-layout.used,
  // Complete repacking also uses the five tiny unreferenced alignment gaps.
  totalSpareAfterFullSuffixPacking:0x1C00-0x370-minimum-layout.used};
}

export function observedRates(rom,effects){
 const rates=Array.from({length:12},()=>({min:null,max:null,effects:[]}));
 for(const e of effects){
  const h=createApu({rom,extension:false});h.ms(60);h.take();h.nativeCmd(2,e.id,15,0x88);
  const touched=new Set();let seen=false;
  for(let ms=0;ms<4000;ms+=2){
   h.ms(2);const mask=h.ram[0xAE];if(mask)seen=true;
   for(let v=0;v<8;v++)if((mask&(1<<v))&&!(h.dspReg(0x3D)&(1<<v))&&h.dspReg(16*v+8)){
    const id=h.dspReg(16*v+4),pitch=(h.dspReg(16*v+2)|(h.dspReg(16*v+3)<<8))&0x3FFF;
    if(id>=12)continue;
    const r=rates[id],rate=pitch*32000/4096;
    r.min=r.min===null?rate:Math.min(r.min,rate);r.max=r.max===null?rate:Math.max(r.max,rate);touched.add(id);
   }
   if(seen&&!mask)break;
  }
  for(const id of touched)rates[id].effects.push(e.id);
  if(e.id%32===0)console.log(`sample rates: effect $${hex(e.id)}`);
 }
 return {window:'2 ms observations, first 4 seconds per effect, centred 02 ee 0F 88; noise excluded; not a proof of all possible pitches',samples:rates};
}

export function audit({trace=null,rates=false}={}){
 mkdirSync(out,{recursive:true});
 const retail=loadRom(),effects=effectDependencies(retail),samples=sampleInventory(retail,effects),songs=songInventory(retail);
 const shipping=readFileSync(process.env.SNES_ROM??join(root,'dist/snes/secret-of-goku.sfc'));
 const scan=staticAudit(retail),commands=trace?JSON.parse(readFileSync(trace,'utf8')).commands:[];
 if(trace)assert.ok(Array.isArray(commands)&&commands.length,'trace has no commands');
 const counts={};for(const c of commands)counts[c.id]=(counts[c.id]??0)+1;
 const evidence={trace:trace?{file:trace,sha256:hash(readFileSync(trace)),commands:commands.length,counts}:null,
  staticSource:'retail ROM (conservative; includes events replaced by the mod)',
  events:scan.events,literals:scan.literals,calls:scan.calls,
  limitation:'Event reachability and computed combat/animation ids are not proven by literal scans or finite traces. No sample is certified unused.'};
 for(const s of samples){
  const ids=[...new Set([...s.sampleEffects,...s.noiseEffects])];
  s.tracedEffects=ids.filter(id=>counts[id]).map(id=>({id,commands:counts[id]}));
  s.eventEffects=ids.filter(id=>scan.events.some(e=>e.effect===id));
  s.literalEffects=ids.filter(id=>scan.literals.some(e=>e.effect===id));
 }
 const selectors={retail:songInstrumentSelectors(retail),shipping:songInstrumentSelectors(shipping)};
 for(const rows of Object.values(selectors))for(const r of rows)assert.ok(r.instruments.every(i=>i<0x30));
 const result={retailSha256:hash(retail),shippingSha256:hash(shipping),songs,samples,effects,evidence,selectors,sequenceSpace:sequenceSpace(retail)};
 if(rates)result.rates=observedRates(retail,effects);
 else if(existsSync(join(out,'storage.json')))result.rates=JSON.parse(readFileSync(join(out,'storage.json'))).rates;
 writeFileSync(join(out,'storage.json'),JSON.stringify(result,null,2)+'\n');
 console.table(songs.filter(s=>s.command).sort((a,b)=>a.free-b.free).slice(0,20).map(s=>({kind:s.kind,id:hex(s.id),EDL:s.echo.edl,end:hex(s.end,4),free:s.free})));
 console.log('Sequence space:',result.sequenceSpace);
 return result;
}
if(process.argv[1]===import.meta.filename)audit({trace:process.argv.find(a=>a.startsWith('--trace='))?.slice(8),rates:process.argv.includes('--rates')});
