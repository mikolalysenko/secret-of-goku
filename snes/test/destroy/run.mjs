#!/usr/bin/env node
// Destroy module regression: imports browser-mod states into Mesen, fires
// attacks through the module's debug trigger and compares the native map
// edits, redraw requests and cut sounds with the JavaScript reference
// (reference.mjs) for the same state. Also checks collision by walking.
//   SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/destroy/run.mjs [scenario ...]
// Outputs (screenshots, grids, results) go to .local/snes-test/destroy/<scenario>/.
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMesen} from '../mesen.mjs';
import {destroyAbi} from './abi.mjs';
import {createReference,attackProfile,facing,loadRom} from './reference.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
// Import bundles: SNES_IMPORT, this checkout's .local, or the main checkout's
// (git worktrees share it).
function importDir(){
  if(process.env.SNES_IMPORT)return resolve(process.env.SNES_IMPORT);
  const local=resolve(repo,'.local/snes-import');
  if(existsSync(local))return local;
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  return r.status===0?resolve(r.stdout.trim(),'..','.local/snes-import'):local;
}
const imports=importDir();
const outRoot=resolve(repo,'.local/snes-test/destroy');
const only=process.argv.slice(2);
const abi=destroyAbi();
const cartridge=loadRom();
const KIND={punch:0,ki:1,beam:2,mega:3};

// Scenarios. The attack origin defaults to Goku's position in the bundle.
export const scenarios=[
  {name:'bush-control',bundle:'emulator-probe__main-before-grass',control:true,walk:'right',walkFrames:48,
    note:'Rusty-sword clearing (map 128): walking right is blocked by the bushes'},
  {name:'bush-punch',bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'punch'},walk:'right',walkFrames:48,
    expect:{passX:41*16},note:'one punch clears the bush stack (C8 -> 5F) and Goku walks through'},
  {name:'bush-mega',bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'mega'},frames:60,
    note:'full Super Saiyan beam across the clearing: every bush in the tapered band'},
  {name:'bush-beam-steps',bundle:'emulator-probe__main-before-grass',attack:{dir:1,kind:'beam',id:7},steps:[32,64,96,128,160,192,224,256,288,320],frames:40,
    note:'a growing beam rescans only new cells and matches the one-shot result'},
  {name:'grass-punch',bundle:'animation-audit__native__rabite-field-b',attack:{dir:0,kind:'punch'},
    note:'tall grass (C1 -> 0) in the Rabite field'},
  {name:'grass-beam',bundle:'animation-audit__native__rabite-field-b',attack:{dir:0,kind:'beam'},frames:40,
    note:'a beam mows a band of tall grass'},
  {name:'vine-control',bundle:'ending-fix__vine',control:true,walk:'right',walkFrames:40,
    note:'Haunted Forest vines block the path'},
  {name:'vine-punch',bundle:'ending-fix__vine',attack:{dir:1,kind:'punch'},walk:'right',walkFrames:40,expect:{passX:12*16},
    note:'Haunted Forest vines (no cut code) become grass 7A; Goku walks through'},
  {name:'bg2-objects',bundle:'juice-research__plants__layer2-before',attack:{dir:3,kind:'punch'},
    note:'multi-stage C2 objects on BG2 (Lost Continent axe room) clear to their final stage'},
];

function lua(s){
  const v=x=>typeof x==='string'?JSON.stringify(x):typeof x==='boolean'?String(x):x===undefined||x===null?'nil':Array.isArray(x)?`{${x.map(v).join(',')}}`:typeof x==='object'?`{${Object.entries(x).map(([k,y])=>`${k}=${v(y)}`).join(',')}}`:String(x);
  return v(s);
}
const body=`
function test()
  D.watch()
  assert(H.importSnesJs(SCN.bundlePath), 'import failed')
  H.wait(SCN.settle or 2)
  H.result('start', D.pos())
  D.grid('before.bin')
  H.shot('before')
  if SCN.control then
    H.hold(SCN.walk, SCN.walkFrames or 40)
    H.result('walked', D.pos())
    H.shot('walked')
    return
  end
  if SCN.steps then
    local results = {}
    for _, len in ipairs(SCN.steps) do
      SCN.attack.length = len
      results[#results + 1] = D.hit(SCN.attack)
    end
    H.result('hit', results)
  elseif SCN.attack then H.result('hit', D.hit(SCN.attack)) end
  H.wait(SCN.frames or 16)
  D.grid('after.bin')
  H.shot('after')
  H.result('queue', {qn = H.r16(ABI.d_qn), live = H.r16(ABI.d_qlive), cleared = H.r16(ABI.d_cn), rows = H.r16(ABI.out_rows)})
  H.result('writes', D.writes)
  if SCN.walk then
    H.hold(SCN.walk, SCN.walkFrames or 40)
    H.result('walked', D.pos())
    H.shot('walked')
  end
end
`;

function diffGrids(a,b){
  const out=[];
  for(let i=0;i<0x8000;i++)if(a[i]!==b[i])out.push({off:i,layer:i>>14,tx:i&127,ty:(i>>7)&127,from:a[i],to:b[i]});
  return out;
}

