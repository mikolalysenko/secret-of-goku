// Stream clip layout shared by the audio generator and its tests.
// A clip is a run of 36-byte chunks (4 BRR blocks). The SPC extension
// (snes/src/modules/audio/spc/stream.s) plays chunk after chunk, chained
// through the DIR loop pointer: every chunk's last block carries END|LOOP.
// One-shots end with a silent END block (no LOOP), which mutes the voice;
// loops start their body with a filter-0 block so the CPU can wrap to it.
import {brrEncode,BRR_BLOCK} from './audio-brr.mjs';
export const CHUNK_BLOCKS=4,CHUNK_BYTES=CHUNK_BLOCKS*BRR_BLOCK,CHUNK_SAMPLES=CHUNK_BLOCKS*16;
export const SILENT_BLOCK=[0,0,0,0,0,0,0,0,0];

// pcm: Float32 at the stream rate. Returns {bytes, chunks, loopChunk, snr}.
// loop: true → the whole clip loops (length is padded with silence to whole
// chunks, so loops should be authored to a multiple of CHUNK_SAMPLES).
export function buildStreamClip(pcm,{loop=false,gain=1}={}){
 const {bytes:brr,blocks,snr}=brrEncode(pcm,{gain,resetAt:new Set([0])});
 const out=[];
 for(let b=0;b<blocks;b++)out.push(Array.from(brr.subarray(b*9,b*9+9)));
 if(!loop)out.push([0x01,0,0,0,0,0,0,0,0]);// mute + end
 while(out.length%CHUNK_BLOCKS)out.push([...SILENT_BLOCK]);
 for(let b=CHUNK_BLOCKS-1;b<out.length;b+=CHUNK_BLOCKS){
  const finalChunk=!loop&&b>=out.length-CHUNK_BLOCKS;
  if(!finalChunk)out[b][0]|=0x03;
 }
 const bytes=Uint8Array.from(out.flat());
 return {bytes,chunks:bytes.length/CHUNK_BYTES,loopChunk:loop?0:-1,snr};
}
