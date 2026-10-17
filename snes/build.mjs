#!/usr/bin/env node
// Builds the standalone Secret of Goku cartridge:
//   node snes/build.mjs [--out=dist/snes/secret-of-goku.sfc] [--define NAME=VAL ...]
// 1. Verifies the tracked US cartridge (rom/secret-of-mana-us.sfc).
// 2. Expands it to a 32 Mbit HiROM image (banks C0-FF).
// 3. Runs the data generators (snes/gen/*.mjs) into dist/snes/gen/.
// 4. Assembles snes/src/main.asm with asar onto the expanded image.
// 5. Checks hijack overlaps and bank budgets, writes the symbol file.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,copyFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'..');
const args=process.argv.slice(2);
const opt=(name,fallback)=>{const a=args.find(x=>x.startsWith(`--${name}=`));return a?a.slice(name.length+3):fallback;};
const out=resolve(repo,opt('out','dist/snes/secret-of-goku.sfc'));
const genDir=resolve(repo,'dist/snes/gen');
const defines=args.filter(a=>a.startsWith('-D'));
const quiet=args.includes('--quiet');
const log=(...m)=>{if(!quiet)console.log(...m);};

export const BASE_SHA256='4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f';
export const ROM_SIZE=0x400000;

export function loadBaseRom(){
  let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
  if(rom.length%0x8000===512)rom=rom.slice(512);
  const sha=createHash('sha256').update(rom).digest('hex');
  if(sha!==BASE_SHA256)throw Error(`rom/secret-of-mana-us.sfc is not the verified US cartridge (sha256 ${sha})`);
  return rom;
}

async function runGenerators(base){
  mkdirSync(genDir,{recursive:true});
  const dir=join(here,'gen');
  const names=existsSync(dir)?readdirSync(dir).filter(f=>f.endsWith('.mjs')&&!f.startsWith('_')).sort():[];
  const manifest=[];
  for(const name of names){
    const mod=await import(pathToFileURL(join(dir,name)).href);
    if(typeof mod.generate!=='function')continue;
    const t0=Date.now();
    const outDir=join(genDir,name.replace(/\.mjs$/,''));
    mkdirSync(outDir,{recursive:true});
    await mod.generate({rom:base,repo,outDir,genDir});
    manifest.push({name,ms:Date.now()-t0});
    log(`  gen ${name} (${Date.now()-t0} ms)`);
  }
  return manifest;
}

function assemble(image){
  mkdirSync(dirname(out),{recursive:true});
  writeFileSync(out,image);
  const sym=out.replace(/\.sfc$/,'.sym');
  const r=spawnSync('asar',['--fix-checksum=on','--symbols=wla',`--symbols-path=${sym}`,`-I${genDir}`,`-I${join(here,'src')}`,...defines,join(here,'src/main.asm'),out],{encoding:'utf8',cwd:repo});
  const text=(r.stdout||'')+(r.stderr||'');
  if(r.status!==0){console.error(text);throw Error('asar failed');}
  return text;
}

// asar does not track REP/SEP, so an immediate's width comes from how it is
// written. Require an explicit .b/.w on every accumulator/index immediate in
// our sources (SEP/REP/PEA/BRK-style operands are always fixed width).
function lintImmediates(dir){
  const problems=[];
  const walk=d=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);
    if(e.isDirectory())walk(p);else if(e.name.endsWith('.asm')){
      readFileSync(p,'utf8').split('\n').forEach((line,i)=>{
        const code=line.replace(/;.*$/,'');
        for(const part of code.split(/(?<!\.):(?!\S*\])/)){
          const m=part.match(/\b(LDA|LDX|LDY|CMP|CPX|CPY|ADC|SBC|AND|ORA|EOR|BIT)(\.[bwBW])?\s+#/);
          if(m&&!m[2])problems.push(`${p.slice(repo.length+1)}:${i+1}: ${part.trim()}`);
        }
      });
    }}};
  walk(dir);
  return problems;
}