async function run(s){
  const bundlePath=join(imports,s.bundle);
  if(!existsSync(bundlePath))return{name:s.name,ok:false,skipped:true,reason:'missing bundle '+s.bundle};
  const wram=new Uint8Array(readFileSync(join(bundlePath,'wram.bin')));
  const w16=a=>wram[a]|wram[a+1]<<8;
  let attack=null,ref=null;
  if(s.attack){
    attack=attackProfile({x:w16(0xe002),y:w16(0xe004),...s.attack});
    attack.code=KIND[attack.kind];
    if(s.steps)attack.length=s.steps.at(-1);
    // JavaScript reference on the same memory.
    const copy=wram.slice(),r=createReference(copy,cartridge),[dx,dy]=facing[attack.dir];
    r.plants.beam({x:attack.x,y:attack.y,dx,dy,length:attack.length,halfWidth:attack.halfWidth,taper:attack.taper,policy:attack.policy,collisionLayer:attack.layer});
    const rows=r.drain();
    ref={rows,grid:diffGrids(wram.subarray(0x10000,0x18000),copy.subarray(0x10000,0x18000)),barrier:r.barrierTarget(attack)};
  }
  const outDir=join(outRoot,s.name);
  const test=`ABI=${lua(abi)}\nSCN=${lua({...s,bundlePath,attack})}\n`+readFileSync(join(here,'destroy.lua'),'utf8')+body;
  const m=await runMesen({rom,test,outDir});
  const res=m.results??{};
  const problems=[];
  if(m.code!==0||res.error)problems.push('mesen: '+(res.error??m.code));
  let grid=[];
  if(!s.control&&existsSync(join(outDir,'after.bin'))){
    const before=new Uint8Array(readFileSync(join(outDir,'before.bin'))),after=new Uint8Array(readFileSync(join(outDir,'after.bin')));
    grid=diffGrids(before,after);
    if(ref){
      const key=c=>`${c.off}:${c.to}`,want=new Set(ref.grid.map(key)),got=new Set(grid.map(key));
      const missing=ref.grid.filter(c=>!got.has(key(c))),extra=grid.filter(c=>!want.has(key(c)));
      if(missing.length)problems.push(`missing edits ${JSON.stringify(missing.slice(0,8))}`);
      if(extra.length)problems.push(`unexpected edits ${JSON.stringify(extra.slice(0,8))}`);
      // Redraw requests and sounds, row by row.
      // $95 requests carry bit 7 until the native sound dispatcher takes
      // them (it rewrites the byte without bit 7); a row that finds the
      // previous request still pending stays silent, as in the browser.
      const w=res.writes??[],r82=w.filter(x=>x.k==='r82').map(x=>x.v),r83=w.filter(x=>x.k==='r83').map(x=>x.v),r95=w.filter(x=>x.k==='r95'&&x.v>=0xd8&&x.v<0xe8).map(x=>x.v);
      const want82=ref.rows.filter(r=>r.redraw[0]).map(r=>r.redraw[0]),want83=ref.rows.filter(r=>r.redraw[0]).map(r=>r.redraw[1]);
      const want95=ref.rows.filter(r=>r.sound).map(r=>r.sound);
      // The native consumer also writes $82/$83 while drawing: compare our
      // requests as an ordered subsequence.
      const sub=(a,b)=>{let i=0;for(const x of a)if(x===b[i])i++;return i===b.length;};
      if(!sub(r82,want82))problems.push(`redraw $82 ${JSON.stringify(r82)} want ${JSON.stringify(want82)}`);
      if(!sub(r83,want83))problems.push(`redraw $83 ${JSON.stringify(r83)} want ${JSON.stringify(want83)}`);
      if(!sub(want95,r95)||want95.length&&!r95.length)problems.push(`sound $95 ${JSON.stringify(r95)} want a subsequence of ${JSON.stringify(want95)}`);
    }
  }
  if(s.expect?.passX!==undefined&&!(res.walked?.x>s.expect.passX))problems.push(`did not walk through: x ${res.walked?.x} <= ${s.expect.passX}`);
  if(s.expect?.blockedX!==undefined&&!(res.walked?.x<=s.expect.blockedX))problems.push(`not blocked: x ${res.walked?.x} > ${s.expect.blockedX}`);
  const summary={name:s.name,ok:!problems.length,problems,edits:grid.length,refEdits:ref?.grid.length,start:res.start,walked:res.walked,queue:res.queue,ms:m.ms,note:s.note};
  writeFileSync(join(outDir,'summary.json'),JSON.stringify({...summary,ref,results:res},null,1));
  return summary;
}

mkdirSync(outRoot,{recursive:true});
const selected=scenarios.filter(s=>!only.length||only.includes(s.name));
const results=[];
for(const s of selected){
  const r=await run(s);results.push(r);
  console.log(`${r.ok?'pass':r.skipped?'skip':'FAIL'}  ${s.name.padEnd(28)} edits ${r.edits??'-'} (ref ${r.refEdits??'-'})  ${r.walked?`walked to ${r.walked.x},${r.walked.y}`:''}  ${r.problems?.join('; ')??r.reason??''}`);
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(results,null,1));
process.exit(results.every(r=>r.ok||r.skipped)?0:1);
