#!/usr/bin/env node
// Per-module CPU cost of the field dispatch tables (modules_field_frame and
// modules_field_nmi), in scanlines (1364 master clocks), from the shared perf
// states (snes/test/perf: .local/snes-test/perf/states/<scene>/scene.mss).
// Each JSL in a table gets an exec callback; a module's cost is the master
// clock from its JSL to the next one. The run walks for 300 frames.
//   node snes/tools/modprof.mjs [--rom=dist/snes/secret-of-goku.sfc] [scene ...]
// Default scenes: preset__sword preset__battle. Idle budget guide: about 0.3
// line per frame callback and 0.1 per vblank callback when the module's
// feature is not active.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../test/mesen.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
const romPath=resolve(args.find(a=>a.startsWith('--rom='))?.slice(6)??join(repo,'dist/snes/secret-of-goku.sfc'));
const scenes=args.filter(a=>!a.startsWith('--'));
if(!scenes.length)scenes.push('preset__sword','preset__battle');
const rom=readFileSync(romPath),sym=readFileSync(romPath.replace(/\.sfc$/,'.sym'),'utf8');
const lab={};
for(const l of sym.split('\n')){const m=l.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)$/i);if(m)lab[m[3]]=(parseInt(m[1],16)<<16)|parseInt(m[2],16);}
const byAddr={};for(const[k,v]of Object.entries(lab))(byAddr[v]??=[]).push(k);
const pc=a=>(((a>>16)&0x3f)<<16)|(a&0xffff);   // $80-$BF code mirror -> first 4 MiB
function table(name){
  const out=[];let p=lab[name];
  if(p===undefined)throw Error(`no label ${name}`);
  for(;;){
    const o=pc(p);
    if(rom[o]===0x22){const t=rom[o+1]|rom[o+2]<<8|rom[o+3]<<16;const names=(byAddr[t]??[]).filter(n=>/^[A-Za-z_]\w*$/.test(n)).sort((a,b)=>a.length-b.length);out.push({at:p,name:names[0]??t.toString(16)});p+=4;}
    else if(rom[o]===0x6B){out.push({at:p,name:'<end>'});return out;}
    else throw Error(`${name}: unexpected byte ${rom[o].toString(16)} at ${p.toString(16)}`);
  }
}
const tables={frame:table('modules_field_frame'),nmi:table('modules_field_nmi')};
const luaTables=JSON.stringify(tables).replace(/"(\w+)":/g,'$1=').replace(/\[/g,'{').replace(/\]/g,'}');
const lua=`
local T = ${luaTables}
local acc = {}
for tn, list in pairs(T) do
  acc[tn] = {}
  local last = nil
  for i, e in ipairs(list) do
    acc[tn][i] = { name = e.name, sum = 0, n = 0, max = 0 }
    emu.addMemoryCallback(function()
      local mc = emu.getState().masterClock
      if last and last.i == i - 1 then
        local d = (mc - last.t) / 1364
        local a = acc[tn][i - 1]
        a.sum = a.sum + d; a.n = a.n + 1; if d > a.max then a.max = d end
      end
      if e.name == '<end>' then last = nil else last = { i = i, t = mc } end
    end, emu.callbackType.exec, e.at, e.at, emu.cpuType.snes, emu.memType.snesMemory)
  end
end
function test()
  H.wait(2)
  for i = 1, 300 do H.hold(({ 'left', 'right', 'up', 'down' })[(i // 40) % 4 + 1], 1) end
  local out = {}
  for _, tn in ipairs({ 'frame', 'nmi' }) do
    local tot = 0
    for _, a in ipairs(acc[tn]) do
      if a.n > 0 then
        tot = tot + a.sum / a.n
        out[#out + 1] = string.format('%-5s %-28s mean %5.2f  max %5.2f', tn, a.name, a.sum / a.n, a.max)
      end
    end
    out[#out + 1] = string.format('%-5s %-28s mean %5.2f', tn, 'total', tot)
  end
  H.result('prof', out)
end`;
for(const scene of scenes){
  const state=join(repo,'.local/snes-test/perf/states',scene,'scene.mss');
  if(!existsSync(state)){console.log(`${scene}: no state (run snes/test/perf/run.mjs once)`);continue;}
  const r=await runMesen({rom:romPath,state,test:lua,outDir:join(repo,'.local/snes-test/modprof',scene),timeoutMs:300000});
  console.log(`== ${scene} (scanlines per call)`);
  console.log((r.results?.prof??[r.output?.slice(-800)]).join('\n'));
}
