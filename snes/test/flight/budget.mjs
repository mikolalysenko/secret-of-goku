#!/usr/bin/env node
// CPU budget with Goku in play (snes/test/perf runs its scenes with whatever
// the battery file holds, usually Goku inactive). Uses the perf test's saved
// scene states (run snes/test/perf/run.mjs once first), sets the arrival
// flag, walks (or flies with --fly) for 300 frames and reports the p90 line
// at which frame logic ends and the lag frames, for each ROM given.
//   node snes/test/flight/budget.mjs [--fly] romA.sfc [romB.sfc ...]
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2),fly=args.includes('--fly');
const roms=args.filter(a=>!a.startsWith('--'));
if(!roms.length)roms.push(join(repo,'dist/snes/secret-of-goku.sfc'));
const scenes=(process.env.PERF_SCENES??'preset__sword,preset__sandship,preset__battle,preset__beast,preset__fortress').split(',');
const norm=l=>l<0?l:(l<200?l+262:l);
const lua=`
local lines = {}
local function onWait() lines[#lines + 1] = emu.getState()['ppu.scanline'] end
function test()
  emu.write(0x316001, 1, emu.memType.snesMemory)
  H.wait(30)
  local id1 = emu.addMemoryCallback(onWait, emu.callbackType.exec, 0x00B077, 0x00B077)
  local start = H.frame
  for i = 1, 300 do
    local dir = (i % 60 < 30) and 'left' or 'right'
    H.hold(${fly?"'a ' .. dir":'dir'}, 1)
  end
  emu.removeMemoryCallback(id1, emu.callbackType.exec, 0x00B077, 0x00B077)
  table.sort(lines)
  H.result('frames', H.frame - start)
  H.result('reached', #lines)
  H.result('p90', lines[math.floor(#lines * 0.9) + 1] or -1)
end
`;
console.log('scene'.padEnd(20)+roms.map(r=>basename(r).padStart(24)).join(''));
for(const scene of scenes){
  const state=resolve(repo,'.local/snes-test/perf/states',scene,'scene.mss');
  if(!existsSync(state)){console.log(scene.padEnd(20)+'no state');continue;}
  const cells=[];
  for(const rom of roms){
    const cart=privateRom(rom,'flight-budget');
    const r=await runMesen({rom:cart,state,test:lua,outDir:resolve(repo,'.local/snes-test/flight/budget',basename(rom),scene)});
    cleanupRom(cart);
    const x=r.results??{};
    cells.push(`${String(norm(x.p90)).padStart(6)} lag ${String((x.frames??0)-(x.reached??0)).padStart(3)}`.padStart(24));
  }
  console.log(scene.padEnd(20)+cells.join(''));
}
