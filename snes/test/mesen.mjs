// Runs a Lua test inside Mesen2's headless --testRunner mode.
//   import {runMesen} from './mesen.mjs';
//   const r = await runMesen({rom, test: 'function test() H.wait(60) H.shot("a") end', outDir});
// Mesen is expected at .local/tools/mesen/Mesen.app (macOS) or $MESEN.
// Lua I/O must be enabled once: Mesen2 settings.json "AllowIoOsAccess": true.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../..');
export function mesenPath(){
  if(process.env.MESEN)return process.env.MESEN;
  const mac=join(repo,'.local/tools/mesen/Mesen.app/Contents/MacOS/Mesen');
  if(existsSync(mac))return mac;
  const linux=join(repo,'.local/tools/mesen/Mesen');
  if(existsSync(linux))return linux;
  throw Error('Mesen2 not found: set MESEN or unpack it under .local/tools/mesen');
}
const luaString=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
export async function runMesen({rom,test,outDir,state=null,timeoutMs=600000,clean=true}){
  outDir=resolve(outDir);
  if(clean&&existsSync(outDir))rmSync(outDir,{recursive:true,force:true});
  mkdirSync(outDir,{recursive:true});
  const harness=readFileSync(join(here,'lua/harness.lua'),'utf8');
  // SNES_LUA_PRELUDE: an extra Lua file run before every test (tracers that
  // ride along existing suites); it may only register callbacks at load.
  const extra=process.env.SNES_LUA_PRELUDE?readFileSync(process.env.SNES_LUA_PRELUDE,'utf8')+'\n':'';
  const prelude=`H_OUT=${luaString(outDir)}\nH_STATE=${state?luaString(resolve(state)):'nil'}\n`+extra;
  const script=join(outDir,'test.lua');
  writeFileSync(script,prelude+test+'\n'+harness);
  const started=Date.now();
  // Mesen's own test-runner limit defaults to 100 s, which long tests hit on a
  // loaded machine; this harness enforces timeoutMs itself.
  const child=spawn(mesenPath(),['--testRunner',`--timeout=${Math.ceil(timeoutMs/1000)+30}`,resolve(rom),script],{stdio:['ignore','pipe','pipe']});
  let stdout='';
  child.stdout.on('data',d=>{stdout+=d;if(stdout.length>1e6)stdout=stdout.slice(-5e5);});
  child.stderr.on('data',d=>{stdout+=d;});
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  const code=await new Promise(res=>child.on('close',c=>res(c)));
  clearTimeout(timer);
  const output=stdout.split('\n').filter(l=>l&&!l.includes('Uninitialized memory read')).join('\n');
  let results=null;
  try{results=JSON.parse(readFileSync(join(outDir,'results.json'),'utf8'));}catch{}
  return {code,results,output,ms:Date.now()-started,outDir};
}
// CLI: node snes/test/mesen.mjs rom.sfc test.lua outDir [state.mss]
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [rom,lua,out,state]=process.argv.slice(2);
  const r=await runMesen({rom,test:readFileSync(lua,'utf8'),outDir:out,state});
  console.log(JSON.stringify({code:r.code,ms:r.ms,results:r.results},null,1));
  if(r.output)console.log(r.output.slice(-4000));
  process.exit(r.code===0?0:1);
}
