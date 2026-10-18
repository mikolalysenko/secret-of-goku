#!/usr/bin/env node
// FX module tests in Mesen. Builds an FX_TEST cartridge (the test mailbox
// in snes/test/fx/testmod.asm drives the public API like a client module),
// imports browser-mod scenes with H.importSnesJs and checks/screenshots the
// effects:
//   gallery  every OBJ kind at fixed screen points, several ages (Potos)
//   beams    charge orb at Goku's palm, Kamehameha in four directions,
//            ki shots, impacts, transformation ring + flash + quake
//   battle   effects over the Frieza arena (preset__battle)
//   budget   frame-logic end line and NMI end with heavy effects
//   node snes/test/fx/run.mjs [test ...]
//   FX_DEFINES='-DCORE_SLOWROM=1' node snes/test/fx/run.mjs   (extra build defines)
// Outputs: .local/snes-test/fx/<test>/ (results.json, screenshots).
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mesenPath} from '../mesen.mjs';
import {checkpointDir,privateRom,cleanupRom,mainCheckout} from '../checkpoints.mjs';
import {readPng} from '../../tools/gfx.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const outRoot=resolve(repo,'.local/snes-test/fx');
mkdirSync(outRoot,{recursive:true});
const testRom=resolve(repo,'.local/snes-test/roms/fx-test.sfc');
const extraDefines=(process.env.FX_DEFINES||'').split(/\s+/).filter(d=>/^-D\w+(=\w+)?$/.test(d));
const b=spawnSync(process.execPath,[join(repo,'snes/build.mjs'),'--quiet','--strict',`--out=${testRom}`,'-DFX_TEST=1',...extraDefines],{cwd:repo,stdio:'inherit'});
if(b.status!==0){console.error('fx: FX_TEST build failed');process.exit(1);}
const cps=checkpointDir();
if(!existsSync(join(cps,'waterfall.mss'))){
  const r=spawnSync(process.execPath,[join(repo,'snes/test/checkpoints.mjs')],{cwd:repo,stdio:'inherit'});
  if(r.status!==0){console.error('fx: checkpoints failed');process.exit(1);}
}
const importRoot=join(mainCheckout(),'.local/snes-import')+'/';
function prelude(rom){
  const sym={};
  for(const line of readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').split('\n')){
    const m=line.match(/^([0-9A-F]{2}):([0-9A-F]{4}) (fx_\w+)$/i);
    if(m)sym[m[3]]=parseInt(m[1]+m[2],16);
  }
  return `SYM={${Object.entries(sym).map(([k,v])=>`${k}=0x${v.toString(16)}`).join(',')}}\nFX_IMPORT=${JSON.stringify(importRoot)}\n`+readFileSync(join(here,'lib.lua'),'utf8')+'\n';
}
// Screenshot checks: fraction of pixels in a span (x0..x1 on row y, or
// rows y0..y1 at column x) whose 5-bit colour is one of `want`, at least
// `min` (or at most `max`). Wave colours: fx_wave_colors (snes/gen/fx.mjs,
// the browser's giantBeam rows).
const BLUE=[0x5D4A,0x6A10,0x7B39,0x7FFF],GOLD=[0x010F,0x01BD,0x37FE,0x7FFF],PURPLE=[0x540C,0x6D3B,0x7E5F,0x7FFF];
const WHITE=[0x7FFF];
const BEAM_CHECKS={
  beams:[
    ['wave_right','axis core',{x0:180,x1:240,y:100,want:WHITE,min:.9}],
    ['wave_right','band 2 (9-16 px in)',{x0:150,x1:240,y:32,want:[BLUE[2]],min:.8}],
    ['wave_right','outside',{x0:150,x1:240,y:10,want:BLUE,max:.05}],
    ['wave_down','core',{x0:150,x1:170,y:150,want:WHITE,min:.8}],
    ['wave_down','left rim',{x:72,y0:60,y1:200,want:[BLUE[1]],min:.4}],
    ['wave_down','right rim',{x:184,y0:60,y1:200,want:[BLUE[1]],min:.4}],
    ['wave_down','outside',{x0:200,x1:250,y:150,want:BLUE,max:.1}],
    ['wave_up','core',{x0:150,x1:170,y:60,want:WHITE,min:.8}],
    ['wave_up','left rim',{x:72,y0:20,y1:150,want:[BLUE[1]],min:.4}],
    ['final_left','axis core',{x0:40,x1:100,y:110,want:WHITE,min:.8}],
    ['final_left','band 2',{x0:60,x1:100,y:72,want:[GOLD[2]],min:.8}],
    ['galick_right','axis core',{x0:150,x1:220,y:110,want:WHITE,min:.8}],
    ['galick_right','band 2',{x0:150,x1:220,y:82,want:[PURPLE[2]],min:.8}],
    ['wave_after','no beam left',{x0:0,x1:255,y:100,want:[BLUE[1],BLUE[2]],max:.05}],
  ],
};
// F.grab's raw frames (exact) when present, else the screenshot.
function readShot(dir,name){
  const raw=join(dir,name+'.rgb');
  if(existsSync(raw)){
    const rgb=readFileSync(raw),data=new Uint8Array(256*224*4);
    for(let i=0;i<256*224;i++){data[i*4]=rgb[i*3];data[i*4+1]=rgb[i*3+1];data[i*4+2]=rgb[i*3+2];data[i*4+3]=255;}
    return {width:256,height:224,data};
  }
  const png=join(dir,name+'.png');
  return existsSync(png)?readPng(png):null;
}
function spanFraction(img,c){
  const at=(x,y)=>{const i=(y*img.width+x)*4,d=img.data;return ((d[i+2]>>3)<<10)|((d[i+1]>>3)<<5)|(d[i]>>3);};
  let n=0,hit=0;
  if(c.x!==undefined)for(let y=c.y0;y<=c.y1;y++){n++;if(c.want.includes(at(c.x,y)))hit++;}
  else for(let x=c.x0;x<=c.x1;x++){n++;if(c.want.includes(at(x,c.y)))hit++;}
  return hit/n;
}
// A shot taken on three consecutive frames (name, name_1, name_2) passes
// when two of them do: a vblank the game uses up may cost the wave a frame.
function shotChecks(t,dir){
  const out=[];
  for(const [shot,label,c] of BEAM_CHECKS[t]??[]){
    const imgs=[shot,shot+'_1',shot+'_2'].map(n=>readShot(dir,n)).filter(Boolean);
    if(!imgs.length){out.push({ok:false,text:`${shot} ${label}: no screenshot`});continue;}
    const paths=imgs;
    const fr=imgs.map(img=>spanFraction(img,c));
    const pass=fr.filter(f=>c.min!==undefined?f>=c.min:f<=c.max).length;
    const ok=pass>=Math.min(2,paths.length);
    out.push({ok,text:`${shot} ${label}: ${fr.map(f=>(f*100).toFixed(0)+'%').join(' ')} (${c.min!==undefined?'min '+c.min*100:'max '+c.max*100}%, ${pass}/${paths.length})`});
  }
  return out;
}
// snes/test/mesen.mjs's runMesen, plus --Snes.DisableFrameSkipping=true:
// unthrottled, Mesen otherwise renders only some frames (wall-clock based),
// so screenshots and emu.getScreenBuffer() show a frame from an unknown
// moment (31 of 39 consecutive grabs identical in a measurement).
async function runMesen({rom,test,outDir,state=null,timeoutMs=600000}){
  outDir=resolve(outDir);
  if(existsSync(outDir))rmSync(outDir,{recursive:true,force:true});
  mkdirSync(outDir,{recursive:true});
  const harness=readFileSync(resolve(here,'../lua/harness.lua'),'utf8');
  const script=join(outDir,'test.lua');
  writeFileSync(script,`H_OUT=${JSON.stringify(outDir)}\nH_STATE=${state?JSON.stringify(resolve(state)):'nil'}\n`+test+'\n'+harness);
  const child=spawn(mesenPath(),['--testRunner','--Snes.DisableFrameSkipping=true',resolve(rom),script],{stdio:['ignore','pipe','pipe']});
  let stdout='';
  child.stdout.on('data',d=>{stdout+=d;});
  child.stderr.on('data',d=>{stdout+=d;});
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  const code=await new Promise(res=>child.on('close',c=>res(c)));
  clearTimeout(timer);
  let results=null;
  try{results=JSON.parse(readFileSync(join(outDir,'results.json'),'utf8'));}catch{}
  return {code,results,output:stdout,outDir};
}

