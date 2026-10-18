#!/usr/bin/env node
// Build and verify a patch-only SNES release. Never tags, pushes or uploads.
// node snes/release.mjs [--version=0.1.0-preview.1]
import {readFileSync,writeFileSync,mkdirSync,rmSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {loadBaseRom} from './build.mjs';
import {createIps,applyIps} from './tools/ips.mjs';
import {crc32} from '../tools/rom/rom.mjs';

const repo=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
if(args.some(a=>!a.startsWith('--version=')))throw Error('Usage: node snes/release.mjs [--version=0.1.0-preview.1]');
const version=args.find(a=>a.startsWith('--version='))?.slice(10)??'0.1.0-preview.1';
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(version))throw Error('Invalid SNES release version');
const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceCommit=git('rev-parse','HEAD');
const dirty=git('status','--porcelain','--untracked-files=normal')!=='';
execFileSync(process.execPath,['snes/build.mjs','--quiet','--strict'],{cwd:repo,stdio:'inherit'});
const source=loadBaseRom(),target=readFileSync(join(repo,'dist/snes/secret-of-goku.sfc'));
assert.equal(target.length,0x800000,'Expected the 8 MiB ExHiROM build');
assert.equal(target[0x40FFD5],0x35,'Expected FastROM ExHiROM mapping');
const patch=createIps(source,target);
assert.deepEqual(applyIps(source,patch),target,'IPS must reproduce the release ROM byte for byte');

const out=join(repo,'release/snes',version),stage=join(out,'package');
mkdirSync(out,{recursive:true});rmSync(stage,{recursive:true,force:true});mkdirSync(stage);
const name=`secret-of-goku-snes-${version}`,tag=`snes-v${version}`;
const patchName=name+'.ips',zipName=name+'.zip';
const url=`https://github.com/mikolalysenko/secret-of-goku/releases/tag/${tag}`;
const substitutions={VERSION:version,COMMIT:sourceCommit+(dirty?' (uncommitted changes; rebuild after committing)':''),
  RELEASE_URL:url,PATCH_NAME:patchName,BASE_SIZE:String(source.length),BASE_CRC32:crc32(source).toUpperCase(),
  BASE_SHA1:createHash('sha1').update(source).digest('hex'),BASE_SHA256:sha(source),
  ROM_SHA256:sha(target),PATCH_SHA256:sha(patch)};
const instructions=readFileSync(join(repo,'snes/PLAYING.txt'),'utf8').replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,k)=>{assert(k in substitutions,k);return substitutions[k];});
writeFileSync(join(stage,patchName),patch);writeFileSync(join(out,patchName),patch);
writeFileSync(join(stage,'README.txt'),instructions);
copyFileSync(join(repo,'CREDITS.md'),join(stage,'CREDITS.md'));
copyFileSync(join(repo,'LICENSE'),join(stage,'LICENSE.txt'));
const files=[patchName,'README.txt','CREDITS.md','LICENSE.txt'];
const sums=files.map(f=>`${sha(readFileSync(join(stage,f)))}  ${f}\n`).join('');
writeFileSync(join(stage,'SHA256SUMS'),sums);
const zip=join(out,zipName);rmSync(zip,{force:true});
execFileSync('zip',['-X','-q',zip,...files,'SHA256SUMS'],{cwd:stage});
const entries=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries,[...files,'SHA256SUMS'].sort(),'Release archive must contain only the patch and documentation');
const archived=execFileSync('unzip',['-p',zip,patchName],{maxBuffer:32*1024*1024});
assert.deepEqual(applyIps(source,archived),target,'Archived IPS must reproduce the release ROM');
writeFileSync(join(out,'SHA256SUMS'),[patchName,zipName].map(f=>`${sha(readFileSync(join(out,f)))}  ${f}\n`).join(''));
writeFileSync(join(out,'build.json'),JSON.stringify({version,tag,sourceCommit,dirty,base:{bytes:source.length,sha256:sha(source)},rom:{bytes:target.length,sha256:sha(target)},patch:{file:patchName,bytes:patch.length,sha256:sha(patch)},archive:{file:zipName,sha256:sha(readFileSync(zip))}},null,2)+'\n');
console.log(JSON.stringify({out,patch:patchName,archive:zipName,sourceCommit,dirty,romSha256:sha(target)},null,2));
if(dirty)console.warn('Local preview only: commit the source and rerun before uploading these files.');