// ROM ownership check. asar silently lets a later org overwrite earlier
// bytes, so two modules placing data in the same bank half corrupt each other
// without an error. Every label defined at column 0 in snes/src/modules/<m>/
// (and in dist/snes/gen/<m>*/) belongs to <m>; core files, modules.asm and the
// generated hook tables belong to core. A 32 KiB bank half (expansion area,
// ROM >= 0x200000) holding labels of two modules is reported.
function labelOwners(){
  const owners=new Map();
  const scan=(dir,owner)=>{
    if(!existsSync(dir))return;
    for(const e of readdirSync(dir,{withFileTypes:true})){
      const p=join(dir,e.name);
      if(e.isDirectory())scan(p,owner);
      else if(e.name.endsWith('.asm'))for(const line of readFileSync(p,'utf8').split('\n')){
        const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*):/);
        if(m&&!owners.has(m[1]))owners.set(m[1],owner);
      }
    }
  };
  const modDir=join(here,'src/modules');
  if(existsSync(modDir))for(const e of readdirSync(modDir,{withFileTypes:true}))if(e.isDirectory())scan(join(modDir,e.name),e.name);
  if(existsSync(genDir))for(const e of readdirSync(genDir,{withFileTypes:true}))if(e.isDirectory()){
    const owner=e.name.replace(/[-_].*$/,'');
    if(!['story','debug'].includes(owner)||!/hooks/.test(e.name))scan(join(genDir,e.name),owner);
  }
  return owners;
}
function checkOwnership(symPath){
  if(!existsSync(symPath))return [];
  const owners=labelOwners(),halves=new Map();
  for(const line of readFileSync(symPath,'utf8').split('\n')){
    const m=line.match(/^([0-9A-Fa-f]{2}):([0-9A-Fa-f]{4}) (\S+)$/);
    if(!m)continue;
    const bank=parseInt(m[1],16),adr=parseInt(m[2],16),name=m[3].replace(/^:/,'');
    let pc=-1;
    if(bank>=0xC0)pc=((bank-0xC0)<<16)|adr;
    else if(bank>=0x80&&bank<0xC0&&adr>=0x8000)pc=((bank-0x80)<<16)|adr;
    if(pc<0x200000)continue;
    const owner=owners.get(name);
    if(!owner)continue;
    const half=pc>>15;
    if(!halves.has(half))halves.set(half,new Map());
    const h=halves.get(half);h.set(owner,(h.get(owner)??0)+1);
  }
  const problems=[];
  for(const[half,h]of[...halves].sort((a,b)=>a[0]-b[0]))if(h.size>1){
    const bank=0xC0+(half>>1),side=half&1?'8000-FFFF':'0000-7FFF';
    problems.push(`$${bank.toString(16).toUpperCase()}:${side}: ${[...h].map(([o,n])=>`${o} (${n} labels)`).join(', ')}`);
  }
  return problems;
}

// Hijack bookkeeping: %hijack() prints "HIJACK <addr> <len> <module>".
function checkHijacks(text){
  const hits=[];
  for(const line of text.split('\n')){
    const m=line.match(/HIJACK ([0-9A-F]{6}) (\d+) (\S+)/i);
    if(m)hits.push({addr:parseInt(m[1],16),len:Number(m[2]),mod:m[3]});
  }
  hits.sort((a,b)=>a.addr-b.addr);
  for(let i=1;i<hits.length;i++){
    const p=hits[i-1],c=hits[i];
    if(c.addr<p.addr+p.len)throw Error(`Hijack overlap: ${p.mod} ${p.addr.toString(16)}+${p.len} and ${c.mod} ${c.addr.toString(16)}+${c.len}`);
  }
  return hits;
}

export async function build(){
  const t0=Date.now();
  const lint=lintImmediates(join(here,'src'));
  if(lint.length){
    console.warn(`WARNING: ${lint.length} immediate(s) without an explicit .b/.w width (asar ignores REP/SEP):`);
    for(const l of lint.slice(0,40))console.warn('  '+l);
    if(args.includes('--strict'))throw Error('immediate width lint failed');
  }
  const base=loadBaseRom();
  const image=new Uint8Array(ROM_SIZE);
  image.set(base);
  log('Secret of Goku SNES build');
  await runGenerators(base);
  const text=assemble(image);
  const hijacks=checkHijacks(text);
  const shared=checkOwnership(out.replace(/\.sfc$/,'.sym'));
  if(shared.length){
    console.warn(`WARNING: ${shared.length} ROM bank half/halves hold labels of more than one module (possible overwrite):`);
    for(const l of shared)console.warn('  '+l);
    if(args.includes('--strict'))throw Error('ROM ownership check failed');
  }
  for(const line of text.split('\n'))if(line.trim()&&!/^HIJACK /.test(line.trim())&&!quiet)console.log('  asar:',line);
  const rom=new Uint8Array(readFileSync(out));
  if(rom.length!==ROM_SIZE)throw Error(`Unexpected ROM size ${rom.length}`);
  const sha=createHash('sha256').update(rom).digest('hex');
  log(`  ${hijacks.length} hijacks, ${(Date.now()-t0)} ms`);
  log(`  wrote ${out}\n  sha256 ${sha}`);
  return {out,sha,hijacks};
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  build().catch(e=>{console.error(e.message);process.exit(1);});
}
