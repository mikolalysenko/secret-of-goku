// RAM-only audition installer; synthesis is shared with the cartridge generator.
import assert from 'node:assert/strict';
import {SAMPLE_BASE,RESERVE,CUSTOM_IDS,customTracks,buildCustom} from '../../gen/audio-custom.mjs';
export {SAMPLE_BASE,RESERVE,INSTRUMENT_BASE,CUSTOM_IDS,buildCustomBank,customTracks} from '../../gen/audio-custom.mjs';

// All four cues coexist at their actual proposed addresses. Do not use the
// audition helper's $3000/$3100 scratch, which overwrites retail effects.
export function installCustom(h,bank,{variant='custom'}={}){
 // Round-five auditions retain their original levels even when this helper
 // is run against an opt-in cartridge with calibrated gains.
 if(h.ram[0x0BED]===0x3F&&h.ram[0x0BEE]===0x80&&h.ram[0x0BEF]===0x55){
  const a=buildCustom({bank}).levelAddress;h.ram.fill(0x40,a,a+7);
 }
 const w=(a,v)=>{h.ram[a]=v&255;h.ram[a+1]=v>>8;};
 for(const s of bank.samples){
  h.ram.set(s.bytes,s.addr);
  w(0x1800+2*s.instrument,s.tune);w(0x1880+2*s.instrument,s.adsr);
  w(0x1900+4*s.instrument,s.addr);w(0x1902+4*s.instrument,s.addr+Math.max(0,s.loop));
 }
 let at=bank.sampleEnd;const seen=new Map(),sequences=[];
 for(const [cue,id] of Object.entries(CUSTOM_IDS)){
  const tracks=customTracks(cue,variant);
  tracks.forEach((bytes,v)=>{
   const key=bytes.join(','),address=seen.get(key)??at;
   if(!seen.has(key)){h.ram.set(bytes,at);seen.set(key,at);sequences.push({cue,voice:v,addr:at,bytes});at+=bytes.length;}
   w(0x2C00+id*4+v*2,address);
  });
 }
 // $ED's pointer uses four bytes of the now-unreferenced round-four shared
 // hit/kick body at $2FB4. All other retail/resident sequences are untouched.
 assert.ok(at<=SAMPLE_BASE+RESERVE,`prototype bank overflow: ${at-SAMPLE_BASE}`);
 return {used:at-SAMPLE_BASE,sequenceBytes:at-bank.sampleEnd,free:SAMPLE_BASE+RESERVE-at,sequences};
}
