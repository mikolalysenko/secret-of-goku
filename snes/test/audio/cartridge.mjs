// Read opt-in audio data from the built ROM, never from the latest generator
// output (another variant may have been built since this cartridge).
export const isCustom=rom=>(rom[0x30134]|rom[0x30135]<<8)===0x5000;
export function uploadSegments(rom){
 if(rom[0x30106]!==0x5C)return [];
 const ptr=a=>(rom[a]|rom[a+1]<<8|rom[a+2]<<16)&0x3FFFFF;
 const boot=ptr(0x30107);if(rom[boot+7]!==0xBF)throw Error('audio boot layout changed');
 let p=ptr(boot+8)-2;const out=[];
 for(;;){const addr=rom[p]|rom[p+1]<<8,n=rom[p+2]|rom[p+3]<<8;if(!n)break;
  out.push({addr,bytes:rom.subarray(p+4,p+4+n)});p+=4+n;}
 return out;
}
export function customSegments(rom){return isCustom(rom)?uploadSegments(rom).filter(s=>s.addr===0x4DF1||[0x1860,0x18E0,0x19C0,0x0BED,0xFFFB].includes(s.addr)):[];}
export function nativeIds(rom,ids){return ids.map((v,i)=>isCustom(rom)&&i===6?0xED:v);}
