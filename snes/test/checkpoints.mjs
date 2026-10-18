#!/usr/bin/env node
// Plays the original opening from power-on in Mesen and saves stable
// checkpoints (snes/test/checkpoints.lua) for other tests to start from:
//   name-entry.mss  empty name editor of a NEW GAME (menu loop)
//   waterfall.mss   first controllable field scene (map 128, field loop)
//   potos.mss       Potos (map 131), entered from the waterfall through the
//                   game's own door event (needs --potos; uses a CORE_TEST build)
//
//   node snes/test/checkpoints.mjs [--rom=path] [--out=dir] [--name=BOY] [--stop=name] [--potos]
//
// Output defaults to <main checkout>/.local/snes-checkpoints/ (shared by all
// git worktrees; override with --out or SNES_CHECKPOINTS), with PNGs and
// checkpoints.json (frame, map, position, ROM sha256 per checkpoint).
// Battery RAM starts empty: the run uses a private copy of the ROM, so
// Mesen's Saves/<rom>.srm of other runs is never touched.
// Use: runMesen({rom, test, outDir, state: '<dir>/waterfall.mss'}), or the CLI's
// fourth argument. Saved in original code, so they load into later builds;
// module WRAM/SRAM inside them is whatever that build left there.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {runMesen} from './mesen.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../..');
const args=process.argv.slice(2);
const opt=(name,fallback)=>{const a=args.find(x=>x.startsWith(`--${name}=`));return a?a.slice(name.length+3):fallback;};

// The main checkout (shared .local/) even when run from a worktree.
export function mainCheckout(){
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  const common=r.status===0?r.stdout.trim():'';
  return common.endsWith('/.git')?dirname(common):repo;
}
export function checkpointDir(){
  return resolve(opt('out',process.env.SNES_CHECKPOINTS??join(mainCheckout(),'.local/snes-checkpoints')));
}
// Mesen keeps battery RAM per ROM file name; give each run a fresh private name.
export function mesenSaveDir(){
  return process.env.MESEN_SAVES??join(homedir(),'Library/Application Support/Mesen2/Saves');
}
export function privateRom(src,tag){
  const dir=resolve(repo,'.local/snes-test/roms');
  mkdirSync(dir,{recursive:true});
  const name=`${tag}-${process.pid}.sfc`;
  const dst=join(dir,name);
  copyFileSync(src,dst);
  rmSync(join(mesenSaveDir(),name.replace(/\.sfc$/,'.srm')),{force:true});
  return dst;
}
export function cleanupRom(rom){
  rmSync(rom,{force:true});
  rmSync(join(mesenSaveDir(),basename(rom).replace(/\.sfc$/,'.srm')),{force:true});
}

async function main(){
  const potos=args.includes('--potos');
  let src=resolve(opt('rom',process.env.SNES_ROM??join(repo,'dist/snes/secret-of-goku.sfc')));
  if(potos&&!opt('rom')){
    // The door request goes through the CORE_TEST mailbox.
    src=resolve(repo,'.local/snes-test/roms/core-test.sfc');
    const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet',`--out=${src}`,'-DCORE_TEST=1'],{cwd:repo,stdio:'inherit'});
    if(b.status!==0)throw Error('CORE_TEST build failed');
  }
  const out=checkpointDir();
  const tmp=resolve(repo,'.local/snes-test/checkpoints-run');
  const rom=privateRom(src,'checkpoints');
  const prelude=[
    `CP_NAME=${JSON.stringify(opt('name','BOY'))}`,
    opt('stop')?`CP_STOP=${JSON.stringify(opt('stop'))}`:'',
    potos?`CP_POTOS_DOOR=${Number(opt('door','3'))}`:'',
  ].join('\n');
  const test=prelude+'\n'+readFileSync(join(here,'checkpoints.lua'),'utf8');
  const r=await runMesen({rom,test,outDir:tmp,timeoutMs:900000});
  cleanupRom(rom);
  const cps=r.results?.checkpoints??[];
  if(r.code!==0||r.results?.error){
    console.error('checkpoints run failed:',r.results?.error??r.output.slice(-2000));
    if(r.results?.error_step)console.error('step:',r.results.error_step);
  }
  mkdirSync(out,{recursive:true});
  const sha=createHash('sha256').update(readFileSync(src)).digest('hex');
  const meta=existsSync(join(out,'checkpoints.json'))?JSON.parse(readFileSync(join(out,'checkpoints.json'),'utf8')):{};
  for(const c of cps){
    for(const ext of ['mss','png'])copyFileSync(join(tmp,`${c.name}.${ext}`),join(out,`${c.name}.${ext}`));
    meta[c.name]={...c,rom:basename(src),romSha256:sha,created:new Date().toISOString()};
  }
  writeFileSync(join(out,'checkpoints.json'),JSON.stringify(meta,null,1));
  for(const c of cps)console.log(`${c.name.padEnd(12)} frame ${String(c.frame).padStart(5)} map ${c.map} (${c.x},${c.y}) -> ${join(out,c.name+'.mss')}`);
  if(r.code!==0||r.results?.error)process.exit(1);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
