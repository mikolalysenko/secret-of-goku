// Driver for snes/tools/retro-host (a headless libretro frontend) in its
// line protocol mode: one JSON step per line in, one JSON reply per line out.
//   const h = await RetroHost.start({core, rom, out, options, sram, wramInit});
//   await h.wait(60); await h.tap('start', 4, 20); const v = await h.r8(0x7E00D0);
//   const results = await h.close();
// The API mirrors the Mesen Lua harness (snes/test/lua/harness.lua).
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';

const here=dirname(fileURLToPath(import.meta.url));
export const repo=resolve(here,'../../..');
const hostSrc=join(repo,'snes/tools/retro-host');
const ext=process.platform==='darwin'?'dylib':process.platform==='win32'?'dll':'so';

// The main checkout's .local (shared by git worktrees), or this checkout's.
export function mainCheckout(){
  const r=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'});
  const common=r.status===0?r.stdout.trim():'';
  return common.endsWith('/.git')?dirname(common):repo;
}
// Directories searched for <name>_libretro.<ext>: $SNES_CORES alone when
// set, else .local/tools/emu in this checkout, then in the main checkout.
export function coreDirs(){
  if(process.env.SNES_CORES)return [resolve(process.env.SNES_CORES)];
  return [...new Set([join(repo,'.local/tools/emu'),join(mainCheckout(),'.local/tools/emu')])];
}
export function findCore(name){
  for(const d of coreDirs()){
    const p=join(d,`${name}_libretro.${ext}`);
    if(existsSync(p))return p;
  }
  return null;
}
// SNES_RETRO_HOST lets worktrees keep their binary outside shared .local/tools.
// Builds the host into .local/tools/emu/retro-host when missing or older
// than its sources. Returns the binary path, or throws with make's output.
export function buildHost(){
  const bin=resolve(process.env.SNES_RETRO_HOST??join(repo,'.local/tools/emu/retro-host'));
  const newest=Math.max(...['retro-host.c','libretro.h','Makefile'].map(f=>statSync(join(hostSrc,f)).mtimeMs));
  if(existsSync(bin)&&statSync(bin).mtimeMs>=newest)return bin;
  const r=spawnSync('make',['-C',hostSrc,`OUT=${bin}`],{encoding:'utf8'});
  if(r.status!==0)throw Error(`retro-host build failed:\n${r.stdout}${r.stderr}`);
  return bin;
}

export class RetroHost{
  static async start({host,core,rom,out,options={},sram=null,wramInit=null,quiet=true}){
    const args=['--core',core,'--rom',rom,'--out',out,'--stdin'];
    for(const [k,v] of Object.entries(options))args.push('--option',`${k}=${v}`);
    if(sram)args.push('--sram',sram);
    if(wramInit)args.push('--wram-init',wramInit);
    if(quiet)args.push('--quiet');
    const h=new RetroHost();
    h.out=out;
    h.child=spawn(host,args,{stdio:['pipe','pipe','pipe']});
    h.stderr='';
    h.child.stderr.on('data',d=>{h.stderr+=d;if(h.stderr.length>2e5)h.stderr=h.stderr.slice(-1e5);});
    h.lines=createInterface({input:h.child.stdout});
    h.queue=[];h.waiters=[];h.exited=null;
    h.lines.on('line',line=>{
      if(h.waiters.length)h.waiters.shift()(line);else h.queue.push(line);
    });
    h.exit=new Promise(res=>h.child.on('close',code=>{h.exited=code;res(code);for(const w of h.waiters.splice(0))w(null);}));
    h.frame=0;
    const info=await h.step({op:'info'});
    h.info=info;
    return h;
  }
  next(){
    if(this.queue.length)return Promise.resolve(this.queue.shift());
    if(this.exited!==null)return Promise.resolve(null);
    return new Promise(res=>this.waiters.push(res));
  }
  async step(obj){
    if(this.exited!==null)throw Error(`retro-host exited (${this.exited}): ${this.stderr.slice(-2000)}`);
    this.child.stdin.write(JSON.stringify(obj)+'\n');
    const line=await this.next();
    if(line===null)throw Error(`retro-host exited (${this.exited}) during ${obj.op}: ${this.stderr.slice(-2000)}`);
    const r=JSON.parse(line);
    if(typeof r.frame==='number')this.frame=r.frame;
    if(!r.ok)throw Error(`retro-host ${obj.op}: ${r.error}`);
    return r;
  }
  wait(frames=1){return this.step({op:'wait',frames});}
  hold(buttons,frames=1){return this.step({op:'hold',buttons,frames});}
  tap(buttons,frames=3,gap=3){return this.step({op:'tap',buttons,frames,gap});}
  shot(name){return this.step({op:'shot',name});}
  async read(mem,addr,size=1){return (await this.step({op:'read',mem,addr,size})).value;}
  async bytes(mem,addr,len){return (await this.step({op:'read',mem,addr,len})).value;}
  r8(addr){return this.read('wram',addr,1);}
  r16(addr){return this.read('wram',addr,2);}
  sram(addr,size=1){return this.read('sram',addr,size);}
  write(mem,addr,bytes){return this.step({op:'write',mem,addr,bytes:[...bytes]});}
  w8(addr,v){return this.write('wram',addr,[v&255]);}
  w16(addr,v){return this.write('wram',addr,[v&255,(v>>8)&255]);}
  result(name,value){return this.step({op:'result',name,value});}
  reset(){return this.step({op:'reset'});}
  reload(){return this.step({op:'reload'});}
  // Like H.waitFor: true once fn() holds, checked every `every` frames.
  async waitFor(fn,frames=600,every=1){
    for(let t=0;t<frames;t+=every){
      if(await fn())return true;
      await this.wait(every);
    }
    return !!(await fn());
  }
  async close(){
    if(this.exited===null){
      this.child.stdin.write(JSON.stringify({op:'quit'})+'\n');
      this.child.stdin.end();
    }
    await this.exit;
    let results=null;
    try{results=JSON.parse(readFileSync(join(this.out,'results.json'),'utf8'));}catch{}
    return results;
  }
  kill(){try{this.child.kill('SIGKILL');}catch{}}
}
