import {readFileSync} from 'node:fs';
import {residentLayout} from '../../gen/audio-resident-storage.mjs';
import {RESIDENT} from '../../gen/audio-resident.mjs';
// Read opt-in audio data from the built ROM, never from the latest generator
// output (another variant may have been built since this cartridge).
export const sampleFloor=rom=>(rom[0x30134]|rom[0x30135]<<8)+0x5F1;
export const isCustom=rom=>sampleFloor(rom)>0x4DF1;
export const isResident7=rom=>sampleFloor(rom)===0x56F1;
export const nativeEffectVoices=(rom,id)=>[0x38,0xE7,0xE8,...(isResident7(rom)?[]:[0xEA,0xED])].includes(id)?2:1;
export function uploadSegments(rom){
 if(rom[0x30106]!==0x5C)return [];
 const ptr=a=>(rom[a]|rom[a+1]<<8|rom[a+2]<<16)&0x3FFFFF;
 const boot=ptr(0x30107);if(rom[boot+7]!==0xBF)throw Error('audio boot layout changed');
 let p=ptr(boot+8)-2;const out=[];
 for(;;){const addr=rom[p]|rom[p+1]<<8,n=rom[p+2]|rom[p+3]<<8;if(!n)break;
  out.push({addr,bytes:rom.subarray(p+4,p+4+n)});p+=4+n;}
 return out;
}
export function customSegments(rom){return isCustom(rom)?uploadSegments(rom).filter(s=>s.addr===0x4DF1||[0x1860,0x18E0,0x19C0,0x19D0,0x0BED,0x0E10,0x0C48,0x14B4,0xFFFB].includes(s.addr)):[];}
export function nativeIds(rom,ids){return ids.map((v,i)=>isResident7(rom)?(i===17?0xEF:v):(isCustom(rom)&&i===6?0xED:v));}

// Historical RAM auditions start from the round-four APU image, never from
// round-seven beds whose sample/code reservation the audition would overwrite.
export function roundFourApuRom(rom){
 const r=Buffer.from(rom),retail=readFileSync(new URL('../../../rom/secret-of-mana-us.sfc',import.meta.url));
 r.set(retail.subarray(0x32139,0x33D39),0x32139);
 for(const p of residentLayout(retail,RESIDENT).patches)r.set(p.bytes,0x32139+p.addr-0x2C00);
 r.writeUInt16LE(0x4800,0x30134);return r;
}
