// Main-CPU/audio timing prelude for existing suites, without altering input.
// node snes/test/audio/profile.mjs ROM [output.lua]
// SNES_LUA_PRELUDE=<output.lua> SNES_ROM=<ROM> node snes/test/frieza/run.mjs battle
// node snes/test/audio/profile.mjs --read path/to/audio-profile.csv [...]
// node snes/test/audio/profile.mjs --compare voice-on.csv voice-muted.csv
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function profilePrelude(path,{muteRare=false}={}){
 const rom=readFileSync(path),sym=new Map([...readFileSync(path.replace(/\.sfc$/,'.sym'),'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\S+)$/gmi)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
 const start=sym.get('audio_frame'),off=start&0x3FFFFF,ends=[];
 // Both the idle early return and the full service end with PLP / RTL.
 for(let p=off;p<off+180;p++)if(rom[p]===0x28&&rom[p+1]===0x6B){ends.push((start&0xFF0000)|(p&0xFFFF));if(p>=off+20&&!sym.has('audio_frame_done'))break;if(ends.at(-1)===sym.get('audio_frame_done'))break;}
 if(!ends.length)throw Error('audio_frame return not found');
 return `local f=assert(io.open(H_OUT..'/audio-profile.csv','w'))
local function row(event,value,lines)
 local s=emu.getState()
 f:write(string.format('%d,%s,%d,%.6f,%d,%d,%d,%d,%d,%d\\n', H and H.frame or 0,event,value or 0,lines or 0,s['ppu.scanline'],H.r16(0x7E00DC),H.r8(0x7EDBC0),H.r8(0x7EDBC1),H.r8(0x316181),H.r8(0x7E00D0)))
 f:flush()
end
local start,stream,which,dispatch
emu.addMemoryCallback(function() start=emu.getState().masterClock; stream=false; which=H.r8(0x7EDD21) end,emu.callbackType.exec,${start},${start})
for _,p in ipairs({${ends.join(',')}}) do emu.addMemoryCallback(function()
 if start then row(stream and 'stream' or 'audio',which,(emu.getState().masterClock-start)/1364); start=nil end
end,emu.callbackType.exec,p,p) end
emu.addMemoryCallback(function(_,v) if v==0x8A and start then stream=true;which=H.r8(0x7EDD21) end end,emu.callbackType.write,0x2140,0x2140)
emu.addMemoryCallback(function() local a=emu.getState()['cpu.a']&255;if a>=28 and a<=30 then row('request',a) end end,emu.callbackType.exec,${sym.get('audio_sfx')},${sym.get('audio_sfx')})
${muteRare?`-- Keep the resident selector and busy-drop path identical. Suppress only
-- pending streams at their service entry; replacing cue ids changes timing
-- even for requests that would never play.
emu.addMemoryCallback(function() H.w8(0x7EDD5A,0) end,emu.callbackType.exec,${sym.get('audio_rare_service')},${sym.get('audio_rare_service')})`:''}
emu.addMemoryCallback(function() row('nmi',H.r8(0x7E00EC)&1==0 and 1 or 0) end,emu.callbackType.exec,0x00C0A8,0x00C0A8)
emu.addMemoryCallback(function() if H.r8(0x7E1E00)==2 then dispatch=emu.getState().masterClock end end,emu.callbackType.exec,0xC30004,0xC30004)
emu.addMemoryCallback(function() if dispatch then row('dispatch',0,(emu.getState().masterClock-dispatch)/1364);dispatch=nil end end,emu.callbackType.exec,0xC30197,0xC30197)
`;
}
export function summarize(path){
 const rows=readFileSync(path,'utf8').trim().split('\n').map(l=>l.split(',')),out={};
 for(const r of rows){
  const [frame,event,value,lines,line,map,vg,phase,fz,script]=r.map((v,i)=>i===1?v:Number(v));
  const key=event==='stream'?`voice-${value}`:event;
  const a=out[key]??={n:0,sum:0,max:0,first:frame};a.n++;a.sum+=lines;a.max=Math.max(a.max,lines);
  if(event==='request')(out.requests??=[]).push({frame,cue:value,line,map,phase,script});
  if(event==='nmi'&&((vg===0x5A&&phase===1)||(fz===6&&script===0))){const b=out.battle??={frames:0,misses:0};b.frames++;b.misses+=value;}
 }
 for(const a of Object.values(out))if(a.n){a.mean=a.sum/a.n;delete a.sum;}
 return out;
}
if(process.argv[1]===import.meta.filename){
 if(process.argv[2]==='--read')for(const p of process.argv.slice(3))console.log(p,JSON.stringify(summarize(p)));
 else if(process.argv[2]==='--compare'){
  const [on,off]=process.argv.slice(3).map(p=>summarize(p).battle);
  if(!on||!off)throw Error('compare requires two fight profiles from the same ROM and input script');
  console.log(JSON.stringify({on,off,addedMisses:on.misses-off.misses}));
  process.exit(on.misses>off.misses?1:0);
 }
 else{const p=resolve(process.argv[3]??'.local/snes-test/audio-work/profile.lua');writeFileSync(p,profilePrelude(resolve(process.argv[2]),{muteRare:process.argv.includes('--mute-rare')}));console.log(p);}
}
