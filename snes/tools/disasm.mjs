#!/usr/bin/env node
// Coverage-guided 65816 disassembler for the HiROM cartridge.
//   node snes/tools/disasm.mjs C0:4053 [count=40] [--m8|--m16] [--x8|--x16] [--rom=path]
// Instruction flags come from dist/snes/analysis/coverage.bin when present
// (built by snes/tools/trace.mjs); otherwise from the flags given (default
// 8-bit A and index) and tracked through REP/SEP. Bytes never executed in the
// trace are marked with '?' so data is not mistaken for code.
import {readFileSync,existsSync} from 'node:fs';
import {decode,hiromToPc,hex} from './w65816.mjs';
const args=process.argv.slice(2);
const romPath=args.find(a=>a.startsWith('--rom='))?.slice(6)??'rom/secret-of-mana-us.sfc';
const rom=new Uint8Array(readFileSync(romPath));
const covPath=(process.env.SNES_ANALYSIS??'dist/snes/analysis')+'/coverage.bin';
const cov=existsSync(covPath)?new Uint8Array(readFileSync(covPath)):null;
const pos=args.filter(a=>!a.startsWith('--'));
const parse=s=>parseInt(s.replace(/[:$]/g,''),16);
let pc=parse(pos[0]??'C08004');
const count=Number(pos[1]??40);
let m=!args.includes('--m16'),x=!args.includes('--x16');
const read=a=>{const o=hiromToPc(a,rom.length);return o>=0&&o<rom.length?rom[o]:0;};
const lines=[];
for(let i=0;i<count;i++){
 const off=hiromToPc(pc),c=cov&&off>=0?cov[off]:0;
 let mm=m,xx=x,mark=' ';
 if(c&1){if((c&6)===2)mm=true;else if((c&6)===4)mm=false;if((c&24)===8)xx=true;else if((c&24)===16)xx=false;if((c&6)===6||(c&24)===24)mark='*';}
 else if(cov)mark='?';
 const d=decode(read,pc,mm,xx);
 const bytes=d.bytes.map(hex.h2).join(' ');
 lines.push(`${mark}${hex.h2(pc>>16)}:${hex.h4(pc&0xffff)}  ${bytes.padEnd(12)} ${d.name} ${d.text}${mm?'':' ;m16'}${xx?'':' ;x16'}`);
 m=mm;x=xx;
 if(d.op===0xC2){if(d.bytes[1]&0x20)m=false;if(d.bytes[1]&0x10)x=false;}
 if(d.op===0xE2){if(d.bytes[1]&0x20)m=true;if(d.bytes[1]&0x10)x=true;}
 pc=(pc&0xff0000)|((pc+d.len)&0xffff);
}
console.log(lines.join('\n'));
if(cov)console.log("\n(* = ran with both flag widths; ? = never executed in trace)");
