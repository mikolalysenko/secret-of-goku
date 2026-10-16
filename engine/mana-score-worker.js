// Renders the Mana-instrument cues off the main thread. The cartridge bytes
// arrive once; each rendered cue goes back as transferable PCM.
import {readManaInstruments} from './mana-instruments.js';
import {renderSpcScoreSync} from './spc-score.js';
import {arrangements} from './mana-arrangements.js';
let bank=null;
self.onmessage=({data})=>{
 try{
  if(data.rom){bank=readManaInstruments(new Uint8Array(data.rom));if(!bank)throw Error('Secret of Mana instrument bank not found in this ROM');}
  for(const key of data.render??[]){
   if(!bank)throw Error('No instrument bank');
   const {left,right,rate}=renderSpcScoreSync(bank,arrangements[key]());
   self.postMessage({key,left,right,rate},[left.buffer,right.buffer]);
  }
 }catch(error){self.postMessage({error:error.message});}
};
