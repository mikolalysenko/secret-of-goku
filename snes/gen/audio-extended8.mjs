import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {effectOffset} from './audio-resident-storage.mjs';
import {brrEncode} from './audio-brr.mjs';
import {arc8,teleport8} from './audio-design8.mjs';
import {DESIGN8} from './audio-resident7.mjs';

export const EXT_RESERVE=0x1F00;
export function buildExtended8(compact){
 const bytes=new Uint8Array(EXT_RESERVE-2);let at=0;
 const add=(pcm,loop=-1)=>{
  const b=brrEncode(pcm,{resetAt:new Set(loop<0?[0]:[0,loop/16])});
  b.bytes[b.bytes.length-9]|=loop<0?1:3;
  const s={addr:at,loop:at+Math.max(0,loop)/16*9,bytes:b.bytes.length,snr:b.snr,frames:pcm.length};
  bytes.set(b.bytes,at);at+=b.bytes.length;return s;
 };
 // 32 ms attack + 432 ms of irregular arc texture, twice the compact
 // decoding rate. The native envelope provides the release and room echo.
 const wave=new Float32Array(5568);
 wave.set(arc8(384,12000,DESIGN8,{attack:384}));wave.set(arc8(5184,12000,DESIGN8),384);
 const beam=add(wave,384),teleport=add(teleport8());
 const source=id=>compact.sequences.find(s=>s.id===id)??compact.layout.tracks.find(s=>s.id===id&&s.voice===0);
 const ptrs={};
 for(const id of [0xEA,0xEB,0xEF,0xF0]){
  let seq=Array.from(source(id).bytes);
  if(id===0xEA||id===0xF0){const p=seq.indexOf(0xE4);assert.equal(seq[p+1],3);seq[p+1]=4;}
  else seq=[0xD2,id===0xEB?0xB8:0x72,0xEA,0x33,0xE4,4,0x89,0xF2];
  ptrs[id]=at;bytes.set(seq,at);at+=seq.length;
 }
 assert.ok(at<=bytes.length,'extended SFX bank overflow');
 const second=id=>{const b=compact.pointers.find(p=>p.addr===0x2C00+id*4).bytes;return b[2]|b[3]<<8;};
 const dir=compact.samples.slice(2).flatMap(s=>[s.addr,s.addr+Math.max(0,s.loop)]);
 const extended=[beam.addr,beam.loop,teleport.addr,teleport.loop,
  ptrs[0xEA],second(0xEA),ptrs[0xEB],0,ptrs[0xEF],0,ptrs[0xF0],second(0xF0)];
 const fallback=[...dir,source(0xEA).addr,second(0xEA),source(0xEB).addr,0,source(0xEF).addr,0,source(0xF0).addr,second(0xF0)];
 const activation=new Uint8Array(72),word=(a,v)=>{activation[a]=v&255;activation[a+1]=v>>8;};
 extended.slice(0,4).forEach((v,i)=>word(i*2,v));
 activation.set(compact.segments.find(s=>s.addr===0x19D0).bytes.slice(0,28),8);
 const rom=readFileSync(new URL('../../rom/secret-of-mana-us.sfc',import.meta.url));
 activation.set(rom.subarray(effectOffset(0x2FA8),effectOffset(0x2FCC)),36);
 for(const p of [...compact.layout.patches,...compact.pointers])for(let j=0;j<p.bytes.length;j++)if(p.addr+j>=0x2FA8&&p.addr+j<0x2FCC)activation[36+p.addr+j-0x2FA8]=p.bytes[j];
 for(const id of [0xEA,0xEB,0xEF,0xF0])word(36+(id-0xEA)*4,ptrs[id]);
 return {bytes:bytes.slice(0,Math.ceil(at/36)*36),used:at,reserve:EXT_RESERVE,beam,teleport,extended,fallback,relocation:0x055F,activation:Array.from(activation)};
}
export function extended8Asm(bank,caps){
 return [
  `!AUDIO_EXT_RESERVE = ${bank.reserve}`,`!AUDIO_EXT_BYTES = ${bank.bytes.length}`,
  'audio_extended_header:', ' db "SOGSFX8",0',
  ` dw ${bank.reserve},${bank.bytes.length}`, ' dl audio_extended_bank',
  ` dw ${bank.beam.addr},${bank.beam.loop},${bank.teleport.addr},${bank.teleport.loop}`,
  ' dl audio_extended_tables_data',
  'audio_extended_tables_data:',` dw ${[...bank.extended,...bank.fallback].join(',')}`,
  'audio_extended_destinations:', ' dw $19C8,$2FA8,$2FBC',
  'audio_extended_activation:',` db ${bank.activation.join(',')}`,
  'audio_extended_required:',` dw ${caps.map(c=>c.end).join(',')}`,
  'audio_extended_bank:', ' incbin "audio/extended.bin"',
 ].join('\n')+'\n';
}
