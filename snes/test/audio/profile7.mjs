// Settled idle cost, using the exact perf states and modprof call boundaries.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
import {hiromToPc} from '../../tools/w65816.mjs';
const root=resolve('.local/snes-test/audio'),report=[];
for(const [tag,path] of [['r4','baseline7/r4.sfc'],['r7','round7.sfc']]){
 const rom=join(root,path),bytes=readFileSync(rom),sym=readFileSync(rom.replace('.sfc','.sym'),'utf8');
 const label=n=>{const m=sym.match(new RegExp('^([A-F0-9]{2}):([A-F0-9]{4}) '+n+'$','mi'));return parseInt(m[1]+m[2],16);};
 let at=label('modules_field_frame');const target=label('audio_frame');
 for(;;at+=4){const o=hiromToPc(at,bytes.length);if(bytes[o]!==0x22)throw Error('audio call not found');if(bytes.readUIntLE(o+1,3)===target)break;}
 for(const scene of ['preset__sword','preset__battle']){
  const test=`local measuring=false;local stamp=nil;local samples={}\nemu.addMemoryCallback(function() if measuring then stamp=emu.getState().masterClock end end,emu.callbackType.exec,${at},${at})\nemu.addMemoryCallback(function() if stamp then samples[#samples+1]=(emu.getState().masterClock-stamp)/1364;stamp=nil end end,emu.callbackType.exec,${at+4},${at+4})\nfunction test() H.wait(60);measuring=true;for i=1,300 do H.hold(({'left','right','up','down'})[(i//40)%4+1],1) end;measuring=false;H.result('samples',samples) end`;
  const copy=privateRom(rom,'audio-idle-'+tag);let r;
  try{r=await runMesen({rom:copy,state:resolve('.local/snes-test/perf/states',scene,'scene.mss'),test,outDir:join(root,'final7/idle-'+tag+'-'+scene)});}finally{cleanupRom(copy);}
  if(r.code!==0||!r.results?.samples?.length)throw Error(JSON.stringify(r.results??r.output));
  const a=r.results.samples,row={tag,scene,calls:a.length,meanLines:a.reduce((x,y)=>x+y,0)/a.length,maxLines:Math.max(...a),samples:a};report.push(row);console.log(tag,scene,row.meanLines,row.maxLines);
 }
}
writeFileSync(join(root,'compare7/cpu7.json'),JSON.stringify({method:'modprof call boundaries including JSL, 60 frames to settle the imported song/driver, 300 walking frames. Unmodified modprof also reports the cold-start mean.',rows:report},null,2));
