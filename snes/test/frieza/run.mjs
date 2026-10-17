#!/usr/bin/env node
// FRIEZA module tests in Mesen, from browser-mod states imported with
// H.importSnesJs and the mod's own Frieza state written into the module's
// fields (state.mjs):
//   court     preset 'frieza': the Thanatos court (trial-taunt), Frieza's 48 px
//             sprite at the court anchor, compared with the browser frames
//   thanatos  preset 'thanatos': trial-entry with the full party
//   battle    preset 'battle': the ground fight's start position
//   node snes/test/frieza/run.mjs [case ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/frieza/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {comparePictures,snesPixels} from '../debug/compare.mjs';
import {friezaWrites,luaWrites,defs} from './state.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/frieza');
mkdirSync(outRoot,{recursive:true});
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc)){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict'],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('frieza: build failed');process.exit(1);}
}
const main=mainCheckout();
const importRoot=join(main,'.local/snes-import');
const refRoot=join(main,'.local/snes-ref');
const cps=checkpointDir();
const lib=readFileSync(join(here,'lib.lua'),'utf8');

function reference(preset){
  const st=JSON.parse(readFileSync(join(refRoot,preset,'state.json'),'utf8'));
  return st.goku;
}

// Import a preset, write its Frieza state, then shoot at the reference
// frame offsets (a window of frames around each, as the two emulators'
// frame phases differ by a frame or two).
function sceneTest(preset,frames){
  const g=reference(preset);
  const writes=friezaWrites(g.frieza,g.challenge);
  return `
function test()
  local ok = H.importSnesJs(${JSON.stringify(join(importRoot,'preset__'+preset))})
  F.check(ok, 'import')
  H.w8(0x316001, 1)          -- !persist_goku_active (not part of browser bundles)
  F.apply(${luaWrites(writes)})
  local shots = {}
  local boxes = {}
  local frame = 0
  local targets = {${frames.join(',')}}
  local t = 1
  while t <= #targets do
    local target = targets[t]
    H.wait(1)
    frame = frame + 1
    if frame >= target - 2 and frame <= target + 2 then
      local name = string.format('f%05d', frame)
      H.shot(name)
      local b = F.box()
      boxes[name] = b or false
      shots[#shots + 1] = name
    end
    if frame >= target + 2 then t = t + 1 end
  end
  H.result('shots', shots)
  H.result('boxes', boxes)
  H.result('scene', F.ram(0x${defs.fz_scene.toString(16)}|0x7E0000))
  H.result('age', F.ram16(0x${defs.fz_sage.toString(16)}|0x7E0000))
  H.result('stage', F.ram(0x${(defs.fzp_stage).toString(16)}))
  F.done()
end
`;
}

const cases={
  court:{preset:'frieza',frames:[60,240,600]},
  thanatos:{preset:'thanatos',frames:[60,240]},
  battle:{preset:'battle',frames:[60]},
};

const results=[];
for(const [name,c] of Object.entries(cases)){
  if(!want(name))continue;
  const rom=privateRom(romSrc,`frieza-${name}`);
  const out=join(outRoot,name);
  const r=await runMesen({rom,test:lib+'\n'+sceneTest(c.preset,c.frames),outDir:out,state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const failures=[...(res.failures??[]),...(res.error?[res.error]:[])];
  // Compare each reference frame with the best of its window.
  const notes=[];
  for(const f of c.frames){
    const ref=join(refRoot,c.preset,`frame-${String(f).padStart(5,'0')}.png`);
    if(!existsSync(ref))continue;
    let best=null;
    for(let d=-2;d<=2;d++){
      const shot=join(out,`f${String(f+d).padStart(5,'0')}.png`);
      if(!existsSync(shot))continue;
      const score=comparePictures(ref,shot,join(out,`compare-${f}${d>=0?'+':''}${d}.png`));
      if(score!==null&&(!best||score>best.score))best={score,d,box:res.boxes?.[`f${String(f+d).padStart(5,'0')}`]};
    }
    if(best){
      notes.push(`frame ${f}: ${(best.score*100).toFixed(1)}% (shift ${best.d})`+(best.box?` frieza ${best.box.n} OBJ at ${best.box.x0},${best.box.y0}-${best.box.x1},${best.box.y1} pal ${best.box.pal}`:' no frieza OBJ'));
      if(!best.box&&c.expectFrieza!==false)failures.push(`frame ${f}: Frieza not drawn`);
    }
  }
  const ok=r.code===0&&res.pass===true&&failures.length===0;
  results.push({name,ok,failures,notes});
  console.log(`frieza ${name}: ${ok?'pass':'FAIL'} (${r.ms} ms) scene ${res.scene} age ${res.age} stage ${res.stage}`);
  for(const n of notes)console.log('   ',n);
  if(!ok)for(const f of failures)console.log('    !',f);
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok)?0:1);
