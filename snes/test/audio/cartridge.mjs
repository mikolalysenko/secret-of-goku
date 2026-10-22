import {readFileSync} from 'node:fs';
import {residentLayout} from '../../gen/audio-resident-storage.mjs';
import {RESIDENT} from '../../gen/audio-resident.mjs';
// Read opt-in audio data from the built ROM, never from the latest generator
// output (another variant may have been built since this cartridge).
export const sampleFloor=rom=>(rom[0x30134]|rom[0x30135]<<8)+0x5F1;
export const isCustom=rom=>sampleFloor(rom)>0x4DF1;
export const isResident7=rom=>sampleFloor(rom)===0x56F1;
export const nativeEffectVoices=(rom,id)=>{const p=0x32139+id*4;return Number(!!(rom[p]|rom[p+1]<<8))+Number(!!(rom[p+2]|rom[p+3]<<8));};
export function extendedInfo(rom){
 const h=Buffer.from(rom).indexOf(Buffer.from('SOGSFX8\0'));if(h<0)return null;
 const word=a=>rom[a]|rom[a+1]<<8,ptr=a=>word(a)|rom[a+2]<<16;
 const reserve=word(h+8),length=word(h+10),address=ptr(h+12),tables=ptr(h+23);
 return {reserve,length,address,tables,relocation:0x055F,
  bytes:rom.subarray(address&0x3FFFFF,(address&0x3FFFFF)+length),
  words:Array.from({length:24},(_,i)=>word((tables&0x3FFFFF)+2*i))};
}
export function uploadSegments(rom){
 if(rom[0x30106]!==0x5C)return [];
 const ptr=a=>(rom[a]|rom[a+1]<<8|rom[a+2]<<16)&0x3FFFFF;
 const boot=ptr(0x30107);if(rom[boot+7]!==0xBF)throw Error('audio boot layout changed');
 let p=ptr(boot+8)-2;const out=[];
 for(;;){const addr=rom[p]|rom[p+1]<<8,n=rom[p+2]|rom[p+3]<<8;if(!n)break;
  out.push({addr,bytes:rom.subarray(p+4,p+4+n)});p+=4+n;}
 return out;
}
export function customSegments(rom){
 const all=uploadSegments(rom),at=all.findIndex(s=>s.addr===0x4DF1);
 return isCustom(rom)&&at>=0?all.slice(at):[];
}
// Round nine fills the empty retail row $7E with the ki contact (IMPACT).
export const KI_CONTACT_ROW=0x7E,SPRING_ROW=0x7D;
export const isRound9=rom=>isResident7(rom)&&!!(rom[0x32139+KI_CONTACT_ROW*4]|rom[0x3213A+KI_CONTACT_ROW*4]);
export const impactId=rom=>isRound9(rom)?KI_CONTACT_ROW:0x38;
export function nativeIds(rom,ids){return ids.map((v,i)=>isResident7(rom)?(i===17?0xEF:i===6?impactId(rom):v):(isCustom(rom)&&i===6?0xED:v));}

// Historical RAM auditions start from the round-four APU image, never from
// round-seven beds whose sample/code reservation the audition would overwrite.
export function roundFourApuRom(rom){
 const r=Buffer.from(rom),retail=readFileSync(new URL('../../../rom/secret-of-mana-us.sfc',import.meta.url));
 r.set(retail.subarray(0x32139,0x33D39),0x32139);
 for(const p of residentLayout(retail,RESIDENT).patches)r.set(p.bytes,0x32139+p.addr-0x2C00);
 r.writeUInt16LE(0x4800,0x30134);return r;
}
