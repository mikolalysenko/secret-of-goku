// Songs $3B-$3F: render the generated sequences through the cartridge's own
// driver (APU harness) and compare them with the browser's renderer
// (engine/spc-score.js on the same instrument bank): level, per-bar loudness
// envelope and octave-band spectrum.
//   node snes/test/audio/songs.mjs [--calibrate] [--wav]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApu,loadRom,loadSong,wav} from './apu.mjs';
import {readManaInstruments} from '../../../engine/mana-instruments.js';
import {renderSpcScoreSync} from '../../../engine/spc-score.js';
import {arrangements} from '../../../engine/mana-arrangements.js';
import {SONGS,buildSongs} from '../../gen/audio.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
export const BROWSER_GAIN=0.32;   // frieza-score.js output gain

// Render a compiled song for `seconds` through the real driver + S-DSP.
export function renderCartridge(rom,song,seconds,{tailSeconds=0,alignStart=false}={}){
 const h=createApu({rom});h.ms(60);
 loadSong(h,rom,{blob:song.blob,instruments:song.ids,echo:song.echo,song:song.id,
  p2:song.p2??0x0F,p3:song.p3??0xFF});
 if(alignStart)h.waitFor(()=>h.ram[0xAD]!==0,4e7);
 h.ms(20);h.take();
 const tracks=[];
 for(let i=0;i<seconds*10;i++){h.ms(100);tracks.push(h.ram[0xAD]);}
 const {l,r}=h.take();
 let tail=null;
 if(tailSeconds){
  // Diagnostic cut: stop new notes and key off all voices, keeping the
  // echo ring, EON, FIR and feedback alive. The first ~8 ms include release.
  // A native stop/fade would change the experiment's input/envelope too.
  h.ram[0xAD]=0;h.ram[0xAF]=0;h.ram[0xB0]=0xFF;h.dsp.write(0x5C,0xFF);
  h.ms(tailSeconds*1000);const t=h.take();
  tail={l:Float32Array.from(t.l,v=>v/32768),r:Float32Array.from(t.r,v=>v/32768)};
 }
 return {l:Float32Array.from(l,v=>v/32768),r:Float32Array.from(r,v=>v/32768),tracks,tail};
}
export function renderBrowser(rom,key){
 const bank=readManaInstruments(rom),out=renderSpcScoreSync(bank,arrangements[key]());
 return {l:out.left.map(v=>v*BROWSER_GAIN),r:out.right.map(v=>v*BROWSER_GAIN),duration:out.duration};
}
const rms=a=>{let e=0;for(const v of a)e+=v*v;return Math.sqrt(e/a.length);};
const db=x=>20*Math.log10(Math.max(x,1e-9));
// loudness per bar (dB)
export function barEnvelope(a,bpm,bars,rate=32000){
 const n=Math.round(4*60/bpm*rate),out=[];
 for(let b=0;b<bars&&(b+1)*n<=a.length;b++)out.push(db(rms(a.subarray(b*n,(b+1)*n))));
 return out;
}
// energy in octave bands 62.5 Hz … 8 kHz (dB), by FFT-free band-pass bank
export function octaveBands(a,rate=32000){
 const centers=[62.5,125,250,500,1000,2000,4000,8000],out=[];
 for(const f of centers){
  // two cascaded 2-pole band-pass filters (Q ≈ 1.4)
  const w=2*Math.PI*f/rate,q=1.41,alpha=Math.sin(w)/(2*q),b0=alpha,a0=1+alpha,a1=-2*Math.cos(w),a2=1-alpha;
  let x1=0,x2=0,y1=0,y2=0,X1=0,X2=0,Y1=0,Y2=0,e=0;
  for(let i=0;i<a.length;i++){
   const y=(b0*a[i]-b0*x2-a1*y1-a2*y2)/a0;x2=x1;x1=a[i];y2=y1;y1=y;
   const z=(b0*y-b0*X2-a1*Y1-a2*Y2)/a0;X2=X1;X1=y;Y2=Y1;Y1=z;e+=z*z;
  }
  out.push(db(Math.sqrt(e/a.length)));
 }
 return out;
}
const corr=(x,y)=>{const n=Math.min(x.length,y.length);let mx=0,my=0;for(let i=0;i<n;i++){mx+=x[i];my+=y[i];}mx/=n;my/=n;let sxy=0,sx=0,sy=0;for(let i=0;i<n;i++){sxy+=(x[i]-mx)*(y[i]-my);sx+=(x[i]-mx)**2;sy+=(y[i]-my)**2;}return sxy/Math.sqrt(sx*sy||1);};

export async function compareSongs({seconds=null,write=false}={}){
 const rom=loadRom(),songs=await buildSongs(repo,rom),out=[];
 for(const s of songs){
  const score=arrangements[s.key](),len=s.score.bars*4*60/score.bpm;
  const secs=seconds??Math.ceil(len+4);
  const cart=renderCartridge(rom,s,secs),web=renderBrowser(rom,s.key);
  const n=Math.min(Math.round(len*32000),cart.l.length,web.l.length);
  const c=cart.l.subarray(0,n),w=web.l.subarray(0,n);
  const envC=barEnvelope(c,score.bpm,score.bars),envW=barEnvelope(w,score.bpm,score.bars);
  const bandC=octaveBands(c),bandW=octaveBands(w);
  const lc=rms(c),lw=rms(w);
  let peak=0;for(const v of c)peak=Math.max(peak,Math.abs(v));
  const r={id:s.id,key:s.key,seconds:n/32000,levelDb:db(lc)-db(lw),cartRms:lc,webRms:lw,peak,envelopeCorr:corr(envC,envW),
   bandDiffDb:bandC.map((x,i)=>(x-db(lc))-(bandW[i]-db(lw))),allTracks:cart.tracks.slice(5).every(t=>t===0xFF),
   master:s.master,suggestedMaster:Math.max(1,Math.min(255,Math.round(s.master*lw/lc))),bytes:s.blob.length};
  out.push(r);
  if(write){mkdirSync(resolve(repo,'.local/snes-test/audio'),{recursive:true});writeFileSync(resolve(repo,`.local/snes-test/audio/song-${s.key}-cart.wav`),wav(Int16Array.from(cart.l,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768)))),Int16Array.from(cart.r,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768))))));
   writeFileSync(resolve(repo,`.local/snes-test/audio/song-${s.key}-web.wav`),wav(Int16Array.from(web.l,v=>Math.round(v*32768)),Int16Array.from(web.r,v=>Math.round(v*32768))));}
 }
 return out;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const res=await compareSongs({write:process.argv.includes('--wav')});
 for(const r of res)console.log(`${r.id.toString(16)} ${r.key.padEnd(18)} ${r.seconds.toFixed(0)}s level ${r.levelDb>=0?'+':''}${r.levelDb.toFixed(1)} dB (master ${r.master} → ${r.suggestedMaster}) peak ${r.peak.toFixed(2)} env r=${r.envelopeCorr.toFixed(2)} bands ${r.bandDiffDb.map(x=>x.toFixed(0)).join('/')} tracks ${r.allTracks?'all':'MISSING'} ${r.bytes} B`);
}
