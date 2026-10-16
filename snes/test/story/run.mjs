#!/usr/bin/env node
// Story module checks in Mesen against the browser mod's own story stack.
//   SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/story/run.mjs [case ...]
// Each case imports a browser-mod state (.local/snes-import), sets the story
// fields, starts an event the way the browser's story.request() does, and
// records every native event resolution (requested id -> first script
// pointer) plus every byte read from the compiled banks. Expectations come
// from evaluating the browser's real dispatch entries (snes/gen/story-env.mjs)
// for the same party and state, never from hand-copied data.
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {loadStoryEnvironment} from '../../gen/story-env.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..','..');
const rom=process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc');
const out=resolve(repo,'.local/snes-test/story');
// Private import bundles live in the main checkout's .local/ (worktrees
// share it through git's common directory).
const mainCheckout=()=>{try{const r=spawnSync('git',['rev-parse','--git-common-dir'],{cwd:repo,encoding:'utf8'});return resolve(repo,r.stdout.trim(),'..');}catch{return repo;}};
const imports=process.env.SNES_IMPORT??[resolve(repo,'.local/snes-import'),resolve(mainCheckout(),'.local/snes-import')].find(p=>existsSync(p))??resolve(repo,'.local/snes-import');
const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');
const sym=new Map();
for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
  const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/i);if(m)sym.set(m[3],parseInt(m[1]+m[2],16));
}
const label=n=>{if(!sym.has(n))throw Error(`missing symbol ${n}`);return sym.get(n);};
const catalog=JSON.parse(readFileSync(resolve(repo,'dist/snes/gen/story/catalog.json'),'utf8'));
const base=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
const env=await loadStoryEnvironment(repo,base);
const {eventRange}=await import(pathToFileURL(join(repo,'engine/event-codec.js')).href);
const {waterPalaceApproach}=await import(pathToFileURL(join(repo,'engine/water-palace.js')).href);
const {decodeText}=await import(pathToFileURL(join(repo,'engine/event-codec.js')).href);
const {compiledText}=await import(pathToFileURL(join(repo,'engine/story-compiler.js')).href);
// The browser's choice for event `id` with party `mask` and state `assign`.
const js=(id,mask,assign=[])=>{const e=env.entries.get(0xc00000+eventRange(env.data,id).start);if(!e)return 0xc00000+eventRange(env.data,id).start;return env.evaluate(e,assign,mask).result;};
const alloc=addr=>catalog.allocations.find(a=>a.at===addr);
const text=addr=>{const a=alloc(addr);return compiledText(Array.from(env.scripts.get(addr).bytes)).map(decodeText).join(' | ');};
// SRAM / RAM addresses (snes/src/modules/story/module.asm, core/shared.asm)
const GOKU_ACTIVE=0x316801,P_VERSION=0x316840,P_MASK=0x316841,P_SEEDS=0x316842;
const goku=[[GOKU_ACTIVE,1,1],[P_VERSION,1,1]];
const bundle=name=>join(imports,name);
const readsCover=(reads,at,end)=>{let n=0;for(const [a,b] of reads){const lo=Math.max(a,at),hi=Math.min(b,end-1);if(hi>=lo)n+=hi-lo+1;}return n;};
const ROLE={girl:0x7ee200,sprite:0x7ee400};

const cases=[];
// 1-4. Party variants: the Moogle (24B) has four authored variants.
for(const [name,file,writes,mask] of[
  ['party-solo','emulator-probe__potos-state',[],0],
  ['party-both','barrier-audit__potos-probe',[],3],
  ['party-girl','barrier-audit__potos-probe',[[ROLE.sprite,0,1]],1],
  ['party-sprite','barrier-audit__potos-probe',[[ROLE.girl,0,1]],2],
]){
  cases.push({name,bundle:file,writes:[...goku,...writes],request:[0x24b,0],frames:900,mash:24,shots:[60,200,400],
    check(r){
      const want=js(0x24b,mask),first=r.trace.find(t=>t[0]===0x24b);
      const a=alloc(want);
      return [
        ['24B resolves to the browser variant for mask '+mask,first&&first[1]===want,`native ${first?hex(first[1],6):'none'}, browser ${hex(want,6)} "${text(want).slice(0,60)}"`],
        ['the compiled text was read',readsCover(r.reads,a.at,a.end)>=a.length*0.8,`${readsCover(r.reads,a.at,a.end)}/${a.length} bytes`],
      ];
    }});
}
// 5. Luka's menu (134) -> Advice (85) with three Balls in the ledger.
// CF C3 = 1: the one-time spear gift (92 -> 13A) was already given; its
// sound-bank upload cannot complete in imported states (APU handshake).
cases.push({name:'luka-advice',bundle:'emulator-probe__potos-state',writes:[...goku,[P_MASK,0x0b,1],[P_SEEDS,0x0b,1],[0x7ecfc3,1,1]],request:[0x134,0],frames:1500,mash:30,shots:[40,120,300,600],
  check(r){
    const menu=js(0x134,0),advice=js(0x85,0,[['questCount',3]]);
    const m=r.trace.find(t=>t[0]===0x134),a=r.trace.find(t=>t[0]===0x85);
    return [
      ['134 resolves to Luka\'s menu',m&&m[1]===menu,`native ${m?hex(m[1],6):'none'} browser ${hex(menu,6)}`],
      ['Advice (85) chooses the 3/7 page',a&&a[1]===advice,`native ${a?hex(a[1],6):'none'} browser ${hex(advice,6)} "${text(advice).slice(0,40)}"`],
      ['advice text was read',a&&readsCover(r.reads,advice,alloc(advice).end)>=alloc(advice).length*0.8,''],
    ];
  }});
