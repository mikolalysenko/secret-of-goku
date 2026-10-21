#!/usr/bin/env node
// Replay the browser mod, including its native hooks, at video-frame cadence.
// Outputs and reconstructed snapshots stay private under .local/snes-test/.
// --speed=both|native|fast (default both); --repeat=5 --flight-corridor;
// --perf selects the six perf scenes; otherwise selects the 13 gameplay cases.
// --cartridge=path also replays the identical bundle/setup/input in Mesen.
// --cartridge-only skips Chromium (useful after a cartridge optimization).
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadCore} from '../../tools/snesjs-export.mjs';
import {snapshot,restore,hash} from '../../../engine/state.js';
import {GAMEPLAY_CASES,PERF_SCENES,PERF_SCRIPT} from './cases.mjs';
import {runMesen} from '../mesen.mjs';
import {privateRom,cleanupRom} from '../checkpoints.mjs';

const repo=resolve(import.meta.dirname,'../../..'),args=process.argv.slice(2);
const opt=(key,fallback)=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const repeat=Number(opt('repeat','1')),speed=opt('speed','both'),perf=args.includes('--perf');
if(!Number.isInteger(repeat)||repeat<1||repeat>100)throw Error('invalid --repeat');
if(!['both','native','fast'].includes(speed))throw Error('invalid --speed');
const root=resolve(repo,opt('out','.local/snes-test/browser-baseline'));
mkdirSync(root,{recursive:true});
const only=args.filter(a=>!a.startsWith('--'));
const cases=perf?PERF_SCENES.map(n=>[n,`preset__${n}`,PERF_SCRIPT]):GAMEPLAY_CASES;
for(const name of only)if(!cases.some(c=>c[0]===name))throw Error('unknown case: '+name);
const rom=new Uint8Array(readFileSync(join(repo,'rom/secret-of-mana-us.sfc')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const cartridge=opt('cartridge'),cartridgeOnly=args.includes('--cartridge-only');
if(cartridgeOnly&&!cartridge)throw Error('--cartridge-only requires --cartridge');

async function cartridgeRun(name,bundle,script,setup){
  const copy=privateRom(resolve(repo,cartridge),'baseline-'+name);
  const test=`
function test()
  H.wait(5)
  assert(H.importSnesJs(${JSON.stringify(join(repo,'.local/snes-import',bundle))}), 'import failed')
  ${perf?'':'H.w8(0x316001,1)'}
  H.wait(${perf?32:45})
  local function buttons(text)
    H.input={};for b in text:gmatch('[^+]+') do if b~='none' then H.input[b]=true end end
  end
  for pad,n in (${JSON.stringify(setup)}):gmatch('([^,:]+):(%d+)') do buttons(pad);H.wait(tonumber(n)) end
  local measuring=true
  local misses,nmiFrames,completed=0,0,0
  for _,pc in ipairs({0x00C0A8,0x80C0A8,0x0088CF,0x8088CF}) do
    emu.addMemoryCallback(function()
      if not measuring then return end
      nmiFrames=nmiFrames+1
      if H.r8(0x7E00EC)&1==0 then misses=misses+1 end
    end,emu.callbackType.exec,pc,pc)
  end
  for _,pc in ipairs({0x00B077,0x80B077,0x008089,0x808089}) do
    emu.addMemoryCallback(function() if measuring then completed=completed+1 end end,emu.callbackType.exec,pc,pc)
  end
  local x0=H.r16(0x7EE002);local direction,turns=1,0
  local videoFrames,maps=0,{}
  for pad,n in (${JSON.stringify(Array(repeat).fill(script).join(','))}):gmatch('([^,:]+):(%d+)') do
    buttons(pad)
    for i=1,tonumber(n) do
      if ${args.includes('--flight-corridor')&&name==='fly-ki'} and (H.input.left or H.input.right) then
        local x=H.r16(0x7EE002);local nextDirection=direction
        if x>=x0+12 then nextDirection=-1 elseif x<=x0-12 then nextDirection=1 end
        if direction~=nextDirection then turns=turns+1 end
        direction=nextDirection;H.input.left=direction<0;H.input.right=direction>0
      end
      H.wait(1);videoFrames=videoFrames+1;maps[tostring(H.r16(0x7E00DC))]=true
    end
  end
  measuring=false;H.input=nil
  H.result('videoFrames',videoFrames);H.result('missedVblanks',misses)
  H.result('nmiFrames',nmiFrames);H.result('completed',completed);H.result('maps',maps)
  H.result('flightCorridorTurns',turns)
end`;
  try{
    const result=await runMesen({rom:copy,state:resolve(repo,process.env.SNES_CHECKPOINTS??'.local/snes-checkpoints','waterfall.mss'),test,outDir:join(root,name+'-cartridge'),exactFrames:true});
    if(result.code!==0||result.results?.error||!result.results)throw Error(`Mesen ${name}: ${result.results?.error??result.output}`);
    const row={name,mode:'cartridge',bundle,romSha256:sha(readFileSync(resolve(repo,cartridge))),...result.results};
    if(row.nmiFrames!==row.videoFrames)throw Error(`${name}: missing cartridge NMI observations`);
    console.log(`${name} (cartridge): ${row.missedVblanks}/${row.videoFrames} CPU misses`);
    return row;
  }finally{cleanupRom(copy);}
}

// Reproduce the exporter's exact advance with the unmodified cartridge. This
// includes CPU/SPC phase, unlike reconstructing just WRAM from the bundle.
function startingState(bundle){
  const dir=join(repo,'.local/snes-import',bundle),regs=JSON.parse(readFileSync(join(dir,'regs.json')));
  const source=regs.source.slice(regs.source.indexOf('.local/'));
  if(!source.startsWith('.local/'))throw Error('bundle source is outside .local');
  const saved=JSON.parse(readFileSync(join(repo,source))),s=loadCore(rom);
  restore(s,{...saved,romHash:hash(s.cart.data)});
  for(let i=0;i<regs.steps;i++)s.cycle(false);
  s.catchUpApu();
  for(const [name,data] of [['wram',s.ram],['vram',s.ppu.vram],['cgram',s.ppu.cgram],['sram',s.cart.sram],['aram',s.apu.ram],['dsp',s.apu.dsp.ram]]){
    const bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
    if(!bytes.equals(readFileSync(join(dir,`${name}.bin`))))throw Error(`${bundle}: ${name} differs from import bundle`);
  }
  const oam=Buffer.concat([Buffer.from(s.ppu.oam.buffer),Buffer.from(s.ppu.highOam.buffer)]);
  if(!oam.equals(readFileSync(join(dir,'oam.bin'))))throw Error(`${bundle}: OAM differs from import bundle`);
  if(s.cpu.br[4]!==regs.cpu.pc||s.cpu.r[1]!==regs.cpu.k||s.yPos!==regs.line||s.xPos>>2!==regs.dot)throw Error('bundle CPU phase mismatch');
  return {state:{...snapshot(s),goku:saved.goku,arrival:saved.arrival,opening:saved.opening},source,steps:regs.steps,wramSha256:sha(s.ram),savedFastRom:s.fastMem};
}

// Wait for this server's listen message; never attach to another worktree's
// server, and never write the shared reference/import directories.
const server=cartridgeOnly?null:spawn(process.execPath,['scripts/serve.mjs'],{cwd:repo,env:{...process.env,PORT:opt('port','5294')},stdio:['ignore','pipe','pipe']});
if(server)await new Promise((res,rej)=>{server.stdout.once('data',res);server.once('exit',c=>rej(Error(`server exited ${c}`)));server.once('error',rej);});
let browser;
const summary=[];
try{
  if(!cartridgeOnly)browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
  for(const [name,bundle,script,setup=''] of cases){
    if(only.length&&!only.includes(name))continue;
    if(cartridge)summary.push(await cartridgeRun(name,bundle,script,setup));
    if(cartridgeOnly)continue;
    const initial=startingState(bundle);
    for(const mode of speed==='both'?['native','fast']:[speed]){
      const page=await browser.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(`http://127.0.0.1:${opt('port','5294')}/?debug=true`);
        await page.waitForFunction(()=>window.mana?.ready,null,{timeout:240000});
        const result=await page.evaluate(async({initial,script,setup,repeat,mode,perf,corridor})=>{
          const m=window.mana,s=m.snes,c=s.cpu;
          m.pause();m.restore({...initial.state,romHash:m.hash(s.cart.data)});
          // Restore native bytes again after the mod's restore/reset hooks.
          const {restore,hash}=await import('/engine/state.js');
          restore(s,{...initial.state,romHash:hash(s.cart.data)});
          // Gameplay imports enable Goku and base-form powers regardless of
          // the native-only animation fixture's disabled browser overlay.
          if(!perf){Object.assign(m.mod.options,{enabled:true,power:true,superSaiyan:false});m.arrival.restore({version:1,phase:'complete',ticks:0,arrived:true,started:true,crater:false});}
          const access={};
          for(const fast of [false,true]){
            s.fastMem=fast;access[fast?'fast':'slow']=Object.fromEntries([0x008000,0x808000,0xC00000,0x400000,0x7E0000,0x002100,0x004016].map(a=>[a.toString(16),s.getAccessTime(a)]));
          }
          for(const [address,slow,fast] of [[0x008000,8,8],[0x808000,8,6],[0xC00000,8,6],[0x400000,8,8],[0x7E0000,8,8],[0x002100,6,6],[0x004016,12,12]]){
            if(access.slow[address.toString(16)]!==slow||access.fast[address.toString(16)]!==fast)throw Error('unexpected memory speed model');
          }
          s.fastMem=initial.savedFastRom;
          const bits={b:0,y:1,select:2,start:3,up:4,down:5,left:6,right:7,a:8,x:9,l:10,r:11};
          const expand=text=>text?text.split(',').flatMap(part=>{const [buttons,n]=part.split(':');return Array.from({length:Number(n)},()=>buttons.split('+').filter(b=>b!=='none').map(b=>{if(bits[b]===undefined)throw Error('bad button');return bits[b];}));}):[];
          const step=buttons=>{if(mode==='fast')s.fastMem=true;m.run(1,buttons);};
          // Finish the imported partial frame before the same settle window.
          step([]);
          for(let i=0;i<(perf?32:45);i++)step([]);
          for(const b of expand(setup))step(b);
          const misses=[],finishes=[],maps={},actions={},fastFrames={};let videoFrame=0,nmiFrames=0,flightFrames=0,turns=0,direction=1,maxTravel=0;
          const x0=m.read16(0xe002),y0=m.read16(0xe004);
          const previous=c.cycle;
          function probe(){
            const bank=c.r[1]&0x3f,pc=c.br[4];
            if(bank===0&&(pc===0xC0A8||pc===0x88CF)){
              nmiFrames++;
              if(!(s.ram[0xec]&1))misses.push({frame:videoFrame,world:pc===0x88CF,ec:s.ram[0xec],phase:s.ram[0x56],line:s.yPos,dot:s.xPos,returnPc:s.ram[(c.br[3]+2)&65535]|s.ram[(c.br[3]+3)&65535]<<8,returnBank:s.ram[(c.br[3]+4)&65535]});
            }
            if(bank===0&&(pc===0xB077||pc===0x8089))finishes.push({frame:videoFrame,line:s.yPos,dot:s.xPos});
            return previous.call(this);
          }
          c.cycle=probe;c.registerBreakpoints(probe,previous,[[0,0xC0A8],[0,0x88CF],[0,0xB077],[0,0x8089]]);
          for(let iteration=0;iteration<repeat;iteration++)for(const input of expand(script)){
            let b=input;
            if(corridor&&(b.includes(6)||b.includes(7))){
              const x=m.read16(0xe002),next=x>=x0+12?-1:x<=x0-12?1:direction;
              if(next!==direction)turns++;direction=next;b=[...b.filter(x=>x!==6&&x!==7),direction<0?6:7];
            }
            step(b);videoFrame++;
            const act=m.mod.action?.kind??'none';actions[act]=(actions[act]??0)+1;
            const map=m.read16(0xdc);maps[map]=(maps[map]??0)+1;
            if(m.mod.localFlight||m.mod.worldFlight)flightFrames++;
            fastFrames[String(s.fastMem)]=(fastFrames[String(s.fastMem)]??0)+1;
            maxTravel=Math.max(maxTravel,Math.abs(m.read16(0xe002)-x0)+Math.abs(m.read16(0xe004)-y0));
          }
          c.cycle=previous;
          return {videoFrames:videoFrame,missedVblanks:misses.length,nmiFrames,completed:finishes.length,misses,finishes,maps,actions,flightFrames,flightCorridorTurns:turns,maxTravel,fastFrames,access,end:{map:m.read16(0xdc),x:m.read16(0xe002),y:m.read16(0xe004),form:m.mod.options.superSaiyan}};
        },{initial,script,setup,repeat,mode,perf,corridor:args.includes('--flight-corridor')&&name==='fly-ki'});
        if(errors.length)throw Error(errors.join('\n'));
        if(result.nmiFrames!==result.videoFrames)throw Error(`${name}: missing NMI observations (${result.nmiFrames}/${result.videoFrames})`);
        if(Object.keys(result.maps).length!==1)throw Error(`${name}: left the measured scene`);
        const action=name.includes('punch')?'punch':name.includes('ki')?'blast':name==='teleport'?'teleport':name==='charge'?'charge':name==='focus-grass'?'focus':name==='transform-grass'?'transform':null;
        if(!perf&&action&&!result.actions[action])throw Error(`${name}: browser did not exercise ${action}`);
        if(!perf&&(name.includes('fly')||name.includes('flight'))&&!result.flightFrames)throw Error(`${name}: browser did not fly`);
        if(mode==='fast'&&result.fastFrames.true!==result.videoFrames)throw Error(`${name}: MEMSEL did not stay enabled`);
        const row={name,mode,bundle,source:initial.source,steps:initial.steps,wramSha256:initial.wramSha256,savedFastRom:initial.savedFastRom,...result};
        summary.push(row);writeFileSync(join(root,`${name}-${mode}.json`),JSON.stringify(row,null,2));
        console.log(`${name} (${mode}): ${row.missedVblanks}/${row.videoFrames} CPU misses; ${row.completed} completed; maps ${Object.keys(row.maps)}; flight ${row.flightFrames}`);
      }finally{await page.close();}
    }
  }
  writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));
}finally{await browser?.close();server?.kill();}
