import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectRom,normalizeRom,US_ROM} from '../tools/rom/rom.mjs';
const run=promisify(execFile),input=process.argv[2],output=resolve('.local/rom/secret-of-mana-us.sfc');
try{
  if(!input)throw Error('Usage: npm run rom:import -- "/path/to/Secret of Mana (USA).zip" (or .sfc / .smc)');
  const source=resolve(input);let bytes;
  if(/\.zip$/i.test(source)){
    const {stdout}=await run('unzip',['-Z','-1',source],{maxBuffer:1024*1024});
    const entries=stdout.trim().split(/\r?\n/).filter(s=>/\.(sfc|smc)$/i.test(s));
    if(entries.length!==1)throw Error('The ZIP must contain exactly one .sfc or .smc file.');
    ({stdout:bytes}=await run('unzip',['-p',source,entries[0]],{encoding:'buffer',maxBuffer:3*1024*1024}));
  }else bytes=await readFile(source);
  const info=inspectRom(bytes);if(info.sha256!==US_ROM.sha256)throw Error('Unsupported ROM. This extraction and mod target the original US retail revision.');
  await mkdir('.local/rom',{recursive:true});
  let same=false;try{const a=await stat(source),b=await stat(output);same=a.dev===b.dev&&a.ino===b.ino;}catch{}
  if(!same)await writeFile(output,normalizeRom(bytes).bytes);
  console.log(`Verified ${info.knownRevision}.`);console.log(`Local ROM: ${output}`);console.log('Run npm run rom:extract to regenerate maps and data.');
}catch(error){console.error(error.message);process.exitCode=1;}
