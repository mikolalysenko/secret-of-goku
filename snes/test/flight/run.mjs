#!/usr/bin/env node
// FLIGHT module tests in Mesen (also run by snes/test/run-all.mjs):
//   classify  terrain differential: every tile of imported scenes classified
//             by the cartridge and by engine/native-local-flight.js
//   landing   Instant Transmission differential: findLanding() for a grid of
//             targets/origins by the cartridge and engine/native-teleport.js
//   water     Water Palace gap: fly over, hover on release, cross, return
//   teleport  teleport.spec.mjs: riverbank landing, offscreen target with the
//             camera follow, cues, walking and the ring afterwards
//   whip      whip-flight.spec.mjs / ki-world.spec.mjs whip pads (Earth Palace)
//   ceiling   indoor-flight.spec.mjs roof exits from seven rooms
//   holes     the floor-hole contract (FLIGHT_TEST_HOLES provider): walking
//             stops, flight crosses, hovering over a hole
//   scene     scene services: custom Instant Transmission targets (vegeta's
//             and frieza's !fl_tp_custom posts) and a camera target
//             (flight_api_camera), on the FLIGHT_TEST cartridge
//   vegeta    Instant Transmission to the live Vegeta in the Time Chamber
//             (only on builds with the vegeta module)
//   ... (see docs/agents/snes-port/flight.md)
//   node snes/test/flight/run.mjs [test ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc (the classify test builds
// its own FLIGHT_TEST cartridge). Outputs: .local/snes-test/flight/
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/flight');
mkdirSync(outRoot,{recursive:true});
const build=(out,defs=[])=>{
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${out}`,...defs],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('flight: build failed');process.exit(1);}
};
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc))build(romSrc);
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('flight: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
const prelude=()=>`IMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
const results=[];
let ok=true;

if(want('classify')){
  const {classify,DEFAULT_BUNDLES}=await import('./classify.mjs');
  const testRom=resolve(repo,'.local/snes-test/roms/flight-test.sfc');
  build(testRom,['-DFLIGHT_TEST=1']);
  const t0=Date.now();
  const res=await classify({bundles:DEFAULT_BUNDLES,rom:testRom,outRoot:join(outRoot,'classify')});
  let tiles=0,bad=0,scenes=0;const failures=[];
  for(const r of res){
    if(r.skipped)continue;
    if(r.error){failures.push(`${r.name}: ${r.error}`);continue;}
    // The Mana Beast streams its Mode 7 art through the collision buffers
    // every frame: a multi-frame snapshot cannot be compared there.
    if(r.map===253)continue;
    scenes++;tiles+=r.tiles;const n=r.bad.fly+r.bad.land+r.bad.low;bad+=n;
    if(n||r.moved)failures.push(`${r.name} (map ${r.map}): fly ${r.bad.fly} land ${r.bad.land} low ${r.bad.low} moved ${r.moved} ${JSON.stringify(r.examples.slice(0,3))}`);
  }
  const pass=!failures.length;ok&&=pass;
  results.push({test:'classify',ok:pass,ms:Date.now()-t0,failures,note:` ${scenes} scenes, ${tiles-bad}/${tiles} tiles equal to native-local-flight.js`});
}

if(want('landing')){
  const {landings,LANDING_BUNDLES}=await import('./landing.mjs');
  const testRom=resolve(repo,'.local/snes-test/roms/flight-test.sfc');
  if(!want('classify')||!existsSync(testRom))build(testRom,['-DFLIGHT_TEST=1']);
  const t0=Date.now();
  const res=await landings({bundles:LANDING_BUNDLES,rom:testRom,outRoot:join(outRoot,'landing')});
  let queries=0,found=0,bad=0,scenes=0,exits=0,caught=0,roofs=0,sweeps=0,lands=0,landable=0;const failures=[];
  for(const r of res){
    if(r.skipped)continue;
    if(r.error){failures.push(`${r.name}: ${r.error}`);continue;}
    scenes++;queries+=r.queries;found+=r.found;bad+=r.bad;exits+=r.exits;caught+=r.exitHits;sweeps+=r.sweeps;lands+=r.apiLand??0;landable+=r.apiPass??0;if(r.roofStable)roofs++;
    if(r.bad||r.moved)failures.push(`${r.name} (map ${r.map}): ${r.bad} mismatches, moved ${r.moved} ${JSON.stringify(r.examples.slice(0,2))}`);
  }
  const pass=!failures.length;ok&&=pass;
  results.push({test:'landing',ok:pass,ms:Date.now()-t0,failures,note:` ${scenes} scenes, ${queries-bad}/${queries} Instant Transmission queries (${found} landings) equal to native-teleport.js; ${exits} opening-exit probes (${caught} caught) equal to the browser's D84C hook; ${sweeps} sweeps equal to canFly at every step; ${lands} canLand service calls (${landable} landable) equal to canLand(x, y, layer, terrain), registers kept; roof colours equal in ${roofs} scenes with a still palette`});
}

// address of a flight routine in the ROM under test (its .sym file)
const symAt=name=>{
  const m=readFileSync(romSrc.replace(/\.sfc$/,'.sym'),'utf8').match(new RegExp(`^([0-9A-F]{2}):([0-9A-F]{4}) ${name}$`,'mi'));
  if(!m)throw Error('no symbol '+name);return `0x${m[1]}${m[2]}`;
};
for(const t of ['water','teleport','whip','ceiling']){
  if(!want(t)||!existsSync(join(here,`${t}.lua`)))continue;
  const rom=privateRom(romSrc,`flight-${t}`);
  const world=/^[0-9A-F]{2}:[0-9A-F]{4} world_takeoff$/mi.test(readFileSync(romSrc.replace(/\.sfc$/,'.sym'),'utf8'));
  const extra=t==='teleport'?`SFX=${symAt('fl_bind_sfx')}\n`:t==='ceiling'?`WORLD=${world}\n`:'';
  const r=await runMesen({rom,test:extra+prelude()+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const pass=r.code===0&&r.results?.pass===true;ok&&=pass;
  results.push({test:t,ok:pass,ms:r.ms,failures:r.results?.failures??[r.results?.error??'no results'],note:'',log:r.results?.log});
}

// FLIGHT_TEST cartridge: posts a scene module would make (testmod.asm)
if(want('scene')){
  const testRom=resolve(repo,'.local/snes-test/roms/flight-test.sfc');
  if(!(want('classify')||want('landing'))||!existsSync(testRom))build(testRom,['-DFLIGHT_TEST=1']);
  const rom=privateRom(testRom,'flight-scene');
  const r=await runMesen({rom,test:prelude()+readFileSync(join(here,'scene.lua'),'utf8'),outDir:join(outRoot,'scene'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const pass=r.code===0&&r.results?.pass===true;ok&&=pass;
  results.push({test:'scene',ok:pass,ms:r.ms,failures:r.results?.failures??[r.results?.error??'no results'],note:'',log:r.results?.log});
}

// Live Instant Transmission to Vegeta (vegeta's vb_flight_target posts
// !fl_tp_custom), on builds that have the vegeta module
if(want('vegeta')){
  if(!/^[0-9A-F]{2}:[0-9A-F]{4} vb_flight_target$/mi.test(readFileSync(romSrc.replace(/\.sfc$/,'.sym'),'utf8'))){
    results.push({test:'vegeta',ok:true,ms:0,failures:[],note:' skipped (no vegeta module in this build)'});
  }else{
    const rom=privateRom(romSrc,'flight-vegeta');
    const outDir=join(outRoot,'vegeta');
    const r=await runMesen({rom,test:prelude()+readFileSync(join(here,'vegeta.lua'),'utf8'),outDir,state:join(cps,'waterfall.mss')});
    cleanupRom(rom);
    const failures=[...(r.results?.failures??[r.results?.error??'no results'])];
    let note='';
    const p=r.results?.press;
    if(p&&existsSync(join(outDir,'wram.bin'))){
      // the browser's choice on the WRAM at the press: a teleport starts
      // when findLanding() finds a spot beside him (mana-mod.js startTeleport)
      const {createNativeLocalFlight}=await import(pathToFileURL(resolve(repo,'engine/native-local-flight.js')).href);
      const {createNativeTeleport}=await import(pathToFileURL(resolve(repo,'engine/native-teleport.js')).href);
      const wram=new Uint8Array(readFileSync(join(outDir,'wram.bin')));
      const snes={ram:wram,cart:{data:new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')))},cpu:{r:new Uint8Array(8),br:new Uint16Array(8),cyclesLeft:0,cycle(){}},frames:1,ppu:{mode:wram[0x29]&7}};
      const h=createNativeLocalFlight(snes,{active:()=>true,phase:true});
      const t=createNativeTeleport(snes,{options:{enabled:true},write16(){}},h);
      const js=t.findLanding({x:p.vx,y:p.vy,terrain:p.vt,custom:'vegeta'},{x:p.gx,y:p.gy});
      t.dispose();h.dispose();
      if(!!js!==!!p.ran)failures.push(`teleport ${p.ran?'started':'not started'}, the browser's findLanding ${js?`lands at ${js.x},${js.y}`:'finds no spot'}`);
      if(js&&p.ran){
        if(p.tg!==3)failures.push(`target slot ${p.tg}, want 3`);
        const d=Math.hypot(p.x-p.ax,p.y-p.ay);
        if(d<18||d>54)failures.push(`landed ${d.toFixed(1)} px from Vegeta`);
      }
      note=` Vegeta at ${p.vx},${p.vy} from ${p.gx},${p.gy}: ${js?`browser lands at ${js.x},${js.y}, cartridge at ${p.x},${p.y}`:'no landing spot in either engine (L+B does nothing)'}`;
    }else if(!failures.length)failures.push('no press recorded');
    const pass=r.code===0&&r.results?.pass===true&&!failures.length;ok&&=pass;
    results.push({test:'vegeta',ok:pass,ms:r.ms,failures,note,log:r.results?.log});
  }
}

// FLIGHT_TEST cartridge: its floor-hole provider (testmod.asm)
if(want('holes')){
  const holesRom=resolve(repo,'.local/snes-test/roms/flight-test-holes.sfc');
  build(holesRom,['-DFLIGHT_TEST=1','-DFLIGHT_TEST_HOLES=1']);
  const rom=privateRom(holesRom,'flight-holes');
  const r=await runMesen({rom,test:prelude()+readFileSync(join(here,'holes.lua'),'utf8'),outDir:join(outRoot,'holes'),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const pass=r.code===0&&r.results?.pass===true;ok&&=pass;
  results.push({test:'holes',ok:pass,ms:r.ms,failures:r.results?.failures??[r.results?.error??'no results'],note:'',log:r.results?.log});
}

for(const r of results){
  console.log(`flight ${r.test}: ${r.ok?'pass':'FAIL'} (${r.ms} ms)${r.note}`);
  if(!r.ok)for(const f of r.failures)console.log('   ',f);
  if(r.log&&(!r.ok||args.includes('--verbose')))for(const l of r.log)console.log('     ',l);
}
writeFileSync(join(outRoot,'results.json'),JSON.stringify(results,null,1));
process.exit(ok?0:1);
