#!/usr/bin/env node
// UI module tests in Mesen. Builds a UI_TEST cartridge (snes/test/ui/
// testmod.asm stands in for the modules that will call the UI API), imports
// browser-mod scenes and checks the cartridge against the browser's own code:
//   window    telepathy window pixel-identical to native-radio.js radioPixels
//             (top and lower placement), clean removal and HUD colours
//   policy    a scripted session (queue, SSJ charge remarks with the saved
//             xorshift roll, interrupt, barriers, ceiling escapes, power intro,
//             hidden frames) replayed frame by frame against createNativeRadio
//   roll      saved charge attempts and xorshift state from a GAME FILE
//   radar     world flight: band panel and dial against dragon-radar.js
//   place     dialogue window placement above the HUD (native-window.js)
//   targeting Goku's Targeting ring item stays native (the scouter was cut)
//   readouts, readoutBudget, analyzerCharge, analyzerCast, scouterPower
//             Analyzer readouts (analyzerCast: a real cast from Primm's ring)
//   text      R batches native glyphs, release/L+R, deferred DMA, raster/CPU
//   status    Goku's STATUS page: BG2 against native-status.js statusPixels
//             (base form and Super Saiyan), menu frame rate, leaving it
//   nocrash   production build from the arrival checkpoint (a savestate of
//             another build) and from preset__sword: keeps running
//   node      generator: every message encodes, atlas == radioPixels glyphs
//   node snes/test/ui/run.mjs [case ...]   (SNES_ROM is ignored: test build)
// Outputs: .local/snes-test/ui/<case>/ (results.json, screenshots).
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runMesen} from '../mesen.mjs';
import {mainCheckout,privateRom,cleanupRom} from '../checkpoints.mjs';
import {compareRadio} from './compare.mjs';
import {compareReadouts} from './readouts.mjs';
import {runModel,loadCatalog} from './model.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const outRoot=resolve(repo,'.local/snes-test/ui');
mkdirSync(outRoot,{recursive:true});
const importDir=process.env.SNES_IMPORT??join(mainCheckout(),'.local/snes-import');
const testRom=resolve(repo,'.local/snes-test/roms/ui-test.sfc');
const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${testRom}`,'-DUI_TEST=1'],{cwd:repo,stdio:'inherit'});
if(b.status!==0){console.error('ui: UI_TEST build failed');process.exit(1);}
const catalog=loadCatalog();
const id=name=>{const m=catalog.messages.find(x=>x.name===name);if(!m)throw Error(`no message ${name}`);return m.id;};
const group=name=>{const g=catalog.groups.find(x=>x.name===name);if(!g)throw Error(`no group ${name}`);return g;};
const lib=readFileSync(join(here,'lib.lua'),'utf8');
const analyzerLua=join(here,'../lua/analyzer.lua');
const bundleMap=name=>{
  const cat=JSON.parse(readFileSync(join(importDir,'catalog.json'),'utf8'));
  return cat.find(x=>x.name===name)?.map??JSON.parse(readFileSync(join(importDir,name,'regs.json'),'utf8')).map;
};
const lua=v=>typeof v==='string'?JSON.stringify(v):Array.isArray(v)?'{'+v.map(lua).join(',')+'}':typeof v==='object'&&v?'{'+Object.entries(v).map(([k,x])=>`${k}=${lua(x)}`).join(',')+'}':String(v);

const summary=[];
async function mesenCase(name,{bundle,prelude={},test,extra=[],exactFrames=false}){
  const rom=privateRom(testRom,`ui-${name}`);
  const pre=Object.entries({BUNDLE:join(importDir,bundle),...prelude}).map(([k,v])=>`${k}=${lua(v)}`).join('\n');
  const more=extra.map(f=>readFileSync(f,'utf8')+'\n').join('');
  const r=await runMesen({rom,test:pre+'\n'+lib+'\n'+more+readFileSync(join(here,`${test}.lua`),'utf8'),outDir:join(outRoot,name),timeoutMs:600000,exactFrames});
  cleanupRom(rom);
  return r;
}
function report(name,ok,details=[]){
  summary.push({test:name,ok,details});
  console.log(`ui ${name.padEnd(10)} ${ok?'pass':'FAIL'}`);
  for(const d of details)console.log('   '+d);
}
const resultFails=res=>Object.entries(res??{}).filter(([k,v])=>typeof v==='string'&&v.startsWith('FAIL')).map(([k,v])=>`${k}: ${v}`);

// ---------------------------------------------------------------------------
const cases={
  async node(){
    // Every message is encodable and fits; the atlas renders glyph cells the
    // way radioPixels() does (pixel-compared through a software BG3).
    const {radioPixels}=await import(pathToFileURL(resolve(repo,'engine/native-radio.js')).href);
    let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
    const atlas=readFileSync(resolve(repo,'dist/snes/gen/ui/atlas.bin'));
    const win=readFileSync(resolve(repo,'dist/snes/gen/ui/window.bin'));
    const fails=[];
    for(const m of catalog.messages){
      if(m.params)continue;
      const text=m.text;
      const ref=radioPixels(rom,text);
      // software BG3: tilemap as ui_fmap_edges / ui_fmap_line* write it
      const lines=text.split('\n');
      const {encodeText}=await import(pathToFileURL(resolve(repo,'engine/event-codec.js')).href);
      const colors={in:[null,0x0000,0x2c00,0x7fff],fr:[null,0x0000,0x5250,0x739c]};
      const tileIdx=(buf,off,x,y,fx,fy)=>{const r=fy?7-y:y,bit=fx?x:7-x;return (buf[off+r*2]>>bit&1)|(buf[off+r*2+1]>>bit&1)<<1;};
      let bad=0;
      for(let py=0;py<64;py++)for(let px=0;px<240;px++){
        const tr=py>>3,tc=px>>3,x=px&7,y=py&7;let idx,pal;
        if(tr===0||tr===7||tc===0||tc===29){
          pal='fr';const fy=tr===7;
          if(tr===0||tr===7){const corner=tc===0||tc===29;idx=tileIdx(win,(corner?0:1)*16,x,y,tc>=15,fy);}
          else idx=tileIdx(win,3*16,x,y,tc===29,false);
        }else{
          pal='in';const line=(tr-1)>>1,half=(tr-1)&1;
          const codes=lines[line]?encodeText(lines[line]):[];
          const g=codes[tc-1]??0x80;
          idx=tileIdx(atlas,(g-0x80)*32+half*16,x,y,false,false);
        }
        const want=ref[py*240+px];
        const got=idx?colors[pal][idx]+1:0;
        if(want!==got)bad++;
      }
      if(bad)fails.push(`${m.name}: ${bad} pixels differ from radioPixels`);
    }
    report('node',!fails.length,fails.slice(0,10));
  },

  async window(){
    const text0=catalog.messages[id('KAI_WARNING_0')].text;
    const lowerIds=group('FRIEZA_FULL_POWER_FRIEZA_SEQ_0');
    const r=await mesenCase('window',{bundle:'preset__late',prelude:{MSG:id('KAI_WARNING_0'),LOWER:lowerIds.first|(lowerIds.count<<12)},test:'window'});
    const fails=resultFails(r.results);
    if(r.code!==0||r.results?.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const top=existsSync(join(r.outDir,'window.png'))?await compareRadio({png:join(r.outDir,'window.png'),text:text0,x:8,y:7}):null;
    if(!top||top.mismatches)fails.push(`top window: ${top?`${top.mismatches}/${top.opaque} pixels differ ${JSON.stringify(top.samples.slice(0,3))}`:'no screenshot'}`);
    const lowerText=catalog.messages[lowerIds.first].text;
    const low=existsSync(join(r.outDir,'lower.png'))?await compareRadio({png:join(r.outDir,'lower.png'),text:lowerText,x:8,y:135}):null;
    if(!low||low.mismatches)fails.push(`lower window: ${low?`${low.mismatches}/${low.opaque} pixels differ`:'no screenshot'}`);
    report('window',!fails.length&&r.results?.failures===0,fails);
  },

  async policy(){
    // One scripted session, replayed by the cartridge and by native-radio.js.
    const s=[],map=bundleMap('preset__late');
    const idle=n=>{for(let i=0;i<n;i++)s.push({});};
    const charge=(n,flags)=>{for(let i=0;i<n;i++)s.push({charge:0x100|flags});};
    const say=name=>s.push({say:id(name),cmd:1,a:id(name)});
    const sayGroup=name=>{const g=group(name);s.push({group:g.ids,cmd:1,a:g.first|(g.count<<12)});};
    const interrupt=name=>{const g=group(name);s.push({interrupt:g.ids,cmd:2,a:g.first|(g.count<<12)});};
    const barrier=(key,map)=>{const b=catalog.barriers.find(x=>x.id===key);s.push({barrier:key,barrierMap:map,cmd:3,a:b.index,x:map});};
    const ceiling=map=>s.push({ceiling:map,cmd:4,a:map});
    // queue order and expiry
    say('SANDSHIP_2');idle(5);say('SANDSHIP_4');idle(5);sayGroup('FORTRESS_SHIELD');idle(700);
    // Super Saiyan charges: first three always warn, later ones roll 10%
    for(let k=0;k<9;k++){charge(170,3);idle(260);}
    // a charge below full power and a base-form charge never warn
    charge(200,1);idle(30);charge(200,2);idle(30);
    // asides wait while charging: power intro during a charge
    charge(20,1);s.push({transform:true,cmd:6,charge:0x101});charge(120,1);idle(700);
    // barriers: one key each, 8 s shared cooldown, blasts coalesce
    barrier('witch-castle',map);barrier('gold-tower',map);idle(300);barrier('witch-castle',map);idle(250);
    barrier('gold-tower',map);idle(400);barrier('moon-ferry',map);idle(300);
    // ceiling remarks: first exit per room, three silent exits, 2 min apart
    ceiling(10);idle(250);ceiling(11);ceiling(12);ceiling(13);ceiling(14);idle(60);
    // interrupt drops stale asides and keeps story lines
    say('SANDSHIP_4');barrier('pure-land-gate-1',map);idle(20);interrupt('CRISIS_FLIGHT');idle(1000);
    // hidden frames pause the window and its timers
    say('SANDSHIP_3');idle(30);for(let i=0;i<100;i++)s.push({hidden:true});idle(200);
    // hover intro
    s.push({hover:true,cmd:7});idle(400);
    const expected=await runModel(s,{catalog,map});
    const r=await mesenCase('policy',{bundle:'preset__late',prelude:{SCRIPT:s.map(({cmd,a,x,charge,hidden})=>({cmd,a,x,charge,hidden}))},test:'policy'});
    const fails=resultFails(r.results);
    if(r.code!==0||r.results?.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const got=(r.results?.trace??'').split(',').map(Number);
    let first=-1;
    for(let i=0;i<expected.length;i++)if(got[i]!==expected[i]){first=i;break;}
    const shown=new Set(expected.filter(Boolean)).size;
    writeFileSync(join(r.outDir,'expected.json'),JSON.stringify(expected));
    if(first>=0){
      const name=v=>v?catalog.messages[v-1].name:'-';
      fails.push(`frame ${first}: cartridge ${name(got[first])}, browser ${name(expected[first])} (context ${JSON.stringify(s.slice(Math.max(0,first-2),first+1))})`);
    }
    report('policy',!fails.length,[...fails,`${expected.length} frames, ${shown} distinct messages shown`]);
  },

  async roll(){
    // Saved charge state (attempt count, xorshift32 state, rotation) as a
    // GAME FILE would restore it: attempts 48-52 judge rolls, the seed's
    // first 10% hits are attempts 50 and 52.
    let roll=0x6d2b79f5;for(let a=1;a<=47;a++){roll^=roll<<13;roll^=roll>>>17;roll^=roll<<5;roll>>>=0;}
    const preset={chargeAttempts:47,warningRoll:roll,warning:4};
    const s=[];
    const idle=n=>{for(let i=0;i<n;i++)s.push({});};
    for(let k=0;k<6;k++){for(let i=0;i<170;i++)s.push({charge:0x103});idle(260);}
    const expected=await runModel(s,{catalog,restore:preset});
    const r=await mesenCase('roll',{bundle:'preset__late',prelude:{SCRIPT:s.map(({charge})=>({charge})),ATTEMPTS:47,ROLL:roll,WARNING:4},test:'roll'});
    const fails=resultFails(r.results);
    if(r.code!==0||r.results?.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const got=(r.results?.trace??'').split(',').map(Number);
    let first=-1;for(let i=0;i<expected.length;i++)if(got[i]!==expected[i]){first=i;break;}
    const name=v=>v?catalog.messages[v-1].name:'-';
    if(first>=0)fails.push(`frame ${first}: cartridge ${name(got[first])}, browser ${name(expected[first])}`);
    const warned=[...new Set(expected.filter(Boolean).map(name))];
    if(warned.length<2)fails.push(`expected two rolled warnings, browser showed ${warned.join(',')}`);
    report('roll',!fails.length,[...fails,`warnings: ${warned.join(', ')}`,`saved attempts ${r.results?.attempts}`]);
  },

  async nocrash(){
    // The production build (no UI_TEST client) from the arrival checkpoint
    // (a savestate of another build: stale UI WRAM) and from an imported
    // scene: frames keep coming while Goku walks, no code runs from RAM.
    const prodRom=resolve(repo,'.local/snes-test/roms/ui-prod.sfc');
    const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${prodRom}`],{cwd:repo,stdio:'inherit'});
    if(b.status!==0){report('nocrash',false,['production build failed']);return;}
    const ckpt=join(process.env.SNES_CHECKPOINTS??join(mainCheckout(),'.local/snes-checkpoints'),'after-arrival.mss');
    const runs=[{name:'nocrash-arrival',state:ckpt,prelude:'IMPORT=nil'},
      {name:'nocrash-sword',state:null,prelude:`IMPORT=${JSON.stringify(join(importDir,'preset__sword'))}`}];
    const fails=[],notes=[];
    for(const run of runs){
      if(run.state&&!existsSync(run.state)){notes.push(`${run.name}: skipped, no ${run.state}`);continue;}
      const rom=privateRom(prodRom,`ui-${run.name}`);
      const r=await runMesen({rom,state:run.state,test:run.prelude+'\n'+lib+'\n'+readFileSync(join(here,'nocrash.lua'),'utf8'),outDir:join(outRoot,run.name),timeoutMs:600000});
      cleanupRom(rom);
      const res=r.results??{};
      if(r.code!==0||res.error){fails.push(`${run.name}: mesen ${res.error??r.output.slice(-300)}`);continue;}
      if(res.ticks<res.steps-4)fails.push(`${run.name}: ${res.ticks} dispatched frames in ${res.steps}`);
      if(res.field_frames<res.steps/2)fails.push(`${run.name}: ${res.field_frames} field frames in ${res.steps}`);
      if(res.ram_pcs)fails.push(`${run.name}: executing RAM at ${res.ram_pcs}`);
      if(res.magic!==0x4b41||res.queue>16)fails.push(`${run.name}: UI block not set up (marker ${res.magic?.toString(16)}, queue ${res.queue})`);
      notes.push(`${run.name}: ${res.ticks}/${res.steps} frames dispatched, ${res.field_frames} field frames`);
    }
    report('nocrash',!fails.length,[...fails,...notes]);
  },

  async ff(){
    // R fast-forward from the Potos checkpoint: Luka's menu ($134) with R
    // held confirms the spear gift's prose and stops at the menu's choice;
    // without input the prose waits.
    const state=join(process.env.SNES_CHECKPOINTS??join(mainCheckout(),'.local/snes-checkpoints'),'potos.mss');
    if(!existsSync(state)){report('ff',true,[`skipped: no ${state}`]);return;}
    const fails=[],notes=[];
    for(const [name,hold] of [['ff-hold','r'],['ff-none',null]]){
      const rom=privateRom(testRom,`ui-${name}`);
      const pre=`HOLD=${hold?JSON.stringify(hold):'nil'}\nFRAMES=1500\nPERSIST_STORY=0x316040\n`;
      const r=await runMesen({rom,state,test:pre+lib+'\n'+readFileSync(join(here,'ff.lua'),'utf8'),outDir:join(outRoot,name),timeoutMs:600000});
      cleanupRom(rom);
      const q=r.results??{};
      fails.push(...resultFails(q));
      if(r.code!==0||q.error){fails.push(`${name}: mesen ${q.error??r.output.slice(-300)}`);continue;}
      if(q.queued!==1||!q.started)fails.push(`${name}: event 134 not started (queued ${q.queued})`);
      if(hold){
        if(!(q.gift>=1))fails.push(`${name}: the spear gift's prose was not confirmed (CFC3 ${q.gift})`);
        if(q.d0===0||q.choice!==1)fails.push(`${name}: not waiting on the menu's choice (D0 ${q.d0}, choice ${q.choice})`);
      }else if(q.gift!==0)fails.push(`${name}: the prose advanced without input (CFC3 ${q.gift})`);
      notes.push(`${name}: D0 ${q.d0?.toString(16)}, CFC3 ${q.gift}, choice window ${q.choice}`);
    }
    report('ff',!fails.length,[...fails,...notes]);
  },

  async text(){
    const state=join(process.env.SNES_CHECKPOINTS??join(mainCheckout(),'.local/snes-checkpoints'),'potos.mss');
    const sym=Object.fromEntries(readFileSync(testRom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')
      .map(l=>l.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/)).filter(Boolean)
      .map(m=>[m[3],parseInt(m[1]+m[2],16)]));
    const SYM={ui_radio_tick:sym.ui_radio_tick,ui_ff_text:sym.ui_ff_text,ui_ff_text_complete:sym.ui_ff_text_complete,ui_ff_text_complete_end:sym.ui_ff_text_complete_end,core_flush_auto:sym.core_flush_auto};
    const fails=[],notes=[],runs=[];
    for(const [hold,defer,native] of [[null,false,false],['r',false,false],['l r',false,false],['mid',false,false],['r',true,false],['r',false,true]]){
      const name=`text-${hold?.replace(' ','-')??'normal'}${defer?'-deferred':''}${native?'-native':''}`, rom=privateRom(testRom,`ui-${name}`);
      if(native){
        const bytes=readFileSync(rom),original=readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc'));
        for(const at of [0x15f,0x1175])for(const mirror of [0,0x400000])original.copy(bytes,mirror+at,at,at+6);
        writeFileSync(rom,bytes);
      }
      const pre=`HOLD=${hold?lua(hold):'nil'}\nSYM=${lua(SYM)}\nDEFER=${defer}\n`;
      const r=await runMesen({rom,state,test:pre+lib+'\n'+readFileSync(join(here,'ff-text.lua'),'utf8'),outDir:join(outRoot,name),exactFrames:true});
      cleanupRom(rom);
      const q=r.results??{};runs.push(q);fails.push(...resultFails(q));
      if(r.code!==0||q.error)fails.push(`${name}: ${q.error??r.output.slice(-300)}`);
      notes.push(`${name}: ${q.glyphs} glyphs in ${q.reveal_frames} frames, max ${q.max_glyphs}/frame, queue CPU ${q.text_cpu?.max?.toFixed(2)}, reveal CPU ${q.reveal_cpu?.max?.toFixed(2)}, frame CPU ${q.text_frame_cpu_max?.toFixed(2)} lines, lag ${q.lag_frames}`);
    }
    if((runs[1].max_glyphs<8||runs[1].max_glyphs>9)||runs[0].max_glyphs!==1||runs[2].max_glyphs!==1)fails.push('R must batch eight glyphs; normal and L+R must keep native speed');
    // Lag counts move by a frame or two with the rest of the frame's timing
    // (normal and L+R run the native glyph routine through the hook alone),
    // so only a clear excess over the native run counts.
    if(runs.some(q=>q.lag_frames>runs[5].lag_frames+2))fails.push('text batching added lag frames');
    if(!(runs[1].reveal_frames<runs[0].reveal_frames*.65))fails.push('R reveal did not accelerate enough');
    if(runs.some(q=>q.raster!==runs[0].raster||q.glyphs!==runs[0].glyphs))fails.push('revealed window differs from native text');
    report('text',!fails.length,[...fails,...notes]);
  },

  async mul(){
    // The radar rotation's multiplier routine against exact integer math.
    const cases=[[1951,7006,14811],[1520,7006,14811],[2048,16384,16384],[0,16384,0],[255,255,256],[256,256,255],[1,1,1]];
    let seed=12345;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
    for(let i=0;i<40;i++)cases.push([rnd(2049),rnd(16385),rnd(16385)]);
    const r=await mesenCase('mul',{bundle:'preset__late',prelude:{CASES:cases},test:'mul'});
    const fails=resultFails(r.results);
    if(r.code!==0||r.results?.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const got=(r.results?.products??'').split(';').map(p=>p.split(',').map(Number));
    cases.forEach(([u,c,s],i)=>{
      const want=[Math.floor((u*c+1024)/2048),Math.floor((u*s+1024)/2048)];
      if(!got[i]||got[i][0]!==want[0]||got[i][1]!==want[1])fails.push(`U ${u} C ${c} S ${s}: cartridge ${got[i]} expected ${want}`);
    });
    report('mul',!fails.length,fails.slice(0,12));
  },

  async place(){
    // window-placement.js. preset__late: Goku stands under the window (his
    // face on lines 0-71, nobody on 128-199), so the scene's windows go
    // above the HUD; potos.mss: Luka's window covers nobody, it stays put.
    // Each against a reference run with placement off (the ending's hide bit).
    const {loadPng}=await import('./compare.mjs');
    const fails=[],notes=[];
    const potos=join(process.env.SNES_CHECKPOINTS??join(mainCheckout(),'.local/snes-checkpoints'),'potos.mss');
    const run=async(name,prelude,state=null)=>{
      if(!state)return mesenCase(name,{bundle:'preset__late',prelude,test:'place'});
      const rom=privateRom(testRom,`ui-${name}`);
      const pre=Object.entries(prelude).map(([k,v])=>`${k}=${lua(v)}`).join('\n');
      const r=await runMesen({rom,state,test:pre+'\n'+lib+'\n'+readFileSync(join(here,'place.lua'),'utf8'),outDir:join(outRoot,name),timeoutMs:600000});
      cleanupRom(rom);
      return r;
    };
    const ok=(name,r)=>{
      if(r.code!==0||r.results?.error){fails.push(`${name}: mesen ${r.results?.error??r.output.slice(-300)}`);return false;}
      if(r.results.queued!==1||!r.results.waits){fails.push(`${name}: event $134 did not reach its first page (queued ${r.results.queued})`);return false;}
      return true;
    };
    const px=(png,x,y)=>{const i=(y*png.width+x)*4;return png.data[i]<<16|png.data[i+1]<<8|png.data[i+2];};
    const lower=await run('place-lower',{BACK:true}),native=await run('place-native',{NOPLACE:true});
    if(ok('place-lower',lower)&&ok('place-native',native)){
      const q=lower.results,n=native.results;
      if((q.wp&7)!==7)fails.push(`preset__late: not moved (placement bits ${q.wp})`);
      if(q.top_frames)fails.push(`preset__late: ${q.top_frames} frames showed the window at the top (vblank in time)`);
      if((n.wp&6)!==0)fails.push(`reference run moved the window (${n.wp})`);
      const L=loadPng(join(lower.outDir,'window.png')),N=loadPng(join(native.outDir,'window.png'));
      const B=loadPng(join(lower.outDir,'before.png')),K=loadPng(join(lower.outDir,'back.png'));
      let win=0,opaque=0,hud=0,top=0,back=0;
      for(let y=0;y<64;y++)for(let x=0;x<256;x++){
        if(q.mask[y*256+x]!=='1')continue;
        opaque++;
        if(px(L,x,135+y)!==px(N,x,7+y))win++;
        if(px(K,x,7+y)!==px(N,x,7+y))back++;
      }
      for(let y=199;y<224;y++)for(let x=0;x<256;x++)if(px(L,x,y)!==px(K,x,y))hud++;   // (same run: Goku's form can differ between runs)
      for(let y=7;y<51;y++)for(let x=0;x<256;x++)if(px(L,x,y)!==px(B,x,y))top++;
      if(win)fails.push(`moved window: ${win}/${opaque} opaque pixels differ from the native window`);
      if(hud)fails.push(`HUD (lines 199-223): ${hud} pixels differ with the window moved and back in place`);
      if(top)fails.push(`lines 7-50 with the window moved: ${top} pixels differ from the scene before the event`);
      if(back)fails.push(`placement switched off: ${back}/${opaque} window pixels differ from the native window`);
      if(q.regs_back!==n.regs)fails.push(`channels 0/1 not given back: ${q.regs_back} (game: ${n.regs})`);
      if(q.wp_back&0x1C)fails.push(`placement still active after switching off (${q.wp_back})`);
      if(!q.ended)fails.push('preset__late: the scene did not end');
      else{
        if(q.wp_end&0x1F)fails.push(`after the scene: placement bits ${q.wp_end} (session not closed or channels kept)`);
        if(q.regs_end!==n.regs)fails.push(`after the scene: channels ${q.regs_end} (game: ${n.regs})`);
        if(q.c2c_end&3)fails.push(`after the scene: $2C = ${q.c2c_end.toString(16)}`);
      }
      notes.push(`preset__late: decided on frame ${q.decided} (faces ${q.faces}); ${q.shown_frames} frames with a window up: ${q.moved_frames} moved, ${q.late_frames} after a late vblank with no window channel running, ${q.top_frames} at the top otherwise; ${opaque} window pixels, HUD and channels intact`);
    }
    if(existsSync(potos)){
      const stay=await run('place-stay',{POTOS:true},potos),ref=await run('place-stay-native',{POTOS:true,NOPLACE:true},potos);
      if(ok('place-stay',stay)&&ok('place-stay-native',ref)){
        if((stay.results.wp&7)!==1)fails.push(`potos: placement bits ${stay.results.wp} (expected a decided scene that stays native)`);
        const S=loadPng(join(stay.outDir,'window.png')),R=loadPng(join(ref.outDir,'window.png'));
        // sprites of either run (ambient creatures follow the game's RNG,
        // which advances with idle CPU time) are left out, 2 pixels wider
        const boxes=[stay,ref].flatMap(r=>(r.results.objs||'').split(' ').filter(Boolean).map(b=>b.split(',').map(Number)));
        const inSprite=(x,y)=>boxes.some(([bx,by,n])=>x>=bx-2&&x<bx+n+2&&y>=by-2&&y<by+n+2);
        let d=0,skipped=0;
        for(let y=0;y<224;y++)for(let x=0;x<256;x++)if(px(S,x,y)!==px(R,x,y)){if(inSprite(x,y))skipped++;else d++;}
        if(d)fails.push(`potos: ${d} pixels differ from the reference`);
        notes.push(`potos: decided on frame ${stay.results.decided} (faces ${stay.results.faces}), stays native, frame identical${skipped?` but for ${skipped} sprite pixels`:''}`);
      }
    }else notes.push(`potos: skipped, no ${potos}`);
    report('place',!fails.length,[...fails,...notes]);
  },

  async scouterPower(){
    const {powerLevel}=await import('../../../engine/scouter.js');
    const inputs=[];
    for(const index of [1,3])for(const factor of [1,4,10,40])for(const hp of [0,1,2,7,8,9,10,16,17,24,25,31,33,34,99,100,101,249,250,999,1000,3333,9999,10000,65535])inputs.push([hp,index,factor]);
    const r=await mesenCase('scouter-power',{bundle:'barrier-audit__potos-probe',prelude:{CASES:inputs},test:'scouter-power'});
    const fails=resultFails(r.results);
    if(r.code!==0||!r.results||r.results.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const tables=JSON.parse(readFileSync(join(repo,'dist/snes/gen/ui/scouter.json')));
    inputs.forEach(([maxHp,index,factor],i)=>{
      const want=powerLevel({challenge:{status:{fed:factor===4||factor===40}},frieza:{trial:factor===10||factor===40},read16:()=>253},{index,maxHp});
      const got=tables.formats[r.results?.formats?.[i]/10]?.n;
      if(got!==want)fails.push(`actor ${index}, HP ${maxHp}, factor ${factor}: ${got} vs ${want}`);
    });
    report('scouterPower',!fails.length,[...fails.slice(0,12),`${inputs.length} native power calculations checked against powerLevel()`]);
  },

  async readoutBudget(){
    const symbols=Object.fromEntries(readFileSync(testRom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')
      .map(l=>l.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/)).filter(Boolean).map(m=>[m[3],parseInt(m[1]+m[2],16)]));
    const SYM=Object.fromEntries(["ui_sc_draw_frame","destroy_late_frame","ui_sc_draw_frame_prepared","ui_sc_analyzer_hit"].map(k=>[k,symbols[k]]));
    const r=await mesenCase('readout-budget',{bundle:'animation-audit__native__rabite-field-b',prelude:{SYM},test:'readout-budget',extra:[analyzerLua]});
    const fails=resultFails(r.results);if(r.code!==0||!r.results||r.results.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const q=r.results?.budget??{};
    for(const mode of ['idle','charge']){
      const on=q[mode+'_on'],off=q[mode+'_off'];
      if(!on||!off){fails.push(`${mode}: missing measurements`);continue;}
      if(on.lag>off.lag+Math.ceil(off.frames*.03))fails.push(`${mode}: exceeds perf's 3% lag allowance`);
      if(on.overruns)fails.push(`${mode}: readout work crossed vblank`);
      if(on.maxSprites>32||on.maxSlivers>34)fails.push(`${mode}: OBJ overflow`);
    }
    if(!(q.idle_on?.maxActors>=5&&q.idle_on?.visible>=60))fails.push('crowd readouts did not achieve useful coverage');
    report('readoutBudget',!fails.length,[...fails,JSON.stringify(q)]);
  },

  async readouts(){
    // Analyzer readouts (the cartridge has no scouter): PPU OAM/VRAM/CGRAM
    // decoded against the browser's font and layout for the same inputs.
    const SYM=Object.fromEntries(readFileSync(testRom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')
      .map(l=>l.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/)).filter(Boolean).map(m=>[m[3],parseInt(m[1]+m[2],16)]));
    const r=await mesenCase('readouts',{bundle:'barrier-audit__potos-probe',prelude:{SYM:{ui_sc_draw_frame:SYM.ui_sc_draw_frame,core_field_nmi_done:SYM.core_field_nmi_done,destroy_late_frame:SYM.destroy_late_frame},MSG:id('KAI_WARNING_0')},test:'readouts',extra:[analyzerLua]});
    const fails=resultFails(r.results);
    if(r.code!==0||!r.results||r.results.error)fails.push(`mesen: ${r.results?.error??r.output.slice(-400)}`);
    const tables=JSON.parse(readFileSync(join(repo,'dist/snes/gen/ui/scouter.json'))),notes=[];
    for(const [name,q] of Object.entries(r.results?.snapshots??{})){
      q.shownValue=tables.formats[q.shown/10]?.n;
      const c=compareReadouts(r.outDir,name,q,{shown:name.startsWith('charge_')});
      notes.push(`${name}: ${JSON.stringify(c)}`);
      if(c.mismatches>c.overlaps)fails.push(`${name}: ${c.mismatches-c.overlaps} unexplained pixels differ`);
      if(c.maxSprites>32||c.maxSlivers>34)fails.push(`${name}: OBJ overflow`);
    }
    const shots=r.results?.snapshots??{};
    if(shots.none&&(shots.none.sc&2))fails.push('an old save\'s scouter switch started readings');
    if(!shots.analyzer||(shots.analyzer.numbers&7)!==7)fails.push('Analyzer readings missing on Goku and both companions');
    // Goku's reading is his power at rest: a charge never moves it.
    const charges=['charge_early','charge_late','charge_full'].map(n=>shots[n]);
    if(charges.some(q=>!q||!(q.sc&4)||(q.numbers&1)===0))fails.push('missing Goku readings while charging');
    else for(const q of charges){
      const rest=tables.formats[tables.goku[(q.superSaiyan?2:0)+(q.weighted?1:0)]].n;
      if(q.shownValue!==rest)fails.push(`charge ${q.charge}: reading ${q.shownValue}, power at rest ${rest}`);
    }
    if(!shots.radio?.radio)fails.push('radio mask was not exercised');
    const blink=['blink_0','blink_4','blink_8','blink_14'].map(n=>shots[n]).filter(Boolean);
    if(!blink.some(q=>(q.actors[0].age&7)<4)||!blink.some(q=>(q.actors[0].age&7)>=4))fails.push('both blink phases were not captured');
    report('readouts',!fails.length,[...fails,...notes,JSON.stringify(r.results?.cpu)]);
  },

  async analyzerCharge(){
    // Analyzer readings while Goku charges and focuses among Rabites: every
    // displayed FX, UI and native sprite shows its owner's pixels (the
    // shared cells check; fx native-cells covers the game's side).
    const symbols=Object.fromEntries(readFileSync(testRom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')
      .map(l=>l.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/)).filter(Boolean).map(m=>[m[3],parseInt(m[1]+m[2],16)]));
    const SYM=Object.fromEntries(['core_field_frame','core_field_nmi_done','fx_k_aura_obj','fx_draw_current','fx_run_slots','fx_entry_tile','fx_entry_vram','fx_cell_dma','fx_aura_rows','fx_aura_asm_id','fx_asm_ptr','fx_asm_data','ui_sc_analyzer_hit'].map(k=>[k,symbols[k]]));
    const r=await mesenCase('analyzer-charge',{bundle:'animation-audit__native__rabite-field-b',prelude:{SYM,SHOTS:4},test:'analyzer-charge',extra:[join(here,'../lua/cells-check.lua'),analyzerLua],exactFrames:true});
    const fails=resultFails(r.results),q=r.results??{};
    if(r.code!==0||q.error)fails.push(`mesen: ${q.error??r.output.slice(-400)}`);
    for(const d of (q.details??[]).slice(0,6))fails.push(JSON.stringify(d));
    report('analyzerCharge',!fails.length&&q.failures===0,[...fails,`hits ${q.hits}; aura ${q.auraFrames} frames, readings ${q.uiFrames}, both ${q.bothFrames}; wrong aura ${q.auraBad}, partial flames ${q.auraPartial} of ${q.auraDrawn}, cut by line limits ${q.auraDropped}, stale FX ${q.fxBad}, readout ${q.uiBad}, native ${q.nativeBad}; late FX uploads ${q.fxLate}, game sprites before their stream ${q.nativeLate}`]);
  },

  async analyzerCast(){
    // A real Analyzer cast from Primm's ring on a Rabite: the game's spell
    // landing starts the target's reading (snapshot decoded as in readouts),
    // which expires 240 frames later.
    const symbols=Object.fromEntries(readFileSync(testRom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')
      .map(l=>l.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (\S+)/)).filter(Boolean).map(m=>[m[3],parseInt(m[1]+m[2],16)]));
    const SYM=Object.fromEntries(['core_field_nmi_done','ui_sc_analyzer_hit','ui_sc_draw_frame','destroy_late_frame'].map(k=>[k,symbols[k]]));
    const r=await mesenCase('analyzer-cast',{bundle:'animation-audit__native__rabite-field-b',prelude:{SYM},test:'analyzer-cast',exactFrames:true});
    const fails=resultFails(r.results),q=r.results??{},notes=[];
    if(r.code!==0||q.error)fails.push(`mesen: ${q.error??r.output.slice(-400)}`);
    for(const [name,s] of Object.entries(q.snapshots??{})){
      const c=compareReadouts(r.outDir,name,s);
      notes.push(`${name}: ${JSON.stringify(c)}`);
      if(c.mismatches>c.overlaps)fails.push(`${name}: ${c.mismatches-c.overlaps} unexplained pixels differ`);
      if(!c.layers.some(l=>l.index===q.target>>9))fails.push(`${name}: no reading on the target`);
      if(c.maxSprites>32||c.maxSlivers>34)fails.push(`${name}: OBJ overflow`);
    }
    if(!q.snapshots?.cast)fails.push('no snapshot of the reading');
    report('analyzerCast',!fails.length,[...fails,`target ${q.target?.toString(16)}, hits ${q.hits}, shown ${q.shown_frames} frames, expired after ${q.expired_after} video / ${q.expired_after_ui} field frames; readout pass ${q.draw?.mean?.toFixed(2)} / ${q.draw?.max?.toFixed(2)} lines mean/max over ${q.draw?.n} frames; landings ${(q.landings??[]).join(' ')}`,...notes]);
  },

  async targeting(){
    // The cartridge has no scouter switch: with Sylphid's powers and an old
    // save's switch bit on, Goku's configuration ring keeps the native
    // Targeting title and option, the saved flags stay, and no scan follows.
    const r=await mesenCase('targeting',{bundle:'barrier-audit__potos-probe',prelude:{},test:'targeting'});
    const fails=resultFails(r.results),q=r.results??{};
    if(r.code!==0||q.error)fails.push(`mesen: ${q.error??r.output.slice(-400)}`);
    else{
      if(q.ring!=='00 02 01')fails.push(`ring not on Goku's Targeting item (1808 1809 1876 = ${q.ring})`);
      if(q.title!=='CA:A174')fails.push(`Targeting title read from ${q.title} (expected the game's string, CA:A174)`);
      if(q.flags_after!==0x40)fails.push(`confirming Targeting changed the saved flags (${q.flags_after})`);
      if(!(q.native_option>0))fails.push('confirming Targeting did not run the native option (C0:73F9)');
      if(q.said)fails.push(`message ${q.said-1} said after the ring closed`);
      if(q.sc&2)fails.push('a reading started without Analyzer');
    }
    report('targeting',!fails.length,[...fails,`title ${q.title}, flags ${q.flags_after}, native option ${q.native_option}, ring resumed ${q.ring_resumed}, item after B ${q.item_after}, menu frames ${q.menu_frames}`]);
  },

  async status(){
    // native-status.js: Goku's STATUS page. BG2 as the PPU shows it (from
    // VRAM and CGRAM) against statusPixels() of the same values, base form
    // and Super Saiyan. Cells whose colours no palette holds (the
    // generator's conflict sets) may show a colour as its nearest one, never
    // a different shape.
    const eng=name=>import(pathToFileURL(resolve(repo,'engine',name)).href);
    const {statusPixels}=await eng('native-status.js');
    const {decodeText}=await eng('event-codec.js');
    let rom=new Uint8Array(readFileSync(resolve(repo,'rom/secret-of-mana-us.sfc')));
    if(rom.length%0x8000===512)rom=rom.slice(512);
    const PAL=[[0,0x5250,0x739c],[0,0x294a,0x2fff],[0x294a,0x2fff,0x285f],[0,0x294a,0x739c],[0,0x2fff,0x285f]];
    const CH='0123456789abcdefghijklmnopqrstuv';
    const fails=[],notes=[];
    for(const form of [0,1]){
      const tag=form?'super saiyan':'base form';
      const r=await mesenCase(`status-${form}`,{bundle:'barrier-audit__potos-probe',prelude:{SET_FORM:form},test:'status'});
      const q=r.results??{};
      if(r.code!==0||q.error){fails.push(`${tag}: mesen ${q.error??r.output.slice(-400)}`);continue;}
      fails.push(...resultFails(q).map(f=>`${tag}: ${f}`));
      if(q.built<0){fails.push(`${tag}: the page was not built (phases ${q.phases})`);continue;}
      const s=q.stats,ssj=s.form?1:0,w=s.weighted?1:0;
      if(ssj!==form)fails.push(`${tag}: Goku's form is ${s.form}`);
      const stats={form:ssj?'SUPER SAIYAN':'SAIYAN',weighted:!!w,level:s.level,hp:s.hp,maxHp:s.maxHp,
        power:[[90000,81000],[150000000,135000000]][ssj][w],strength:s.strength,agility:s.agility,
        constitution:s.constitution,intelligence:s.intelligence,wisdom:s.wisdom,attack:[[4095,3686],[8191,7372]][ssj][w],
        hit:s.hit,defense:s.defense,evade:s.evade,magicDefense:s.magicDefense,mana:s.mana,money:s.money};
      // the browser paints the raster from scanline 1: BG row b shows its row b + 1
      const page=statusPixels(rom,stats,decodeText(s.name.split(',').map(Number)));
      const ref=new Uint16Array(512*224);ref.set(page.subarray(512));
      const cg=q.cgram.split(' ').map(h=>parseInt(h,16));
      const conflict=new Set();
      for(let cy=0;cy<28;cy++)for(let cx=0;cx<32;cx++){
        const set=new Set();
        for(let y=cy*8;y<cy*8+8;y++)for(let x=cx*16;x<cx*16+16;x++)if(ref[y*512+x])set.add(ref[y*512+x]-1);
        if(set.size&&!PAL.some(p=>[...set].every(c=>p.includes(c))))conflict.add(cy*32+cx);
      }
      let shape=0,colour=0,near=0,opaque=0;const where=[];
      for(let y=0;y<224;y++)for(let x=0;x<512;x++){
        const v=ref[y*512+x],ch=q.bg2[y*512+x],mine=ch==='.'?-1:cg[CH.indexOf(ch)];
        if(v)opaque++;
        const bad=!v!==(mine<0)?'shape':v&&mine!==v-1?(conflict.has((y>>3)*32+(x>>4))?'near':'colour'):null;
        if(bad==='near')near++;
        else if(bad){if(bad==='shape')shape++;else colour++;if(where.length<6)where.push(`${x},${y} ${v?(v-1).toString(16):'none'}/${mine<0?'none':mine.toString(16)}`);}
      }
      if(shape||colour)fails.push(`${tag}: ${shape} pixels differ in shape, ${colour} in colour from statusPixels (${where.join('; ')})`);
      if(q.build_hooks<q.build_frames-2)fails.push(`${tag}: the menu ran ${q.build_hooks} frames of ${q.build_frames} while the page was built`);
      if(q.phase_after!==0)fails.push(`${tag}: the session did not end after leaving (phase ${q.phase_after}, ring ${q.mode_after})`);
      if(q.native_phase!==0)fails.push(`${tag}: the endings' hide bit did not keep the page native (phase ${q.native_phase})`);
      // (CGRAM 16 pulses in the ring: compared from 17)
      if(q.cgram_after.slice(5)!==q.cgram_native.slice(5))fails.push(`${tag}: CGRAM 17-31 after leaving ${q.cgram_after.slice(5)} (native page: ${q.cgram_native.slice(5)})`);
      notes.push(`${tag}: built in ${q.built} frames (menu frames ${q.build_hooks}/${q.build_frames}), ${opaque} opaque pixels as statusPixels, ${conflict.size} conflict cells (${near} pixels as their nearest colour)`);
    }
    report('status',!fails.length,[...fails,...notes]);
  },

  async radar(){
    // World flight: the band (lines 152-215) and the dial, against
    // dragon-radar.js run on the cartridge's own state for each screenshot.
    const {renderRadar}=await import('./radar.mjs');
    const {loadPng,rgb,compareRadio}=await import('./compare.mjs');
    const scenarios=[
      {name:'radar-frieza',quest:0x7f7f,flags:0x24,frieza:{stolen:true},crisis:true,
       steer:[['left',40],['left',60],['left',60],['right',30]]},
      {name:'radar-palace',quest:0x0b0b,flags:0,frieza:{},crisis:false,
       steer:[['right',50],['right',70],['left',40]]},
    ];
    const fails=[],notes=[];
    for(const sc of scenarios){
      const r=await mesenCase(sc.name,{bundle:'preset__flight',prelude:{QUEST:sc.quest,FLAGS:sc.flags,STEER:sc.steer},test:'radar'});
      if(r.code!==0||r.results?.error){fails.push(`${sc.name}: mesen ${r.results?.error??r.output.slice(-300)}`);continue;}
      fails.push(...resultFails(r.results).map(f=>`${sc.name}: ${f}`));
      for(const s of r.results.samples??[]){
        const png=loadPng(join(r.outDir,`${s.name}.png`));
        const quest={held:sc.quest&0x7f,collected:sc.quest>>8};
        // The browser's blip before rounding: a coordinate within 0.05 px of
        // a half pixel may round either way on the cartridge (its distance
        // is a table hypot), so the two blip squares are then left out of the
        // dial comparison and the cartridge's square is checked on its own.
        const st=(await renderRadar({ram:s,quest,frieza:sc.frieza,crisis:sc.crisis,sweepAngle:0,blink:false})).bearing;
        const br=Math.min(18,st.distance/50),bxf=24+Math.sin(st.angle)*br,byf=24-Math.cos(st.angle)*br;
        const bx=Math.round(bxf),by=Math.round(byf);
        const tie=(v,c)=>c===Math.round(v)||(Math.abs(v-Math.floor(v)-.5)<.05&&Math.abs(c-v)<1);
        const rounded=(s.bx!==bx||s.by!==by)&&tie(bxf,s.bx)&&tie(byf,s.by);
        const inSquare=(x,y,cx,cy)=>Math.abs(x-8-cx)<=1&&Math.abs(y-8-cy)<=1;
        // the dial: exact match against the browser's dial for one sweep
        // angle / blink phase (the sampled state may be a frame ahead)
        let best={bad:1e9};
        for(let da=-4;da<=4;da++)for(const blink of [true,false]){
          const a=(s.sweep+da+64)&63;
          const ex=await renderRadar({ram:s,quest,frieza:sc.frieza,crisis:sc.crisis,sweepAngle:a,blink});
          let bad=0;const where=[];
          for(const [k,c] of ex.pixels){const [x,y]=k.split(',').map(Number);
            if(rounded&&(inSquare(x,y,bx,by)||inSquare(x,y,s.bx,s.by)))continue;
            const at=(y*png.width+x)*4,want=rgb(c);
            if(png.data[at]!==want[0]||png.data[at+1]!==want[1]||png.data[at+2]!==want[2]){bad++;if(where.length<8)where.push(`${x-8},${y-8}:${c.toString(16)}/${png.data[at]},${png.data[at+1]},${png.data[at+2]}`);}}
          if(rounded&&blink)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            const x=8+s.bx+dx,y=8+s.by+dy,at=(y*png.width+x)*4,want=rgb(0x03ff);
            if(x===32&&y===32)continue;                        // the centre stays on top
            if(png.data[at]!==want[0]||png.data[at+1]!==want[1]||png.data[at+2]!==want[2])bad++;
          }
          if(bad<best.bad)best={bad,da,blink,ex,n:ex.pixels.size,where};
        }
        if(best.bad)fails.push(`${sc.name}/${s.name}: dial ${best.bad}/${best.n} pixels differ at best (angle ${s.sweep}${best.da>=0?'+':''}${best.da}, blink ${best.blink}) ${best.where.join(' ')}`);
        const ex=best.ex;
        const panel=await compareRadio({png,text:ex.text,x:8,y:152});
        if(panel.mismatches)fails.push(`${sc.name}/${s.name}: panel ${panel.mismatches}/${panel.opaque} differ; browser "${ex.text.replace(/\n/g,' | ')}"`);
        const guides=['LAND HERE','AHEAD','TURN AROUND','LEFT','RIGHT'];
        if(guides[s.guide]!==ex.bearing.guide)fails.push(`${sc.name}/${s.name}: guide ${guides[s.guide]} vs browser ${ex.bearing.guide}`);
        if(!rounded&&(s.bx!==bx||s.by!==by))fails.push(`${sc.name}/${s.name}: blip ${s.bx},${s.by} vs browser ${bxf.toFixed(3)},${byf.toFixed(3)}`);
        notes.push(`${sc.name}/${s.name}: ${ex.bearing.guide}, distance ${s.dist} (browser ${ex.bearing.distance.toFixed(1)}), heading ${s.f6}, blip ${s.bx},${s.by} (browser ${bxf.toFixed(2)},${byf.toFixed(2)}${rounded?', a rounding tie':''}), sweep ${s.sweep}${best.da>=0?'+':''}${best.da}, moved ${s.front}`);
      }
    }
    report('radar',!fails.length,[...fails,...notes]);
  },
};

for(const [name,fn] of Object.entries(cases)){
  if(only.length&&!only.includes(name))continue;
  try{await fn();}catch(e){report(name,false,[e.stack.split('\n').slice(0,3).join(' | ')]);}
}
writeFileSync(join(outRoot,'summary.json'),JSON.stringify(summary,null,1));
process.exit(summary.every(s=>s.ok)?0:1);
