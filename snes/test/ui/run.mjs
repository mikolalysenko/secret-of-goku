#!/usr/bin/env node
// UI module tests in Mesen. Builds a UI_TEST cartridge (snes/test/ui/
// testmod.asm stands in for the modules that will call the UI API), imports
// browser-mod scenes and checks the cartridge against the browser's own code:
//   window    telepathy window pixel-identical to native-radio.js radioPixels
//             (top and lower placement), clean removal and HUD colours
//   policy    a scripted session (queue, SSJ charge remarks with the saved
//             xorshift roll, interrupt, barriers, ceiling escapes, power intro,
//             hidden frames) replayed frame by frame against createNativeRadio
//   dialogue  the window yields to a native dialogue and comes back after it
//   roll      saved charge attempts and xorshift state from a GAME FILE
//   radar     world flight: band panel and dial against dragon-radar.js
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
const bundleMap=name=>{
  const cat=JSON.parse(readFileSync(join(importDir,'catalog.json'),'utf8'));
  return cat.find(x=>x.name===name)?.map??JSON.parse(readFileSync(join(importDir,name,'regs.json'),'utf8')).map;
};
const lua=v=>typeof v==='string'?JSON.stringify(v):Array.isArray(v)?'{'+v.map(lua).join(',')+'}':typeof v==='object'&&v?'{'+Object.entries(v).map(([k,x])=>`${k}=${lua(x)}`).join(',')+'}':String(v);

const summary=[];
async function mesenCase(name,{bundle,prelude={},test}){
  const rom=privateRom(testRom,`ui-${name}`);
  const pre=Object.entries({BUNDLE:join(importDir,bundle),...prelude}).map(([k,v])=>`${k}=${lua(v)}`).join('\n');
  const r=await runMesen({rom,test:pre+'\n'+lib+'\n'+readFileSync(join(here,`${test}.lua`),'utf8'),outDir:join(outRoot,name),timeoutMs:600000});
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
      // software BG3: tilemap as ui_build_map writes it
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
        const ex=await renderRadar({ram:s,quest:{held:sc.quest&0x7f,collected:sc.quest>>8},frieza:sc.frieza,crisis:sc.crisis,
          sweepAngle:s.sweep,blink:(s.uiframe%30)<22});
        const png=loadPng(join(r.outDir,`${s.name}.png`));
        let bad=0,n=0;const where=[];
        for(const [k,c] of ex.pixels){const [x,y]=k.split(',').map(Number);n++;
          const at=(y*png.width+x)*4,want=rgb(c);
          if(png.data[at]!==want[0]||png.data[at+1]!==want[1]||png.data[at+2]!==want[2]){bad++;if(where.length<6)where.push(`${x},${y}:${c.toString(16)}/${png.data[at]},${png.data[at+1]},${png.data[at+2]}`);}}
        if(bad)fails.push(`${sc.name}/${s.name}: dial ${bad}/${n} pixels differ (${where.join(' ')}) sweep ${s.sweep}`);
        const panel=await compareRadio({png,text:ex.text,x:8,y:152});
        if(panel.mismatches)fails.push(`${sc.name}/${s.name}: panel ${panel.mismatches}/${panel.opaque} differ; browser "${ex.text.replace(/\n/g,' | ')}"`);
        const guides=['LAND HERE','AHEAD','TURN AROUND','LEFT','RIGHT'];
        notes.push(`${s.name} browser ${ex.bearing.guide} cart ${guides[s.guide]} d=${Math.round(ex.bearing.distance)}/${s.dist} f6=${s.f6} angle=${ex.bearing.angle.toFixed(3)} rel=${(s.rel<<16>>16)} blip ${s.bx},${s.by}`);
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
