#!/usr/bin/env node
// Emit an audio-owned, read-only prelude for gameplay's offset runs:
//   node snes/test/audio/dispatch-profile.mjs [ROM.sym] > /private/path/trace.lua
//   SNES_LUA_PRELUDE=/private/path/trace.lua GAMEPLAY_OUT=/private/out \
//     node snes/test/gameplay/run.mjs --offsets=0,1,2,3,4,5,6,7,8,9 --jobs=8
//   node snes/test/audio/dispatch-report.mjs /private/out/summary.json
// Separates NMI time from sound dispatch, measures every SPC polling loop
// and records the port-0 command stream (dispatch-profile.lua).
import {readFileSync} from 'node:fs';
const sym=process.argv[2]??'dist/snes/secret-of-goku.sym';
const labels=Object.fromEntries([...readFileSync(sym,'utf8').matchAll(/^([\dA-F]{2}):([\dA-F]{4}) (\w+)$/gmi)].map(m=>[m[3],parseInt(m[1]+m[2],16)]));
console.log('local S={'+Object.entries(labels).map(([n,a])=>`[${JSON.stringify(n)}]=${a}`).join(',')+'}');
console.log(readFileSync(new URL('./dispatch-profile.lua',import.meta.url),'utf8'));