// asar does not report overlapping writes: make sure no other module's data
// landed on FX's cells (bank !FX_DATA, snes/src/modules/fx/module.asm).
function checkCells(rom){
  const sym=readFileSync(rom.replace(/\.sfc$/,'.sym'),'utf8').match(/^([0-9A-F]{2}):([0-9A-F]{4}) fx_cells$/im);
  if(!sym)return 'no fx_cells symbol';
  const bank=parseInt(sym[1],16),addr=parseInt(sym[2],16),off=((bank&0x3F)<<16)|addr;
  const cells=readFileSync(resolve(repo,'dist/snes/gen/fx/cells.bin')),img=readFileSync(rom);
  for(let i=0;i<cells.length;i++)if(img[off+i]!==cells[i])return `fx cells overwritten at ${sym[1]}:${(addr+i).toString(16).toUpperCase()} (another module writes into FX's data bank)`;
  return null;
}
for(const r of [testRom,process.env.SNES_ROM??resolve(repo,'dist/snes/secret-of-goku.sfc')]){
  if(!existsSync(r))continue;
  const err=checkCells(r);
  if(err){console.error(`fx: ${r}: ${err}`);process.exit(1);}
}
const tests=['gallery','beams','debris','battle','budget'].filter(t=>existsSync(join(here,`${t}.lua`))&&(!only.length||only.includes(t)));
let ok=true;
for(const t of tests){
  const rom=privateRom(testRom,`fx-${t}`);
  const t0=Date.now();
  const r=await runMesen({rom,test:prelude(testRom)+readFileSync(join(here,`${t}.lua`),'utf8'),outDir:join(outRoot,t),state:join(cps,'waterfall.mss')});
  cleanupRom(rom);
  const res=r.results??{};
  const fails=Object.entries(res).filter(([k,v])=>typeof v==='string'&&v.startsWith('FAIL'));
  const shots=shotChecks(t,join(outRoot,t));
  const pass=r.code===0&&!res.error&&res.failures===0&&shots.every(c=>c.ok);
  if(!pass)ok=false;
  console.log(`fx ${t.padEnd(10)} ${pass?'pass':'FAIL'} (${((Date.now()-t0)/1000).toFixed(1)} s)${res.error?' error: '+res.error:''}`);
  for(const [k,v] of fails)console.log(`   ${k}: ${v}`);
  for(const c of shots)console.log(`   ${c.ok?'ok  ':'FAIL'} ${c.text}`);
}
process.exit(ok?0:1);
