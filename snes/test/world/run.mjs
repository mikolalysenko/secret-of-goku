#!/usr/bin/env node
// WORLD module tests in Mesen (browser-mod states imported with
// H.importSnesJs, plus the shared waterfall checkpoint):
//   sprite    Goku replaces Flammie in Mode 7 flight (OAM, VRAM, palettes,
//             banking, bob, shadow), both forms
//   takeoff   L+R from the field: native $0C00|map path without the summon
//   landing   B over land: no BG3 fly-by, landing pose, ordinary loader
//   ki        aerial ki shots, charge, Fortress shield deflection
//   fortress  full Super Saiyan wave: destruction, cutaway, deck landing
//   scars     town craters in the 7F ring and the Mode 7 tilemap, persistence
//   dock      docking approach: ki boost, curve into the Fortress, deck
//   item      Fly from the item ring: Goku's icon, no drum, same handoff
//   node snes/test/world/run.mjs [test ...]
// ROM: $SNES_ROM or dist/snes/secret-of-goku.sfc. Outputs: .local/snes-test/world/
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {radarTarget} from '../../../engine/dragon-radar.js';
import {encodeText} from '../../../engine/event-codec.js';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
const only=args.filter(a=>!a.startsWith('--'));
const repeat=Number(args.find(a=>a.startsWith('--repeat='))?.slice(9)??1);
const scene=args.find(a=>a.startsWith('--scene='))?.slice(8)??'preset__flight';
if(!Number.isInteger(repeat)||repeat<1||repeat>100)throw Error('--repeat must be an integer from 1 to 100');
const want=t=>!only.length||only.includes(t);
const outRoot=resolve(repo,'.local/snes-test/world');
mkdirSync(outRoot,{recursive:true});
const romSrc=resolve(process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc'));
if(!existsSync(romSrc)){
  const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${romSrc}`],{cwd:repo,stdio:'inherit'});
  if(b.status!==0){console.error('world: build failed');process.exit(1);}
}
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('world: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
function prelude(rom){
  const sym={};
  for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
    const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) ((?:world|goku|flight|core|combat|ui)_\w+)$/i);
    if(m)sym[m[3]]=parseInt(m[1]+m[2],16);
  }
  return `REPEAT=${repeat}\nTIMING_SCENE=${JSON.stringify(scene)}\nSYM={${Object.entries(sym).map(([k,v])=>`${k}=0x${v.toString(16)}`).join(',')}}\nIMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
}
const tests=['sprite','takeoff','takeoff-locks','landing','controls','ki','wave','fortress','scars','barrier','dock','item','radar','map','timing'].filter(t=>existsSync(join(here,`${t}.lua`))&&want(t));
const summary=[];
for(const t of tests){
  const rom=privateRom(romSrc,`world-${t}`);
  const t0=Date.now();
  const r=await runMesen({rom,test:prelude(romSrc)+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const fails=Object.entries(res).filter(([,v])=>typeof v==='string'&&v.startsWith('FAIL'));
  if(t==='radar'){
    const base=readFileSync(join(repo,'rom/secret-of-mana-us.sfc'));
    for(const s of res.samples??[]){
      const target=radarTarget(base,{mask:s.mask,seedMask:s.seeds,wished:!!s.wished},{
        fortressDestroyed:!!s.gone,fortress:{x:s.fx,y:s.fy},frieza:{
          needsTree:!!s.needsTree,stolen:!!s.stolen,eligible:!!s.eligible,stage:s.dormant?'dormant':'hunt',
        },
      });
      const id=target==null?-1:typeof target.id==='number'?target.id:{'mana-tree':7,frieza:8,dryad:9,finale:10}[target.id];
      const actual=s.on?s.target:-1;
      if(actual!==id)fails.push([s.name,`FAIL target ${actual}, browser ${id}`]);
      if(target){
        if(s.tx!==target.x||s.ty!==target.y)fails.push([s.name,`FAIL target coordinates ${s.tx},${s.ty}, browser ${target.x},${target.y}`]);
        const lines=[`Next: ${target.name}`,s.crisis?'CORE: 5 MINUTES REMAIN':target.hint];
        for(const [i,line] of lines.entries()){
          const expected=[...encodeText(line),...Array(28).fill(0x80)].slice(0,28);
          if(expected.some((c,j)=>s.text[(i+1)*28+j]!==c))fails.push([s.name,`FAIL radar line ${i+2}: expected ${line}`]);
        }
        const prefix=encodeText(s.stolen?'RADAR 8TH BALL':`RADAR ${s.mask.toString(2).replaceAll('0','').length}/7`);
        if(prefix.some((c,j)=>s.text[j]!==c))fails.push([s.name,'FAIL quest count / eighth-Ball indicator']);
      }
    }
  }
  const ok=r.code===0&&!res.error&&res.failures===0&&!fails.length;
  summary.push({test:t,ok,seconds:((Date.now()-t0)/1000).toFixed(1),fails:fails.map(([k,v])=>`${k}: ${v}`),error:res.error});
  console.log(`world ${t.padEnd(10)} ${ok?'pass':'FAIL'} (${((Date.now()-t0)/1000).toFixed(1)} s)`);
  for(const[k,v]of fails)console.log(`   ${k}: ${v}`);
  if(res.error)console.log('   error:',res.error);
  if(!ok&&r.code!==0&&!res.error)console.log(r.output.slice(-1500));
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
process.exit(summary.every(s=>s.ok)?0:1);
