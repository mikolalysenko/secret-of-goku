// Secret of Mana's own instrument bank, read from the player's cartridge at
// runtime. Nothing here is copied into the repository: the table location and
// layout are verified against the ROM before any sample is decoded.
//
// US table at C3:3DF9 (file 0x33df9), 33 entries, stored as parallel arrays:
//   33 × 24-bit pointers to [u16 length][BRR blocks]
//   33 × u16 loop offset in bytes (equal to the length for one-shots)
//   33 × u16 tuning; the driver scales its note pitch by low byte f/256
//        (0 = unscaled), which keeps every sample on the same semitone grid
//   33 × ADSR1/ADSR2 register pairs, as the sound driver writes them
export const bankTable=0x33df9,bankSize=33;

// Hardware BRR decode, including the 15-bit wrap after each filter stage.
export function decodeBrr(rom,start,length){
 const out=new Int16Array(length/9*16);let p1=0,p2=0,o=0;
 for(let b=start;b<start+length;b+=9){
  const header=rom[b],shift=header>>4,filter=header>>2&3;
  for(let i=0;i<16;i++){
   let nibble=rom[b+1+(i>>1)]>>(i&1?0:4)&15;if(nibble>7)nibble-=16;
   let s=shift<=12?nibble<<shift>>1:nibble<0?-2048:0;
   if(filter===1)s+=p1+(-p1>>4);
   else if(filter===2)s+=2*p1+(-p1*3>>5)-p2+(p2>>4);
   else if(filter===3)s+=2*p1+(-p1*13>>6)-p2+(p2*3>>4);
   s=Math.max(-32768,Math.min(32767,s));s=s<<17>>16>>1;
   out[o++]=s;p2=p1;p1=s;
  }
 }
 return out;
}

function pointer(rom,i){const a=bankTable+i*3;return rom[a+2]<0xc0?-1:rom[a]|rom[a+1]<<8|rom[a+2]-0xc0<<16;}

// Returns null for any cartridge whose bank does not match this layout.
export function readManaInstruments(rom){
 if(!rom||rom.length<0x200000)return null;
 const u16=a=>rom[a]|rom[a+1]<<8,bank=[];
 for(let i=0;i<bankSize;i++){
  const at=pointer(rom,i);if(at<0||at+2>rom.length)return null;
  const length=u16(at),loop=u16(bankTable+bankSize*3+i*2),tune=rom[bankTable+bankSize*5+i*2];
  if(!length||length%9||loop%9||at+2+length>rom.length)return null;
  const last=rom[at+length-7];if(!(last&1))return null;// the final block carries the END flag
  const looped=(last&2)!==0&&loop<length;
  bank.push({index:i,pcm:decodeBrr(rom,at+2,length),loopStart:looped?loop/9*16:-1,unity:0x1000*(tune||256)/256,
   adsr:[rom[bankTable+bankSize*7+i*2],rom[bankTable+bankSize*7+i*2+1]]});
 }
 return bank;
}
