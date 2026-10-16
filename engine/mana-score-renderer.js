// Renders the arrangements with the instrument bank of the running cartridge.
// A module Worker keeps the ~0.3 s per-cue render off the frame loop; where
// workers are unavailable, the same generator runs in short main-thread slices.
import {readManaInstruments} from './mana-instruments.js';
import {renderSpcScore} from './spc-score.js';
import {arrangements} from './mana-arrangements.js';

export const manaTracks=Object.keys(arrangements);

export function createManaScoreRenderer(rom,onTrack,onError){
 let worker=null,disposed=false,fell=false;
 const copy=rom.slice(0x30000,0x60000),padded=new Uint8Array(rom.length);padded.set(copy,0x30000);
 try{
  worker=new Worker(new URL('./mana-score-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(disposed)return;if(data.error){fallback();return;}onTrack(data.key,data);};
  worker.onerror=event=>{event.preventDefault?.();fallback();};
  // Only the sample bank region is sent; the reader validates the table.
  worker.postMessage({rom:padded.buffer,render:manaTracks},[padded.buffer]);
 }catch{fallback();}
 function fallback(){
  if(fell||disposed)return;fell=true;worker?.terminate();worker=null;
  const bank=readManaInstruments(rom);
  if(!bank){onError('Secret of Mana instrument bank not found in this ROM');return;}
  const queue=[...manaTracks];let job=null,key=null;
  (function step(){
   if(disposed)return;
   if(!job){key=queue.shift();if(!key)return;job=renderSpcScore(bank,arrangements[key]());}
   const r=job.next();if(r.done){onTrack(key,r.value);job=null;}
   setTimeout(step,0);
  })();
 }
 return{dispose(){disposed=true;worker?.terminate();}};
}