// 6. Water Palace Jema (131) before the plate (CF11 = 7): dynamic walk.
cases.push({name:'water-palace-walk',bundle:'power-flight-fixes__jema-7',writes:[...goku],request:[0x131,0],frames:30,mash:0,shots:[20],dump_water:true,
  check(r){
    const w=readFileSync(join(bundle('power-flight-fixes__jema-7'),'wram.bin'));
    const word=a=>w[a]|w[a+1]<<8;
    let jema=null;for(let i=0;i<12;i++){const b=0xe000+i*0x200;if((w[b]&1)&&w[b+0x180]===0xa0){jema={index:i};break;}}
    let leader=0xe000;for(const b of[0xe000,0xe200,0xe400])if((w[b]&1)&&(w[b+0x2c]&1)){leader=b;break;}
    const want=jema?waterPalaceApproach({x:word(leader+2),y:word(leader+4)},jema):null;
    const t=r.trace.find(x=>x[0]===0x131);
    const got=r.water?.slice(0,want?.length??0);
    return [
      ['Jema found in the state',!!jema,jema?`index ${jema.index}`:''],
      ['131 resolves to the SRAM walk',t&&t[1]===0x336000,t?hex(t[1],6):'none'],
      ['walk bytes equal water-palace.js',want&&got&&want.every((v,i)=>v===got[i]),want?`${want.length} bytes`:''],
    ];
  }});

const only=process.argv.slice(2);
mkdirSync(out,{recursive:true});
let failures=0;
const luaBody=readFileSync(join(here,'story.lua'),'utf8');
const lua=v=>Array.isArray(v)?'{'+v.map(lua).join(',')+'}':typeof v==='string'?JSON.stringify(v):typeof v==='boolean'?String(v):v===null||v===undefined?'nil':String(v);
for(const c of cases){
  if(only.length&&!only.includes(c.name))continue;
  if(!existsSync(bundle(c.bundle))){console.log(`skip ${c.name}: no bundle ${c.bundle}`);continue;}
  const prelude=`CASE = {bundle=${lua(bundle(c.bundle))}, writes=${lua(c.writes)}, before=${lua(c.before??[])}, request=${lua(c.request)}, frames=${c.frames}, mash=${c.mash??0}, shots=${lua(c.shots??[])}, resolve=${label('story_resolve_done')}, dump_water=${!!c.dump_water}, stop_idle=${!!c.stopIdle}, rom_writes=${lua(c.romWrites??[])}}\n`;
  const r=await runMesen({rom,test:prelude+luaBody,outDir:join(out,c.name)});
  const res=r.results??{};
  if(res.error||!res.trace){console.log(`FAIL ${c.name}: ${res.error??'no results'}\n${r.output.slice(-1500)}`);failures++;continue;}
  writeFileSync(join(out,c.name,'trace.txt'),res.trace.map(([id,p,f])=>`${f} ${hex(id,3)} -> ${hex(p,6)}${alloc(p)?' ['+hex(alloc(p).id,3)+' m'+alloc(p).mask+']':''}`).join('\n'));
  const checks=c.check(res);
  const ok=checks.every(x=>x[1]);
  if(!ok)failures++;
  console.log(`${ok?'pass':'FAIL'} ${c.name} (${(r.ms/1000).toFixed(1)}s)`);
  for(const [what,pass,detail] of checks)console.log(`   ${pass?'ok  ':'BAD '} ${what}${detail?' — '+detail:''}`);
}
console.log(failures?`${failures} story case(s) failed`:'story: all cases passed');
process.exit(failures?1:0);
