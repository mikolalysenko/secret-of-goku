// Round-nine targets: each cue's loudness against the field song must match
// or exceed the PC edition's. References measured by report9.mjs (PC chain
// in Chromium against the echo-less field song at the browser's .4 gain):
// max momentary LU over the integrated music; small = both high-passed at
// 200 Hz; band = loudest 400 ms of 0.5–5 kHz over the music's mean.
import {renderCart,renderMusic,cartCues} from './cues9.mjs';
import {cueMetrics,musicMetrics,momentary} from './loudness.mjs';
export const PC={
 hit1:{lu:14.7,small:15.7,band:17.0},hitMean:{lu:11.8,small:12.6,band:13.9},
 kick:{lu:16.7,small:17.5,band:18.4},blast:{lu:9.7,small:10.8,band:11.9},
 impact:{lu:10.9,small:11.7,band:13.5},
 chargeStart:{lu:10.0,small:11.2,band:14.0},chargeStartSsj:{lu:12.6,small:13.7,band:16.2},
 charged:{lu:4.8,small:5.9,band:5.7},
 beamRelease:{lu:17.2,small:18.2},beamSustain:{lu:16.6,small:17.7},
};
const cache=new WeakMap();
export function fieldMusic(rom){
 if(!cache.has(rom))cache.set(rom,musicMetrics(renderMusic(rom),32000));
 return cache.get(rom);
}
// Ratios of one cartridge cue (cues9.mjs names) against the ROM's own field song.
export function cueRatios(rom,name){
 const c=cartCues(rom)[name],x=renderCart(rom,c.script,{seconds:c.seconds}),m=cueMetrics(x,32000),music=fieldMusic(rom);
 return {...m,pcm:x,lu:m.momentaryLufs-music.integratedLufs,small:m.smallLufs-music.smallLufs,band:m.bandMaxDb-music.bandMeanDb};
}
// Release / sustain windows of a wave render (starts 0–0.2 s / 0.4–0.8 s).
export function waveWindows(x,{small=false}={}){
 const m=momentary(x,32000,{small}),pm=a=>10*Math.log10(a.reduce((s,v)=>s+10**(v/10),0)/a.length);
 return {release:Math.max(...m.filter(w=>w.start<=.2).map(w=>w.lufs)),sustain:pm(m.filter(w=>w.start>=.4&&w.start<=.8).map(w=>w.lufs))};
}
// Attack: onset (−60 dB of peak) to the first 2 ms RMS window within 3 dB of
// the loudest. A crunch plateau's single largest sample can fall anywhere
// in the plateau, so time-to-peak is not an attack measure for it.
export function attackMs(pcm,rate=32000){
 let peak=0;for(const v of pcm)peak=Math.max(peak,Math.abs(v));
 const onset=pcm.findIndex(v=>Math.abs(v)>peak*.001),n=Math.round(rate*.002),rms=[];
 for(let p=onset;p+n<=pcm.length;p+=n){let e=0;for(let i=p;i<p+n;i++)e+=pcm[i]*pcm[i];rms.push(Math.sqrt(e/n));}
 const top=Math.max(...rms);return rms.findIndex(v=>v>=top/Math.SQRT2)*2;
}
