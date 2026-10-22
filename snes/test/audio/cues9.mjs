// Round-nine cartridge cue renders on the ROM's own SPC image (APU harness),
// isolated over a silent song that carries the field song's echo, plus the
// field music alone. Measurements in loudness.mjs; tables in report9.mjs.
import {createApu,loadSong,romSong,romEcho} from './apu.mjs';
import {extendedInfo,impactId} from './cartridge.mjs';
import {int16Stereo} from './loudness.mjs';
export const FIELD_SONG=0x1C,FIELD_PRESET=10;
export const FRAME=1000/60.0988;
// Charge/aura bed rows exactly as gen/audio.mjs packs them, quantized as
// beds.asm sends them (level & $F0, rate & $FC, one update per 12 frames).
const byte=n=>Math.max(0,Math.min(255,Math.round(n)));
export function bedRow(f,ssj){
 return {level:byte((.48+.52*f)*255)&0xF0,rate:byte((.94+.12*f)*128)&0xFC,aura:ssj&&f>.35?byte(f*255)&0xF0:0,arate:128};
}
export function silentSong(h,rom,echo){
 const blob=Buffer.alloc(21);blob.writeUInt16LE(0x1A14,0);
 for(let i=2;i<20;i+=2)blob.writeUInt16LE(0x1A14,i);blob[20]=0xF2;
 loadSong(h,rom,{blob,instruments:[],echo,song:0x3B,p2:FIELD_PRESET,p3:255});
 h.ms(300);h.take();
}
// The completed optional bank, as extended.test.mjs installs it.
export function installExtended(h,rom,base=0xA000){
 const ext=extendedInfo(rom);if(!ext)return false;
 h.ram.set(ext.bytes,base);
 for(let i=0;i<12;i++){
  const a=[0x19C8,0x2FA8,0x2FBC][i>>2]+(i&3)*2,v=ext.words[i]+((ext.relocation>>i)&1?base:0);
  h.ram[a]=v&255;h.ram[a+1]=v>>8;
 }
 return true;
}
export function fieldEcho(rom){return romEcho(rom,FIELD_PRESET);}
// script(h, wait) issues commands; wait(ms) advances the APU.
export function renderCart(rom,script,{seconds=1.5,extended=false,echo=fieldEcho(rom)}={}){
 const h=createApu({rom});h.ms(60);
 silentSong(h,rom,echo);
 if(extended&&!installExtended(h,rom))return null;
 h.take();let t=0;
 const wait=ms=>{h.ms(ms);t+=ms;};
 script(h,wait);
 if(t<seconds*1000)h.ms(seconds*1000-t);
 const {l,r}=h.take();
 return int16Stereo(l.slice(0,Math.round(seconds*32000)),r.slice(0,Math.round(seconds*32000)));
}
export function renderMusic(rom,{song=FIELD_SONG,preset=FIELD_PRESET,seconds=20,echo=true}={}){
 const h=createApu({rom});h.ms(60);
 const s=romSong(rom,song),e=romEcho(rom,preset);
 loadSong(h,rom,{blob:s.blob,instruments:s.instruments,echo:echo?e:{...e,evol:0,efb:0},song,p2:preset,p3:255});
 h.waitFor(()=>h.ram[0xAD]!==0,4e7);h.ms(1000);h.take();h.ms(seconds*1000);
 const {l,r}=h.take();return int16Stereo(l,r);
}
const cmd=id=>(h,wait)=>{h.nativeCmd(2,id,0x0F,0x88);wait(1);};
// Charge from its first frame: ED (and EE in SSJ) at the in-game cadence.
export const chargeScript=(ssj,frames=72)=>(h,wait)=>{
 let sentLevel=-1,sentAura=-1;
 for(let f=0;f<frames;f++){
  if(f%12===0){
   const row=bedRow(Math.min(1,f/(ssj?45:90)),ssj);
   if(row.level!==sentLevel){h.nativeCmd(0x81,0xED,row.level,row.rate);sentLevel=row.level;}
   if(ssj&&row.aura!==sentAura){h.nativeCmd(0x81,0xEE,row.aura,row.arate);sentAura=row.aura;}
  }
  wait(FRAME);
 }
};
// Default cue set for the round-nine tables (see report9.mjs). IMPACT is
// the cartridge's own mapping: retail $38 before round nine, $7E after.
export const cartCues=rom=>({...CART_CUES,kiContact:{script:cmd(impactId(rom)),seconds:1.2}});
export const CART_CUES={
 hit:{script:cmd(0xE7),seconds:1.2},
 kick:{script:cmd(0xE8),seconds:1.2},
 kickSsj:{script:cmd(0xF1),seconds:1.2},
 ki:{script:cmd(0xDE),seconds:1.2},
 kiSsj:{script:(h,wait)=>{h.nativeCmd(2,0xDE,0x0D,0x88);wait(1);},seconds:1.2},
 kiContact:{script:cmd(0x38),seconds:1.2},
 chargeStart:{script:chargeScript(false),seconds:1.2},
 chargeStartSsj:{script:chargeScript(true),seconds:1.2},
 charged:{script:cmd(0xDF),seconds:1.2},
 release:{script:cmd(0xEA),seconds:1.6},
 releaseSsj:{script:cmd(0xF0),seconds:1.6},
};
// Three consecutive HITs rotate the three pitches; measure each.
export function hitVariants(rom){
 const h=createApu({rom});h.ms(60);silentSong(h,rom,fieldEcho(rom));
 return [0,1,2].map(()=>{h.take();h.nativeCmd(2,0xE7,0x0F,0x88);h.ms(1200);const {l,r}=h.take();return int16Stereo(l,r);});
}
