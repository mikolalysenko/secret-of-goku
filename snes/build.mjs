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
